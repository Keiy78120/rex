<p align="center">
  <img src=".github/assets/rex-banner.png" alt="REX" width="600" />
</p>

<h1 align="center">REX</h1>

<p align="center">
  <strong>Claude Code productivity centralizer</strong><br>
  Monitoring, voice transcription & semantic search in your menubar.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rex-cli"><img src="https://img.shields.io/npm/v/rex-cli?color=blue&label=npm" alt="npm" /></a>
  <a href="https://github.com/Keiy78120/rex/releases"><img src="https://img.shields.io/github/v/release/Keiy78120/rex?label=app" alt="release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  <a href="https://github.com/Keiy78120/rex/actions"><img src="https://img.shields.io/github/actions/workflow/status/Keiy78120/rex/ci.yml?label=CI" alt="CI" /></a>
</p>

---

## What is REX?

REX monitors your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) setup and gives you instant visibility into your config health, MCP servers, plugins, hooks, memory, and more — all from your macOS menubar.

It also includes a built-in **voice transcription** powered by Whisper, running 100% locally on your machine.

### Features

- **Zero config** — auto-detects `~/.claude/`, starts monitoring immediately
- **Health checks** — config, rules, memory, MCP servers, plugins, hooks, docs cache, environment
- **Voice transcription** — press `Option+Space`, speak, get text in your clipboard
- **Two-pass Whisper** — instant draft (tiny model) + accurate replacement (large model), automatic
- **Code-aware** — detects `camelCase`, `snake_case`, keywords, and formats them as code
- **Semantic search** — find anything across sessions, transcriptions, and memory
- **Privacy-first** — everything runs locally, nothing leaves your machine
- **One-click install** — `npx rex install` and you're done

## Install

```bash
# CLI + menubar app
npx rex install

# CLI only
npm install -g rex-cli

# Or download the .dmg from Releases
```

## CLI Usage

```bash
# Full health check
rex doctor

# Quick status
rex status
```

```
═════════════════════════════════════════════
        REX DOCTOR — Health Check
═════════════════════════════════════════════

  ⚙ Config  3/3
    ✓ CLAUDE.md — Present and non-empty
    ✓ settings.json — Valid JSON
    ✓ vault.md — Present

  📏 Rules  8/8
    ✓ api-design.md — Present and non-empty
    ✓ defensive-engineering.md — Present and non-empty
    ...

─────────────────────────────────────────────
  Summary: 42/42 checks passed
  Status:  HEALTHY
═════════════════════════════════════════════
```

## Menubar App

A lightweight macOS menubar app that shows your Claude Code health at a glance.

```
┌─────────────────────────────────┐
│  ● REX              Healthy     │
│  v0.1.0         last: 2m ago    │
├─────────────────────────────────┤
│  ▸ Config          8/8  ✓      │
│  ▸ MCP Servers     3/3  ✓      │
│  ▸ Plugins         3/3  ✓      │
│  ▸ Hooks           3/3  ✓      │
│  ▸ Docs Cache      7 files     │
│  ▸ Memory          4 files     │
│  ▸ Voice     ⌥Space to talk    │
├─────────────────────────────────┤
│  ⚙ Settings     Run Doctor      │
└─────────────────────────────────┘
```

Built with [Tauri v2](https://v2.tauri.app/) — native macOS performance, tiny footprint (~15MB + models).

## Architecture

```
rex/
├── packages/
│   ├── core/     # Shared checks engine (TypeScript)
│   ├── cli/      # CLI tool — rex doctor, rex status
│   └── app/      # Tauri v2 + React menubar app
│       └── src-tauri/
│           └── whisper/  # whisper.cpp embedded (Rust)
```

Monorepo powered by pnpm workspaces.

| Component | Tech |
|-----------|------|
| App | Tauri v2, React 19, Tailwind CSS 4 |
| Transcription | whisper.cpp via whisper-rs (local, CoreML on Apple Silicon) |
| Storage | SQLite + sqlite-vec (vector search) |
| CLI | TypeScript, npm |
| Core | TypeScript shared library |

## Voice Transcription

REX includes a built-in SuperWhisper-like voice transcription:

1. Press **`Option+Space`** anywhere
2. Speak naturally
3. Text is copied to your clipboard

**Two-pass pipeline** (automatic, zero config):
- **Pass 1** — Whisper Tiny (75MB, bundled): instant draft while you speak
- **Pass 2** — Whisper Large V3 Turbo (auto-downloaded on first use): replaces with accurate text

**Code detection**: automatically wraps `camelCase`, `snake_case`, and known programming keywords in backticks.

## Requirements

- macOS 13+ (Ventura or later)
- Apple Silicon or Intel Mac
- Node.js 20+ (for CLI)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Roadmap

- [x] Core checks engine
- [x] CLI (`rex doctor`, `rex status`)
- [ ] Menubar app (Tauri v2)
- [ ] Voice transcription (two-pass Whisper, local)
- [ ] Audio logger — listen to all your meetings, WhatsApp calls, Discord on your Mac. Never forget anything. Everything is transcribed, summarized, and searchable.
- [ ] Semantic search across sessions, transcriptions, and memory
- [ ] Personal RAG — all your data indexed and ready for fine-tuning personal LLMs
- [ ] `npx rex install` one-click setup
- [ ] Homebrew cask

## License

[MIT](LICENSE) — D-Studio
