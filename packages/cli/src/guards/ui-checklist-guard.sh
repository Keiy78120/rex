#!/bin/bash
# REX Guard: UI States Checklist
# Hook: PostToolUse (matcher: Edit|Write)
# Prevents the "missing states" anti-pattern: LLMs generate happy path only

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Only check UI component files
if ! echo "$INPUT" | grep -qE '\.(tsx|jsx|vue|svelte)'; then
  exit 0
fi

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_./-]+\.(tsx|jsx|vue|svelte)' | head -1)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""

# Check if component does any data fetching
if grep -qE 'fetch\(|useQuery|useSWR|axios\.|\.get\(|\.post\(|trpc\.' "$FILE_PATH" 2>/dev/null; then
  # Must have loading state
  if ! grep -qE 'loading|isLoading|isPending|Skeleton|Spinner|Loading' "$FILE_PATH" 2>/dev/null; then
    ISSUES="${ISSUES}\n  - Missing loading state (no spinner/skeleton while fetching)"
  fi

  # Must have error state
  if ! grep -qE 'error|isError|Error|catch|onError' "$FILE_PATH" 2>/dev/null; then
    ISSUES="${ISSUES}\n  - Missing error state (no error handling for failed fetch)"
  fi

  # Must have empty state
  if ! grep -qE 'empty|no.results|no.data|\.length\s*[=!]==?\s*0|isEmpty' "$FILE_PATH" 2>/dev/null; then
    ISSUES="${ISSUES}\n  - Missing empty state (no UI for zero results)"
  fi
fi

if [ -n "$ISSUES" ]; then
  echo "REX Guard: UI component may be missing required states:"
  echo -e "$ISSUES"
  echo ""
  echo "Every component that fetches data needs: loading + error + empty states."
fi
