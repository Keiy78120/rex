#!/bin/bash
# REX Guard: honesty-guard
# Hook: UserPromptSubmit
# Detects "c'est fait" / "it's done" claims without attached proof
# INJECT: verification prompt to require evidence

INPUT="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}"

# Check for completion claims without evidence
if echo "$INPUT" | grep -qiE "(c'est fait|it'?s done|it is done|all done|c'est terminé|terminé|j'ai fini|i'?ve finished|fini|that'?s done|done!|all good|works now|fixed now|c'est bon)"; then
  # Check if there's evidence: command output, error trace, test results, build log
  if ! echo "$INPUT" | grep -qE '(\$\s|```|npm run|pnpm|flutter build|tsc|PASS|FAIL|error:|Error:|[0-9]+ passing|[0-9]+ tests)'; then
    echo "REX Guard (honesty): Completion claim detected without evidence."
    echo ""
    echo "Before marking as done, provide:"
    echo "  1. Build output: \`pnpm build\` (0 errors)"
    echo "  2. Run output: test the feature manually or with tests"
    echo "  3. Screenshot or log snippet showing the expected behavior"
    echo ""
    echo "Rule: '§ Verification — Always provide a way to verify work'"
    exit 0
  fi
fi

exit 0
