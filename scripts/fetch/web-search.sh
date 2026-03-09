#!/bin/bash
# Usage: ./web-search.sh "query" [count]
# Requires: BRAVE_API_KEY env var
QUERY="${1:?Usage: web-search.sh <query> [count]}"
COUNT="${2:-5}"
curl -s "https://api.search.brave.com/res/v1/web/search?q=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$QUERY")&count=$COUNT" \
  -H "Accept: application/json" \
  -H "X-Subscription-Token: $BRAVE_API_KEY" \
  | jq '[.web.results[] | {title, url, description}]' 2>/dev/null || echo "[]"
