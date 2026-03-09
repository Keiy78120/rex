#!/bin/bash
# REX Guard: Secret Leak Prevention
# Hook: PreToolUse (Write, Edit)
# Detects API keys, tokens, hardcoded credentials in content being written
# exit 2 = BLOCK, exit 0 = OK

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Skip .env.example / .env.sample / test files / template files
FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('file_path','') or d.get('path','') or '')
except:
  print('')
" 2>/dev/null)

if echo "$FILE" | grep -qE '\.env\.(example|sample|template)$|CLAUDE\.md$|\.(test|spec)\.(ts|tsx|js|jsx|py)$|fixtures?/'; then
  exit 0
fi

# Patterns that indicate hardcoded secrets
if echo "$INPUT" | grep -qE \
  'sk-[a-zA-Z0-9]{20,}|' \
  'ghp_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|' \
  'ANTHROPIC_API_KEY\s*[=:]\s*"[a-zA-Z0-9\-_]{20,}"|' \
  'OPENAI_API_KEY\s*[=:]\s*"[a-zA-Z0-9\-_]{20,}"|' \
  'Bearer\s+[a-zA-Z0-9\-._~+/]{40,}|' \
  'xoxb-[0-9]+-[a-zA-Z0-9\-]+|' \
  'AWS_SECRET_ACCESS_KEY\s*[=:]\s*"[a-zA-Z0-9+/]{40}"'; then
  echo "REX SECURITY BLOCK: Potential secret/API key detected in content. Use environment variables instead — never hardcode credentials."
  exit 2
fi

exit 0
