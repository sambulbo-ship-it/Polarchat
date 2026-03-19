# PolarChat Privacy Policy

## Our Promise: Your Privacy is Non-Negotiable

PolarChat is built on a single principle: **what you say is yours, and yours alone**.

## What We Collect

**Nothing.** Specifically:

- **No email addresses** — registration requires only a username and password
- **No phone numbers** — we don't need them, we don't want them
- **No IP logging** — your connection details are stripped and never stored
- **No message content** — all messages are end-to-end encrypted; the server sees only ciphertext
- **No metadata tracking** — we don't track who talks to whom, when, or how often
- **No analytics** — no tracking pixels, no telemetry, no usage statistics
- **No cookies** — session tokens are ephemeral and memory-only
- **No third-party services** — no Google Analytics, no Facebook SDK, no ad networks

## How Encryption Works

1. **Key Generation** — Your encryption keys are generated on YOUR device, never on our servers
2. **End-to-End Encryption** — Messages are encrypted before leaving your device using NaCl (Networking and Cryptography Library)
3. **Zero-Knowledge Server** — Our server is a "dumb relay" that forwards encrypted blobs. It cannot read your messages. Ever.
4. **Voice Encryption** — Voice calls use WebRTC with SRTP encryption, peer-to-peer when possible
5. **Key Backup** — If you export your keys, they are encrypted with your password first

## Data Retention

- **Messages**: Deleted from server immediately after delivery confirmation
- **Accounts**: Minimal data (hashed username, public key) — deletable at any time
- **Voice calls**: No recording, no storage — real-time only
- **Server logs**: None. We don't log.

## Your Rights

- **Delete your account** at any time — all associated data is permanently erased
- **Export your keys** for backup — encrypted with your password
- **Verify encryption** — every message shows its E2EE status
- **Inspect the code** — PolarChat is open source

## Technical Details

| Feature | Implementation |
|---------|---------------|
| Message Encryption | NaCl box (Curve25519, XSalsa20, Poly1305) |
| Password Hashing | Argon2id |
| Key Exchange | X25519 Diffie-Hellman |
| Voice Encryption | SRTP (via WebRTC) |
| Session Tokens | NaCl secretbox |
| Username Storage | SHA-512 hash only |

## Contact

Found a security vulnerability? Open an issue on our GitHub repository.

---

*PolarChat: Because privacy isn't a feature — it's a right.*
