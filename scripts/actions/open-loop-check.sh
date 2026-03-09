#!/usr/bin/env bash
# Report open loops (TODO/FIXME/BUG older than 7 days) from REX memory
# Usage: open-loop-check.sh [--json]

set -euo pipefail

JSON_MODE="${1:-}"
DB_PATH="${HOME}/.rex-memory/rex-memory.db"

if [[ ! -f "$DB_PATH" ]]; then
  echo "No memory DB found at $DB_PATH" >&2
  exit 1
fi

CUTOFF=$(date -v-7d '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -d '7 days ago' '+%Y-%m-%dT%H:%M:%S')

SQL="
  SELECT content, source, created_at
  FROM memories
  WHERE created_at <= '${CUTOFF}'
    AND (
      content LIKE '%TODO%' OR content LIKE '%FIXME%' OR
      content LIKE '%BUG%' OR content LIKE '%still broken%' OR
      content LIKE '%needs fix%'
    )
  ORDER BY created_at ASC
  LIMIT 20;
"

if [[ "$JSON_MODE" == "--json" ]]; then
  sqlite3 -json "$DB_PATH" "$SQL"
else
  echo "Open loops older than 7 days:"
  echo "================================"
  sqlite3 "$DB_PATH" "$SQL" | while IFS='|' read -r content source ts; do
    echo "[${ts}] (${source})"
    echo "  ${content:0:120}"
    echo
  done
fi
