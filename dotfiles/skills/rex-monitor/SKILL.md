---
name: rex-monitor
description: Set up recurring REX monitoring using /loop. Health checks, sync watch, memory stats, build monitoring. Use when user says "monitor", "watch", "keep checking", or "poll".
---

# REX Monitor — Recurring Checks with /loop

Set up recurring monitoring for REX systems using the `/loop` skill (CronCreate).

## Common Patterns

### Health monitoring
```
/loop 5m rex doctor --quick
```
Run a quick health check every 5 minutes. Alerts on Ollama down, DB issues, disk low.

### Memory watch
```
/loop 30m rex memory-check --json
```
Check memory integrity every 30 minutes. Flags orphan embeddings, stale pending, duplicates.

### Sync status
```
/loop 5m rex sync status
```
Monitor sync queue health — pending events, hub connectivity, consecutive failures.

### Build watch
```
/loop 2m cd packages/cli && pnpm build 2>&1 | tail -3
```
Watch for build errors during development.

### Gateway heartbeat
```
/loop 1m rex gateway --status
```
Verify gateway is responding.

### Provider availability
```
/loop 10m rex providers --json | jq '[.[] | select(.status != "available")] | length'
```
Alert when providers go unavailable.

## Usage

1. Pick a pattern above or customize
2. Run `/loop <interval> <command>`
3. Note the job ID for later cancellation
4. Jobs auto-expire after 3 days
5. Cancel early with CronDelete

## When to use

- During long dev sessions to catch regressions
- When deploying to monitor stability
- When Ollama or services are flaky
- When running background ingest/categorize

## Notes

- `/loop` minimum granularity is 1 minute (cron-based)
- For sub-minute checks, use the REX daemon instead (30s loop)
- Prefer daemon health checks for production; `/loop` for ad-hoc dev monitoring
