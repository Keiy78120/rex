# Contributing to REX

Thanks for your interest! REX is a CLI + desktop app companion for Claude Code.

---

## What you need

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 22+ | CLI runtime |
| pnpm | 10+ | Package manager |
| Flutter | 3.x | macOS desktop app (optional) |
| Xcode | 15+ | For Flutter macOS builds (optional) |
| Ollama | latest | Local embeddings (optional, recommended) |

---

## Setup

```bash
git clone https://github.com/Keiy78120/rex.git
cd rex
pnpm install
pnpm build
```

Verify:
```bash
node packages/cli/dist/index.js doctor
```

Flutter app (optional):
```bash
cd packages/flutter_app
flutter pub get
flutter build macos --debug
open build/macos/Build/Products/Debug/rex_app.app
```

---

## Project structure

```
packages/
├── cli/         TypeScript CLI — entry: src/index.ts, build: pnpm build
├── core/        Shared health checks (rex doctor)
├── memory/      Embedding + semantic search (SQLite + nomic-embed-text)
└── flutter_app/ macOS native app — entry: lib/main.dart

dotfiles/
├── skills/      Claude Code skills (SKILL.md + evals/)
└── CLAUDE.md    Global REX instructions for Claude agents

docs/plans/      Architecture and execution plans
```

Key files:
- `packages/cli/src/index.ts` — all CLI commands
- `packages/cli/src/daemon.ts` — background service
- `packages/cli/src/hub.ts` — HTTP API (port 7420)
- `packages/cli/src/free-tiers.ts` — free tier provider catalog
- `packages/flutter_app/lib/services/rex_service.dart` — all app business logic

---

## Code rules

### TypeScript (CLI)
- Explicit types — no `any`
- Logs via `createLogger('source')` from `logger.ts` — never `console.log`
- Paths via `paths.ts` — never hardcode `~/.claude/rex/`
- ESM imports with `.js` extensions

### Dart (Flutter)
- Business logic in `rex_service.dart` only — pages are UI only
- `ValueListenableBuilder` for state — no `setState` in complex widgets
- Colors from `RexColors` in `theme.dart` — never hardcode hex
- `addPostFrameCallback` for service calls in `initState`

---

## Workflow

```bash
# 1. Branch
git checkout -b feat/my-feature

# 2. Make changes

# 3. Verify build
pnpm build              # must be zero errors
# flutter build macos --debug  (if you touched flutter_app/)

# 4. Commit
git commit -m "feat(cli): add my feature"
```

Commit format (conventional commits): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

---

## Architecture notes

**Provider routing order**: cache → local script → Ollama → free tier (Groq/Cerebras/Together/Mistral/OpenRouter/DeepSeek) → subscription

**Memory flow**: sessions → `~/.claude/rex/memory/pending/` → embedded lazily by daemon → SQLite vector search

**Guards**: hooks in `~/.claude/settings.json` call scripts in `~/.claude/rex-guards/`

**Hub**: HTTP API on port 7420, `REX_HUB_TOKEN`-protected (dashboard `/` is public)

---

## Questions?

Open a GitHub Issue with the provided templates, or start a Discussion.
