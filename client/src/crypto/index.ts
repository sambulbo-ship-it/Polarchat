import nacl from 'tweetnacl';
import {
  encodeBase64,
  decodeBase64,
  encodeUTF8,
  decodeUTF8,
} from 'tweetnacl-util';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  senderPublicKey: string;
}

export interface EncryptedKeyBackup {
  encryptedKeys: string;
  nonce: string;
  salt: string;
}

/**
 * Generate a new NaCl box keypair for asymmetric encryption.
 * Keys are generated entirely client-side and never leave the device unencrypted.
 */
export function generateKeyPair(): KeyPair {
  return nacl.box.keyPair();
}

/**
 * Encrypt a plaintext message for a specific recipient using NaCl box (x25519-xsalsa20-poly1305).
 * The sender's secret key and recipient's public key are used for authenticated encryption.
 */
export function encryptMessage(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): EncryptedMessage {
  const messageBytes = decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKey,
    senderSecretKey
  );

  if (!encrypted) {
    throw new Error('Encryption failed');
  }

  const senderKeyPair = nacl.box.keyPair.fromSecretKey(senderSecretKey);

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
    senderPublicKey: encodeBase64(senderKeyPair.publicKey),
  };
}

/**
 * Decrypt a message from a sender using NaCl box.open.
 * Verifies authenticity via the sender's public key.
 */
export function decryptMessage(
  encryptedMsg: EncryptedMessage,
  recipientSecretKey: Uint8Array
): string {
  const ciphertext = decodeBase64(encryptedMsg.ciphertext);
  const nonce = decodeBase64(encryptedMsg.nonce);
  const senderPublicKey = decodeBase64(encryptedMsg.senderPublicKey);

  const decrypted = nacl.box.open(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientSecretKey
  );

  if (!decrypted) {
    throw new Error('Decryption failed - message may be tampered with or wrong key');
  }

  return encodeUTF8(decrypted);
}

/**
 * Encrypt a message using a shared symmetric key (NaCl secretbox).
 * Used for group/channel messages where all members share a channel key.
 */
export function encryptWithSharedKey(
  plaintext: string,
  sharedKey: Uint8Array
): { ciphertext: string; nonce: string } {
  const messageBytes = decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  const encrypted = nacl.secretbox(messageBytes, nonce, sharedKey);

  if (!encrypted) {
    throw new Error('Symmetric encryption failed');
  }

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  };
}

/**
 * Decrypt a message using a shared symmetric key (NaCl secretbox).
 */
export function decryptWithSharedKey(
  ciphertext: string,
  nonce: string,
  sharedKey: Uint8Array
): string {
  const ciphertextBytes = decodeBase64(ciphertext);
  const nonceBytes = decodeBase64(nonce);

  const decrypted = nacl.secretbox.open(ciphertextBytes, nonceBytes, sharedKey);

  if (!decrypted) {
    throw new Error('Symmetric decryption failed');
  }

  return encodeUTF8(decrypted);
}

/**
 * Derive a symmetric key from a password using NaCl's hash + scrypt-like approach.
 * Uses multiple rounds of hashing for key stretching.
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Uint8Array {
  const passwordBytes = decodeUTF8(password);
  const combined = new Uint8Array(passwordBytes.length + salt.length);
  combined.set(passwordBytes);
  combined.set(salt, passwordBytes.length);

  // Hash multiple rounds for key stretching
  let derived = nacl.hash(combined);
  for (let i = 0; i < 10000; i++) {
    derived = nacl.hash(derived);
  }

  // Take first 32 bytes as symmetric key
  return derived.slice(0, nacl.secretbox.keyLength);
}

/**
 * Export keys encrypted with user's password for backup.
 * Keys never leave the device unencrypted.
 */
export function exportEncryptedKeyBackup(
  keyPair: KeyPair,
  password: string
): EncryptedKeyBackup {
  const salt = nacl.randomBytes(32);
  const derivedKey = deriveKeyFromPassword(password, salt);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  // Combine public and secret key for backup
  const combined = new Uint8Array(
    keyPair.publicKey.length + keyPair.secretKey.length
  );
  combined.set(keyPair.publicKey);
  combined.set(keyPair.secretKey, keyPair.publicKey.length);

  const encrypted = nacl.secretbox(combined, nonce, derivedKey);

  if (!encrypted) {
    throw new Error('Key backup encryption failed');
  }

  return {
    encryptedKeys: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
    salt: encodeBase64(salt),
  };
}

/**
 * Import keys from an encrypted backup using the user's password.
 */
export function importEncryptedKeyBackup(
  backup: EncryptedKeyBackup,
  password: string
): KeyPair {
  const salt = decodeBase64(backup.salt);
  const derivedKey = deriveKeyFromPassword(password, salt);
  const nonce = decodeBase64(backup.nonce);
  const encryptedKeys = decodeBase64(backup.encryptedKeys);

  const decrypted = nacl.secretbox.open(encryptedKeys, nonce, derivedKey);

  if (!decrypted) {
    throw new Error(
      'Key import failed - wrong password or corrupted backup'
    );
  }

  const publicKey = decrypted.slice(0, nacl.box.publicKeyLength);
  const secretKey = decrypted.slice(nacl.box.publicKeyLength);

  return { publicKey, secretKey };
}

/**
 * Generate a session key for group chats.
 * This symmetric key is shared with all group members via individual encrypted messages.
 */
export function generateSessionKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Compute a shared secret between two parties (Diffie-Hellman via NaCl box.before).
 * Useful for deriving channel-specific keys.
 */
export function computeSharedSecret(
  theirPublicKey: Uint8Array,
  mySecretKey: Uint8Array
): Uint8Array {
  return nacl.box.before(theirPublicKey, mySecretKey);
}

/**
 * Encode a Uint8Array key to base64 string for transport/storage.
 */
export function keyToString(key: Uint8Array): string {
  return encodeBase64(key);
}

/**
 * Decode a base64 string back to Uint8Array key.
 */
export function stringToKey(keyString: string): Uint8Array {
  return decodeBase64(keyString);
}
