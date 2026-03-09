#!/bin/bash
# REX Guard: Large File Blocker
# Hook: PreToolUse (Write)
# Blocks writing files > 10MB (likely binaries, datasets, or accidental large writes)
# exit 2 = BLOCK, exit 0 = OK

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('file_path','') or d.get('path','') or '')
except:
  print('')
" 2>/dev/null)

CONTENT_SIZE=$(echo "$INPUT" | wc -c)
# 10MB threshold in bytes for the JSON-encoded content
MAX_SIZE=10485760

if [ "$CONTENT_SIZE" -gt "$MAX_SIZE" ]; then
  echo "REX BLOCK: Attempting to write a very large file ($(( CONTENT_SIZE / 1024 / 1024 ))MB)."
  echo "File: $FILE"
  echo "Large binaries, datasets, and generated files should not be committed to git."
  echo "Add to .gitignore or use git-lfs for large assets."
  exit 2
fi

# Also block common binary extensions that should not be written
if echo "$FILE" | grep -qiE '\.(zip|tar|gz|bz2|rar|7z|exe|dll|so|dylib|bin|dat|pkl|pt|h5|onnx|safetensors|parquet|arrow)$'; then
  echo "REX WARNING: Writing binary file '$FILE' — ensure this is intentional."
  echo "Binary files should typically be in .gitignore and managed separately."
fi

exit 0
