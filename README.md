<h1 align="center">REX</h1>

<p align="center">
  <strong>Your always-on dev assistant.</strong><br>
  Talk to Claude from Telegram · Local memory RAG · Smart guards · macOS app
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rex-claude"><img src="https://img.shields.io/npm/v/rex-claude?color=blue&label=npm" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/platform-macOS-black" alt="macOS" />
  <img src="https://img.shields.io/badge/Claude_Code-compatible-purple" alt="Claude Code" />
</p>

---

## What is REX?

REX wraps your Claude Code workflow with automation that runs 24/7:

| Layer | What it does |
|-------|-------------|
| **Telegram Gateway** | Talk to Claude or Qwen from your phone, switch models on the fly |
| **Memory RAG** | Every session indexed — search your own work with semantic search |
| **Smart Guards** | Prevent Claude from committing to `main`, writing insecure code, or declaring "done" too early |
| **Design Skills** | UX flows, premium visual execution, and accessibility audits built into Claude |
| **macOS Native App** | Flutter UI for health, memory, gateway, and voice |

---

## Install

```bash
npm install -g rex-claude
rex init
rex setup
```

Guards, hooks, skills, and LaunchAgents install automatically.

---

## Telegram Gateway

Control your entire dev environment from your phone.

```
/claude <prompt>  → Ask Claude (streams with animated progress)
/qwen <prompt>    → Ask local Qwen (streaming, think-blocks filtered)
/models           → Switch model live (Haiku · Sonnet · Opus / Qwen 1.5b · 4b · 9b)
/memory <query>   → Semantic search over all your sessions
/notifs           → Browse task notifications by project
/status           → Full health check in one tap
```

Start it:

```bash
rex gateway
# or let the LaunchAgent keep it alive automatically
```

**Model switching** — flip between Claude Haiku / Sonnet / Opus and local Qwen models without leaving Telegram. Preferences persist across restarts.

**Silent notifications** — task completions are stored, never spam your chat. Browse with `/notifs`, filter by project, mark as read.

---

## Memory

Every Claude Code session becomes searchable knowledge.

```bash
rex ingest                              # index latest sessions
rex categorize                          # auto-tag by topic (Qwen or Claude)
rex search "how did I fix the auth bug" # semantic vector search
```

Powered by **Ollama** + `nomic-embed-text` + SQLite. Runs fully local, no cloud.

Auto-ingest runs every hour via LaunchAgent — zero maintenance.

---

## Smart Guards

Hooks that run on every Claude action, silently in the background:

| Guard | What it catches |
|-------|----------------|
| **Completion** | Saying "done" with TODO / empty functions left |
| **Dangerous Command** | `rm -rf`, `git push --force main`, irreversible ops |
| **Test Protector** | Touching tests instead of fixing code |
| **Scope Guard** | Too many files modified without context (>8) |
| **Session Summary** | Saves work state + last commit at end of every session |

---

## Design Skills

Three skills that upgrade Claude's UI/UX quality across all projects:

### `/ux-flow` — Before you build
Maps the full user experience before writing code. Forces:
- All states: loading · empty · error · success · partial
- Progressive disclosure and onboarding flows
- Edge cases: overflow, offline, permissions, double-submit
- Feedback timing: <100ms tap response, <300ms loader threshold

### `/ui-craft` — While you build
Premium visual execution. Enforces:
- Visual hierarchy — one dominant element per section
- 4px spatial grid — consistent spacing throughout
- Typography scale — xs to 4xl, never arbitrary sizes
- WCAG AA contrast, focus states, accessible colors
- Motion rules — 200ms max, purposeful only

### `/ui-review` — After you build
Systematic audit on finished components. Read-only, always reports `file:line`:
- Visual hierarchy and competing weights
- Missing states (empty, error, loading, disabled)
- Accessibility: ARIA, keyboard nav, focus indicators, contrast
- Responsive: 375px / 768px / 1280px breakpoints
- Component composition: tokens vs hardcoded, no inline styles
- Performance signals: unbounded lists, layout shifts

**The loop:** `ux-flow` → build with `ui-craft` → ship → `ui-review`

These install automatically with `rex init` and activate in any Claude Code project.

---

## Commands

| Command | Description |
|---------|-------------|
| `rex init` | Install guards, hooks, skills, LaunchAgents |
| `rex setup` | Install Ollama deps and models |
| `rex doctor` | Full health check (55+ checks, 9 categories) |
| `rex status` | One-line status |
| `rex gateway` | Start Telegram bot |
| `rex ingest` | Index Claude Code sessions |
| `rex categorize` | Auto-tag memories by topic |
| `rex search <query>` | Semantic search over sessions |
| `rex optimize` | Analyze and improve your CLAUDE.md |
| `rex context` | Project context snapshot |
| `rex skills list` | List all installed skills |

---

## Architecture

```
rex-claude (npm, ~90KB)
├── packages/cli/          TypeScript CLI
│   ├── src/gateway.ts     Telegram bot (Qwen stream · Claude async · model switching)
│   ├── src/ingest.ts      Session indexer (pending/ + lockfile + throttling)
│   ├── src/skills.ts      Skills system
│   └── src/guards/        6 bash guards hooked into Claude Code
├── packages/core/         Shared health checks (rex doctor)
└── packages/flutter_app/  macOS native app
    └── 9 pages: Health · Memory · Gateway · Voice · Optimize · Settings

~/.claude/
├── rex-guards/            Bash guards (SessionStart, Stop, PreToolUse)
├── skills/                Skills auto-installed by rex init
│   ├── ux-flow/           UX flow mapping skill
│   ├── ui-craft/          Visual execution skill
│   └── ui-review/         Accessibility + quality audit skill
└── rules/                 Custom rules loaded per-project

~/.rex-memory/
├── rex-memory.db          SQLite + sqlite-vec embeddings
└── notifications.json     Silent notification queue (max 500)

~/Library/LaunchAgents/
├── com.dstudio.rex-doctor.plist   Health check every hour
├── com.dstudio.rex-ingest.plist   Session ingest every hour
└── com.dstudio.rex-gateway.plist  Telegram bot (KeepAlive)
```

---

## Notifications

REX never spams your Telegram chat. Task completions store silently:

```bash
bash ~/notify-telegram.sh -p my-project "Deploy done" "3 files changed"
```

Browse in Telegram with `/notifs` — filter by project, mark as read.

---

## Prerequisites

- **Node.js 20+**
- **Claude Code** (`claude` CLI)
- **macOS** (Linux partial support)

**Optional for memory and local chat:**
- Ollama
- `nomic-embed-text` (embeddings)
- `qwen2.5:1.5b` or `qwen3.5:9b` (local chat)

---

## License

[MIT](LICENSE) — D-Studio
