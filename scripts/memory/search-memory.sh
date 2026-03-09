#!/bin/bash
# Usage: ./search-memory.sh "query" [limit]
QUERY="${1:?Usage: search-memory.sh <query> [limit]}"
LIMIT="${2:-5}"
# BM25 text search (fast, no LLM)
find ~/.rex/memory ~/.openclaw/workspace/knowledge -name "*.md" -o -name "*.yaml" 2>/dev/null \
  | xargs grep -il "$QUERY" 2>/dev/null \
  | head -"$LIMIT" \
  | while read f; do
      echo "=== $f ==="
      grep -i -A2 -B2 "$QUERY" "$f" | head -20
    done
