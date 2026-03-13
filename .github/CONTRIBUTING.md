# Contributing to REX

Thank you for your interest in contributing. REX is a monorepo (pnpm workspaces) targeting developers who use Claude Code or Codex on macOS or Linux.

Before contributing, read `docs/REX-BRAIN.md` — it's the source of truth for how REX thinks and routes.

---

## Stack

| Package | Language | Build | Entry |
|---------|----------|-------|-------|
| `packages/cli` | TypeScript, Node 22 | `tsup` | `src/index.ts` |
| `packages/memory` | TypeScript, SQLite | `tsc` | `src/index.ts` |
| `packages/flutter_app` | Dart / Flutter 3.x | `flutter build` | `lib/main.dart` |
| `packages/core` | TypeScript | `tsc` | `src/index.ts` |

Key CLI files:
- `src/orchestrator.ts` — Fleet race, tier routing
- `src/relay-engine.ts` — Multi-model relay chain (RxJS)
- `src/rex-identity.ts` — REX Identity Layer, 5-step pipeline
- `src/gateway.ts` — Telegram bot + OpenClaw sessions
- `src/daemon.ts` — Unified background process
- `src/orchestration-policy.ts` — 6-tier routing, 0 LLM
- `packages/memory/src/hybrid-search.ts` — BM25 + vector search

---

## Getting Started

```bash
git clone https://github.com/Keiy78120/rex.git
cd rex
pnpm install
pnpm build          # TypeScript strict — must be 0 errors
pnpm test           # 713 tests, < 2s
```

Flutter app:
```bash
cd packages/flutter_app
flutter pub get
flutter build macos --debug
```

Verify the CLI works:
```bash
node packages/cli/dist/index.js --version
# or if globally installed:
rex --version
rex doctor
```

---

## Architecture principles to respect

**Script-first (70/30)**: If a script can do the job, use a script. No LLM.

**Routing is 0-LLM**: `orchestration-policy.ts` routes based on message patterns, never calls a model to decide.

**Logs via logger**: Never `console.log`. Use `createLogger('source')` from `logger.ts`.

**Paths via paths.ts**: Never hardcode `~/.claude/...` or `~/.rex/...` directly.

**REX Identity Layer**: All free-text messages go through `rexIdentityPipeline()` in `rex-identity.ts`. Don't bypass it.

---

## Branch Naming

```
feat/<short-description>     # new feature
fix/<short-description>      # bug fix
refactor/<short-description> # code improvement without behavior change
docs/<short-description>     # documentation only
chore/<short-description>    # tooling, deps, config
test/<short-description>     # tests only
```

Never commit directly to `main`.

---

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(memory): add delta ingest for growing files
fix(gateway): prevent duplicate update processing
refactor(daemon): consolidate ingest cycle logic
docs(readme): update install instructions
chore: upgrade tsup to 8.x
test(relay): add confidence threshold coverage
```

Rules:
- Imperative mood, lowercase after the colon
- No `Co-Authored-By` lines
- No mention of AI tools in commit messages or PR descriptions

---

## Pull Requests

1. Branch off `main`
2. `pnpm build` — zero TypeScript errors
3. `pnpm test` — all 713 tests green
4. For Flutter changes: `flutter build macos --debug` must pass
5. For CLI changes: `rex doctor` output looks sane
6. Fill in the PR template (context + test plan)
7. Link any related issue

---

## Code Style

### TypeScript (CLI + Memory)

- No `any` — use `unknown` + type guard if necessary
- No `console.log` — use `createLogger('source')` from `logger.ts`
- ESM imports with `.js` extensions: `import { foo } from './bar.js'`
- `async/await` everywhere — no callbacks, no `.then()` chains
- All paths via `paths.ts`
- Always try/catch with explicit error messages — no silent swallows
- No `require()` in `.ts` files — ESM only (silent fail otherwise)

### Dart / Flutter

- Business logic ONLY in `rex_service.dart` — pages are UI only
- `ValueListenableBuilder` for complex state — no `setState` in complex widgets
- Colors via `RexColors` (theme.dart) — never hardcode hex in pages
- `addPostFrameCallback` for any service call in `initState`
- Flat UI — no Material elevation/shadows

### General

- No secrets or `.env` files committed
- No feature flags for things that can just be changed
- No backwards-compatibility shims for code that's not in use yet
- YAGNI — only build what's needed now

---

## Testing

```bash
pnpm test                    # all tests
pnpm test --coverage         # with coverage
pnpm test packages/cli/tests/unit/gateway.test.ts  # single file
```

Rules:
- Never modify tests to make them pass — fix the code
- Don't delete tests to clean up — understand what they're protecting
- Every new public function needs at least one test
- Mock external APIs (Telegram, Ollama), never mock internal logic you're testing

---

## Areas & owners

| Area | Key files | What to check |
|------|-----------|---------------|
| Relay / Routing | `relay-engine.ts`, `orchestration-policy.ts`, `orchestrator.ts` | `rex route --explain`, `rex relay "<task>"` |
| Memory | `packages/memory/src/` | `rex ingest`, `rex search --hybrid` |
| Gateway | `gateway.ts` | Telegram bot responds, no duplicate messages |
| Daemon | `daemon.ts`, `watchdog.ts` | `rex daemon`, daily summary at 22h |
| Flutter | `packages/flutter_app/lib/` | `flutter build macos --debug`, open app |
| Guards | `guards/`, `init.ts` | `rex init`, `rex doctor` |
| Agents | `agent-runtime.ts`, `agent-templates/` | `rex agents list` |

---

## Documentation

Key docs to read before working on an area:

- `docs/REX-BRAIN.md` — full logic and routing (source of truth)
- `docs/VISION.md` — manifesto and principles
- `docs/vps-install.md` — VPS Brain deployment
- `CLAUDE.md` (root) — project entry point for Claude Code

If you discover a pattern or gotcha while contributing, add it to the relevant doc.
