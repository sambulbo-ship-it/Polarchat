# PolarChat 🔒

**Chat by text or voice with your friends — fully encrypted, fully private, fully open source.**

A Discord-like chat application built with one uncompromising principle: **your privacy is non-negotiable**.

No spyware. No tracking. No data collection. No compromise.

## Features

### 💬 Secure Text Chat
- End-to-end encrypted messages (NaCl: Curve25519 + XSalsa20 + Poly1305)
- Server is a "dumb relay" — it **never** sees your messages in plaintext
- Messages auto-deleted from server after delivery confirmation
- Per-channel encryption keys with rotation support

### 🎙️ Encrypted Voice Chat
- WebRTC peer-to-peer voice calls with SRTP encryption
- Mute/deafen controls
- Connection quality monitoring
- No recording, no storage — real-time only

### 🛡️ Privacy by Design
- **Anonymous registration** — username + password only, no email or phone required
- **Zero-knowledge server** — all encryption happens client-side
- **No IP logging** — connection details stripped from every request
- **No analytics** — no tracking pixels, no telemetry, no cookies
- **No third-party services** — no Google, no Facebook, no ad networks
- **Ephemeral sessions** — session tokens are short-lived and memory-only
- **Key backup** — export your encryption keys encrypted with your password

### 🖥️ Discord-like UI
- Server/channel organization
- Dark theme interface
- Typing indicators
- Online presence (opt-in)
- Invite codes for servers

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand |
| Encryption | TweetNaCl (NaCl) — client-side only |
| Backend | Express + WebSocket |
| Database | SQLite (zero-knowledge design) |
| Auth | Argon2id password hashing |
| Voice | WebRTC + SRTP |
| Desktop | Electron (privacy-hardened) |

## Project Structure

```
Polarchat/
├── client/          # React frontend
│   └── src/
│       ├── components/  # UI components (auth, chat, voice, layout)
│       ├── crypto/      # E2EE encryption (client-side only)
│       ├── hooks/       # WebSocket & WebRTC hooks
│       ├── store/       # Zustand state (auth, chat, voice)
│       └── utils/       # API utilities
├── server/          # Express backend
│   └── src/
│       ├── routes/      # REST API (auth, channels, servers)
│       ├── ws/          # WebSocket message handler
│       ├── middleware/  # Auth middleware
│       ├── crypto.ts    # Server-side crypto (tokens only)
│       ├── db.ts        # SQLite zero-knowledge database
│       └── privacy.ts   # Privacy enforcement
├── electron/        # Desktop app wrapper
└── PRIVACY.md       # Full privacy policy
```

## Getting Started

### Prerequisites
- Node.js >= 18.0.0

### Development

```bash
# Install dependencies
npm install

# Start both server and client in dev mode
npm run dev

# Or start individually:
npm run dev:server   # Backend on port 3001
npm run dev:client   # Frontend on port 5173
```

### Build (Web)

```bash
npm run build
```

### Build Desktop App (Native Installers)

PolarChat can be packaged as a native desktop app for **Windows**, **macOS**, and **Linux**.

```bash
# Install Electron dependencies
cd electron && npm install && cd ..

# Build for your current platform
npm run desktop:dist

# Build for a specific platform
npm run desktop:win      # Windows (.exe installer + portable)
npm run desktop:mac      # macOS (.dmg + .zip)
npm run desktop:linux    # Linux (.AppImage + .deb + .rpm)

# Build for ALL platforms at once
npm run desktop:all
```

#### Output Files

| Platform | Format | Location |
|----------|--------|----------|
| Windows | `.exe` (NSIS installer) | `release/PolarChat-1.0.0-win-x64.exe` |
| Windows | `.exe` (portable) | `release/PolarChat-1.0.0-win-x64-portable.exe` |
| macOS | `.dmg` | `release/PolarChat-1.0.0-mac-x64.dmg` |
| macOS | `.zip` | `release/PolarChat-1.0.0-mac-arm64.zip` |
| Linux | `.AppImage` | `release/PolarChat-1.0.0-x64.AppImage` |
| Linux | `.deb` | `release/PolarChat-1.0.0-linux-x64.deb` |
| Linux | `.rpm` | `release/PolarChat-1.0.0-linux-x64.rpm` |

#### Custom App Icon

```bash
# Generate icons from a 1024x1024 PNG source
cd electron/assets
./generate-icons.sh your-icon-1024x1024.png
```

## Privacy Policy

See [PRIVACY.md](./PRIVACY.md) for our complete privacy policy.

**TL;DR**: We collect nothing. We see nothing. Your data is yours.

## Legal

Fully open source. No restrictions except: respect your country's laws.

## License

See [LICENSE](./LICENSE) for details.
