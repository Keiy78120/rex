#!/usr/bin/env bash
# REX — Linux Bootstrap
# Idempotent one-command install for Linux (Ubuntu/Debian/Arch/headless VPS)
# Usage: bash scripts/install-linux.sh [--profile=headless-node|hub-vps] [--yes]
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
info() { echo -e "  ${DIM}→${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
step() { echo -e "\n${BOLD}$1${RESET}"; }

# ── Parse args ──────────────────────────────────────────────────────────────
PROFILE="headless-node"
YES=false
for arg in "$@"; do
  case "$arg" in
    --profile=*) PROFILE="${arg#*=}" ;;
    --yes|-y)    YES=true ;;
  esac
done

echo -e "\n${BOLD}REX — Linux Bootstrap${RESET}"
echo -e "${DIM}Profile: ${PROFILE}${RESET}\n"

# ── Linux check ──────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Linux" ]]; then
  fail "This script is for Linux only."
  exit 1
fi

# ── Detect package manager ───────────────────────────────────────────────────
PKG_MGR=""
if command -v apt-get &>/dev/null; then PKG_MGR="apt"
elif command -v dnf &>/dev/null;    then PKG_MGR="dnf"
elif command -v pacman &>/dev/null; then PKG_MGR="pacman"
elif command -v zypper &>/dev/null; then PKG_MGR="zypper"
fi

install_pkg() {
  case "$PKG_MGR" in
    apt)    sudo apt-get install -y "$@" ;;
    dnf)    sudo dnf install -y "$@" ;;
    pacman) sudo pacman -S --noconfirm "$@" ;;
    zypper) sudo zypper install -y "$@" ;;
    *)      fail "Unknown package manager. Install $* manually."; return 1 ;;
  esac
}

# ── git ──────────────────────────────────────────────────────────────────────
step "1. git"
if command -v git &>/dev/null; then
  ok "git already installed: $(git --version | head -1)"
else
  info "Installing git..."
  install_pkg git
  ok "git installed"
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
step "2. Node.js"
if command -v node &>/dev/null; then
  ok "Node.js already installed: $(node --version)"
else
  warn "Node.js not found. Installing via nvm..."
  # Install nvm if not present
  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    info "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  else
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi
  nvm install 22
  nvm use 22
  ok "Node.js installed: $(node --version)"
fi

# ── pnpm ─────────────────────────────────────────────────────────────────────
step "3. pnpm"
if command -v pnpm &>/dev/null; then
  ok "pnpm already installed: $(pnpm --version)"
else
  npm install -g pnpm
  ok "pnpm installed"
fi

# ── rex-claude ───────────────────────────────────────────────────────────────
step "4. rex-claude"
if command -v rex &>/dev/null; then
  REX_VER=$(rex --version 2>/dev/null | head -1 || echo "unknown")
  ok "rex already installed: $REX_VER"
else
  info "Installing rex-claude..."
  npm install -g rex-claude
  ok "rex installed"
fi

# ── Ollama ───────────────────────────────────────────────────────────────────
step "5. Ollama (local AI — optional)"
if command -v ollama &>/dev/null; then
  ok "Ollama already installed"
else
  if [[ "$YES" == "true" ]] || { echo -e "  Install Ollama? [y/N] " && read -r ans && [[ "$ans" =~ ^[Yy]$ ]]; }; then
    info "Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    ok "Ollama installed"
  else
    warn "Skipped Ollama"
  fi
fi

# ── systemd service (headless) ───────────────────────────────────────────────
if [[ "$PROFILE" == "headless-node" || "$PROFILE" == "hub-vps" ]]; then
  step "6. systemd service"
  SERVICE_FILE="/etc/systemd/system/rex-daemon.service"
  if [ -f "$SERVICE_FILE" ]; then
    ok "rex-daemon systemd service already exists"
  else
    REX_PATH=$(command -v rex 2>/dev/null || echo "/usr/local/bin/rex")
    CURRENT_USER=$(whoami)
    info "Creating systemd service at $SERVICE_FILE..."
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=REX Daemon
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
ExecStart=$REX_PATH daemon
Restart=always
RestartSec=5
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable rex-daemon
    ok "rex-daemon service created and enabled"
    info "Start with: sudo systemctl start rex-daemon"
  fi
fi

# ── rex install ──────────────────────────────────────────────────────────────
step "7. REX initialization"
info "Running: rex install --profile=$PROFILE"
rex install --profile="$PROFILE" ${YES:+--yes}

echo -e "\n${GREEN}${BOLD}REX Linux setup complete!${RESET}"
echo -e "${DIM}Run 'rex doctor' to verify the installation.${RESET}"
if [[ "$PROFILE" == "headless-node" || "$PROFILE" == "hub-vps" ]]; then
  echo -e "${DIM}Start the daemon: sudo systemctl start rex-daemon${RESET}"
fi
echo ""
