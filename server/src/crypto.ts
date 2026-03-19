import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

// Server-side secret key for session tokens. Generated once at startup and held
// in memory only — never persisted. If the server restarts, all sessions are
// invalidated, which is a *feature* for a privacy-focused system.
const SERVER_SECRET_KEY: Uint8Array = nacl.randomBytes(nacl.secretbox.keyLength);

// Default token lifetime: 24 hours.
const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface TokenPayload {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Create an ephemeral session token using NaCl secretbox.
 * The token is not stored server-side — it is self-contained and verified
 * by decrypting with the in-memory secret key.
 */
export function createSessionToken(userId: string): string {
  const now = Date.now();
  const payload: TokenPayload = {
    userId,
    createdAt: now,
    expiresAt: now + TOKEN_LIFETIME_MS,
  };

  const message = decodeUTF8(JSON.stringify(payload));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(message, nonce, SERVER_SECRET_KEY);

  // Combine nonce + ciphertext into a single base64 token.
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);

  return encodeBase64(combined);
}

/**
 * Verify and decode a session token. Returns the payload if valid, or null
 * if the token is invalid, expired, or tampered with.
 */
export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const combined = decodeBase64(token);
    if (combined.length < nacl.secretbox.nonceLength + nacl.secretbox.overheadLength) {
      return null;
    }

    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const ciphertext = combined.slice(nacl.secretbox.nonceLength);

    const decrypted = nacl.secretbox.open(ciphertext, nonce, SERVER_SECRET_KEY);
    if (!decrypted) return null;

    const payload: TokenPayload = JSON.parse(encodeUTF8(decrypted));

    // Check expiration.
    if (Date.now() > payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Hash a username using NaCl's SHA-512, then base64-encode.
 * The server never stores or knows the plaintext username.
 */
export function hashUsername(username: string): string {
  const bytes = decodeUTF8(username.toLowerCase().trim());
  const hashed = nacl.hash(bytes);
  return encodeBase64(hashed);
}

/**
 * Generate a cryptographically random invite code.
 */
export function generateInviteCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = nacl.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}
