#!/bin/bash
set -e

REX_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== REX Install ==="

# ── Detect OS ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"
IS_MACOS=false
IS_LINUX=false
case "$OS" in
  Darwin) IS_MACOS=true ;;
  Linux)  IS_LINUX=true  ;;
  *)      echo "⚠️  Unsupported OS: $OS — proceeding anyway" ;;
esac

# ── Check prerequisites ────────────────────────────────────────────────────────
check_deps() {
  for cmd in node npm jq; do
    command -v "$cmd" &>/dev/null || { echo "❌ Missing: $cmd — please install it first"; exit 1; }
  done
  node --version | grep -qE "v(20|21|22|23)" || echo "⚠️  Node 20+ recommended (found $(node --version))"
}
check_deps

# 1. Symlink dotfiles → ~/.claude/
echo "→ Syncing dotfiles..."
mkdir -p "$CLAUDE_DIR"
for item in CLAUDE.md commands rules agents skills templates; do
  src="$REX_DIR/dotfiles/$item"
  dest="$CLAUDE_DIR/$item"
  if [ -e "$src" ]; then
    if [ -L "$dest" ]; then
      rm "$dest"
    elif [ -e "$dest" ]; then
      echo "  Backing up existing $dest → ${dest}.bak"
      mv "$dest" "${dest}.bak"
    fi
    ln -sf "$src" "$dest"
    echo "  Linked $item"
  fi
done

# 1b. Sync skills + AGENTS.md to ~/.codex/ (Codex integration)
CODEX_DIR="$HOME/.codex"
if [ -d "$CODEX_DIR" ]; then
  echo "→ Syncing REX to Codex (~/.codex/)..."

  # Symlink skills (same format as Claude)
  for item in skills; do
    src="$REX_DIR/dotfiles/$item"
    dest="$CODEX_DIR/$item"
    if [ -e "$src" ]; then
      if [ -L "$dest" ]; then rm "$dest"
      elif [ -e "$dest" ]; then
        echo "  Backing up existing $dest → ${dest}.bak"
        mv "$dest" "${dest}.bak"
      fi
      ln -sf "$src" "$dest"
      echo "  Linked $item → ~/.codex/$item"
    fi
  done

  # Symlink AGENTS.md (Codex equivalent of CLAUDE.md)
  agents_src="$REX_DIR/dotfiles/AGENTS.md"
  agents_dest="$CODEX_DIR/AGENTS.md"
  if [ -e "$agents_src" ]; then
    [ -L "$agents_dest" ] && rm "$agents_dest"
    ln -sf "$agents_src" "$agents_dest"
    echo "  Linked AGENTS.md → ~/.codex/AGENTS.md"
  fi

  # Register rex-memory MCP in config.toml (smart merge — preserves existing)
  CODEX_CONFIG="$CODEX_DIR/config.toml"
  if [ -f "$CODEX_CONFIG" ]; then
    if ! grep -q 'rex-memory' "$CODEX_CONFIG"; then
      # Find built memory server path (same as used for Claude)
      MEMORY_SERVER="$REX_DIR/memory/dist/server.js"
      if [ -f "$MEMORY_SERVER" ]; then
        cat >> "$CODEX_CONFIG" << TOML

[mcp_servers.rex-memory]
command = "node"
args = ["$MEMORY_SERVER"]
TOML
        echo "  Registered rex-memory in ~/.codex/config.toml"
      else
        echo "  ⚠️  Memory server not built yet — run 'rex install' after build"
      fi
    else
      echo "  rex-memory already in config.toml"
    fi
  else
    echo "  ℹ️  ~/.codex/config.toml not found — skipping MCP merge"
  fi
else
  echo "→ Codex not installed — skipping ~/.codex/ integration (install codex-cli to enable)"
fi

# 2. Install MCP server dependencies
echo "→ Installing memory server..."
cd "$REX_DIR/memory"
npm install

# 3. Build MCP server
echo "→ Building memory server..."
npm run build

# 4. Register MCP server in settings.json (smart merge — preserves existing mcpServers)
echo "→ Registering rex-memory MCP server..."
SETTINGS="$CLAUDE_DIR/settings.json"

if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

if command -v jq &>/dev/null; then
  # Ensure .mcpServers key exists, then merge rex-memory without overwriting others
  if ! jq -e '.mcpServers."rex-memory"' "$SETTINGS" &>/dev/null; then
    tmp=$(mktemp)
    jq --arg cmd "node" --arg dir "$REX_DIR/memory/dist/server.js" \
      'if .mcpServers == null then .mcpServers = {} else . end
       | .mcpServers["rex-memory"] = {"command": $cmd, "args": [$dir]}' \
      "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    echo "  Registered rex-memory in settings.json (existing mcpServers preserved)"
  else
    echo "  rex-memory already registered"
  fi
else
  echo "  ⚠️  jq not found — skipping settings.json merge (install jq and re-run)"
fi

# 5. Hammerspoon (macOS only)
if $IS_MACOS; then
  if ! command -v hammerspoon &>/dev/null; then
    echo "→ Installing Hammerspoon..."
    brew install --cask hammerspoon
  fi

  HS_DIR="$HOME/.hammerspoon"
  mkdir -p "$HS_DIR"
  if ! grep -q "rex/activity" "$HS_DIR/init.lua" 2>/dev/null; then
    cat >> "$HS_DIR/init.lua" << EOF

-- REX Activity Logger
local rex = dofile("$REX_DIR/activity/init.lua")
rex.start()
EOF
    echo "  Added REX logger to Hammerspoon init.lua"
  fi
else
  echo "→ Skipping Hammerspoon (macOS only)"
  echo "  Linux: use systemd for gateway (see docs/linux-setup.md)"
fi

# 6. LaunchAgents (macOS only)
if $IS_MACOS; then
  if [ -d "$REX_DIR/launchagents" ] 2>/dev/null; then
    echo "→ Installing LaunchAgents..."
    LAUNCH_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$LAUNCH_DIR"
    for plist in "$REX_DIR/launchagents/"*.plist; do
      [ -f "$plist" ] || continue
      dest="$LAUNCH_DIR/$(basename "$plist")"
      # Replace REX_DIR placeholder if present
      sed "s|REX_DIR|$REX_DIR|g" "$plist" > "$dest"
      launchctl load "$dest" 2>/dev/null || true
      echo "  Loaded $(basename "$plist")"
    done
  fi
else
  echo "→ Skipping LaunchAgents (macOS only)"
fi

# 7. Ensure db directory exists
mkdir -p "$REX_DIR/memory/db"

# 8. Remove old dotfiles dir if still present
if [ -d "$HOME/.claude-dotfiles" ] && [ ! -L "$HOME/.claude-dotfiles" ]; then
  echo "→ Old ~/.claude-dotfiles found. Remove it? (y/N)"
  read -r answer
  if [ "$answer" = "y" ]; then
    rm -rf "$HOME/.claude-dotfiles"
    echo "  Removed ~/.claude-dotfiles"
  fi
fi

echo ""
echo "=== REX installed ==="
echo "  Dotfiles: $REX_DIR/dotfiles/ → ~/.claude/"
echo "  MCP:      rex-memory server registered in $SETTINGS"
echo "  Codex:    rex-memory + skills synced to ~/.codex/"
if $IS_MACOS; then
  echo "  Activity: Hammerspoon logger configured"
else
  echo "  Activity: systemd recommended — see docs/linux-setup.md"
fi
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to pick up MCP server"
if $IS_MACOS; then
  echo "  2. Open Hammerspoon to start activity logging"
fi
echo "  3. Run 'cd $REX_DIR/memory && npm run ingest' to import past sessions"
echo ""
echo "💡 Alternative: after installing rex-claude globally, use 'rex install'"
echo "   (one command: init + setup + audit)"
