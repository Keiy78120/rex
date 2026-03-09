#!/bin/bash
# REX Guard: a11y-guard
# Hook: PostToolUse (matcher: Write|Edit)
# Checks TSX files for img without alt, button without aria-label

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Only check TSX/JSX files
if ! echo "$INPUT" | grep -qE '\.(tsx|jsx)'; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\.(tsx|jsx)' | head -1)
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""

# Check <img without alt attribute
if grep -qE '<img\b' "$FILE_PATH" 2>/dev/null; then
  IMG_NO_ALT=$(grep -cE '<img\b(?![^>]*\balt=)' "$FILE_PATH" 2>/dev/null || true)
  # Simpler check: img tags that don't have alt= on same line
  IMG_LINES=$(grep -nE '<img\b' "$FILE_PATH" 2>/dev/null | grep -vE '\balt=' | wc -l | tr -d ' ')
  if [ "$IMG_LINES" -gt 0 ]; then
    ISSUES="${ISSUES}\n  - <img> tag(s) without alt attribute (${IMG_LINES} found)"
  fi
fi

# Check <button without aria-label or visible text hint
if grep -qE '<button\b' "$FILE_PATH" 2>/dev/null; then
  # Icon-only buttons: button with only an icon child and no visible label
  BTN_ICON_ONLY=$(grep -nE '<button\b[^>]*>' "$FILE_PATH" 2>/dev/null | grep -vE '(aria-label=|aria-labelledby=)' | wc -l | tr -d ' ')
  if [ "$BTN_ICON_ONLY" -gt 0 ]; then
    ISSUES="${ISSUES}\n  - <button> without aria-label may not be accessible (${BTN_ICON_ONLY} found)"
  fi
fi

if [ -n "$ISSUES" ]; then
  echo "REX Guard: Accessibility issues in ${FILE_PATH}:"
  echo -e "$ISSUES"
  echo ""
  echo "  Fix:"
  echo "    <img src='...' alt='Descriptive text' />   // or alt='' if decorative"
  echo "    <button aria-label='Close dialog'>...</button>"
fi

exit 0
