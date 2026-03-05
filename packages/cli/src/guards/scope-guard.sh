#!/bin/bash
# REX Guard: Scope Creep Detector
# Hook: PostToolUse (matcher: Edit|Write)
# Detects when Claude modifies too many files — sign of scope creep

# Count files modified in current session (unstaged changes)
MODIFIED_COUNT=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
STAGED_COUNT=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
TOTAL=$((MODIFIED_COUNT + STAGED_COUNT))

if [ "$TOTAL" -gt 12 ]; then
  echo "REX Guard: $TOTAL files changed in this session. This may indicate scope creep."
  echo "Consider committing current work and splitting remaining changes into a separate task."
elif [ "$TOTAL" -gt 8 ]; then
  echo "REX Guard: $TOTAL files modified. Getting large — consider a checkpoint commit."
fi
