#!/bin/bash
# REX Guard: Force Push Blocker
# Hook: PreToolUse (Bash)
# Blocks git push --force / --force-with-lease on main/master branches
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

# Check for force push patterns
if echo "$CMD" | grep -qE 'git\s+push\s+.*(-f\b|--force\b|--force-with-lease)'; then
  # Check if targeting protected branches
  if echo "$CMD" | grep -qE '(origin|upstream|remote)\s+(main|master|prod|production|release)' || \
     echo "$CMD" | grep -qE '-f\s*(origin|upstream)?\s*(main|master|prod|production|release)'; then
    echo "REX SECURITY BLOCK: Force push to protected branch (main/master/prod) is not allowed."
    echo "Use 'git push --force-with-lease' for non-protected branches, or create a new branch."
    exit 2
  fi
  # Warn but allow force push to non-protected branches
  echo "REX WARNING: Force push detected. Ensure this is intentional and not targeting shared history."
fi

exit 0
