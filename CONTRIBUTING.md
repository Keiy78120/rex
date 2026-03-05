# Contributing to REX

Thanks for your interest in REX! Here's how to get started.

## Development Setup

1. **Prerequisites**: Node.js 20+, pnpm 10+, Flutter 3.x (macOS toolchain)
2. **Clone**: `git clone https://github.com/Keiy78120/rex.git && cd rex`
3. **Install**: `pnpm install`
4. **Build**: `pnpm build`
5. **Test**: `pnpm test`
6. **App dev**: `cd packages/flutter_app && flutter run -d macos`

## Project Structure

```
rex/
├── packages/
│   ├── core/    # Shared checks engine (TypeScript)
│   ├── cli/     # CLI tool (TypeScript)
│   ├── memory/  # Local memory MCP + ingestion (TypeScript)
│   └── flutter_app/ # Desktop app (Flutter macOS)
```

## Pull Request Process

1. Fork the repo and create a feature branch (`feat/my-feature`)
2. Write tests for new functionality
3. Ensure all tests pass (`pnpm test`)
4. Ensure the build succeeds (`pnpm build`)
5. Submit a PR with a clear description

## Commit Convention

We use conventional commits:
- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — maintenance
- `docs:` — documentation
- `test:` — tests

## Code Style

- TypeScript strict mode
- No `any` types without justification
- Tests for all public APIs

## Reporting Issues

Use GitHub Issues with the provided templates. Include:
- OS version and architecture
- Node.js and Flutter versions
- Steps to reproduce
