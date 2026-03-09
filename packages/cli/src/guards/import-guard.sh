#!/bin/bash
# REX Guard: import-guard
# Hook: PostToolUse (matcher: Write|Edit)
# Detects imports that are never used in the file body

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Only check TypeScript files
if ! echo "$INPUT" | grep -qE '\.(ts|tsx)'; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\.(ts|tsx)' | head -1)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip test files
if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|tsx)'; then
  exit 0
fi

ISSUES=""

# Extract named imports from all import lines
# Handles: import { Foo, Bar } from '...'
# Skip type-only imports (import type { ... }) — they're compile-time only
while IFS= read -r import_line; do
  # Extract the imported names between { and }
  names=$(echo "$import_line" | grep -oE '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' | sed 's/^\s*//;s/\s*$//')
  while IFS= read -r name; do
    # Strip 'as alias' — check both original and alias
    alias=$(echo "$name" | grep -oE 'as\s+\w+' | awk '{print $2}')
    original=$(echo "$name" | sed 's/\s*as\s*\w*//' | tr -d ' ')
    check_name="${alias:-$original}"
    [ -z "$check_name" ] && continue
    # Count usages outside the import line itself
    usage_count=$(grep -cv "^import " "$FILE_PATH" 2>/dev/null | head -1)
    uses=$(grep -v "^import " "$FILE_PATH" 2>/dev/null | grep -cE "\b${check_name}\b" || echo 0)
    if [ "$uses" -eq 0 ]; then
      ISSUES="${ISSUES}\n  - Unused import: '${check_name}'"
    fi
  done <<< "$names"
done < <(grep -E "^import\s*\{" "$FILE_PATH" | grep -v "^import\s*type\s")

if [ -n "$ISSUES" ]; then
  echo "REX Guard: Unused import(s) in ${FILE_PATH}:"
  echo -e "$ISSUES"
  echo ""
  echo "  Remove unused imports to keep the codebase clean."
  echo "  TypeScript strict mode will also catch these at build time."
fi

exit 0
