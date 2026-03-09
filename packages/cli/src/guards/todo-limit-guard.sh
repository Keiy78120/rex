#!/bin/bash
# REX Guard: TODO/FIXME Accumulation Warning
# Hook: PostToolUse (Write, Edit)
# Warns when TODO/FIXME/HACK count in modified file exceeds threshold
# exit 1 = WARN (non-blocking), exit 0 = OK

TODO_LIMIT=${REX_TODO_LIMIT:-10}

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('file_path','') or d.get('path','') or '')
except:
  print('')
" 2>/dev/null)

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Only check code files
if ! echo "$FILE" | grep -qE '\.(ts|tsx|js|jsx|py|go|rs|dart|rb|java|swift|kt|c|cpp|h)$'; then
  exit 0
fi

TODO_COUNT=$(grep -cE '(TODO|FIXME|HACK|XXX)\b' "$FILE" 2>/dev/null || echo 0)

if [ "$TODO_COUNT" -gt "$TODO_LIMIT" ]; then
  echo "REX WARN: $FILE has $TODO_COUNT TODO/FIXME markers (limit: $TODO_LIMIT)."
  echo "Consider addressing some before adding more. Run 'rex debt' for full project list."
fi

exit 0
