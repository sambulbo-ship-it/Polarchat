import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'polarchat.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- Users: zero-knowledge design. No email, no phone, no personal info.
    -- Username stored as hash only so the server never knows the actual username.
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username_hash TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Servers (guilds): name is encrypted by the owner, server only stores ciphertext.
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name_encrypted TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Channels within servers.
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
      server_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    -- Messages: stored ONLY as ciphertext. The server is a dumb relay and never
    -- sees plaintext. Messages are auto-purged after delivery confirmation.
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      nonce TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      delivered INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Server membership.
    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (server_id, user_id),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Key bundles for end-to-end encryption key exchange (X3DH-style).
    CREATE TABLE IF NOT EXISTS key_bundles (
      user_id TEXT PRIMARY KEY,
      identity_key TEXT NOT NULL,
      signed_prekey TEXT NOT NULL,
      prekey_signature TEXT NOT NULL,
      one_time_prekeys TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Index for fast message queries and cleanup.
    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_delivered ON messages(delivered, created_at);
    CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id);
  `);
}

// ─── Data access helpers ───────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username_hash: string;
  public_key: string;
  password_hash: string;
  created_at: number;
}

export interface ServerRow {
  id: string;
  name_encrypted: string;
  owner_id: string;
  invite_code: string;
  created_at: number;
}

export interface ChannelRow {
  id: string;
  name: string;
  type: 'text' | 'voice';
  server_id: string;
  created_at: number;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  created_at: number;
  delivered: number;
}

export interface ServerMemberRow {
  server_id: string;
  user_id: string;
  role: string;
  joined_at: number;
}

export interface KeyBundleRow {
  user_id: string;
  identity_key: string;
  signed_prekey: string;
  prekey_signature: string;
  one_time_prekeys: string;
}

// ─── User operations ───────────────────────────────────────────────────────────

export function createUser(id: string, usernameHash: string, publicKey: string, passwordHash: string): void {
  const stmt = getDb().prepare(
    'INSERT INTO users (id, username_hash, public_key, password_hash) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, usernameHash, publicKey, passwordHash);
}

export function getUserByUsernameHash(usernameHash: string): UserRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM users WHERE username_hash = ?');
  return stmt.get(usernameHash) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as UserRow | undefined;
}

// ─── Server operations ─────────────────────────────────────────────────────────

export function createServer(id: string, nameEncrypted: string, ownerId: string, inviteCode: string): void {
  const db = getDb();
  const insertServer = db.prepare(
    'INSERT INTO servers (id, name_encrypted, owner_id, invite_code) VALUES (?, ?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)'
  );
  const insertChannel = db.prepare(
    'INSERT INTO channels (id, name, type, server_id) VALUES (?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    insertServer.run(id, nameEncrypted, ownerId, inviteCode);
    insertMember.run(id, ownerId, 'owner');
    // Create a default "general" text channel.
    const { v4: uuidv4 } = require('uuid');
    insertChannel.run(uuidv4(), 'general', 'text', id);
  });
  transaction();
}

export function getServerById(id: string): ServerRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM servers WHERE id = ?');
  return stmt.get(id) as ServerRow | undefined;
}

export function getServerByInviteCode(code: string): ServerRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM servers WHERE invite_code = ?');
  return stmt.get(code) as ServerRow | undefined;
}

export function getUserServers(userId: string): ServerRow[] {
  const stmt = getDb().prepare(
    `SELECT s.* FROM servers s
     INNER JOIN server_members sm ON s.id = sm.server_id
     WHERE sm.user_id = ?`
  );
  return stmt.all(userId) as ServerRow[];
}

export function addServerMember(serverId: string, userId: string, role: string = 'member'): void {
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)'
  );
  stmt.run(serverId, userId, role);
}

export function isServerMember(serverId: string, userId: string): boolean {
  const stmt = getDb().prepare(
    'SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?'
  );
  return stmt.get(serverId, userId) !== undefined;
}

export function getServerMemberRole(serverId: string, userId: string): string | undefined {
  const stmt = getDb().prepare(
    'SELECT role FROM server_members WHERE server_id = ? AND user_id = ?'
  );
  const row = stmt.get(serverId, userId) as { role: string } | undefined;
  return row?.role;
}

// ─── Channel operations ────────────────────────────────────────────────────────

export function createChannel(id: string, name: string, type: 'text' | 'voice', serverId: string): void {
  const stmt = getDb().prepare(
    'INSERT INTO channels (id, name, type, server_id) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, name, type, serverId);
}

export function getChannelById(id: string): ChannelRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM channels WHERE id = ?');
  return stmt.get(id) as ChannelRow | undefined;
}

export function getChannelsByServerId(serverId: string): ChannelRow[] {
  const stmt = getDb().prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY created_at ASC');
  return stmt.all(serverId) as ChannelRow[];
}

export function deleteChannel(id: string): void {
  const stmt = getDb().prepare('DELETE FROM channels WHERE id = ?');
  stmt.run(id);
}

// ─── Message operations ────────────────────────────────────────────────────────

export function storeMessage(
  id: string, channelId: string, senderId: string, ciphertext: string, nonce: string
): void {
  const stmt = getDb().prepare(
    'INSERT INTO messages (id, channel_id, sender_id, ciphertext, nonce) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(id, channelId, senderId, ciphertext, nonce);
}

export function getMessagesByChannel(channelId: string, limit: number = 50, before?: number): MessageRow[] {
  if (before) {
    const stmt = getDb().prepare(
      'SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?'
    );
    return (stmt.all(channelId, before, limit) as MessageRow[]).reverse();
  }
  const stmt = getDb().prepare(
    'SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?'
  );
  return (stmt.all(channelId, limit) as MessageRow[]).reverse();
}

export function markMessageDelivered(messageId: string): void {
  const stmt = getDb().prepare('UPDATE messages SET delivered = 1 WHERE id = ?');
  stmt.run(messageId);
}

export function purgeDeliveredMessages(): number {
  const stmt = getDb().prepare('DELETE FROM messages WHERE delivered = 1');
  const result = stmt.run();
  return result.changes;
}

export function purgeOldMessages(maxAgeSeconds: number): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
  const stmt = getDb().prepare('DELETE FROM messages WHERE created_at < ?');
  const result = stmt.run(cutoff);
  return result.changes;
}

// ─── Key bundle operations ──────────────────────────────────────────────────────

export function upsertKeyBundle(
  userId: string, identityKey: string, signedPrekey: string,
  prekeySignature: string, oneTimePrekeys: string[]
): void {
  const stmt = getDb().prepare(
    `INSERT INTO key_bundles (user_id, identity_key, signed_prekey, prekey_signature, one_time_prekeys)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       identity_key = excluded.identity_key,
       signed_prekey = excluded.signed_prekey,
       prekey_signature = excluded.prekey_signature,
       one_time_prekeys = excluded.one_time_prekeys`
  );
  stmt.run(userId, identityKey, signedPrekey, prekeySignature, JSON.stringify(oneTimePrekeys));
}

export function getKeyBundle(userId: string): KeyBundleRow | undefined {
  const stmt = getDb().prepare('SELECT * FROM key_bundles WHERE user_id = ?');
  return stmt.get(userId) as KeyBundleRow | undefined;
}

export function consumeOneTimePrekey(userId: string): string | null {
  const bundle = getKeyBundle(userId);
  if (!bundle) return null;

  const keys: string[] = JSON.parse(bundle.one_time_prekeys);
  if (keys.length === 0) return null;

  const key = keys.shift()!;
  const stmt = getDb().prepare('UPDATE key_bundles SET one_time_prekeys = ? WHERE user_id = ?');
  stmt.run(JSON.stringify(keys), userId);
  return key;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────────

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
