import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import {
  KeyPair,
  generateSessionKey,
  encryptMessage,
  decryptMessage,
  exportEncryptedKeyBackup,
  importEncryptedKeyBackup,
  EncryptedKeyBackup,
} from './index';

interface ChannelKeyEntry {
  key: Uint8Array;
  version: number;
  rotatedAt: number;
}

/**
 * KeyManager handles secure in-memory storage and lifecycle of cryptographic keys.
 * Keys NEVER leave memory unencrypted. They are not persisted to localStorage or sent to the server.
 */
class KeyManager {
  private identityKeyPair: KeyPair | null = null;
  private channelKeys: Map<string, ChannelKeyEntry> = new Map();
  private peerPublicKeys: Map<string, Uint8Array> = new Map();
  private keyRotationIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * Store the user's identity keypair in memory.
   */
  setIdentityKeyPair(keyPair: KeyPair): void {
    this.identityKeyPair = keyPair;
  }

  /**
   * Get the current identity keypair.
   */
  getIdentityKeyPair(): KeyPair | null {
    return this.identityKeyPair;
  }

  /**
   * Get only the public key as a base64 string (safe to share).
   */
  getPublicKeyString(): string | null {
    if (!this.identityKeyPair) return null;
    return encodeBase64(this.identityKeyPair.publicKey);
  }

  /**
   * Store a peer's public key (received from server during key exchange).
   */
  setPeerPublicKey(userId: string, publicKey: string): void {
    this.peerPublicKeys.set(userId, decodeBase64(publicKey));
  }

  /**
   * Get a peer's public key.
   */
  getPeerPublicKey(userId: string): Uint8Array | null {
    return this.peerPublicKeys.get(userId) || null;
  }

  /**
   * Generate or set a shared symmetric key for a channel.
   * Used for group E2EE where all members share one key.
   */
  setChannelKey(channelId: string, key?: Uint8Array, version?: number): void {
    const channelKey = key || generateSessionKey();
    this.channelKeys.set(channelId, {
      key: channelKey,
      version: version || 1,
      rotatedAt: Date.now(),
    });
  }

  /**
   * Get the current shared key for a channel.
   */
  getChannelKey(channelId: string): ChannelKeyEntry | null {
    return this.channelKeys.get(channelId) || null;
  }

  /**
   * Rotate the key for a channel. Generates a new key and increments version.
   * The new key must be distributed to all channel members via encrypted messages.
   */
  rotateChannelKey(channelId: string): ChannelKeyEntry {
    const existing = this.channelKeys.get(channelId);
    const newVersion = existing ? existing.version + 1 : 1;
    const newKey = generateSessionKey();

    const entry: ChannelKeyEntry = {
      key: newKey,
      version: newVersion,
      rotatedAt: Date.now(),
    };

    this.channelKeys.set(channelId, entry);
    return entry;
  }

  /**
   * Start automatic key rotation for a channel at a given interval.
   */
  startKeyRotation(
    channelId: string,
    intervalMs: number = 3600000, // default 1 hour
    onRotation?: (channelId: string, entry: ChannelKeyEntry) => void
  ): void {
    this.stopKeyRotation(channelId);

    const interval = setInterval(() => {
      const entry = this.rotateChannelKey(channelId);
      if (onRotation) {
        onRotation(channelId, entry);
      }
    }, intervalMs);

    this.keyRotationIntervals.set(channelId, interval);
  }

  /**
   * Stop automatic key rotation for a channel.
   */
  stopKeyRotation(channelId: string): void {
    const interval = this.keyRotationIntervals.get(channelId);
    if (interval) {
      clearInterval(interval);
      this.keyRotationIntervals.delete(channelId);
    }
  }

  /**
   * Encrypt a channel key for a specific recipient so it can be shared securely.
   */
  encryptChannelKeyForPeer(
    channelId: string,
    recipientPublicKey: Uint8Array
  ): { ciphertext: string; nonce: string; senderPublicKey: string } | null {
    if (!this.identityKeyPair) return null;
    const channelEntry = this.channelKeys.get(channelId);
    if (!channelEntry) return null;

    const keyString = encodeBase64(channelEntry.key);
    return encryptMessage(
      keyString,
      recipientPublicKey,
      this.identityKeyPair.secretKey
    );
  }

  /**
   * Receive and decrypt a channel key that was encrypted for us.
   */
  receiveChannelKey(
    channelId: string,
    encryptedKey: { ciphertext: string; nonce: string; senderPublicKey: string },
    version: number
  ): boolean {
    if (!this.identityKeyPair) return false;

    try {
      const keyString = decryptMessage(
        encryptedKey,
        this.identityKeyPair.secretKey
      );
      const key = decodeBase64(keyString);
      this.channelKeys.set(channelId, {
        key,
        version,
        rotatedAt: Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export all keys as an encrypted backup using a password.
   */
  exportBackup(password: string): EncryptedKeyBackup | null {
    if (!this.identityKeyPair) return null;
    return exportEncryptedKeyBackup(this.identityKeyPair, password);
  }

  /**
   * Import keys from an encrypted backup.
   */
  importBackup(backup: EncryptedKeyBackup, password: string): boolean {
    try {
      const keyPair = importEncryptedKeyBackup(backup, password);
      this.identityKeyPair = keyPair;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all keys from memory. Called on logout.
   */
  clearAll(): void {
    this.identityKeyPair = null;
    this.channelKeys.clear();
    this.peerPublicKeys.clear();

    for (const interval of this.keyRotationIntervals.values()) {
      clearInterval(interval);
    }
    this.keyRotationIntervals.clear();
  }

  /**
   * Get the number of stored peer keys (for debugging/status display).
   */
  getPeerKeyCount(): number {
    return this.peerPublicKeys.size;
  }

  /**
   * Get all channel IDs that have keys.
   */
  getEncryptedChannelIds(): string[] {
    return Array.from(this.channelKeys.keys());
  }
}

// Singleton instance - keys live only in memory for the session
export const keyManager = new KeyManager();
export default keyManager;
