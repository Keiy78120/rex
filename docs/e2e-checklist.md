# REX E2E Checklist

Last validated: March 5, 2026

## One-command install
- [x] `rex install` completes without interactive prompts when environment is ready.
- [x] `rex install` runs `init` + `setup` + post-install `audit`.

## CLI core
- [x] `rex --version`
- [x] `rex doctor`
- [x] `rex status`
- [x] `rex audit --json`

## Autonomous agents
- [x] `rex agents profiles --json`
- [x] `rex agents create read ...`
- [x] `rex agents run <id> --once`
- [x] `rex agents run <id>` + `rex agents stop <id>`
- [x] `rex agents delete <id>`

## MCP registry
- [x] `rex mcp list --json`
- [x] `rex mcp add ...`
- [x] `rex mcp check <id>`
- [x] `rex mcp remove <id>`

## Gateway controls
- [x] Telegram gateway menu includes `Advanced` + `Agents` + `MCP`.
- [x] Gateway slash commands for autonomous agents lifecycle.
- [x] Gateway slash commands for MCP registry (`check`, `enable/disable`, `sync-claude`, `export`).
- [ ] Manual chat validation: upload image/PDF/audio to Telegram bot and run `/file_analyze`.

## Memory / MCP
- [x] `rex prune --stats`
- [x] `rex context`

## Voice / Audio
- [x] `rex call status --json`
- [x] `rex audio status --json`
- [x] `rex voice status --json`
- [x] `whisper-cli` detected after setup auto-install (macOS + Homebrew)

## Flutter desktop
- [x] `cd packages/flutter_app && flutter test`
- [x] `cd packages/flutter_app && flutter build macos --debug`

## Monorepo build
- [x] `pnpm -r build`
- [x] `pnpm -r test`

## Known follow-ups
- [ ] Add callback-level agent targeting buttons (start/stop per-id inline shortcuts).
- [ ] Add MCP remote connectivity deep diagnostics (latency/retry/circuit-breaker).
