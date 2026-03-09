#!/bin/bash
# REX Guard: .env File Commit Blocker
# Hook: PreToolUse (Bash)
# Blocks git add / git commit staging .env files with real credentials
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

# Block git add of .env files
if echo "$CMD" | grep -qE 'git\s+add\s+.*\.env($|[^\.])'; then
  # Allow .env.example, .env.sample, .env.template
  if echo "$CMD" | grep -qE '\.env\.(example|sample|template|test)'; then
    exit 0
  fi
  echo "REX SECURITY BLOCK: Attempting to stage a .env file."
  echo "Secrets must never be committed. Add '.env' to .gitignore instead."
  echo "Use .env.example with placeholder values for documentation."
  exit 2
fi

# Block git commit -a when .env is modified/staged
if echo "$CMD" | grep -qE 'git\s+commit\s+.*(-a|--all)'; then
  # Check if any .env files are staged (excluding examples)
  STAGED=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.env($|[^\.])')
  if echo "$STAGED" | grep -qE '^\.' && ! echo "$STAGED" | grep -qE '\.(example|sample|template|test)$'; then
    echo "REX SECURITY BLOCK: .env file is staged in this commit."
    echo "Run 'git reset HEAD .env' to unstage, then add to .gitignore."
    exit 2
  fi
fi

exit 0
