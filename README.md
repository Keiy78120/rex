<div align="center">

# REX

**The control plane between you and Claude Code.**

Guards, semantic memory, smart routing, multi-account pool, fleet awareness — all local-first and free-tier by default.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/macOS-primary-black)
![cli](https://img.shields.io/badge/CLI-available-444)
![claude](https://img.shields.io/badge/Claude_Code-compatible-purple)

</div>

---

## Why REX

Claude Code is excellent at producing code.  
It is weaker at continuity, cost control, multi-machine coordination, and knowing when to delegate.

REX adds the missing operational layer:

- **Memory**: searchable local vector store — sessions become lessons and runbooks
- **Guards**: 8 hook-based safeguards that run before damage lands
- **Routing**: owned hardware and free tiers considered before any paid API call
- **Orchestration**: Claude Code as the sole orchestrator; Codex dispatched as a background worker for parallel execution
- **Fleet**: useful with 1 machine, scales cleanly to 10-30 nodes via Tailscale
- **Control**: CLI, Telegram gateway, and Flutter macOS app — same API behind all three

> REX is not a theme or dashboard gimmick.  
> It is a practical developer control plane that runs on what you already own.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    You / Operator                   │
│          CLI · Telegram Gateway · Flutter App       │
└───────────────────────┬─────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │   Claude Code      │  ← sole orchestrator
              │   (Sonnet/Opus)    │    intent detection, planning
              └──┬──────────┬──────┘
                 │          │
        ┌────────▼──┐  ┌────▼──────────────┐
        │  REX CLI  │  │  Codex Worker      │  ← background executor
        │  Guards   │  │  (non-interactive) │    codex exec --full-auto
        │  Memory   │  └────────────────────┘
        │  Router   │
        └──┬────────┘
           │
  ┌────────▼──────────────────────────────────────────┐
  │               Resource Chain (70/30)               │
  │  Script/CLI → Owned hardware → Free tier → Paid   │
  └───────────────────────────────────────────────────┘
```

**70/30 principle**: 70% of tasks stay local and free. 30% warrant paid inference. REX enforces this automatically.

---

## What Exists Today

| Area | State |
|------|-------|
| **CLI** | `rex doctor`, `rex memory`, `rex ingest`, `rex search`, `rex intent`, `rex pool`, `rex setup --quick`, `rex audit` |
| **Memory** | SQLite + Ollama embeddings, semantic search, pending queue, session reinjection |
| **Guards** | 8 hook-based safeguards (dangerous commands, fake completions, test deletion, scope creep, UI gaps…) |
| **Router** | Task-aware model routing, free-tier catalog, account-pool with rate-limit cooldown |
| **Intent detection** | Signal-based project intent (branch/commits/filesystem → new-project / feature / bug-fix / refactor / infra / docs / explore) |
| **Quick setup** | `rex setup --quick` — scans Ollama, API keys, Claude, Tailscale, Codex; writes optimal routing chain with zero questions |
| **Account pool** | Discovers `~/.claude-account-N/` dirs, selects least-loaded account, 1h cooldown on rate-limited accounts |
| **Codex dispatch** | `runWithCodex()` dispatches work non-interactively as background worker (model: 'codex') |
| **Gateway** | Telegram bot control surface |
| **App** | Flutter macOS desktop app (Health, Memory, Gateway, Voice, Agents, MCP, Optimize, Logs, Settings) |

---

## What Makes REX Different

| Without REX | With REX |
|-------------|----------|
| Claude forgets previous sessions | Local searchable memory, lessons, runbooks |
| Paid API by default | Free tiers, owned hardware, and scripts used first |
| One account, one rate limit | Multi-account pool with automatic failover |
| Remote control is ad-hoc | Telegram + CLI + Flutter, same API |
| No intent awareness | Signal-based detection before each session |
| Background work blocks foreground | Codex dispatched as parallel worker |
| Single machine only | Fleet-ready via Tailscale, degrades cleanly at any scale |

---

## Core Principles

1. **Use what you already own**: script → local CLI → owned hardware → free tier → subscription → paid API
2. **CLI first**: CLI before MCP, MCP before API, API before anything heavier
3. **Claude Code orchestrates, Codex executes**: Claude plans and governs; Codex runs background tasks non-interactively
4. **Headless parity**: everything critical works on a VPS without a GUI
5. **No fake complexity**: integrate well-maintained open source instead of rebuilding solved problems
6. **Zero-loss continuity**: append-only logs, queues, ack, replay — delayed response is acceptable, data loss is not
7. **Topology-aware degradation**: single machine, small cluster, or large fleet — REX adapts cleanly

---

## Quick Start

```bash
npm install -g rex-claude

# Detect your environment, write optimal config
rex setup --quick

# Check everything is working
rex doctor

# See what the current project intends to do
rex intent

# Search past sessions semantically
rex search "how did I fix the JWT issue"
```

---

## Routing & Free Tiers

REX routes tasks to the cheapest capable resource available:

```
Task → project-intent → router.ts
         ↓
  Free-tier catalog lookup
  (Ollama local · Groq free · OpenRouter free · Gemini free)
         ↓ if no match
  Account pool (least-loaded Claude account)
         ↓ if rate-limited or complex
  Paid model (Sonnet / Opus)
```

Configure your providers in `~/.claude/rex/config.json`. REX fills the rest automatically.

---

## Account Pool

REX can distribute load across multiple Claude accounts:

```bash
# Accounts discovered from ~/.claude-account-N/ dirs
rex pool          # show pool status and rate-limit state
rex pool --reset  # clear cooldowns
```

Each account gets a 1-hour cooldown when it hits a rate limit. REX picks the next available one automatically.

---

## Memory

```bash
rex ingest         # index current Claude Code sessions
rex search "..."   # semantic search across all sessions
rex categorize     # re-classify memory entries
```

Memory stack:
- **SQLite** — zero-infrastructure local storage
- **Ollama + nomic-embed-text** — free local embeddings
- **Pending queue** — safe two-phase ingest (save instantly, embed lazily)
- **Session reinjection** — relevant context injected at session start via `preload.ts`
- **Self-improvement** — failures become lessons, successes become runbooks via `self-improve.ts`

---

## Guards

8 hook-based safeguards around Claude Code activity:

| Guard | Purpose |
|-------|---------|
| Dangerous Command | Block risky shell / database operations |
| Completion | Catch false "done" claims |
| Test Protector | Stop deleting or weakening tests |
| Scope Guard | Warn on unjustified wide file changes |
| Session Summary | Save repo state at session end |
| Error Pattern | Surface repeated failure signatures |
| UI Checklist | Catch missing loading / empty / error states |
| Notify Telegram | Push important events to a quiet notification flow |

Guards run via Claude hooks: `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`.

---

## Fleet Vision

REX is built to scale from 1 machine to a small fleet without changing how you use it:

```
Mac (primary)  ──┐
VPS (hub)      ──┤  Tailscale mesh
GPU box        ──┤  Secure, zero-config networking
NAS            ──┘

rex doctor              # health across all nodes
rex daemon              # background daemon (LaunchAgent / systemd)
```

**Hub role (VPS)**: always-on daemon, event journal, memory queue, gateway.  
**Node roles**: Mac for interactive work, GPU for heavy inference, NAS for storage.  
**Transport**: Tailscale first. Wake-on-LAN if a required node is offline.

No node is required. REX degrades cleanly to single-machine operation at any time.

---

## App Surface

The Flutter app builds today on macOS:

```bash
cd packages/flutter_app
flutter build macos --debug
```

Pages: Health · Memory · Gateway · Voice · Agents · MCP · Optimize · Logs · Settings

Design direction:
- Operator surface stays minimal — essentials first (health, nodes, queue, memory, incidents)
- Flutter is the UI, not the brain — headless CLI + API parity is mandatory
- Remote dashboard: lightweight Next.js/React on the same API if needed later

---

## Skills

REX ships built-in skills for design, engineering, review, delivery, and project setup.

<details>
<summary><strong>Skill Groups</strong></summary>

### Design
`ux-flow` · `ui-craft` · `ui-review`

### Engineering
`perf` · `api-design` · `db-design` · `auth-patterns` · `test-strategy` · `error-handling` · `seo` · `i18n`

### Workflow
`code-review` · `build-validate` · `debug-assist` · `fix-issue` · `pr-review-loop` · `deploy-checklist` · `new-rule` · `research` · `context-loader` · `token-guard` · `notify` · `rex-boot` · `one-shot` · `project-init` · `spec-interview` · `figma-workflow` · `dstudio-design-system`

</details>

---

## Architecture Snapshot

```
rex-claude/
├── packages/cli/src/
│   ├── index.ts          CLI entry + commands
│   ├── router.ts         Task-aware model routing
│   ├── free-tiers.ts     Free-tier provider catalog
│   ├── account-pool.ts   Multi-account rotation + cooldowns
│   ├── project-intent.ts Signal-based intent detection
│   ├── quick-setup.ts    Zero-config environment detection
│   ├── agents.ts         Orchestrator profiles + runWithCodex()
│   ├── preload.ts        Context injection at session start
│   ├── self-improve.ts   Lesson extraction + rule promotion
│   ├── gateway.ts        Telegram bot
│   ├── daemon.ts         Background daemon
│   └── ...
├── packages/memory/      SQLite + embeddings
├── packages/core/        Shared checks (rex doctor)
└── packages/flutter_app/ macOS native UI
```

---

## Platform Status

| Platform | Status |
|----------|--------|
| **macOS** | Primary experience — CLI + Flutter app |
| **Linux / VPS** | Full CLI + daemon + gateway (headless) |
| **Windows** | Future desktop target |

---

## VPS Deployment

```bash
# CLI + memory only (no Flutter)
npm install -g rex-claude

# systemd daemon
rex daemon
```

```ini
# /etc/systemd/system/rex-daemon.service
[Service]
ExecStart=/usr/local/bin/rex daemon
Restart=always
Environment=OLLAMA_URL=http://localhost:11434
```

Ollama can be local or remote via `OLLAMA_URL`. Gateway Telegram runs headless and stays alive via systemd.

---

## License

[MIT](LICENSE) — D-Studio
