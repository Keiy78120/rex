<div align="center">

# REX

**The missing layer between you and Claude Code.**

Claude Code is powerful. But it forgets everything, ships half-done work, makes the same mistakes twice, and you can't control it when you're away from your desk.

REX fixes all of that.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/macOS-black)
![claude](https://img.shields.io/badge/Claude_Code-compatible-purple)

</div>

---

## What REX actually is

REX is a **full companion system for Claude Code** — not just a plugin.

It runs 24/7 in the background. It watches every action Claude takes. It indexes everything Claude produces. It gives Claude a persistent memory it would otherwise never have. It lets you talk to Claude from your phone. It blocks the dumb mistakes before they happen. And it brings you features that normally cost money — completely free and local.

Think of it as the infra layer Claude Code never shipped.

---

## What you stop paying for

Claude Code out of the box gives you a capable agent with zero memory and zero guardrails. REX changes that — using open source models running locally.

| Feature | Without REX | With REX |
|---------|------------|---------|
| **Voice transcription** | ~$0.006/min (Whisper API) | Free — local Whisper via Ollama |
| **Persistent memory** | Not available | Free — SQLite + nomic-embed-text, local |
| **Talk to Claude on mobile** | Not available | Free — Telegram gateway |
| **Error learning** | Claude forgets instantly | Logged, categorized, searchable forever |
| **Session history search** | Not available | Free — semantic vector search |
| **Auto-categorized knowledge** | Not available | Free — Qwen auto-tags every session |
| **Task notifications** | Nothing | Free — Telegram /notifs with project filter |

---

## What REX prevents

Claude Code is good at writing code. It is less good at not breaking things.

REX installs **6 guards** that hook into every Claude action before it executes:

| Guard | What it blocks |
|-------|---------------|
| **Dangerous Command** | `rm -rf`, `git push --force main`, `DROP TABLE` — blocks before execution |
| **Completion** | Claude saying "done" when TODO, FIXME, or empty functions remain |
| **Test Protector** | Claude deleting or weakening tests to make them pass instead of fixing code |
| **Scope Guard** | Touching more than 8 files at once without understanding why |
| **Session Summary** | Saves git state, branch, modified files, and last commit at every session end |
| **Error Pattern** | Detects repeated error signatures and surfaces them before Claude retries blind |

These run silently. Zero UX impact. You only hear from them when something is wrong.

---

## Memory that actually works

Every Claude Code session is automatically indexed into a local vector database.

```bash
rex ingest                               # index latest sessions (runs hourly via LaunchAgent)
rex categorize                           # auto-tag by topic: bug, pattern, lesson, refactor...
rex search "how did I fix the JWT bug"   # semantic search across all your sessions
```

Powered by **Ollama** + `nomic-embed-text` + SQLite. Everything stays local. No API calls. No cost.

When you start a new session in a project, REX injects the most relevant memories directly into Claude's context — so it already knows what was done last time, what broke, and what patterns you use.

```
[REX Context] Project: my-app | next.js, typescript, drizzle
Last: Fixed race condition in optimistic updates — used mutex pattern
Lessons:
  - useEffect cleanup needed when fetch is cancelled mid-flight
  - Drizzle transactions must await all queries before returning
Skills: ux-flow, ui-craft, ui-review, db-design, seo, perf
```

Claude reads this at session start. It doesn't start from zero anymore.

---

## Control Claude from your phone

REX includes a full Telegram bot that keeps running 24/7.

```
/claude build me a pricing page with dstudio-ui
/qwen explain this regex: ^(?=.*[A-Z])(?=.*\d).{8,}$
/models → switch between Haiku · Sonnet · Opus · Qwen 1.5b · 4b · 9b
/memory auth bug fix             → semantic search on the fly
/notifs                          → browse task completions by project
/status                          → full health check, LaunchAgent status
```

- **Qwen runs local** — zero cost, streams token by token, think-blocks filtered
- **Claude streams too** — animated progress while it processes, not a black box
- **Model switching** — change between Haiku/Sonnet/Opus live from Telegram, persists
- **Silent notifications** — task completions stored silently in `/notifs`, never spam your chat

Start it once, the LaunchAgent keeps it alive forever:

```bash
rex gateway
```

---

## 28 skills that make Claude smarter

Skills are instruction sets Claude loads on demand. REX ships **28 battle-tested skills** that cover the full dev workflow.

When you open a project, REX detects your stack from `package.json` and tells Claude which skills are available — automatically.

### Design
| Skill | When it activates |
|-------|------------------|
| `ux-flow` | Building any page or form — maps all states before writing code |
| `ui-craft` | Visual execution — hierarchy, 4px grid, typography scale, motion |
| `ui-review` | Post-build audit — WCAG AA, responsive, composition, a11y |

### Engineering
| Skill | Stack detection |
|-------|---------------|
| `perf` | react, next, vue → Core Web Vitals, bundle, N+1 queries |
| `api-design` | express, hono, fastify → REST conventions, envelopes, pagination |
| `db-design` | prisma, drizzle → schema, indexes, safe migrations |
| `auth-patterns` | next-auth, passport → JWT, sessions, RBAC, rate limiting |
| `test-strategy` | vitest, jest, playwright → pyramid, mocking rules, coverage |
| `error-handling` | any backend → boundaries, logging, async flows |
| `seo` | next → metadata API, OG images, sitemap, structured data |
| `i18n` | next-intl → locale routing, pluralization, date formatting |

### Dev workflow
`code-review` · `build-validate` · `debug-assist` · `fix-issue` · `pr-review-loop` · `deploy-checklist` · `new-rule` · `research` · `context-loader` · `token-guard` · `notify` · `rex-boot` · `one-shot` · `project-init` · `spec-interview` · `figma-workflow` · `dstudio-design-system`

---

## Voice — free transcription

REX includes voice transcription powered by local Whisper (via Ollama). No API key. No per-minute cost.

- Record → transcribe → optionally optimize the transcript as a prompt via local LLM
- Auto start/stop recording tied to call detection (Hammerspoon on macOS)
- Accessible from the macOS app or `rex voice transcribe`

---

## Health monitoring

```bash
rex doctor    # 55+ checks across 9 categories — guards, hooks, LaunchAgents, Ollama, models
rex status    # one-line summary
rex logs -f   # tail live logs from all background services
```

REX checks itself. If a LaunchAgent died, if Ollama is down, if a guard is broken — `rex doctor` finds it and `rex doctor --fix` repairs it.

---

## macOS native app

A Flutter desktop app for when you want a GUI instead of the terminal.

9 pages: **Health** · **Memory** · **Gateway** · **Voice** · **Agents** · **MCP** · **Optimize** · **Logs** · **Settings**

- Browse and search your memory with category chips
- Start/stop the Telegram gateway with one click
- Live log viewer with tabs per service
- 5-tab settings (General · Claude · LLM · Files · Advanced)
- System tray with hide-to-tray and quick actions

---

## Install

```bash
npm install -g rex-claude
rex init      # installs guards, hooks, skills, LaunchAgents
rex setup     # installs Ollama + nomic-embed-text + Qwen (optional but recommended)
```

That's it. Everything runs in the background from here.

---

## All commands

| Command | What it does |
|---------|-------------|
| `rex init` | Install guards, hooks, skills, LaunchAgents |
| `rex setup` | Install Ollama dependencies and models |
| `rex doctor` | Full health check (55+ checks) |
| `rex doctor --fix` | Auto-repair common issues |
| `rex status` | One-line status |
| `rex gateway` | Start Telegram bot (or let LaunchAgent handle it) |
| `rex ingest` | Index Claude Code sessions into memory |
| `rex categorize` | Auto-tag memories by topic |
| `rex search <query>` | Semantic search over all indexed sessions |
| `rex optimize` | Analyze and improve your CLAUDE.md |
| `rex context` | Project context snapshot |
| `rex skills list` | List all installed skills |
| `rex skills show <name>` | Show a skill's content |
| `rex logs` | View logs from all background services |
| `rex logs -f` | Tail live logs |
| `rex agents list` | List configured autonomous agents |

---

## Architecture

```
rex-claude (npm, ~90KB)
├── CLI (TypeScript/Node)
│   ├── gateway.ts      Telegram bot — Qwen stream, Claude async, model switching
│   ├── ingest.ts       Session indexer — pending queue, lockfile, throttling
│   ├── preload.ts      SessionStart context injector — memory + skill detection
│   ├── agents.ts       Autonomous agent profiles (orchestrator, watchdog, etc.)
│   ├── skills.ts       Skills system — list, show, add, delete
│   └── guards/         6 bash guards hooked via Claude Code hooks
│
├── Memory (SQLite + sqlite-vec)
│   ├── ~/.rex-memory/rex-memory.db          Vector embeddings store
│   └── ~/.rex-memory/notifications.json     Silent notification queue
│
├── Config (~/.claude/)
│   ├── rex-guards/     Guard scripts (SessionStart, Stop, PreToolUse, PostToolUse)
│   ├── skills/         28 skills, auto-installed by rex init
│   ├── rules/          Custom rules per project
│   └── settings.json   Credentials (Telegram, Ollama URLs)
│
├── LaunchAgents (macOS, always-on)
│   ├── com.dstudio.rex-doctor.plist    Health check every hour
│   ├── com.dstudio.rex-ingest.plist    Ingest + categorize every hour
│   └── com.dstudio.rex-gateway.plist   Telegram bot (KeepAlive, auto-restart)
│
└── Flutter App (macOS native)
    └── 9 pages: Health · Memory · Gateway · Voice · Agents · MCP · Optimize · Logs · Settings
```

---

## Prerequisites

**Required:**
- Node.js 20+
- Claude Code (`claude` CLI)
- macOS (Linux: CLI works, app and LaunchAgents are macOS-only)

**Optional (enables memory, local chat, and voice):**
- [Ollama](https://ollama.ai) + `nomic-embed-text` + `qwen2.5:1.5b` (or larger)
- `whisper` for voice transcription
- Telegram bot token + chat ID for the gateway

---

## License

[MIT](LICENSE) — D-Studio
