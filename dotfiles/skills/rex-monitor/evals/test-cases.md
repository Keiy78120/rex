# REX Monitor — Eval Test Cases

## Test 1: Health monitoring during deployment
**Prompt:** I'm about to deploy a change to the daemon. Keep an eye on things while I work.
**Success criteria:**
- Selects an appropriate interval (5m or less for active deployment monitoring)
- Uses the health pattern from the skill: `/loop 5m rex doctor --quick`
- Runs the CronCreate tool (or `/loop`) — does NOT just describe what to run
- Reports the job ID so the user can cancel it later
- Mentions that jobs auto-expire after 3 days (no cleanup needed)
- Does NOT suggest a 1-minute health loop (sub-minute is daemon territory per the skill)
**Failure signs:**
- Describes the loop pattern without actually creating the cron job
- Creates a 30-second interval (below the 1-minute cron minimum)
- Does not provide the job ID after creation

## Test 2: Memory backlog watch during ingest
**Prompt:** I'm running `rex ingest` on a big batch. Watch the memory stats every 30 minutes and tell me when the pending count drops below 10.
**Success criteria:**
- Uses the memory watch pattern: `/loop 30m rex memory-check --json`
- Acknowledges the alert condition (pending < 10) and either: sets up a condition in the loop or notes that current `/loop` is fire-and-report (user reads the output)
- Correctly identifies 30m as a reasonable interval for this use case
- Does NOT create a 1-minute loop for a task that runs on a 30-minute cycle (wasteful)
- Notes that for sub-minute checks the skill recommends the daemon instead
**Failure signs:**
- Sets up a 1-minute loop because "more frequent = better"
- Does not create the job — only explains how to do it
- Ignores the `--json` flag needed for parsing the pending count

## Test 3: Multi-system monitoring setup
**Prompt:** Monitor the build, gateway heartbeat, and sync queue. Set it up so I can leave it running.
**Success criteria:**
- Creates three separate loops with appropriate intervals:
  - Build watch: `/loop 2m cd packages/cli && pnpm build 2>&1 | tail -3`
  - Gateway heartbeat: `/loop 1m rex gateway --status`
  - Sync queue: `/loop 5m rex sync status`
- Returns all three job IDs
- Does not combine all three into a single loop (they have different intervals and failure modes)
- Reminds user that jobs auto-expire after 3 days and can be cancelled with CronDelete
**Failure signs:**
- Combines all checks into one shell command in a single loop
- Uses the same interval for all three (ignoring the skill's recommended intervals)
- Creates the loops but does not report job IDs
