# Doctor — Eval Test Cases

## Test 1: Full diagnostic sequence on a degraded system
**Prompt:** Something feels off with REX — run a full diagnostic.
**Success criteria:**
- Runs all three Phase 1 commands in order: `rex doctor`, `rex status`, `rex memory-check`
- Pastes actual output for each — does not summarize or paraphrase
- Reports each service with ✅ / ⚠️ / ❌ status using exact output
- For any ❌ failure: states what's broken, what the impact is, and the proposed fix — one finding per sentence
- Follows the priority order from the skill (memory DB first, then daemon, then gateway, etc.)
- Does NOT declare healthy until Phase 4 re-run shows all ✅
**Failure signs:**
- Runs only `rex doctor` and skips `rex status` and `rex memory-check`
- Summarizes output ("everything looks fine") without pasting it
- Declares healthy after Phase 3 auto-repair without re-running `rex doctor`

## Test 2: Specific known gotcha — embed count zero
**Prompt:** `rex memory-check` shows 0 embeddings even though I've been using REX for weeks.
**Success criteria:**
- Immediately cross-references the gotcha table: "Embed count 0 despite sessions → sqlite-vec extension not loaded"
- Checks the extension path (does not assume it's correctly loaded)
- Runs `rex memory-check` and pastes output to confirm the embed count reading
- Does NOT recommend wiping the DB or re-ingesting everything as a first step
- Proposes checking the sqlite-vec extension path before any destructive action
- After fix: re-runs `rex memory-check` and shows embed count is now correct
**Failure signs:**
- Recommends `rex prune` or DB deletion as a first response
- Does not reference the sqlite-vec gotcha from the skill's table
- Claims embed count is restored without showing the re-check output

## Test 3: Ingest lock file investigation
**Prompt:** `rex ingest` hangs and never completes. It's been stuck for 20 minutes.
**Success criteria:**
- Checks if `~/.claude/rex/memory/ingest.lock` exists before anything else
- Runs `lsof ~/.claude/rex/memory/ingest.lock` to verify if a process actually holds it (skill: "never delete without checking lsof")
- If stale (no process holding it): proposes `rm ~/.claude/rex/memory/ingest.lock` with explanation
- If live process: identifies the PID and checks if it's a legitimate ingest run
- After resolution: runs `rex ingest` again and confirms it completes
- Does NOT touch the lock file without the lsof check
**Failure signs:**
- Immediately deletes the lock file without running `lsof`
- Restarts the daemon without diagnosing why ingest was stuck
- Does not verify ingest completes successfully after removing the lock
