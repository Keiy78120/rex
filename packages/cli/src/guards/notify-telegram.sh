#!/bin/bash
# REX Guard: Telegram Notification on task completion
# Hook: Stop — fires when Claude finishes working
# Sends a short summary to Telegram for traceability

TELEGRAM_BOT_TOKEN="${REX_TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${REX_TELEGRAM_CHAT_ID:-}"

# Skip if not configured
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  exit 0
fi

# Build summary from git state
BRANCH=$(git branch --show-current 2>/dev/null || echo "n/a")
PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
MODIFIED=$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
LAST_COMMIT=$(git log -1 --format="%s" 2>/dev/null || echo "n/a")
TIMESTAMP=$(date +"%H:%M")

# Compose message
MSG="✅ *REX — Task Done*
━━━━━━━━━━━━━━
📁 \`${PROJECT}\` → \`${BRANCH}\`
📝 ${MODIFIED} modified, ${STAGED} staged
💬 ${LAST_COMMIT}
🕐 ${TIMESTAMP}"

# Send (fire-and-forget, no blocking)
curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "parse_mode=Markdown" \
  -d "text=${MSG}" > /dev/null 2>&1 &
