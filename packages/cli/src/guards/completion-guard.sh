#!/bin/bash
# REX Guard: Completion Verification
# Hook: Stop — runs when Claude considers stopping
# Prevents the "70-80% problem" — Claude declaring done with incomplete work

# Check for TODO/placeholder/stub patterns in recently modified files
MODIFIED_FILES=$(git diff --name-only HEAD 2>/dev/null)
if [ -z "$MODIFIED_FILES" ]; then
  exit 0
fi

ISSUES=""

# Check for incomplete implementation markers
for file in $MODIFIED_FILES; do
  if [ ! -f "$file" ]; then continue; fi

  # Skip non-code files
  case "$file" in
    *.md|*.json|*.lock|*.yaml|*.yml|*.txt|*.log) continue ;;
  esac

  TODOS=$(grep -n "TODO\|FIXME\|HACK\|XXX\|placeholder\|not.implemented\|throw new Error.*TODO" "$file" 2>/dev/null | head -5)
  if [ -n "$TODOS" ]; then
    ISSUES="${ISSUES}\n⚠ Incomplete markers in ${file}:\n${TODOS}\n"
  fi

  # Check for empty function bodies (common LLM pattern)
  EMPTY_FN=$(grep -n "{\s*}" "$file" 2>/dev/null | grep -v "import\|interface\|type " | head -3)
  if [ -n "$EMPTY_FN" ]; then
    ISSUES="${ISSUES}\n⚠ Empty function bodies in ${file}:\n${EMPTY_FN}\n"
  fi
done

if [ -n "$ISSUES" ]; then
  echo "REX Guard: Found potential incomplete implementation:"
  echo -e "$ISSUES"
  echo ""
  echo "Verify these are intentional before declaring the task done."
fi
