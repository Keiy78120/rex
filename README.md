<div align="center">

# REX

**A local-first operating layer for Claude Code.**

Make Claude Code safer, less forgetful, cheaper to run, and easier to control across your machines.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/macOS-primary-black)
![cli](https://img.shields.io/badge/CLI-available-444)
![claude](https://img.shields.io/badge/Claude_Code-compatible-purple)

</div>

---

## Why REX

Claude Code is strong at producing code.
It is weaker at persistence, guardrails, memory, cost control, and remote operation.

REX adds that missing layer:

- **Memory**: searchable local memory instead of starting from zero every session
- **Guards**: block dangerous or low-quality actions before they land
- **Control**: operate through CLI, Telegram, and a Flutter desktop app
- **Cost routing**: use what you already own before paying for more inference
- **Topology awareness**: useful with one machine, a small cluster, or a larger fleet

> REX is not a theme, wrapper, or dashboard gimmick.
> It is meant to become a practical developer control plane.

---

## What Exists Today

| Area | Current state |
|------|---------------|
| **CLI** | Health checks, memory ingest/search, guards, agents, logs, audit |
| **Memory** | Local SQLite + embeddings via Ollama, semantic search, pending queue |
| **Guards** | 8 hook-based safeguards for dangerous commands, weak completions, UI issues, and more |
| **Gateway** | Telegram control surface |
| **App** | Flutter macOS desktop app |
| **Ops** | LaunchAgents, doctor checks, audit command |

### Current strengths

- **Local-first**: memory and many workflows run without paid APIs
- **Actually usable now**: this is not only a future architecture document
- **Honest scope**: macOS is the main supported desktop app today; CLI remains the durable base

---

## What Makes REX Different

| Without REX | With REX |
|-------------|----------|
| Claude forgets previous work | Local searchable memory and session context injection |
| Expensive defaults become normal | Owned hardware, scripts, CLIs, and free tiers are considered first |
| Remote control is awkward | Telegram + CLI + app surfaces |
| "Done" can still be fake | Guards catch TODOs, weak test fixes, dangerous commands, and repeated failures |
| Every workflow is repeated manually | Successful patterns can become reusable runbooks |

---

## Core Principles

REX is being shaped around a few hard rules:

1. **Use what the user already has**: script, local CLI, local service, owned hardware, free tier, then paid API.
2. **CLI first for execution**: CLI before MCP, MCP before API, API before anything heavier.
3. **Headless parity**: critical operations cannot depend only on the GUI.
4. **No fake complexity**: if open source already solves a low-level problem well, REX integrates it instead of rebuilding it.
5. **Zero-loss before fancy sync**: append-only logs, queues, ack, replay, then real-time niceties.
6. **Flutter is the main operator UI, not the brain**: the system must still run on a headless VPS.
7. **Continuity beats immediacy**: if one node survives, REX should preserve, spool, organize, and replay rather than lose work.

---

## Vision

REX is moving toward a stricter v7 shape:

- **One brain, multiple machines**: Mac, VPS, GPU node, NAS
- **User-owned resources first**: scripts, installed CLIs, local services, and owned hardware before paid inference
- **Governed tool registry**: many tools can be known, but external ones stay disabled until the user enables them
- **Flutter-first operator console**: no default rewrite into a noisy web dashboard
- **Cross-platform target**: macOS today, desktop target later is macOS + Windows + Linux
- **Topology-aware**: one machine, 2-5 machines, or 10-30+ nodes must all degrade cleanly
- **OpenClaw-inspired capabilities**: central routing and remote control, not its interface style
- **Living memory**: failures become lessons, successes become runbooks
- **Optional secure hub**: VPS preferred when available, never required for single-machine usefulness

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
- [ ] preserve gateway messages, tasks, and observations before processing
- [ ] keep organizing work possible through scripts, local LLMs, or free tiers
- [ ] strengthen audit and doctor flows

### Phase 3 — Secure Multi-Machine REX

- [ ] add secure hub API for nodes, tasks, events, and health
- [ ] add durable sync with queue, ack, and replay
- [ ] make Tailscale the default networking layer
- [ ] support clean fallback when the preferred hub goes down

### Phase 4 — Better Operator Surfaces

- [ ] extend the Flutter operator app beyond the current macOS-first state
- [ ] add better views for nodes, queue health, degraded mode, and incidents
- [ ] keep remote dashboard support secondary to the shared API
- [ ] keep the UI minimal, fast, and readable

### Phase 5 — Governed Tooling

- [ ] expand the MCP/tool registry without auto-enabling everything
- [ ] keep tool activation explicit and explainable
- [ ] prefer CLI first, then MCP, then API
- [ ] integrate existing OSS where it already solves the low-level problem well

### Phase 6 — Install and Fleet Readiness

- [ ] one-command install profiles for local dev, desktop full, headless node, hub VPS, and GPU node
- [ ] clearer fleet behaviors for 10-30+ machines
- [ ] group/tag-based targeting and aggregate health
- [ ] better packaging and setup on macOS, Linux, Windows, and VPS

---

## Docs Map

Internal planning docs are now split by usage:

| Doc | Use it for |
|-----|------------|
| `docs/plans/action.md` | launch work with an agent team |
| `docs/plans/backend-functions.md` | backend logic, gateway, memory, sync, hub |
| `docs/plans/frontend-design.md` | Flutter UI, operator UX, page priorities |
| `docs/plans/sources.md` | source hierarchy, OSS reuse, anti-duplication |
| `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md` | architecture guardrails |
| `docs/plans/2026-03-07-rex-v7-master-plan.md` | long-form reference only |

For one-shot agent execution, the intended entrypoint is:

```text
Read docs/plans/action.md and follow only the references it gives you.
```

---

## Coming Next

<details>
<summary><strong>Planned Implementations</strong></summary>

### Near-term

- Secure REX hub API for nodes, tasks, health, and events
- Resource inventory: scripts, installed tools, services, quotas, hardware
- Durable queue + replay between machines
- Success memory and reusable runbooks
- Tailscale-first networking with explicit fallbacks
- MCP registry with recommendation-only defaults and explicit activation
- Better one-shot agent-team execution through a single `action.md` entrypoint

### Product direction

- Flutter desktop surface extended beyond macOS
- Remote dashboard as a view on the same API, not a second brain
- Better operator views for nodes, queue health, and incidents
- Meeting/transcription bots through existing OSS where possible
- One-command install strategy for macOS, Linux, Windows, and VPS
- Clearer fleet behavior for larger machine sets

### Explicit non-goals

- Rebuilding low-level sandbox engines when existing OSS already works
- Duplicating the product with a separate full web app by default
- Routing paid LLMs before owned/free options
- Treating multi-node as required for basic usefulness

</details>

<details>
<summary><strong>Topology Rules</strong></summary>

### 1 machine

- No hub required
- No Tailscale required
- Local mode must stay fully useful
- Multi-node features should hide or degrade cleanly

### 2 to 5 machines

- Preferred standard mode
- Stable hub if available, otherwise a main machine can temporarily lead
- Tailscale, wake, and health checks become valuable

### 10 to 30+ machines

- Inventory, tags, groups, and aggregate health become mandatory
- No noisy full-sync assumptions everywhere
- Scheduling and rate limiting must target groups, not only individual nodes

</details>

---

## Interfaces

| Interface | Role |
|-----------|------|
| **CLI** | Primary execution surface |
| **Flutter app** | Main operator UI |
| **Telegram** | Remote control and notifications |
| **Hub API** | Future shared control plane for app, CLI, gateway, and nodes |

---

## Install

```bash
npm install -g rex-claude
rex init
rex setup
```

What this does:

- installs guards and hooks
- installs skills
- configures background services
- optionally sets up Ollama models for local memory and local tasks

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `rex init` | Install guards, hooks, skills, and background setup |
| `rex setup` | Install Ollama dependencies and models |
| `rex doctor` | Full health check |
| `rex doctor --fix` | Auto-repair common issues |
| `rex status` | One-line system summary |
| `rex gateway` | Start Telegram gateway |
| `rex audit` | Run integration audit |
| `rex ingest` | Index Claude Code sessions into memory |
| `rex categorize` | Auto-tag memories |
| `rex search <query>` | Semantic memory search |
| `rex logs -f` | Tail background logs |

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

Current pages:

- Health
- Memory
- Gateway
- Voice
- Agents
- MCP
- Optimize
- Logs
- Settings

Design direction for future UI work:

- keep the operator surface minimal
- show essentials first: health, nodes, queue, memory pending, incidents
- avoid dashboard bloat
- keep remote and desktop surfaces aligned with the same API

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
| Notify Telegram | Push important events to a quiet notification flow |

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

## Architecture Snapshot

```text
rex-claude
├── CLI (TypeScript/Node)
├── Memory (SQLite + embeddings)
├── Guards (Claude hooks)
├── Telegram gateway
├── Flutter desktop app
└── Future secure hub for multi-node control
```

### Planned hub shape

- **Hub**: always-on daemon on a VPS or other stable machine
- **Nodes**: Mac, Linux, GPU box, NAS
- **Routing**: cache -> script/tool -> owned hardware -> free provider -> paid provider
- **Tool policy**: CLI/script -> MCP -> API -> other
- **Transport**: Tailscale first
- **Reliability**: no sync feature before durable journaling and replay

---

## Platform Status

| Platform | Status |
|----------|--------|
| **macOS** | Primary experience today |
| **Linux** | CLI/headless direction is valid; desktop app is not the main surface today |
| **Windows** | Future desktop target; current focus is not native parity yet |
| **VPS** | Expected to run headless via CLI, daemon, gateway, and API |

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
