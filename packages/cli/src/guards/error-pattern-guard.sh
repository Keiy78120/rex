#!/bin/bash
# REX Guard: Error Pattern Detector
# Hook: PostToolUse (matcher: Bash)
# Detects recurring error patterns in command output and suggests creating rules

TRACK_FILE="${HOME}/.claude/rex-error-patterns.json"
TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-$TOOL_OUTPUT}"

# Only process if there's output that looks like an error
if [ -z "$TOOL_OUTPUT" ]; then
  exit 0
fi

# Extract error-like lines from output
ERRORS=$(echo "$TOOL_OUTPUT" | grep -iE '(error|ERR!|fatal|failed|ENOENT|EACCES|TypeError|SyntaxError|ReferenceError|Cannot find|Module not found|command not found)' | head -3)

if [ -z "$ERRORS" ]; then
  exit 0
fi

# Normalize error to a pattern (strip file paths, line numbers, specific values)
PATTERN=$(echo "$ERRORS" | head -1 | sed 's/[0-9]\+/N/g' | sed 's|/[^ ]*||g' | sed 's/"[^"]*"/"..."/g' | cut -c1-100)

if [ -z "$PATTERN" ]; then
  exit 0
fi

# Initialize tracking file if needed
if [ ! -f "$TRACK_FILE" ]; then
  echo '{}' > "$TRACK_FILE"
fi

# Count occurrences of this pattern (using simple grep since jq may not be available)
COUNT=$(grep -c "$PATTERN" "$TRACK_FILE" 2>/dev/null || echo "0")
NEWCOUNT=$((COUNT + 1))

# Append pattern to tracking file
echo "{\"pattern\":\"$PATTERN\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$TRACK_FILE"

# After 3 occurrences, suggest creating a rule
if [ "$NEWCOUNT" -ge 3 ]; then
  echo "REX Guard: Recurring error detected ($NEWCOUNT times): $PATTERN"
  echo "Consider using /new-rule to create a permanent rule for this pattern."
  echo "Call rex_learn with category 'lesson' to memorize: \"Recurring error: $PATTERN\""
fi
