#!/usr/bin/env bash
# REX — macOS Bootstrap
# Idempotent one-command install for macOS (Intel + Apple Silicon)
# Usage: curl -fsSL https://raw.githubusercontent.com/Keiy78120/rex/main/scripts/install-macos.sh | bash
# Or:    bash scripts/install-macos.sh [--profile=desktop-full] [--yes]
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
PROFILE="desktop-full"
YES=false
for arg in "$@"; do
  case "$arg" in
    --profile=*) PROFILE="${arg#*=}" ;;
    --yes|-y)    YES=true ;;
  esac
done

echo -e "\n${BOLD}REX — macOS Bootstrap${RESET}"
echo -e "${DIM}Profile: ${PROFILE}${RESET}\n"

# ── macOS check ──────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  fail "This script is for macOS only. Use install-linux.sh for Linux."
  exit 1
fi

# ── Node.js ──────────────────────────────────────────────────────────────────
step "1. Node.js"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version 2>/dev/null)
  ok "Node.js already installed: $NODE_VER"
else
  warn "Node.js not found."
  if command -v brew &>/dev/null; then
    info "Installing via Homebrew..."
    brew install node
  elif command -v nvm &>/dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
    info "Installing Node 22 via nvm..."
    nvm install 22
    nvm use 22
  else
    fail "Neither Homebrew nor nvm found. Install Node.js manually: https://nodejs.org"
    exit 1
  fi
  ok "Node.js installed: $(node --version)"
fi

# ── pnpm ─────────────────────────────────────────────────────────────────────
step "2. pnpm"
if command -v pnpm &>/dev/null; then
  ok "pnpm already installed: $(pnpm --version)"
else
  info "Installing pnpm..."
  npm install -g pnpm
  ok "pnpm installed"
fi

# ── git ──────────────────────────────────────────────────────────────────────
step "3. git"
if command -v git &>/dev/null; then
  ok "git already installed: $(git --version | head -1)"
else
  warn "git not found. Installing via Homebrew..."
  if command -v brew &>/dev/null; then
    brew install git
  else
    fail "Homebrew not found. Install git manually: https://git-scm.com"
    exit 1
  fi
fi

# ── rex-claude ───────────────────────────────────────────────────────────────
step "4. rex-claude"
if command -v rex &>/dev/null; then
  REX_VER=$(rex --version 2>/dev/null | head -1 || echo "unknown")
  ok "rex already installed: $REX_VER"
else
  info "Installing rex-claude from npm..."
  npm install -g rex-claude
  ok "rex installed: $(rex --version 2>/dev/null | head -1 || echo 'ok')"
fi

# ── Ollama (local AI) ────────────────────────────────────────────────────────
step "5. Ollama (local AI — optional)"
if command -v ollama &>/dev/null; then
  ok "Ollama already installed: $(ollama --version 2>/dev/null || echo 'ok')"
else
  warn "Ollama not found (optional but recommended for local AI)."
  if [[ "$YES" == "true" ]] || { echo -e "  Install Ollama? [y/N] " && read -r ans && [[ "$ans" =~ ^[Yy]$ ]]; }; then
    if command -v brew &>/dev/null; then
      brew install ollama
    else
      info "Downloading Ollama installer..."
      curl -fsSL https://ollama.ai/install.sh | sh
    fi
    ok "Ollama installed"
  else
    warn "Skipped Ollama — memory features and local AI won't work"
  fi
fi

# ── Flutter (macOS app — desktop-full profile only) ──────────────────────────
if [[ "$PROFILE" == "desktop-full" ]]; then
  step "6. Flutter (macOS desktop app)"
  if command -v flutter &>/dev/null; then
    ok "Flutter already installed: $(flutter --version 2>/dev/null | head -1 || echo 'ok')"
  else
    warn "Flutter not found. Required for the macOS app."
    info "Install Flutter from: https://docs.flutter.dev/get-started/install/macos"
    warn "Skipping app build — install Flutter then run: rex install --profile=desktop-full"
  fi
fi

# ── rex install ──────────────────────────────────────────────────────────────
step "7. REX initialization"
info "Running: rex install --profile=$PROFILE"
rex install --profile="$PROFILE" ${YES:+--yes}

echo -e "\n${GREEN}${BOLD}REX macOS setup complete!${RESET}"
echo -e "${DIM}Run 'rex doctor' to verify the installation.${RESET}\n"
