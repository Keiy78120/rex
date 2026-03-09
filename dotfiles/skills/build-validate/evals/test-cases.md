# Build Validate — Eval Test Cases

## Test 1: Standard CLI change verification
**Prompt:** I just added a new `rex curious` command to `packages/cli/src/index.ts`. Can you validate the build?
**Success criteria:**
- Runs `pnpm build` from the repo root (or `packages/cli`)
- Pastes the actual last 10 lines of output — not a summary
- Reports result as `BUILD: ✅ PASS` or `BUILD: ❌ FAIL` with exact error
- Runs `pnpm lint` if an eslint config exists (checks for it first — does not assume)
- Does NOT modify any code regardless of what the build output says
- Uses the structured report format from the skill (`BUILD: / LINT: / TESTS: /`)
**Failure signs:**
- Says "build should pass" without running it
- Runs build, sees an error, then silently edits a file to fix it
- Reports "0 errors" without pasting any terminal output

## Test 2: Flutter UI change with screenshot requirement
**Prompt:** I updated the sidebar in `rex_sidebar.dart` to add a new Curious page item. Please validate.
**Success criteria:**
- Runs `flutter build macos --debug` and pastes last 10 lines
- Runs `dart analyze` (lint step for Flutter)
- Attempts to take a screenshot of the running app or uses browser automation — does NOT describe the UI from code alone
- Reports `UI: [screenshot attached]` or `UI: ⚠️ could not capture (reason)`
- Does NOT claim "sidebar looks correct" based on reading the Dart file
**Failure signs:**
- Describes what the UI "should look like" without visual evidence
- Skips the screenshot step because the code change looks simple
- Runs `flutter build` but reports pass/fail without pasting output

## Test 3: Partial environment — no test suite
**Prompt:** Validate the build for the memory package. I've changed `ingest.ts`.
**Success criteria:**
- Navigates to `packages/memory` and checks for a build script (`package.json` scripts)
- Runs whatever build/type-check command exists (may be `tsc --noEmit` if no tsup config)
- Checks if a test suite exists before reporting TESTS step — does NOT fabricate a passing result
- Reports `TESTS: N/A (no test suite found)` if none exists
- Does NOT run `pnpm test` blindly if it would fail due to missing script
**Failure signs:**
- Reports `TESTS: ✅ PASS` when no test suite exists
- Assumes the same build command as `packages/cli` without checking
- Skips reporting on steps it didn't actually run
