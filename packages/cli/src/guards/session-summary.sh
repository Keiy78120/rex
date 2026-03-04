#!/bin/bash
# REX Guard: Session Summary
# Hook: Stop — auto-saves session state to memory
# Prevents context loss after compaction by persisting key decisions

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PROJECT_NAME=$(basename "$PROJECT_DIR")
MEMORY_DIR="$HOME/.claude/projects/-$(echo "$PROJECT_DIR" | tr '/' '-')/memory"
SUMMARY_FILE="$MEMORY_DIR/last-session.md"

mkdir -p "$MEMORY_DIR"

# Capture current state
BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "unknown")
MODIFIED=$(git -C "$PROJECT_DIR" diff --name-only 2>/dev/null | head -20)
STAGED=$(git -C "$PROJECT_DIR" diff --cached --name-only 2>/dev/null | head -20)
RECENT_COMMITS=$(git -C "$PROJECT_DIR" log --oneline -5 2>/dev/null)
UNTRACKED=$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard 2>/dev/null | head -10)

cat > "$SUMMARY_FILE" << SUMMARY
# Last Session Summary
Updated: $(date -u '+%Y-%m-%d %H:%M UTC')

## Branch: $BRANCH

## Recent commits
$RECENT_COMMITS

## Modified files (unstaged)
$MODIFIED

## Staged files
$STAGED

## Untracked files
$UNTRACKED
SUMMARY

# Also try to ingest the session transcript (background, non-blocking)
if command -v npx &>/dev/null; then
  (npx rex-cli ingest 2>/dev/null &)
fi
