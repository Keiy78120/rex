---
name: build-validate
description: Verify code changes compile, pass tests, and work correctly. Runs build, lint, tests, dev server checks. Reports without modifying code.
---

# Build Validation

Verify the current project state:

1. Run build command (`npm run build` or equivalent)
2. Run linter if configured
3. Run test suite if exists
4. Start dev server, verify it loads (curl for 200)
5. For UI changes, take a screenshot

Report each step as PASS/FAIL with details. NEVER modify code — only report.
