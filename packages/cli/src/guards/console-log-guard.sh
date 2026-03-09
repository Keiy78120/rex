#!/bin/bash
# REX Guard: console-log-guard
# Hook: PostToolUse (matcher: Write|Edit)
# Detects console.log outside test files — warns to use createLogger()

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Only check TypeScript files
if ! echo "$INPUT" | grep -qE '\.(ts|tsx)'; then
  exit 0
fi

# Extract file path
FILE_PATH=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\.(ts|tsx)' | head -1)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip test files
if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|tsx)'; then
  exit 0
fi

# Check for console.log / console.error / console.warn (not in comments)
COUNT=$(grep -cE '^\s*(console\.(log|error|warn|debug|info)\()' "$FILE_PATH" 2>/dev/null || echo 0)

if [ "$COUNT" -gt 0 ]; then
  echo "REX Guard: Found ${COUNT} console.log/error/warn in ${FILE_PATH}"
  echo ""
  echo "  In REX CLI modules, use the centralized logger instead:"
  echo ""
  echo "    import { createLogger } from './logger.js'"
  echo "    const log = createLogger('MODULE:name')"
  echo "    log.info('message')  // console + file, with level filtering"
  echo "    log.warn('message')"
  echo "    log.error('message')"
  echo ""
  echo "  Benefits: dual output (console + ~/.claude/rex/daemon.log), rotation, --verbose flag"
fi

exit 0
