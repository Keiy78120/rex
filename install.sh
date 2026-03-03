#!/bin/bash
set -e

REX_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

echo "=== REX Install ==="

# 1. Symlink dotfiles → ~/.claude/
echo "→ Syncing dotfiles..."
for item in CLAUDE.md settings.json commands rules agents skills templates; do
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

# 2. Install MCP server dependencies
echo "→ Installing memory server..."
cd "$REX_DIR/memory"
npm install

# 3. Build MCP server
echo "→ Building memory server..."
npm run build

# 4. Register MCP server in settings.json
echo "→ Registering rex-memory MCP server..."
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ] && command -v jq &> /dev/null; then
  # Check if already registered
  if ! jq -e '.mcpServers."rex-memory"' "$SETTINGS" &>/dev/null; then
    tmp=$(mktemp)
    jq --arg cmd "node" --arg dir "$REX_DIR/memory/dist/server.js" \
      '.mcpServers["rex-memory"] = {"command": $cmd, "args": [$dir]}' \
      "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    echo "  Registered rex-memory in settings.json"
  else
    echo "  rex-memory already registered"
  fi
fi

# 5. Hammerspoon
if ! command -v hammerspoon &> /dev/null; then
  echo "→ Installing Hammerspoon..."
  brew install --cask hammerspoon
fi

HS_DIR="$HOME/.hammerspoon"
mkdir -p "$HS_DIR"
if ! grep -q "rex/activity" "$HS_DIR/init.lua" 2>/dev/null; then
  cat >> "$HS_DIR/init.lua" << 'EOF'

-- REX Activity Logger
local rex = dofile(os.getenv("HOME") .. "/Documents/Developer/_config/rex/activity/init.lua")
rex.start()
EOF
  echo "  Added REX logger to Hammerspoon init.lua"
fi

# 6. Ensure db directory exists
mkdir -p "$REX_DIR/memory/db"

# 7. Remove old dotfiles dir if still present
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
echo "  MCP:      rex-memory server registered"
echo "  Activity: Hammerspoon logger configured"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code to pick up MCP server"
echo "  2. Open Hammerspoon to start activity logging"
echo "  3. Run 'cd $REX_DIR/memory && npm run ingest' to import past sessions"
