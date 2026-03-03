Run the project's test suite and analyze results.

Steps:
1. Detect test framework (look for vitest.config, jest.config, playwright.config)
2. Run the appropriate test command
3. If tests fail:
   - Analyze each failure
   - Identify root cause
   - Suggest fixes (NEVER modify tests to make them pass — fix the code)
4. Report: total tests, passed, failed, skipped
5. If no test suite exists, report that and suggest setting one up
