#!/bin/bash
# REX Guard: Dangerous Command Blocker
# Hook: PreToolUse (matcher: Bash)
# Prevents destructive commands from running without confirmation

# $TOOL_INPUT contains the command about to be executed
CMD="$TOOL_INPUT"

# Patterns that should ALWAYS be blocked or warned
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \$HOME"
  "git push --force main"
  "git push --force master"
  "git push -f origin main"
  "git push -f origin master"
  "git reset --hard"
  "git clean -fd"
  "DROP TABLE"
  "DROP DATABASE"
  "truncate "
  "--dangerously-skip"
  "--no-verify"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qi "$pattern"; then
    echo '{"decision": "block", "reason": "REX Guard: Dangerous command detected — '"$pattern"'. Use a safer alternative."}'
    exit 0
  fi
done

# Warn on potentially risky commands (don't block, just flag)
WARN_PATTERNS=(
  "git push --force"
  "rm -rf"
  "chmod 777"
  "curl.*| sh"
  "curl.*| bash"
  "npm publish"
  "npx wrangler deploy"
)

for pattern in "${WARN_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qi "$pattern"; then
    echo "REX Guard: Risky command detected ($pattern). Proceeding with caution."
    exit 0
  fi
done
