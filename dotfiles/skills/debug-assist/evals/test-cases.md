# Debug Assist — Eval Test Cases

## Test 1: TypeScript compile error
**Prompt:** I'm getting this error when I run `pnpm build`: `packages/cli/src/daemon.ts:87:5 — Property 'budgetCycle' does not exist on type 'RexConfig'`. Fix it.
**Success criteria:**
- Reads the full error message before proposing anything
- Opens `daemon.ts` around line 87 AND reads `config.ts` / the `RexConfig` type definition to understand the actual type shape
- Checks `git diff HEAD~3 -- packages/cli/src/daemon.ts` for recent changes
- States root cause explicitly (e.g., "field was renamed in config.ts but daemon.ts was not updated")
- Proposes a minimal fix (correct field name or type extension) — not a refactor
- Runs `pnpm build` after the fix and pastes last 10 lines of output as proof
**Failure signs:**
- Adds `// @ts-ignore` or casts to `any` as the fix
- Proposes the fix before stating root cause
- Claims "fixed" without showing build output

## Test 2: Silent runtime failure (no stack trace)
**Prompt:** `rex ingest` runs without error but no new memories are appearing in the DB. It just finishes instantly.
**Success criteria:**
- Recognizes this is a silent failure — no stack trace means must instrument or read logic
- Checks `rex search` to confirm memories are genuinely missing (not a display bug)
- Reads `packages/memory/src/ingest.ts` — specifically the lockfile and pending logic
- Checks if `~/.claude/rex/memory/ingest.lock` exists (stale lock = known gotcha)
- Checks `~/.claude/rex/memory/pending/` for queued chunks
- Searches REX memory: `rex search "ingest silent no output"`
- States root cause before proposing fix (e.g., "stale lockfile preventing processing")
- Provides fix with verification step (e.g., `rm ingest.lock` then `rex ingest` then `rex memory-check`)
**Failure signs:**
- Immediately suggests reinstalling or wiping the DB
- Skips checking the lockfile gotcha documented in CLAUDE.md
- Does not verify the fix actually ingests new memories

## Test 3: Flutter crash on startup
**Prompt:** The REX Flutter app crashes immediately on launch. No error shown in the UI. Logs show: `NSException: -[NSApplication _crashOnException:]`
**Success criteria:**
- Reads `packages/flutter_app/lib/main.dart` to check for known crash patterns (window_manager, MacosWindowUtils)
- Cross-references with the known gotcha: `waitUntilReadyToShow` incompatibility
- Checks `DebugProfile.entitlements` for sandbox setting
- States root cause with reference to the specific known crash pattern
- Proposes minimal fix (remove offending call or reorder initialization)
- Verifies with `flutter build macos --debug` then launching the app
- Saves finding: `rex_learn(...)` or updates `~/.claude/docs/flutter.md`
**Failure signs:**
- Suggests deleting `build/` and rebuilding without diagnosing
- Does not reference the known `window_manager` crash documented in CLAUDE.md
- Claims fixed without actually launching the built app
