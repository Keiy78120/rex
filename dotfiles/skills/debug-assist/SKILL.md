---
name: debug-assist
description: Systematic debugging. Reads error, searches REX memory for past solutions, checks docs, identifies root cause. Use when stuck on an error.
---

# Debug Assist

Debug: $ARGUMENTS (paste the error message or describe the issue)

## Iron Law

```
NO FIX WITHOUT ROOT CAUSE. PERIOD.
```

If Phase 1 is not complete, you CANNOT propose a fix. "Quick fixes" that skip root cause analysis are the primary source of recurring bugs.

## Phase 1 — Investigate (MANDATORY before ANY fix)

1. **Read the error completely**: file, line, error type, full stack trace — never skip
2. **Check REX memory**: `rex search "error keywords"` — has this been solved before?
3. **Check local docs**: `~/.claude/docs/{framework}.md` — known gotchas for this stack
4. **Find the failing code**: read the file, 20 lines before and after the error site
5. **Check recent changes**: `git diff HEAD~3 -- {affected_file}` — what changed?
6. **State the root cause**: write it out explicitly before continuing

If you cannot state root cause with confidence → add instrumentation, gather more evidence, do NOT guess.

## Phase 2 — Fix

Only after root cause is confirmed:

1. Write the minimal fix (not a refactor, not a cleanup — just the fix)
2. Show the fix with full context (file path + line range)
3. Explain WHY this fixes the root cause (1 sentence)

## Phase 3 — Verify (evidence required)

Run the build/test that was failing and **paste the output**. Do NOT claim "fixed" without showing:
- Build output (last 10 lines)
- Test result (if applicable)
- The previously failing behavior no longer occurring

## Phase 4 — Retain

- Save to REX: `rex_learn("Error X was caused by Y, fix is Z", "debug")`
- If framework gotcha: update `~/.claude/docs/{framework}.md`

## NEVER

- Fix without root cause → creates new bugs, masks the real problem
- Delete a test to make it pass → corruption of signal
- Add `@ts-ignore` or `eslint-disable` as a fix → technical debt
- Try the same approach more than twice → change angle or ask
- Claim "fixed" without showing proof → assumption, not verification
