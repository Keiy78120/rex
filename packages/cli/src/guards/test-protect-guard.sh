#!/bin/bash
# REX Guard: Test File Protection
# Hook: PostToolUse (matcher: Edit|Write)
# Prevents the #1 LLM anti-pattern: modifying tests to match broken code

# $CLAUDE_TOOL_INPUT contains the file path and changes
INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Check if a test file was modified
if echo "$INPUT" | grep -qE '\.(test|spec)\.(ts|tsx|js|jsx|py)'; then
  # Check if assertions were changed (likely making tests pass by changing expectations)
  if echo "$INPUT" | grep -qE 'expect\(|assert\.|assertEqual|toBe\(|toEqual\(|toMatch\('; then
    echo "REX Guard: Test assertions modified. Remember: fix the CODE, not the tests. Tests define truth."
  fi
fi
