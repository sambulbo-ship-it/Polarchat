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
| Desktop | Tauri v2 (system webview, ~10x lighter than Electron) |

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
├── src-tauri/       # Native desktop app (Tauri v2 / Rust)
├── scripts/         # Desktop staging (bundles server + Node runtime)
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

Built with [Tauri v2](https://v2.tauri.app): the app uses the OS webview
(WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) and embeds the
PolarChat server plus a Node.js runtime — no external dependencies for users.

Requires the [Rust toolchain](https://rustup.rs) to build.

```bash
# Build the desktop app for your current platform
npm run desktop:build

# Run the desktop app in dev mode (hot reload)
npm run desktop:dev
```

Bundles land in `src-tauri/target/release/bundle/`. Official installers for
every platform are built automatically by CI when a `v*.*.*` tag is pushed,
and published at https://polarchat.animalcoat.com.

| Platform | Formats |
|----------|---------|
| macOS (Apple Silicon + Intel) | `.dmg` |
| Windows | `.exe` (NSIS), `.msi` |
| Linux | `.AppImage`, `.deb`, `.rpm` |

## Privacy Policy

See [PRIVACY.md](./PRIVACY.md) for our complete privacy policy.

**TL;DR**: We collect nothing. We see nothing. Your data is yours.

## Legal

Fully open source. No restrictions except: respect your country's laws.

## License

See [LICENSE](./LICENSE) for details.
