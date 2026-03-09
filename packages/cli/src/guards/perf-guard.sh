#!/bin/bash
# REX Guard: perf-guard
# Hook: PostToolUse (matcher: Write|Edit)
# Detects useEffect without deps array, fetch/API calls inside loops

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Only check TypeScript/JS files
if ! echo "$INPUT" | grep -qE '\.(ts|tsx|js|jsx)'; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\.(ts|tsx|js|jsx)' | head -1)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip test files
if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx)'; then
  exit 0
fi

ISSUES=""

# Check useEffect without dependency array — runs on every render
# Pattern: useEffect((...) => { ... }) with no second arg on same or next lines
USE_EFFECT_NO_DEPS=$(grep -cE 'useEffect\([^,)]+\)\s*$' "$FILE_PATH" 2>/dev/null || echo 0)
if [ "$USE_EFFECT_NO_DEPS" -gt 0 ]; then
  ISSUES="${ISSUES}\n  - useEffect without dependency array (runs on every render)"
fi

# Check fetch/axios/API calls inside for/forEach/map loops
# Pattern: for loop containing fetch, or .forEach/.map with fetch inside
FETCH_IN_LOOP=$(grep -cE '(for\s*\(|\.forEach\(|\.map\().*\n.*\bfetch\(' "$FILE_PATH" 2>/dev/null || echo 0)
# Simpler single-line heuristic: fetch on a line that's indented inside a loop
LOOP_FETCH=$(awk '/\b(for|forEach|while)\b.*\{/{in_loop=1} in_loop && /\bfetch\(/{count++} /^\s*\}/{if(in_loop)in_loop=0} END{print count+0}' "$FILE_PATH" 2>/dev/null || echo 0)
if [ "$LOOP_FETCH" -gt 0 ]; then
  ISSUES="${ISSUES}\n  - fetch() inside a loop — use Promise.all() instead"
fi

if [ -n "$ISSUES" ]; then
  echo "REX Guard: Performance concern(s) in ${FILE_PATH}:"
  echo -e "$ISSUES"
  echo ""
  echo "  Tips:"
  echo "    useEffect(() => { ... }, [dep1, dep2])   // always pass deps array"
  echo "    await Promise.all(items.map(item => fetch(...)))  // parallel, not serial"
fi

exit 0
