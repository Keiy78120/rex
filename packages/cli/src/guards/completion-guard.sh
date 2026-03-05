#!/bin/bash
# REX Guard: Completion Verification
# Hook: Stop — runs when Claude considers stopping
# Prevents the "70-80% problem" — Claude declaring done with incomplete work

# Check for TODO/placeholder/stub patterns in recently modified files
MODIFIED_FILES=$(git diff --name-only HEAD 2>/dev/null)
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null)

ALL_FILES=$(echo -e "${MODIFIED_FILES}\n${STAGED_FILES}\n${UNTRACKED_FILES}" | sort -u | grep -v '^$')

if [ -z "$ALL_FILES" ]; then
  exit 0
fi

ISSUES=""

# Warn about untracked files that should probably be committed
if [ -n "$UNTRACKED_FILES" ]; then
  UNTRACKED_CODE=$(echo "$UNTRACKED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|rs|go|sh|css|html|vue|svelte)$' | head -5)
  if [ -n "$UNTRACKED_CODE" ]; then
    ISSUES="${ISSUES}\n⚠ Untracked code files (forgot to git add?):\n${UNTRACKED_CODE}\n"
  fi
fi

# Check for incomplete implementation markers
for file in $ALL_FILES; do
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
