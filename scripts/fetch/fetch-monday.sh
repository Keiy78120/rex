#!/bin/bash
# Usage: ./fetch-monday.sh <board_id> [status_filter]
BOARD_ID="${1:?Usage: fetch-monday.sh <board_id> [status]}"
FILTER="${2:-}"
QUERY='{"query":"{ boards(ids: ['$BOARD_ID']) { items_page(limit: 50) { items { id name state column_values { id text } } } } }"}'
curl -s -X POST https://api.monday.com/v1 \
  -H "Content-Type: application/json" \
  -H "Authorization: $MONDAY_API_TOKEN" \
  -d "$QUERY" \
  | jq '.data.boards[0].items_page.items | map({id,name,state,cols:.column_values})' 2>/dev/null
