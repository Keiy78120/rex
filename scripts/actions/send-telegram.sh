#!/usr/bin/env bash
# Send a Telegram message via REX bot
# Usage: send-telegram.sh "<message>" [chat_id]
# Reads REX_TELEGRAM_BOT_TOKEN + REX_TELEGRAM_CHAT_ID from env or ~/.claude/settings.json

set -euo pipefail

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: send-telegram.sh \"<message>\" [chat_id]" >&2
  exit 1
fi

# Load from settings.json if env not set
if [[ -z "${REX_TELEGRAM_BOT_TOKEN:-}" ]]; then
  SETTINGS="$HOME/.claude/settings.json"
  if [[ -f "$SETTINGS" ]]; then
    REX_TELEGRAM_BOT_TOKEN="$(jq -r '.env.REX_TELEGRAM_BOT_TOKEN // empty' "$SETTINGS" 2>/dev/null || true)"
    REX_TELEGRAM_CHAT_ID="$(jq -r '.env.REX_TELEGRAM_CHAT_ID // empty' "$SETTINGS" 2>/dev/null || true)"
  fi
fi

TOKEN="${REX_TELEGRAM_BOT_TOKEN:-}"
CHAT="${2:-${REX_TELEGRAM_CHAT_ID:-}}"

if [[ -z "$TOKEN" || -z "$CHAT" ]]; then
  echo "Error: REX_TELEGRAM_BOT_TOKEN and REX_TELEGRAM_CHAT_ID are required" >&2
  exit 1
fi

curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${CHAT}\", \"text\": $(echo "$MSG" | jq -Rs .)}" \
  | jq -r 'if .ok then "Sent ✓" else "Error: \(.description)" end'
