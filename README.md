<h1 align="center">REX</h1>

<p align="center">
  <strong>Your dev assistant. Always on. Always watching.</strong><br>
  Telegram gateway · Memory RAG · Smart guards · macOS native app
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rex-claude"><img src="https://img.shields.io/npm/v/rex-claude?color=blue&label=npm" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" /></a>
  <img src="https://img.shields.io/badge/platform-macOS-black" alt="macOS" />
  <img src="https://img.shields.io/badge/Claude_Code-compatible-purple" alt="Claude Code" />
</p>

---

## What is REX?

REX is a personal dev companion that wraps your Claude Code workflow with:

- **Telegram gateway** — talk to Claude or Qwen from your phone, switch models on the fly
- **Memory RAG** — every session is indexed; search your own work with semantic search
- **Smart guards** — prevent Claude from committing to `main`, writing insecure code, or saying "done" too early
- **macOS native app** — Flutter UI for health, memory, gateway, and voice
- **Silent notifications** — task completion stored in `/notifs` menu, never spam your chat

---

## Install

```bash
npm install -g rex-claude
rex init
rex setup
```

That's it. Guards, hooks, and LaunchAgents are installed automatically.

---

## Telegram Gateway

Talk to your dev assistant anywhere.

```
/claude   → Ask Claude (streams response, animated progress)
/qwen     → Ask local Qwen (streams think-filtered response)
/models   → Switch model (Haiku / Sonnet / Opus · Qwen 1.5b / 4b / 9b)
/memory   → Search your session history
/notifs   → Browse notifications by project
/status   → Health check from your phone
```

Start it:

```bash
rex gateway
```

Or let the LaunchAgent keep it alive automatically.

---

## Memory

Index your Claude Code sessions and search them semantically:

```bash
rex ingest                              # index latest sessions
rex categorize                          # auto-tag by topic (Qwen or Claude)
rex search "how did I fix the auth bug" # semantic vector search
```

Powered by **Ollama** + `nomic-embed-text` + SQLite. Runs locally, no cloud.

---

## Guards

Automatic checks on every Claude action:

| Guard | What it prevents |
|-------|-----------------|
| **Completion** | Saying "done" with TODO / empty functions left |
| **Dangerous Command** | `rm -rf`, `git push --force main`, irreversible ops |
| **Test Protector** | Modifying tests instead of fixing code |
| **Scope Guard** | Touching too many files (>8) without context |
| **Session Summary** | Saves work state at end of every session |

---

## Commands

| Command | Description |
|---------|-------------|
| `rex init` | Install guards, hooks, LaunchAgents |
| `rex setup` | Install Ollama deps and models |
| `rex doctor` | Full health check (55+ checks, 9 categories) |
| `rex status` | One-line status |
| `rex gateway` | Start Telegram bot |
| `rex ingest` | Index Claude Code sessions |
| `rex categorize` | Auto-tag memories by topic |
| `rex search <query>` | Semantic search over sessions |
| `rex optimize` | Analyze and improve your CLAUDE.md |
| `rex context` | Project context snapshot |

---

## Architecture

```
rex-claude (npm)
├── packages/cli/         TypeScript CLI
│   └── src/
│       ├── gateway.ts    Telegram bot (Qwen stream + Claude async)
│       ├── ingest.ts     Session indexer (pending/ + lockfile)
│       ├── memory/       SQLite + sqlite-vec embeddings
│       └── guards/       6 bash guards, hooked into Claude Code
├── packages/core/        Shared health checks
└── packages/flutter_app/ macOS native app
    └── 9 pages: Health · Memory · Gateway · Voice · Optimize · Settings

~/.claude/
├── rex-guards/           Bash guards (SessionStart, Stop, PreToolUse)
├── settings.json         Credentials (Telegram, Ollama)
└── rules/                Custom rules loaded per-project

~/.rex-memory/
├── rex-memory.db         SQLite embeddings store
└── notifications.json    Silent notification queue
```

---

## Notifications

REX never spams your Telegram chat. Task completions are stored silently:

```bash
bash ~/notify-telegram.sh -p my-project "Deploy done" "3 files changed"
```

Browse them in Telegram with `/notifs` — filter by project, mark as read.

---

## Prerequisites

- Node.js 20+
- Claude Code (`claude` CLI)
- macOS (Linux partial support)

**Optional:** Ollama + `nomic-embed-text` + `qwen2.5` for memory and local chat

---

## License

[MIT](LICENSE) — D-Studio
