<p align="center">
  <img src=".github/assets/rex-banner.png" alt="REX" width="600" />
</p>

<h1 align="center">REX</h1>

<p align="center">
  <strong>Claude Code sous steroides</strong><br>
  Guards, health checks, memory RAG — zero config, one command.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rex-cli"><img src="https://img.shields.io/npm/v/rex-cli?color=blue&label=npm" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  <img src="https://img.shields.io/badge/zero_dependencies-black" alt="zero deps" />
  <img src="https://img.shields.io/badge/size-10KB-brightgreen" alt="size" />
</p>

---

## The Problem

Claude Code (Opus, Sonnet) makes the same mistakes over and over:

- **70% problem** — declares "done" with TODOs and empty functions left behind
- **Missing UI states** — generates the happy path, forgets loading/error/empty
- **Test modification** — changes test assertions instead of fixing the code
- **Scope creep** — touches 15+ files when you asked for one change
- **Dangerous commands** — runs `rm -rf`, `git push --force main`, `--no-verify`
- **Context loss** — forgets everything after compaction

REX fixes all of this automatically via Claude Code hooks.

## Install

```bash
npm install -g rex-cli
rex init
```

That's it. Everything is automatic after `rex init`:

- 6 guard hooks installed into `~/.claude/settings.json`
- Session auto-save on exit
- Context injection on session start
- Health monitoring ready

## What REX Does

### Guard System (automatic, zero config)

REX installs 6 shell-based hooks that run automatically during Claude Code sessions:

| Guard | Hook | What it prevents |
|-------|------|-----------------|
| **Completion Guard** | `Stop` | Scans modified files for TODO/FIXME/empty functions before Claude stops |
| **Dangerous Command Guard** | `PreToolUse` | Blocks `rm -rf /`, `git push --force main`, `--no-verify`, `DROP TABLE` |
| **Test Protector** | `PostToolUse` | Warns when test assertions are modified (fix the code, not the tests) |
| **UI Checklist** | `PostToolUse` | Checks `.tsx`/`.jsx` components for loading, error, and empty states |
| **Scope Guard** | `PostToolUse` | Alerts when >8 files modified (scope creep detection) |
| **Session Summary** | `Stop` | Auto-saves git state, branch, modified files to memory |

Guards run in the background — you don't see them unless they catch something.

### Health Checks (9 categories, 55+ checks)

```bash
rex doctor
```

```
═════════════════════════════════════════════
        REX DOCTOR — Health Check
═════════════════════════════════════════════

  ⚙ Config       3/3
  📏 Rules        8/8
  🧠 Memory      16/16
  🔌 MCP Servers  1/1
  🧩 Plugins      3/3
  🪝 Hooks        6/6
  🛡 Guards       6/6
  📚 Docs Cache   7/7
  💻 Environment  5/5

─────────────────────────────────────────────
  Summary: 55/55 checks passed
  Status:  HEALTHY
═════════════════════════════════════════════
```

### Quick Status

```bash
rex status
# REX ● HEALTHY — 55/55 checks passed
```

### Memory & RAG (optional, requires Ollama)

```bash
# Sync all Claude Code sessions into vector DB
rex ingest

# Semantic search across past sessions
rex search "cloudflare workers rate limiting"

# Analyze CLAUDE.md with local LLM
rex optimize
```

Requires [Ollama](https://ollama.ai) + `nomic-embed-text` model.

## Commands

| Command | Description |
|---------|-------------|
| `rex init` | One-click setup — installs guards, hooks, MCP server |
| `rex doctor` | Full health check (9 categories) |
| `rex status` | Quick one-line status |
| `rex ingest` | Sync sessions to vector DB (requires Ollama) |
| `rex search <query>` | Semantic search across memory (requires Ollama) |
| `rex optimize` | Analyze CLAUDE.md with local LLM (requires Ollama) |

## Architecture

```
rex-cli (npm)          — CLI tool, zero dependencies, 10KB
├── Guards (6x)        — Shell scripts installed to ~/.claude/rex-guards/
├── Health Engine      — 9 check categories, 55+ individual checks
└── Hooks              — SessionStart, SessionEnd, Stop, PreToolUse, PostToolUse
```

The CLI is a single JavaScript file with all checks bundled. No runtime dependencies.

Guard scripts are plain bash — readable, auditable, modifiable. Find them in `~/.claude/rex-guards/`.

## How Guards Work

REX uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — shell commands that run at specific lifecycle points:

```
User prompt → PreToolUse → [Claude works] → PostToolUse → Stop
                  ↑                              ↑           ↑
          dangerous-cmd-guard         test-protect-guard   completion-guard
                                      ui-checklist-guard   session-summary
                                      scope-guard
```

Guards output warnings to Claude's context. They don't block Claude (except `dangerous-cmd-guard` which returns `{"decision": "block"}` for truly destructive commands).

## Requirements

- Node.js 20+
- Claude Code installed
- macOS / Linux (bash required for guards)

**Optional (for memory features):**
- [Ollama](https://ollama.ai) running locally
- `ollama pull nomic-embed-text`

## Customization

Guards live in `~/.claude/rex-guards/`. Edit any `.sh` file to customize behavior:

```bash
# Example: change scope guard threshold from 8 to 15 files
vim ~/.claude/rex-guards/scope-guard.sh
```

Hooks are registered in `~/.claude/settings.json` under the `hooks` key.

## License

[MIT](LICENSE) — D-Studio
