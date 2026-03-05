---
name: debug-assist
description: Systematic debugging. Reads error, searches REX memory for past solutions, checks docs, identifies root cause. Use when stuck on an error.
---

# Debug Assist

Debug: $ARGUMENTS (paste the error message or describe the issue)

## Process
1. **Parse the error**: extract file, line, error type, stack trace
2. **Check REX memory**: `rex_search("error message keywords")` for past solutions
3. **Check local docs**: read `~/.claude/docs/{framework}.md` for known gotchas
4. **Search codebase**: find the failing code, read surrounding context
5. **Identify root cause**: not the symptom — what ACTUALLY caused it
6. **Propose fix**: with code snippet and explanation

## Anti-patterns (NEVER do these)
- Never suppress the error without understanding it
- Never delete a test to make it pass
- Never add `@ts-ignore` or `eslint-disable` as a fix
- Never retry the same approach more than twice — try a different angle

## After fixing
- Save the pattern to REX: `rex_learn("Error X was caused by Y, fix is Z", "debug")`
- Update `~/.claude/docs/{framework}.md` if it's a framework gotcha
