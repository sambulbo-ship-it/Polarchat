import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { createUser, getUserByUsernameHash, getUserById, upsertKeyBundle, getUserData, deleteUser } from '../db';
import { hashUsername, createSessionToken } from '../crypto';
import { safeLog } from '../privacy';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * POST /auth/register
 *
 * Register with a username (hashed server-side), password (hashed with Argon2),
 * and public key. No email, no phone, no personal info collected.
 *
 * Body: { username: string, password: string, publicKey: string, keyBundle?: { ... } }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, publicKey, keyBundle } = req.body;

    if (!username || !password || !publicKey) {
      res.status(400).json({ error: 'Missing required fields: username, password, publicKey' });
      return;
    }

    if (typeof username !== 'string' || username.length < 3 || username.length > 32) {
      res.status(400).json({ error: 'Username must be 3-32 characters' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
      return;
    }

    // Hash the username so the server never stores plaintext usernames.
    const usernameHash = hashUsername(username);

    // Check for uniqueness.
    const existing = getUserByUsernameHash(usernameHash);
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    // Hash the password with Argon2id (memory-hard, GPU-resistant).
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,  // 64 MB
      timeCost: 3,
      parallelism: 4,
    });

    const userId = uuidv4();
    createUser(userId, usernameHash, publicKey, passwordHash);

    // Store E2EE key bundle if provided.
    if (keyBundle && keyBundle.identityKey && keyBundle.signedPrekey && keyBundle.prekeySignature) {
      upsertKeyBundle(
        userId,
        keyBundle.identityKey,
        keyBundle.signedPrekey,
        keyBundle.prekeySignature,
        keyBundle.oneTimePrekeys || []
      );
    }

    // Generate an ephemeral session token (not stored server-side).
    const token = createSessionToken(userId);

    safeLog.info('New user registered');

    res.status(201).json({
      userId,
      token,
    });
  } catch (err) {
    safeLog.error('Registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/login
 *
 * Authenticate with username + password. Returns an ephemeral session token.
 *
 * Body: { username: string, password: string }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Missing required fields: username, password' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
      return;
    }

    const usernameHash = hashUsername(username);
    const user = getUserByUsernameHash(usernameHash);

    if (!user) {
      // Use a generic message to prevent username enumeration.
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password with Argon2.
    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = createSessionToken(user.id);

    safeLog.info('User logged in');

    res.json({
      userId: user.id,
      token,
    });
  } catch (err) {
    safeLog.error('Login failed');
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /auth/me/export
 *
 * GDPR data access request. Returns all data associated with the authenticated user.
 * Requires a valid session token.
 */
router.get('/me/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const user = getUserById(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const data = getUserData(userId);

    safeLog.info('User data export requested');

    res.json({
      exportedAt: new Date().toISOString(),
      user: {
        id: data.user?.id,
        username_hash: data.user?.username_hash,
        public_key: data.user?.public_key,
        created_at: data.user?.created_at,
      },
      servers: data.servers,
      memberships: data.memberships,
      channels: data.channels,
      messages: data.messages,
      keyBundle: data.keyBundle ? {
        identity_key: data.keyBundle.identity_key,
        signed_prekey: data.keyBundle.signed_prekey,
        prekey_signature: data.keyBundle.prekey_signature,
        one_time_prekeys: data.keyBundle.one_time_prekeys,
      } : null,
    });
  } catch (err) {
    safeLog.error('Data export failed');
    res.status(500).json({ error: 'Data export failed' });
  }
});

/**
 * DELETE /auth/me
 *
 * GDPR right to erasure. Deletes the authenticated user's account and all
 * associated data (memberships, messages, owned servers if sole owner, key bundles).
 * Requires a valid session token.
 */
router.delete('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const user = getUserById(userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    deleteUser(userId);

    safeLog.info('User account deleted');

    res.json({ message: 'Account and all associated data have been deleted' });
  } catch (err) {
    safeLog.error('Account deletion failed');
    res.status(500).json({ error: 'Account deletion failed' });
  }
});

export default router;
