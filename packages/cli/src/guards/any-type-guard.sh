#!/bin/bash
# REX Guard: any-type-guard
# Hook: PostToolUse (matcher: Write|Edit)
# Detects `: any` TypeScript additions — warns with type suggestion

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

# Count `: any` occurrences (not in comments)
COUNT=$(grep -cE ':\s*any\b' "$FILE_PATH" 2>/dev/null || echo 0)

if [ "$COUNT" -gt 0 ]; then
  echo "REX Guard: Found ${COUNT} usage(s) of \`: any\` in ${FILE_PATH}"
  echo ""
  echo "  Prefer explicit types:"
  echo "    - \`unknown\` + type guard if type is truly uncertain"
  echo "    - \`Record<string, unknown>\` for generic objects"
  echo "    - \`Parameters<typeof fn>[0]\` to derive from existing types"
  echo "    - A proper interface or type alias"
  echo ""
  echo "  Rule: packages/cli/CLAUDE.md — 'Toujours typer explicitement (pas de \`any\`)'"
fi

exit 0
