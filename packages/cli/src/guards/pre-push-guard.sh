#!/bin/bash
# REX Guard: Pre-push Review Gate
# Hook: PreToolUse (Bash)
# Runs rex review --pre-push before any git push — blocks on failures (secrets/TS errors)
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

# Only trigger on git push (not pull, clone, fetch, etc.)
if ! echo "$CMD" | grep -qE '^\s*git\s+push(\s|$)'; then
  exit 0
fi

# Skip if REX_SKIP_REVIEW is set
if [ -n "$REX_SKIP_REVIEW" ]; then
  exit 0
fi

# Locate rex binary
REX_BIN="rex"
if ! command -v rex &>/dev/null; then
  for p in "$HOME/.nvm/versions/node/v22.20.0/bin/rex" "$HOME/.local/bin/rex" "/usr/local/bin/rex"; do
    if [ -x "$p" ]; then
      REX_BIN="$p"
      break
    fi
  done
fi

if ! command -v "$REX_BIN" &>/dev/null 2>&1 && [ ! -x "$REX_BIN" ]; then
  exit 0  # rex not found — allow push
fi

echo "REX: Running pre-push review (secrets + TypeScript)..."

# Run pre-push review with 45s timeout; exits 1 on failures
timeout 45 "$REX_BIN" review --pre-push
EXIT_CODE=$?

if [ $EXIT_CODE -eq 124 ]; then
  echo "REX WARNING: Review timed out (45s). Allowing push — run 'rex review' manually."
  exit 0
fi

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "REX BLOCK: Pre-push review failed. Fix the issues above, then push again."
  echo "To bypass: REX_SKIP_REVIEW=1 git push"
  exit 2
fi

exit 0
