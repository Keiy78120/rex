# REX Autonomous Babysitter — Design Document

## Goal

Transform REX from a CLI tool into an autonomous, self-managing babysitter for Claude Code. REX pre-loads relevant context, categorizes memory to save tokens, self-repairs, advises the user proactively, and learns from mistakes — all without user intervention.

## Architecture

REX lives inside `~/.claude/rex/` as a centralized hub. A single persistent daemon handles all background tasks (health checks, ingestion, categorization, self-improvement). Native Claude Code directories (`~/.claude/rules/`, `skills/`, `docs/`) stay untouched — REX adds what's missing alongside them.

LLM routing: Ollama first (free, fast), Claude sub-agent fallback (haiku for classify, sonnet for complex). Auto-detect based on availability.

## Tech Stack

- Node.js (TypeScript, tsup) — daemon + CLI
- SQLite + sqlite-vec — semantic memory (nomic-embed-text 768d)
- Ollama — local LLM (qwen3.5:9b classify, nomic-embed-text embed)
- Claude CLI — fallback for complex tasks
- LaunchAgent — single `com.dstudio.rex-daemon.plist` (KeepAlive)
- Telegram Bot API — notifications

---

## 1. Directory Structure

```
~/.claude/rex/
  memory/
    rex.sqlite            # Migrated from ~/.rex-memory/db/
    pending/              # Chunks waiting for Ollama
    backups/              # Daily auto-backups (7 days retention)
    embeddings.meta       # Stats: count, last_ingest, model
  projects/
    index.json            # Auto-generated project registry
    summaries/            # 1 .md per project (auto-summarized)
  references/             # Manually bookmarked docs/articles
  inspirations/           # Screenshots, designs, UI examples
  self-improvement/
    lessons.json          # Auto-extracted from sessions
    error-patterns.json   # Recurring errors (3+ occurrences)
    rule-candidates.md    # Proposed rules for promotion
  vault.md                # Credentials (moved from ~/.claude/)
  config.json             # Unified REX config
  daemon.log              # Unified log (7 day rotation)
```

Existing native Claude Code directories stay in place:
- `~/.claude/rules/` — 9 rules (auto-loaded by Claude Code)
- `~/.claude/skills/` — 17 skills (auto-loaded)
- `~/.claude/docs/` — 10 doc caches (auto-loaded)
- `~/.claude/rex-guards/` — 8 guards (referenced by hooks)

## 2. Memory Pipeline

### Categories (9)

| Category | Purpose |
|----------|---------|
| debug | Debugging traces, error investigation |
| fix | Patches applied, solutions |
| pattern | Reusable code patterns |
| lesson | Mistakes to not repeat |
| architecture | Structural decisions |
| config | Setup, configuration changes |
| project | Project summaries |
| reference | API docs, external knowledge |
| session | Fallback catch-all |

### Ingestion flow

```
Session .jsonl -> chunk (500 tokens max) -> embed (nomic-embed-text)
                                         -> classify (Ollama or Claude)
                                         -> store (rex.sqlite + vec)
```

### LLM routing for classify

1. Check Ollama available -> pickModel('categorize') -> qwen3.5:9b
2. Ollama down -> Claude sub-agent (haiku) via `claude -p`
3. Confidence < 0.6 -> retry with stronger model
4. All fail -> store as "session" with `needs_reprocess=true`

### Search optimization

1. Embed query -> vector search (top 20 candidates)
2. Filter by category if context is clear (debug session -> prioritize debug+fix)
3. Return max 5 results with summary (not raw chunks) -> token savings

### Re-categorization (one-shot migration)

`rex recategorize` — processes all 2661 existing "session" memories:
- Batch of 50, Ollama default, ~15min total
- Saves category + summary in DB
- Idempotent (skips already-categorized)

## 3. Smart SessionStart — Pre-loading

Hook `rex-context.sh` enhanced:

1. Detect CWD -> identify project (via projects/index.json)
2. Search 3-5 most relevant memories for this project
3. Search lessons/error-patterns related to project stack
4. Generate compact briefing (~200 tokens max) injected into context

Example output:
```
[REX Context] Project: mc (MEC) | Next.js + Cloudflare Workers
Last session: fix pagination orders API (2h ago)
Active lessons:
  - Always chunk CF Workers subrequests (max 50/invocation)
  - D1 binding: no complex JOINs, prefer separate queries
Useful patterns: response envelope {data, meta, error}
```

Hard limit: 200 tokens. If Claude Code needs more -> explicit `rex search`.

## 4. Smart SessionEnd — Extraction

1. Read session transcript
2. LLM extracts: lessons, patterns, fixes, errors
3. Categorize and store in rex.sqlite
4. If error recurs 3+ times -> add to self-improvement/rule-candidates.md
5. Update projects/summaries/{project}.md

## 5. Project Index

`rex ingest` scans `~/Documents/Developer/` and generates `projects/index.json`:

```json
[{
  "name": "mc",
  "path": "~/Documents/Developer/dstudio/mc",
  "stack": ["next.js", "cloudflare-workers", "d1"],
  "lastActive": "2026-03-05",
  "status": "active",
  "repo": "github.com/...",
  "memoryCount": 42
}]
```

Stack detection: parse package.json, pubspec.yaml, composer.json, Cargo.toml.
Project summaries: auto-generated by LLM, rebuilt when >10 new memories.

## 6. Self-Improvement Pipeline

```
Sessions -> LLM extracts lessons + error patterns -> lessons.json

Every 24h (daemon):
  -> rex self-review
  -> Analyze lessons.json for recurring patterns
  -> 3+ occurrences of same error type?
    -> Propose rule in rule-candidates.md
    -> Telegram notification

Kevin review:
  -> Approve -> rex promote-rule -> copy to ~/.claude/rules/
  -> Refuse -> mark as dismissed
```

### Workflow repetition detection

REX observes sessions:
- "Kevin did build+install 12 times this week" -> propose alias
- "Kevin did deploy+check+fix+redeploy 4 times" -> propose skill

### Doc staleness detection (24h)

Compare ~/.claude/docs/*.md freshness vs upstream (Context7).
Flag outdated docs via Telegram.

### Cross-project learning

Pattern found in project A that applies to project B:
- Inject into context when Kevin works on project B
- "REX: you have a proven pattern for this -> see memory #1423"

## 7. Rex Daemon

Single LaunchAgent `com.dstudio.rex-daemon.plist` replaces all 3 current agents.

### Schedule

| Interval | Task |
|----------|------|
| 5 min | Health check (Ollama, DB, pending, disk) + auto-fix |
| 30 min | Ingest + categorize new sessions |
| 60 min | Backup DB, prune old backups, update project index |
| 24h | Self-review, doc staleness check, weekly digest (Monday) |
| Event | Watch pending/ and markers/ for immediate processing |

### Auto-fix table

| Detection | Auto action | Notify |
|-----------|------------|--------|
| Ollama crash | `ollama serve &` | Silent |
| Pending backlog + Ollama up | ingest + categorize | Silent |
| DB integrity fail | Restore backup, re-ingest delta | Telegram |
| Uncategorized memories >50 | Batch categorize | Silent |
| Missing embeddings | Re-embed rows without vector | Silent |
| Disk < 500MB | Prune old backups + recordings | Telegram |
| Config corrupted | Restore .bak | Telegram |
| Gateway crash | Restart gateway | Silent |
| 3+ same error | Create rule-candidate | Telegram |

### Notifications policy

- Silent for routine auto-fixes
- Telegram warning for structural problems
- Daily summary (morning): sessions ingested, memories added, rules proposed
- Weekly digest (Monday): stats, stale PRs, expiring tokens, suggestions

## 8. REX Advisor

### Boot recommendations

```
[REX Advisor]
-> 3 stale PRs on mc (>2 days) — review?
-> Postiz Instagram token expires in 13 days
-> Pattern detected: repeated "fix pagination" — rule candidate ready
-> New Qwen 3.6 available — rex setup to upgrade?
```

Sources: GitHub API, vault.md expirations, self-improvement, web check.

### Token budget tracker

REX tracks pre-loading token injection per session:
- If avg > 300 tokens -> reduce automatically
- If Claude Code does many `rex search` -> enrich pre-loading
- Auto-tuning feedback loop

## 9. Resilience & Fallbacks

| Scenario | Risk | Fallback |
|----------|------|----------|
| Mac off during ingest | Partial writes | SQLite WAL = atomic transactions, rollback on restart |
| Ollama off | No embed/classify | Chunks -> pending/ with timestamp, retry on next cycle |
| Ollama + Claude both off | Nothing works | Raw storage, category "session", flag needs_reprocess=true |
| DB corrupted | Memory loss | Daily backup, `rex doctor --fix` restores + re-ingests |
| Cut during SessionEnd | Session not ingested | Marker file written first, deleted after success. Orphan markers -> re-ingest |
| Disk full | Can't write | Check before write, skip if <500MB, prune, notify |
| Config corrupted | REX won't start | Backup before write, restore .bak, fallback to hardcoded defaults |

Principle: **never lose data silently**. Every failure -> pending queue -> daemon retries automatically.

## 10. Unified Config

`~/.claude/rex/config.json`:

```json
{
  "llm": {
    "embedModel": "nomic-embed-text",
    "classifyModel": "auto",
    "routing": "ollama-first",
    "claudeFallback": "haiku"
  },
  "ingest": {
    "scanPaths": ["~/Documents/Developer/"],
    "excludePaths": ["node_modules", ".git", "_archive"],
    "autoIngestInterval": 1800
  },
  "selfImprovement": {
    "enabled": true,
    "ruleThreshold": 3,
    "reviewInterval": 86400
  },
  "daemon": {
    "healthCheckInterval": 300,
    "ingestInterval": 1800,
    "maintenanceInterval": 3600,
    "selfReviewInterval": 86400
  },
  "notifications": {
    "silent": ["ollama-restart", "pending-flush", "categorize-batch"],
    "warn": ["db-corrupt", "disk-low", "config-corrupt"],
    "daily": true,
    "weekly": true
  },
  "telegram": {
    "credentials": "-> vault.md"
  }
}
```

## Migration Plan

1. Create `~/.claude/rex/` structure
2. Migrate `~/.rex-memory/db/rex.sqlite` -> `~/.claude/rex/memory/rex.sqlite`
3. Symlink `~/.rex-memory/` -> `~/.claude/rex/memory/` (backward compat)
4. Run `rex recategorize` (one-shot, 2661 memories)
5. Generate `projects/index.json` (scan Developer/)
6. Create `config.json` from current env vars
7. Replace 3 LaunchAgents with single daemon
8. Update all path references in CLI source
