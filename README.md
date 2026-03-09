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

| Area | Current state |
|------|---------------|
| **CLI** | Health checks, memory ingest/search, guards, agents, logs, audit |
| **Memory** | Local SQLite + embeddings via Ollama, semantic search, pending queue |
| **Guards** | 8 hook-based safeguards for dangerous commands, weak completions, UI issues, and more |
| **Comms** | Telegram control surface (`rex comms` / `gateway.ts`) |
| **Commander** | Central hub API always-on, port 7420 (`hub.ts`) |
| **Fleet** | Connected machines as FleetNodes, managed by `node-mesh.ts` |
| **App** | Flutter macOS desktop app |
| **Ops** | LaunchAgents, doctor checks, audit command |

### Current strengths

- **Local-first**: memory and many workflows run without paid APIs
- **Actually usable now**: this is not only a future architecture document
- **Honest scope**: macOS is the main supported desktop app today; CLI remains the durable base

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

REX is divided into 10 modules that serve as both **UI navigation menus** in the Flutter app and **internal semantic namespaces** for task routing.

| Module | Role |
|--------|------|
| **HQ** | Health dashboard — system status, guards, burn rate, quick actions |
| **TOOLS** | MCP marketplace, tool registry, enable/disable integrations |
| **CURIOUS** | Proactive discovery — new Ollama models, GitHub trending, HN AI filter |
| **AGENTS** | Autonomous agent management — profiles, teams, orchestrator chat |
| **BUDGET** | Cost tracking, provider usage, free tier quotas, burn rate |
| **FLEET** | Node topology, Commander status, Tailscale mesh, sync queue |
| **MEMORY** | Session indexing, semantic search, categories, consolidation |
| **GATEWAY** | Comms / Telegram control surface status and logs |
| **PROJETS** | Project scanner — stack detection, open in Claude, recent activity |
| **OPTIMIZE** | CLAUDE.md analysis, rule suggestions, self-improvement |

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

REX is being built in practical layers, not as a giant rewrite.

### Phase 1 — Strong Local Base

- [ ] make local memory and pending queues harder to lose
- [ ] improve resource inventory: scripts, CLIs, services, hardware, quotas
- [ ] promote repeatable successes into runbooks
- [ ] keep solo-machine mode fully useful

### Phase 2 — Reliable Background System

- [ ] unify background jobs around reconcile / organize / reflect / prune
- [ ] preserve Comms messages, tasks, and observations before processing
- [ ] keep organizing work possible through scripts, local LLMs, or free tiers
- [ ] strengthen audit and doctor flows

### Phase 3 — Secure Multi-Machine REX

- [ ] add Commander API for Fleet, tasks, events, and health
- [ ] add durable sync with queue, ack, and replay
- [ ] make Tailscale the default networking layer
- [ ] support clean fallback when the preferred Commander goes down

### Phase 4 — Better Operator Surfaces

- [ ] extend the Flutter operator app beyond the current macOS-first state
- [ ] add better views for Fleet health, queue, degraded mode, and incidents
- [ ] keep remote dashboard support secondary to the shared Commander API
- [ ] keep the UI minimal, fast, and readable

### Phase 5 — Governed Tooling

- [ ] expand the MCP/tool registry without auto-enabling everything
- [ ] keep tool activation explicit and explainable
- [ ] prefer CLI first, then MCP, then API
- [ ] integrate existing OSS where it already solves the low-level problem well

### Phase 6 — Install and Fleet Readiness

- [ ] one-command install profiles for local dev, desktop full, headless Specialist, Commander VPS, and GPU node
- [ ] clearer Fleet behaviors for 10-30+ machines
- [ ] group/tag-based targeting and aggregate health
- [ ] better packaging and setup on macOS, Linux, Windows, and VPS

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
