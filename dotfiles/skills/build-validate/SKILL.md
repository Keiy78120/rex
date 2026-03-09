---
name: build-validate
description: Verify code changes compile, pass tests, and work correctly. Runs build, lint, tests, dev server checks. Reports without modifying code.
---

# Build Validation

## Iron Rule

```
EVIDENCE BEFORE ASSERTIONS.
Never claim PASS without showing output.
```

Verify the current project state. Report each step with actual output — not "seems to work".

## Steps

### 1. Build
```bash
pnpm build   # or npm run build / flutter build macos --debug
```
→ Paste last 10 lines of output.
→ PASS: zero errors. FAIL: paste the error.

### 2. Lint (if configured)
```bash
pnpm lint   # or eslint / dart analyze
```
→ PASS: 0 errors/warnings. FAIL: list each.

### 3. Tests (if suite exists)
```bash
pnpm test   # or pytest / flutter test
```
→ PASS: X/X passing. FAIL: paste failing test names + errors.

### 4. Dev server sanity (if applicable)
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```
→ PASS: 200. FAIL: show status code + error.

### 5. UI changes → screenshot required
For any Flutter/web UI change, take a screenshot or use browser automation.
Do NOT describe UI without visual evidence.

## Report format

```
BUILD: ✅ PASS (pnpm build — 0 errors, 223ms)
LINT:  ✅ PASS (0 issues)
TESTS: ✅ PASS (42/42)
DEV:   ✅ PASS (curl → 200)
UI:    [screenshot attached]
```

or on failure:

```
BUILD: ❌ FAIL
  → packages/cli/src/foo.ts:42:10 — Property 'bar' does not exist on type 'Baz'
```

## NEVER
- Claim "build passes" without showing output
- Skip steps because they "probably pass"
- Modify code to fix failures (this skill is read-only reporting)
