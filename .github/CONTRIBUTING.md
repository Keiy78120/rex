# Contributing to REX

Thank you for your interest in contributing. REX is a monorepo (pnpm workspaces) targeting developers who use Claude Code on macOS or Linux.

## Stack

| Package | Language | Build |
|---------|----------|-------|
| `packages/cli` | TypeScript, Node 22 | `tsup` |
| `packages/memory` | TypeScript, SQLite | `tsc` |
| `packages/flutter_app` | Dart / Flutter 3.x | `flutter build` |
| `packages/core` | TypeScript | `tsc` |

## Getting Started

```bash
git clone https://github.com/Keiy78120/rex.git
cd rex
pnpm install
pnpm build          # builds all TypeScript packages
```

Flutter app:
```bash
cd packages/flutter_app
flutter pub get
flutter build macos --debug
```

## Branch Naming

```
feat/<short-description>     # new feature
fix/<short-description>      # bug fix
refactor/<short-description> # code improvement
docs/<short-description>     # documentation only
chore/<short-description>    # tooling, deps
```

Never commit directly to `main`.

## Commit Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(memory): add delta ingest for growing files
fix(gateway): prevent duplicate update processing
refactor(daemon): consolidate ingest cycle logic
docs(readme): update install instructions
chore: upgrade tsup to 8.x
```

Rules:
- Imperative mood, lowercase after the colon
- No `Co-Authored-By` lines
- No mention of AI tools in commit messages

## Pull Requests

1. Branch off `main`
2. Run `pnpm build` — must pass with zero errors
3. For Flutter changes: `flutter build macos --debug` must pass
4. Fill in the PR template fully
5. Link any related issue in the PR description

## Code Style

- **TypeScript**: no `any`, no `console.log` (use `createLogger` from `logger.ts`), ESM imports
- **Paths**: always use `paths.ts` — never hardcode `~/.claude/...` directly
- **Dart/Flutter**: business logic in `rex_service.dart` only, widgets stay UI-only
- **No secrets**: `.env` files must never be committed

## Running Tests

```bash
pnpm test           # runs tests across all packages
```

If no test suite exists for the area you changed, add one or describe manual verification steps in your PR.
