#!/bin/bash
# REX Guard: Pre-push Review Gate
# Hook: PreToolUse (Bash)
# Runs rex review --quick before any git push — blocks on failures
# exit 2 = BLOCK, exit 0 = OK

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('command','') or '')
except:
  print('')
" 2>/dev/null)

# Only trigger on git push (not pull, clone, etc.)
if ! echo "$CMD" | grep -qE '^\s*git\s+push(\s|$)'; then
  exit 0
fi

# Skip if REX_SKIP_REVIEW is set
if [ -n "$REX_SKIP_REVIEW" ]; then
  exit 0
fi

# Locate rex binary
REX_BIN="${REX_BIN:-rex}"
if ! command -v "$REX_BIN" &>/dev/null; then
  # Try common paths
  for p in "$HOME/.nvm/versions/node/v22.20.0/bin/rex" "$HOME/.local/bin/rex" "/usr/local/bin/rex"; do
    if [ -x "$p" ]; then
      REX_BIN="$p"
      break
    fi
  done
fi

if ! command -v "$REX_BIN" &>/dev/null 2>&1 && [ ! -x "$REX_BIN" ]; then
  # rex not found — allow push, don't block
  exit 0
fi

echo "REX: Running pre-push review..."

# Run review with 45s timeout, capture JSON output
REVIEW_OUTPUT=$(timeout 45 "$REX_BIN" review --quick --json 2>/dev/null)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "REX WARNING: Review timed out (45s). Allowing push — run 'rex review --quick' manually."
  exit 0
fi

if [ -z "$REVIEW_OUTPUT" ]; then
  echo "REX WARNING: Review returned no output. Allowing push."
  exit 0
fi

# Parse failures from JSON
FAILURES=$(echo "$REVIEW_OUTPUT" | python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  results = data.get('results', [])
  fails = [r for r in results if r.get('status') == 'fail']
  for f in fails:
    print(f\"{f.get('name','?')}: {f.get('message','')}\")
  sys.exit(0 if not fails else 1)
except Exception as e:
  sys.exit(0)
" 2>/dev/null)

PARSE_EXIT=$?

if [ $PARSE_EXIT -ne 0 ]; then
  echo "REX BLOCK: Pre-push review failed:"
  echo "$FAILURES" | while IFS= read -r line; do
    echo "  ✗ $line"
  done
  echo ""
  echo "Fix the issues above, then push again."
  echo "To bypass: REX_SKIP_REVIEW=1 git push"
  exit 2
fi

echo "REX: Review passed — pushing."
exit 0
