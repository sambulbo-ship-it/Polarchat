import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { createUser, getUserByUsernameHash, upsertKeyBundle } from '../db';
import { hashUsername, createSessionToken } from '../crypto';
import { safeLog } from '../privacy';

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

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
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

export default router;
