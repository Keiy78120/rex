---
name: code-review
description: Thorough code review of staged/changed files. Checks logic errors, security, performance, missing states, TypeScript strictness.
---

# Code Review

## Two-Stage Review (mandatory order)

### Stage 1 — Spec Compliance

Does the code do what was asked and ONLY what was asked?

- Missing requirements: features specified but not implemented
- Extra features: code added that wasn't requested (YAGNI violation)
- Wrong behavior: misunderstood the spec

→ If Stage 1 has issues, report them and stop. Do NOT proceed to Stage 2 until spec issues are resolved.

### Stage 2 — Code Quality

Only after Stage 1 passes:

1. **Logic errors** — edge cases, off-by-one, null/undefined access, wrong conditionals
2. **Security** (OWASP top 10):
   - SQL injection (parameterized queries only)
   - XSS (escape user input in DOM)
   - Secrets in code (no hardcoded keys, tokens, passwords)
   - Auth missing on endpoints that need it
3. **Performance**:
   - N+1 queries (loops with DB calls)
   - Unbounded lists (pagination missing)
   - Missing indexes on filtered/sorted columns
4. **Error handling**:
   - Missing loading/empty/error states in UI
   - Unhandled promise rejections
   - Silent catch blocks swallowing errors
5. **TypeScript strictness**:
   - `any` without justification
   - `@ts-ignore` / `eslint-disable` without comment
6. **Consistency** — follows existing patterns, naming conventions, file structure

## Rating

- **critical**: security vulnerability, data loss risk, blocking bug — MUST fix before merge
- **warning**: wrong behavior, missing state handling — should fix
- **suggestion**: style, naming, optional improvement — take or leave

## Format

```
Stage 1 — Spec: ✅ compliant / ❌ issues:
  - Missing: [requirement]
  - Extra: [unrequested code]

Stage 2 — Quality:
  [critical] packages/cli/src/foo.ts:42 — SQL injection: `db.query(\`... ${userId}\`)`
             Fix: `db.query('... ?', [userId])`
  [warning]  lib/pages/foo.dart:88 — Missing empty state when list is []
  [suggestion] Use `const` instead of `final` for immutable widget
```

## NEVER
- Stage 2 before Stage 1 passes
- Suggest deleting tests to make them pass
- Ignore security findings because "it's just internal"
- Accept "close enough" on spec compliance
