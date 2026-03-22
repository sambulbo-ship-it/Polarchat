#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# PolarChat Installer for Linux & macOS
# Usage: curl -fsSL https://polarchat.animalcoat.com/install.sh | bash
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/sambulbo-ship-it/Polarchat.git"
INSTALL_DIR="$HOME/.polarchat"
BRANCH="main"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

info()  { printf "${BLUE}[PolarChat]${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}[PolarChat]${RESET} %s\n" "$1"; }
err()   { printf "${RED}[PolarChat]${RESET} %s\n" "$1" >&2; }
step()  { printf "\n${CYAN}${BOLD}▸ %s${RESET}\n" "$1"; }

# ── Banner ───────────────────────────────────────────────────────────────────
printf "\n${BOLD}${CYAN}"
cat << 'BANNER'
    ____        __           ________          __
   / __ \____  / /___ ______/ ____/ /_  ____ _/ /_
  / /_/ / __ \/ / __ `/ ___/ /   / __ \/ __ `/ __/
 / ____/ /_/ / / /_/ / /  / /___/ / / / /_/ / /_
/_/    \____/_/\__,_/_/   \____/_/ /_/\__,_/\__/

BANNER
printf "${RESET}${DIM}  Private messaging. End-to-end encrypted. No tracking.${RESET}\n\n"

# ── OS Detection ─────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="macos" ;;
  *)       err "Unsupported OS: $OS"; exit 1 ;;
esac

info "Detected: $PLATFORM ($ARCH)"

# ── Check dependencies ──────────────────────────────────────────────────────
step "Checking dependencies"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "  ✓ $1 found"
    return 0
  else
    return 1
  fi
}

# Git
if ! check_cmd git; then
  err "Git is required. Install it first:"
  if [ "$PLATFORM" = "linux" ]; then
    echo "  sudo apt install git    # Debian/Ubuntu"
    echo "  sudo dnf install git    # Fedora"
    echo "  sudo pacman -S git      # Arch"
  else
    echo "  xcode-select --install"
  fi
  exit 1
fi

# Node.js
NODE_REQUIRED=18
if check_cmd node; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt "$NODE_REQUIRED" ]; then
    err "Node.js $NODE_REQUIRED+ required (found v$NODE_VERSION)"
    NEED_NODE=1
  else
    NEED_NODE=0
  fi
else
  NEED_NODE=1
fi

if [ "$NEED_NODE" = "1" ]; then
  step "Installing Node.js via nvm"
  if ! check_cmd nvm; then
    info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  fi
  nvm install 20
  nvm use 20
  ok "  ✓ Node.js $(node -v) installed"
fi

# npm
check_cmd npm || { err "npm not found"; exit 1; }

# ── Clone / Update ──────────────────────────────────────────────────────────
step "Downloading PolarChat"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation..."
  cd "$INSTALL_DIR"
  git fetch origin "$BRANCH" --quiet
  git reset --hard "origin/$BRANCH" --quiet
  ok "  ✓ Updated to latest version"
else
  info "Cloning repository..."
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR" --quiet
  ok "  ✓ Downloaded"
fi

cd "$INSTALL_DIR"

# ── Install dependencies ────────────────────────────────────────────────────
step "Installing dependencies"
npm ci --omit=dev --silent 2>/dev/null || npm install --omit=dev --silent
ok "  ✓ Dependencies installed"

# ── Build ────────────────────────────────────────────────────────────────────
step "Building PolarChat"
npm run build --silent 2>/dev/null || npm run build
ok "  ✓ Build complete"

# ── Create launcher script ──────────────────────────────────────────────────
step "Creating launcher"

LAUNCHER="$INSTALL_DIR/polarchat"
cat > "$LAUNCHER" << 'LAUNCHER_SCRIPT'
#!/usr/bin/env bash
cd "$HOME/.polarchat"
node server/dist/index.js &
SERVER_PID=$!
sleep 1

URL="http://localhost:3001"

# Open browser
if command -v xdg-open &>/dev/null; then
  xdg-open "$URL"
elif command -v open &>/dev/null; then
  open "$URL"
fi

echo "PolarChat running at $URL (PID: $SERVER_PID)"
echo "Press Ctrl+C to stop."

trap "kill $SERVER_PID 2>/dev/null; exit" INT TERM
wait $SERVER_PID
LAUNCHER_SCRIPT
chmod +x "$LAUNCHER"

# ── Install to PATH ─────────────────────────────────────────────────────────
step "Installing to system"

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
ln -sf "$LAUNCHER" "$BIN_DIR/polarchat"

# Ensure ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_RC=""
  case "$(basename "$SHELL")" in
    zsh)  SHELL_RC="$HOME/.zshrc" ;;
    bash) SHELL_RC="$HOME/.bashrc" ;;
    fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
  esac
  if [ -n "$SHELL_RC" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    info "Added ~/.local/bin to PATH in $SHELL_RC"
  fi
fi

# ── Desktop entry (Linux) ───────────────────────────────────────────────────
if [ "$PLATFORM" = "linux" ]; then
  DESKTOP_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESKTOP_DIR"
  cat > "$DESKTOP_DIR/polarchat.desktop" << EOF
[Desktop Entry]
Name=PolarChat
Comment=Private & Secure Chat
Exec=$BIN_DIR/polarchat
Icon=$INSTALL_DIR/client/public/favicon.svg
Type=Application
Categories=Network;Chat;InstantMessaging;
Keywords=chat;messaging;encrypted;private;voice;
StartupWMClass=PolarChat
EOF
  chmod +x "$DESKTOP_DIR/polarchat.desktop"
  ok "  ✓ Desktop shortcut created"
fi

# ── macOS .app bundle ────────────────────────────────────────────────────────
if [ "$PLATFORM" = "macos" ]; then
  APP_DIR="$HOME/Applications/PolarChat.app"
  mkdir -p "$APP_DIR/Contents/MacOS"
  mkdir -p "$APP_DIR/Contents/Resources"

  cat > "$APP_DIR/Contents/MacOS/PolarChat" << MACSCRIPT
#!/usr/bin/env bash
exec "$BIN_DIR/polarchat"
MACSCRIPT
  chmod +x "$APP_DIR/Contents/MacOS/PolarChat"

  cat > "$APP_DIR/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>PolarChat</string>
  <key>CFBundleIdentifier</key><string>com.polarchat.desktop</string>
  <key>CFBundleVersion</key><string>0.2.0</string>
  <key>CFBundleExecutable</key><string>PolarChat</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>PolarChat needs microphone access for encrypted voice calls.</string>
</dict>
</plist>
PLIST
  ok "  ✓ PolarChat.app created in ~/Applications"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
printf "\n${GREEN}${BOLD}✓ PolarChat installed successfully!${RESET}\n\n"
echo "  Launch:    polarchat"
echo "  Location:  $INSTALL_DIR"
if [ "$PLATFORM" = "macos" ]; then
  echo "  App:       ~/Applications/PolarChat.app"
fi
echo ""
printf "${DIM}  Uninstall: rm -rf ~/.polarchat ~/.local/bin/polarchat${RESET}\n"
if [ "$PLATFORM" = "linux" ]; then
  printf "${DIM}             rm -f ~/.local/share/applications/polarchat.desktop${RESET}\n"
fi
if [ "$PLATFORM" = "macos" ]; then
  printf "${DIM}             rm -rf ~/Applications/PolarChat.app${RESET}\n"
fi
echo ""
