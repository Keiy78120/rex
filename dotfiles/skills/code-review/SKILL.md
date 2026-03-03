---
name: code-review
description: Thorough code review of staged/changed files. Checks logic errors, security, performance, missing states, TypeScript strictness.
---

# Code Review

Review all changed files (`git diff`):

1. Logic errors and edge cases
2. Security vulnerabilities (OWASP top 10)
3. Performance (N+1 queries, unbounded loops, missing indexes)
4. Missing error handling, loading/empty/error states
5. TypeScript strictness (no `any`, no `@ts-ignore` without justification)
6. Consistency with existing codebase patterns

Rate findings: **critical** / **warning** / **suggestion**. Provide fix snippets.
Never suggest modifying tests to pass. Focus bugs > security > style.
