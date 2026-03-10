<div align="center">

# REX

**The superlayer above your LLMs.**

REX prepares context, routes resources, enforces guards, and manages memory — then calls Claude Code (Opus/Sonnet) or Codex when the task actually needs a frontier model. Claude Code is not the entry point. REX is.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/macOS-primary-black)
![cli](https://img.shields.io/badge/CLI-available-444)
![claude](https://img.shields.io/badge/Claude_Code-compatible-purple)

</div>

---

## Why REX

Frontier models like Claude Opus are powerful — but they have no memory of your past sessions, no awareness of the tools and machines you already own, no cost discipline, and no guardrails beyond what you manually set up.

REX is the layer that runs **before** Opus sees your task:

- **Loads memory**: injects relevant past sessions, errors, and runbooks into context
- **Routes resources**: checks cache, local scripts, Ollama, and free tiers before paying for inference
- **Applies guards**: blocks dangerous commands, weak completions, and scope creep before they land
- **Manages the fleet**: one machine, a small cluster, or a larger set of nodes — all degrade cleanly
- **Operates remotely**: CLI, Telegram, and Flutter app are all first-class control surfaces

> REX is not a wrapper or a dashboard.
> It is the operating layer that decides, prepares, and delegates — so Opus only runs when it actually needs to.

---

## What Exists Today

> Phases 1–4 complete. 80+ TypeScript files. All planned modules implemented.

| Area | Current state |
|------|---------------|
| **CLI** | 50+ commands: health, memory, agents, hub, fleet, clients, budget, relay, route, test, secrets |
| **Memory** | SQLite + BM25 hybrid search + sqlite-vec embeddings, FTS5, versioned migrations (v1–v5) |
| **Guards** | 11 hook-based safeguards (dangerous commands, completions, UI, secrets, force push) |
| **Comms** | Telegram gateway: long-poll, Qwen streaming, Stop guard, long-message splitting |
| **Commander** | Hub API (port 7420), `/api/v1/version`, X-Rex-Version headers, Fleet compatibility check |
| **Fleet** | FleetNodes with typed roles, Dijkstra routing, BRAIN/FLEET API versioning |
| **Daemon** | Unified 24/7 process: watchdog (60s), budget alerts, daily summary, DB migrations at boot |
| **Agents** | 5 templates (DG/DRH/CEO/COO/Freelance), @openai/agents SDK, LangGraph workflows |
| **Clients** | `rex client:create/list/logs/update/stop`, per-client isolated dirs |
| **Budget** | Daily limit alerts (80%/100%), AES-256-GCM secrets vault, cost tracking per provider |
| **User Cycles** | XState machine (AWAKE→SLEEPING→WAKING_UP), ActivityWatch AFK bridge, sleep-aware routing |
| **CURIOUS** | RSS proactive discovery, 3 signal types (DISCOVERY/PATTERN/OPEN_LOOP) |
| **Mini-modes** | Intent detection without LLM, regex patterns, < 50ms |
| **Resource Hub** | 20+ resources catalog (MCP/guards/skills), awesome-mcp-servers integration |
| **App** | Flutter macOS: 26 pages — Health, Memory, Gateway, Agents, Hub, Clients, Training |
| **Test infra** | Mock LLM server, mock ActivityWatch, seed data, migration compat tests, load tests |

### Current strengths

- **Local-first**: 70% of tasks via scripts, Ollama, or free tiers — no paid API by default
- **Production-grade daemon**: watchdog, budget alerts, timezone-aware crons, DB migrations at boot
- **Actually usable now**: not only a future architecture document
- **Honest scope**: macOS is the primary desktop app today; CLI remains the durable cross-platform base

---

## Architecture

REX is organized around a military-style command structure: a single **Commander** orchestrates a **Fleet** of specialized machines, reachable through **Comms**.

```text
You / Operator
(CLI · Comms · Flutter App)
         │
         ▼
┌─────────────────────────────────────────────────┐
│              COMMANDER  (port 7420)             │
│              hub.ts — always-on API             │
│                                                 │
│  routes tasks · aggregates health · auth token  │
└────────────┬──────────────────────┬─────────────┘
             │                      │
       ┌─────┴──────┐        ┌──────┴──────┐
       │   COMMS    │        │    FLEET    │
       │ gateway.ts │        │ node-mesh.ts│
       │  Telegram  │        │  FleetNodes │
       └────────────┘        └──────┬──────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                      │
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ Code Specialist  │  │Inference Spec.   │  │Background Spec.  │
   │ Mac+Claude Code  │  │ Ollama / GPU     │  │ Daemon / Pi      │
   │  agents.ts       │  │ orchestrator.ts  │  │  daemon.ts       │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
              │
   ┌──────────────────┐
   │Storage Specialist│
   │ NAS / sync node  │
   │  sync.ts         │
   └──────────────────┘
```

### Commander

`hub.ts` — Central API, always-on at port 7420. Orchestrates the fleet, aggregates health, routes LLM tasks, and enforces auth. Runs on a VPS or the main machine. Every other component talks to it.

### Fleet

`node-mesh.ts` — All connected machines register as **FleetNodes** with a typed role and a capability profile (CPU cores, RAM, Ollama models). The Commander routes tasks to the right node automatically.

### Specialists

Each machine in the Fleet plays a typed role:

| Specialist | Role | Source |
|------------|------|--------|
| **Code Specialist** | Mac with Claude Code — runs agents, reviews, lint loops | `agents.ts` |
| **Inference Specialist** | Machine with Ollama/GPU — handles LLM inference requests | `orchestrator.ts` |
| **Storage Specialist** | NAS or dedicated storage node — manages sync and backup | `sync.ts` |
| **Background Specialist** | Lightweight node (Raspberry Pi, cheap VPS) — runs daemon cycles | `daemon.ts` |

### Comms

`gateway.ts` — Telegram bot interface, alias `rex comms`. Remote control, notifications, and interactive commands from anywhere. Rate-limited, streaming-capable, and tied into the full Commander API.

---

## 10 Modules

REX is divided into 10 modules. Each module is both a **navigation page** in the Flutter app and a **semantic namespace** — logs, scripts, and internal LLM calls are all prefixed with the module name (`[FLEET]`, `[MEMORY]`, etc.) so any LLM or script instantly understands context without reading the whole codebase.

### REX HQ

The dashboard. Aggregates health, guards, budget burn rate, active agents, memory stats, and system alerts in a single read. Zero LLM — all reads run in parallel via `Promise.all`.

`dashboard.ts` · `event-journal.ts`

### REX FLEET

Fleet management. All connected machines register as typed **FleetNodes** (Code Specialist, Inference Specialist, Storage Specialist, Background Specialist). The Commander routes tasks to the right node based on capabilities, latency, and availability. Supports 1 machine, 2-5, or 30+.

`node-mesh.ts` · `hub.ts` · `daemon.ts`

### REX MEMORY

The knowledge base. Sessions from Claude Code are ingested, chunked, embedded (nomic-embed-text via Ollama), and stored in SQLite. Searchable by semantic query. Failed sessions become error patterns. Successful ones become runbooks. Injected at session start (200-token budget).

`packages/memory/` · `ingest.ts` · `semantic-cache.ts` · `sync-queue.ts`

### REX BUDGET

Cost discipline. Every LLM call follows a relay chain: cache → script/CLI → Ollama local → free tier API (Groq, Cerebras, Together, Mistral, OpenRouter, DeepSeek) → subscription → pay. Tracks burn rate, context %, daily quota. Alerts before hitting limits.

`orchestrator.ts` · `burn-rate.ts` · `free-tiers.ts` · `litellm.ts`

### REX AGENTS

Autonomous agent management. Launch Claude Code or Codex with typed profiles (feature, bug-fix, refactor, infra, docs). Each agent runs in an isolated `CLAUDE_CONFIG_DIR`. Multi-account rotation (account-pool.ts) handles rate limits. Orchestrator chat in the Flutter app.

`agents.ts` · `rex-launcher.ts` · `account-pool.ts`

### REX GATEWAY

Comms interface. The Telegram bot is the primary remote control surface. Routes messages through the Fleet (mesh routing for LLM tasks, direct for memory queries). Streams responses progressively. Falls back to spool-and-replay when the Commander is unreachable.

`gateway.ts` (CLI alias: `rex comms`)

### REX TOOLS

MCP marketplace and tool registry. Discover, scan, install, and enable/disable MCP servers from a curated catalog (awesome-mcp-servers, Smithery). Every install goes through a security scanner before it runs. Lint-loop for iterative code correction.

`mcp-discover.ts` · `security-scanner.ts` · `lint-loop.ts` · `rex-mcp-server.ts`

### REX CURIOUS

Proactive discovery. Runs in the background without interrupting you. Scans Ollama library, GitHub trending AI repos, Hacker News AI filter. Surfaces new models, tools, and repos worth watching. Results cached, surfaced in the app with a NEW badge.

`curious.ts` · `signal-detector.ts` · `dev-monitor.ts`

### REX PROJETS

Project scanner and setup. Detects all git repos in your dev directory, identifies the stack (TS, Flutter, PHP, etc.), tracks recent activity. Intent detection reads git signals (branch name, staged files, recent commits) to pick the right Claude Code profile before launch.

`projects.ts` · `project-intent.ts` · `context-loader.ts`

### REX OPTIMIZE

Self-improvement. Analyzes your `CLAUDE.md` for redundancy and gaps. Extracts lessons from sessions, promotes patterns into rules. Prunes stale memories, rotates logs. Setup wizard auto-detects everything available (Ollama, API keys, CLIs, Tailscale, hardware) without asking.

`reflector.ts` · `self-improve.ts` · `setup-wizard.ts` · `quick-setup.ts`

---

## What Makes REX Different

| Without REX | With REX |
|-------------|----------|
| Opus starts cold — no memory of past sessions, errors, or solutions | REX injects relevant memory at session start — Opus arrives with context |
| Every task hits the paid API by default | REX checks cache, local scripts, Ollama, and free tiers first |
| No guardrails beyond what you manually wire | 8 guards catch dangerous commands, fake completions, weak test fixes, and scope creep |
| Remote control is awkward | Comms (Telegram) + CLI + Flutter app — all backed by the same Commander API |
| Successful workflows disappear after the session ends | REX promotes patterns into runbooks, lessons into rules |
| One machine = one context | REX manages topology across 1 machine, a small cluster, or a larger fleet |

---

## Core Principles

REX is being shaped around a few hard rules:

1. **Use what the user already has**: script, local CLI, local service, owned hardware, free tier, subscriptions, then paid API.
2. **CLI first for execution**: CLI before MCP, MCP before API, API before anything heavier.
3. **Headless parity**: critical operations cannot depend only on the GUI.
4. **No fake complexity**: if open source already solves a low-level problem well, REX integrates it instead of rebuilding it.
5. **Zero-loss before fancy sync**: append-only logs, queues, ack, replay, then real-time niceties.
6. **Flutter is the main operator UI, not the brain**: the system must still run on a headless VPS.
7. **Continuity beats immediacy**: if one Specialist survives, REX should preserve, spool, organize, and replay rather than lose work.

---

## Vision

REX is moving toward a stricter v7 shape:

- **One Commander, multiple Specialists**: Mac, VPS, GPU node, NAS
- **User-owned resources first**: scripts, installed CLIs, local services, and owned hardware before paid inference
- **Governed tool registry**: many tools can be known, but external ones stay disabled until the user enables them
- **Flutter-first operator console**: keep the main app in Flutter; if a remote dashboard is needed later, use a light Next.js/React surface on the same Commander API
- **Cross-platform target**: macOS today, desktop target later is macOS + Windows + Linux
- **Topology-aware**: one machine, 2-5 machines, or 10-30+ Specialists must all degrade cleanly
- **Living memory**: failures become lessons, successes become runbooks
- **Optional secure Commander**: VPS preferred when available, never required for single-machine usefulness

---

## Roadmap

REX is built in practical layers. Phases 1–4 are complete as of March 2026.

### Phase 1 — Strong Local Base ✅

- [x] local memory and pending queues (two-phase ingest, lockfile, throttling)
- [x] resource inventory: scripts, CLIs, services, hardware, quotas
- [x] promote successes into runbooks, lessons into rules
- [x] solo-machine mode fully useful (offline-first, no Commander required)

### Phase 2 — Reliable Background System ✅

- [x] unified daemon (watchdog 60s, budget alerts, daily summary, DB migrations)
- [x] preserve messages before processing (sync queue, append-only journal)
- [x] scripts, Ollama, free tiers — 70% of tasks handled without paid API
- [x] audit and doctor flows (`rex audit`, `rex doctor --fix`)

### Phase 3 — Secure Multi-Machine REX ✅

- [x] Commander API (hub.ts, port 7420) with versioning headers and `/api/v1/version`
- [x] durable sync with queue, ack, and replay (sync-queue.ts)
- [x] Fleet API versioning — BRAIN/FLEET compatibility check on registration
- [x] fallback when Commander unreachable (Comms spool-and-replay)

### Phase 4 — Better Operator Surfaces ✅

- [x] Flutter app: 26 pages, 10-module layout (Health/Memory/Gateway/Agents/Hub/Clients/Training)
- [x] Agent templates (DG/DRH/CEO/COO/Freelance), @openai/agents SDK, LangGraph
- [x] Client management (`rex client:create/list/logs/update/stop`)
- [x] Resource Hub (20+ resources, MCP catalog, awesome-mcp-servers integration)

### Phase 5 — Governed Tooling (next)

- [ ] expand MCP/tool registry without auto-enabling everything
- [ ] keep tool activation explicit and auditable
- [ ] prefer CLI → MCP → API
- [ ] integrate OSS where it already solves the problem (no rebuilding)

### Phase 6 — Install and Fleet Readiness (next)

- [ ] one-command install profiles (local dev, headless Specialist, Commander VPS, GPU node)
- [ ] clearer Fleet behaviors for 10–30+ machines (group/tag-based targeting)
- [ ] aggregate health and incident views in the Flutter app
- [ ] better packaging on macOS, Linux, Windows, and VPS

---

## Coming Next

<details>
<summary><strong>Planned Implementations</strong></summary>

### Near-term

- Commander API hardening: Fleet, tasks, health, and events
- Resource inventory: scripts, installed tools, services, quotas, hardware
- Durable queue + replay between Specialists
- Success memory and reusable runbooks
- Tailscale-first networking with explicit fallbacks
- MCP registry with recommendation-only defaults and explicit activation
- Better one-shot agent-team execution through a single `action.md` entrypoint

### Product direction

- Flutter desktop surface extended beyond macOS
- Remote dashboard as a view on the same Commander API, not a second brain
- Better operator views for Fleet health, queue, and incidents
- Meeting/transcription bots through existing OSS where possible
- One-command install strategy for macOS, Linux, Windows, and VPS
- Clearer Fleet behavior for larger machine sets

### Explicit non-goals

- Rebuilding low-level sandbox engines when existing OSS already works
- Duplicating the product with a separate full web app by default
- Routing paid LLMs before owned/free options
- Treating multi-node as required for basic usefulness

</details>

<details>
<summary><strong>Topology Rules</strong></summary>

### 1 machine

- No Commander required (runs locally)
- No Tailscale required
- Local mode must stay fully useful
- Fleet features should hide or degrade cleanly

### 2 to 5 machines

- Preferred standard mode
- Stable Commander if available, otherwise a main machine can temporarily lead
- Tailscale, wake, and health checks become valuable

### 10 to 30+ machines

- Inventory, tags, groups, and aggregate health become mandatory
- No noisy full-sync assumptions everywhere
- Scheduling and rate limiting must target groups, not only individual Specialists

</details>

---

## Interfaces

| Interface | Role |
|-----------|------|
| **CLI** | Primary execution surface |
| **Flutter app** | Main operator UI (10-module layout) |
| **Comms** | Remote control and notifications via Telegram |
| **Commander API** | Shared control plane for app, CLI, Comms, and Fleet |

---

## Install

**Option A - npm (recommended)**

```bash
npm install -g rex-claude
rex install
```

`rex install` is the intended one-command path when available. It runs the equivalent of init + setup + doctor with clearer install defaults.

**Option B - explicit steps**

```bash
npm install -g rex-claude
rex init
rex setup
```

This path remains useful when you want finer control over setup stages.

**Option C - clone the repo directly**

```bash
git clone https://github.com/Keiy78120/rex
cd rex && ./install.sh
```

`install.sh` handles the same setup for the dotfiles and MCP server.
It auto-detects your OS: Hammerspoon and LaunchAgents are macOS-only.
On Linux, see `docs/linux-setup.md` if present in the repo branch you use.

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `rex init` | Install guards, hooks, skills, and background setup |
| `rex setup` | Install Ollama dependencies and models |
| `rex doctor` | Full health check |
| `rex doctor --fix` | Auto-repair common issues |
| `rex status` | One-line system summary |
| `rex comms` | Start Comms (Telegram gateway) |
| `rex audit` | Run integration audit |
| `rex ingest` | Index Claude Code sessions into memory |
| `rex categorize` | Auto-tag memories |
| `rex search <query>` | Semantic memory search |
| `rex logs -f` | Tail background logs |
| `rex reflect` | Extract lessons and runbooks from sessions |
| `rex providers` | Show provider registry and availability |
| `rex budget` | Show cost tracking summary |
| `rex inventory` | Scan detected hardware, CLIs, services, models |
| `rex hub` | Start the Commander API server |
| `rex node status` | Show node identity and Commander connection |
| `rex memory-check` | Verify memory integrity and health |

<details>
<summary><strong>More Commands</strong></summary>

| Command | Purpose |
|---------|---------|
| `rex optimize` | Analyze and improve your `CLAUDE.md` |
| `rex context` | Show project context snapshot |
| `rex skills list` | List installed skills |
| `rex skills show <name>` | Show one skill |
| `rex agents list` | List autonomous agents |
| `rex logs` | View logs from background services |

</details>

---

## App Surface

The Flutter app already builds today on macOS.

```bash
cd packages/flutter_app
flutter build macos --debug
```

Current pages (10-module layout):

- HQ (Health)
- FLEET (Network topology, Commander, sync, queue)
- BUDGET (Providers, routing order, inventory, runbooks)
- Voice / Audio
- MEMORY
- GATEWAY (Comms status and logs)
- AGENTS
- TOOLS (MCP marketplace)
- OPTIMIZE
- Logs
- Settings

Design direction for future UI work:

- keep the operator surface minimal
- show essentials first: health, Fleet status, queue, memory pending, incidents
- avoid dashboard bloat
- keep remote and desktop surfaces aligned with the same Commander API

---

## Memory

REX indexes Claude Code sessions into a local vector database.

```bash
rex ingest
rex categorize
rex search "how did I fix the JWT bug"
```

Current memory stack:

- **SQLite** for local storage
- **Ollama + nomic-embed-text** for embeddings
- **pending queue** for safer ingest before processing
- **context reinjection** at session start

This is the direction for memory over time:

- failures become lessons
- successes become runbooks
- repetitive workflows become scripts or reusable procedures

---

## Guardrails

REX currently ships **8 guards** around Claude Code activity.

| Guard | Purpose |
|-------|---------|
| Dangerous Command | Block risky shell/database operations |
| Completion | Catch false "done" claims |
| Test Protector | Stop deleting or weakening tests |
| Scope Guard | Warn on wide, unjustified file changes |
| Session Summary | Save repo state at session end |
| Error Pattern | Surface repeated failure signatures |
| UI Checklist | Catch missing loading/empty/error states |
| Notify | Push important events to Comms |

---

## Skills

REX ships a large built-in skill set for design, engineering, review, delivery, and project setup.

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

## Component Map

REX sits **above** Claude Code. When you invoke REX — via CLI, Comms, or the Flutter app — REX prepares everything first: memory, context, resources, guards, routing. Only then does it hand off to Claude Code (Opus/Sonnet) or Codex for the actual reasoning and coding work.

Claude Code is not the entry point. **REX is.**

```text
You / Operator
(CLI · Comms · Flutter App)
         │
         ▼
┌─────────────────────────────────────────────────┐
│                    REX                          │
│                                                 │
│  Memory · Guards · Router · Budget              │
│  Scripts · Context prep · Skills                │
│  Inventory · Daemon · Commander API             │
│                                                 │
│  load memory → apply guards → route → delegate │
└────────────────────┬────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐  ┌─────────────────────┐
│  Claude Code     │  │  Codex Worker       │
│  (Opus / Sonnet) │  │  (non-interactive)  │
│  reasoning       │  │  background exec    │
│  coding          │  │  codex --full-auto  │
└──────────────────┘  └─────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  Resource Chain (owned-first)                   │
│  Cache → Script/CLI → Ollama → Free tier → Paid │
└─────────────────────────────────────────────────┘
```

**70/30 principle**: 70% of tasks stay local and free. 30% warrant paid inference. REX enforces this automatically.

### What REX does before Opus sees anything

1. Injects relevant memory and past session context
2. Runs guards (dangerous command check, scope check, completion quality)
3. Routes to the cheapest resource that can do the job
4. Provides the full resource inventory so Opus can make better decisions
5. Tracks cost, captures results, promotes successes into runbooks

```text
rex-claude
├── CLI (TypeScript/Node)           ← entry point for all operations
├── Memory (SQLite + embeddings)    ← semantic search, session recall
├── Guards (Claude hooks)           ← Pre/PostToolUse, SessionStart/End
├── Router (llm.ts + free-tiers)   ← owned-first model routing
├── Daemon (daemon.ts)              ← background cycles, health, sync
├── Comms (gateway.ts)             ← Telegram remote control surface
├── Flutter desktop app             ← operator UI (10 modules)
├── Commander API (hub.ts)          ← shared control plane for all surfaces
├── Fleet (node-mesh.ts)           ← FleetNodes: Code/Inference/Storage/Background
├── Provider registry               ← inventory of all available resources
├── Sync queue (SQLite)             ← append-only, ack, replay
└── Reflector                       ← lessons, runbooks from sessions
```

### Commander shape

- **Commander**: always-on daemon on a VPS or the main machine (port 7420)
- **Fleet**: Mac, Linux, GPU box, NAS — register as typed Specialists and heartbeat
- **Routing**: cache → script/tool → owned hardware → free provider → paid provider
- **Tool policy**: CLI/script → MCP → API → other
- **Transport**: Tailscale first
- **Reliability**: durable journaling and replay before any real-time feature

---

## Platform Status

| Platform | Status |
|----------|--------|
| **macOS** | Primary experience today |
| **Linux** | CLI/headless direction is valid; desktop app is not the main surface today |
| **Windows** | Future desktop target; current focus is not native parity yet |
| **VPS** | Expected to run headless via CLI, daemon, Comms, and Commander API |

---

## Project Intent

This repo should stay:

- **simple to understand**
- **fast to scan on GitHub**
- **clear about what exists vs what is planned**
- **consistent with the real architecture documents**
- **useful to both users and contributors**

If REX becomes powerful but unreadable, the project loses.

---

## License

[MIT](LICENSE) - D-Studio
