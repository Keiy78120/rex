#!/bin/bash
# REX Combined PostToolUse Guard (Edit|Write) — runs inline but FAST
# Combines: test-protect, ui-checklist, scope-guard, any-type, console-log
# Must complete in <2s to never impact UX

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# 1) Test file protection
if echo "$INPUT" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx|py)'; then
  if echo "$INPUT" | grep -qE 'expect\(|assert\.|assertEqual|toBe\(|toEqual\('; then
    echo "REX: Test assertions modified. Fix CODE, not tests."
  fi
fi

# 2) UI states checklist (only .tsx/.jsx)
if echo "$INPUT" | grep -qE '\.(tsx|jsx)'; then
  FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('file_path','') or d.get('path','') or '')
except:
  print('')
" 2>/dev/null)
  if [ -n "$FILE_PATH" ] && [ -f "$FILE_PATH" ]; then
    if grep -qE 'fetch\(|useQuery|useSWR|axios\.' "$FILE_PATH" 2>/dev/null; then
      MISSING=""
      grep -qE 'loading|isLoading|Skeleton|Spinner' "$FILE_PATH" 2>/dev/null || MISSING="${MISSING} loading"
      grep -qE 'error|isError|catch|onError' "$FILE_PATH" 2>/dev/null || MISSING="${MISSING} error"
      grep -qE 'empty|no.results|\.length.*0|isEmpty' "$FILE_PATH" 2>/dev/null || MISSING="${MISSING} empty"
      [ -n "$MISSING" ] && echo "REX: Missing UI states:${MISSING}"
    fi
  fi
fi

# 3) Scope check (cheap — just count)
TOTAL=$(( $(git diff --name-only 2>/dev/null | wc -l) + $(git diff --cached --name-only 2>/dev/null | wc -l) ))
[ "$TOTAL" -gt 12 ] && echo "REX: $TOTAL files changed — consider a checkpoint commit."

# 4) TypeScript 'any' type detection (only .ts/.tsx — skip tests and generated files)
if echo "$INPUT" | grep -qE '\.(ts|tsx)' && ! echo "$INPUT" | grep -qE '\.(test|spec)\.(ts|tsx)|\.d\.ts'; then
  NEW_CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('new_string','') or d.get('content','') or '')
except:
  print('')
" 2>/dev/null)
  ANY_COUNT=$(echo "$NEW_CONTENT" | grep -cE ':\s*any(\s|[,;<>|&)])|as\s+any\b|Array<any>|Promise<any>' 2>/dev/null || echo 0)
  if [ "$ANY_COUNT" -gt 0 ]; then
    echo "REX: $ANY_COUNT \`any\` type(s) added — prefer explicit types or \`unknown\` + type guard."
  fi
fi

# 5) console.log detection (only .ts/.tsx/.js — skip test and debug files)
if echo "$INPUT" | grep -qE '\.(ts|tsx|js|jsx)' && ! echo "$INPUT" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx)|debug\.|dev\.'; then
  NEW_CONTENT=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('new_string','') or d.get('content','') or '')
except:
  print('')
" 2>/dev/null)
  LOG_COUNT=$(echo "$NEW_CONTENT" | grep -cE 'console\.(log|warn|error|debug)\(' 2>/dev/null || echo 0)
  if [ "$LOG_COUNT" -gt 0 ]; then
    echo "REX: $LOG_COUNT console.log/warn/error added — use createLogger() from logger.ts instead."
  fi
fi

exit 0
