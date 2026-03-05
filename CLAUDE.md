# REX - Central TODO (Agents + MCP + Voice)

## Source Of Truth
- `CLAUDE.md` principal = celui du root du repo actif.
- Repo principal de travail: `/Users/keiy/Documents/Developer/keiy/rex`
- Ce clone (`/Users/keiy/Documents/Developer/_config/rex`) doit rester synchronisé avec le principal.

## In progress
- [x] Validate full end-to-end flow after Flutter-only migration (no legacy UI fallback).
- [x] Run full integration tests: CLI + MCP memory + gateway + Flutter desktop + LaunchAgents.

## Autonomous Agents (OpenClaw-like)
- [x] Add `rex agents` command group (`list`, `create`, `run`, `stop`, `status`, `logs`).
- [x] Ship 3 preconfigs: `read`, `analysis`, `code-review` (+ `advanced`, `ultimate`).
- [ ] Add scheduler/cron wake-up for autonomous agents.
- [ ] Add hard stop policy when tasks are done or budget/time limits are hit.
- [ ] Add Opus/Sonnet-assisted agent profile generator with strict templates.

## MCP Orchestration
- [x] Add global MCP registry manager in CLI/UI (remote + self-hosted connectors).
- [ ] Add MCP health checks + dependency checks in `rex doctor`.
- [ ] Add MCP auto-reconnect and circuit-breaker strategy.
- [ ] Add per-agent MCP tool policy + allow/deny lists.

## Memory & Embeddings
- [ ] Add configurable embed model (`nomic-embed-text` default, user override).
- [ ] Add local summarizer pipeline before embedding to reduce token load.
- [ ] Add long-session compaction strategy and memory retention controls.
- [ ] Add conflict resolution for cloud memory + local semantic memory merge.

## Voice / Audio
- [x] Add whisper transcription pipeline command (`classic` + `REX optimize` mode).
- [x] Add post-transcription optimize toggle (local model or Haiku) in Flutter settings.
- [ ] Add automatic call event -> audio logger -> transcript -> memory ingest pipeline.
- [x] Add recorder input setup helper for ffmpeg/avfoundation device mapping.

## Telegram Gateway
- [x] Add interactive `Advanced` submenu for complex operations.
- [ ] Add quick actions for frequent tasks (chat Qwen / Claude session resume / status).
- [x] Add commands for autonomous agents lifecycle and MCP registry controls.
- [x] Add attachment pipeline (Telegram image/pdf/audio/video upload -> local save -> on-demand analysis).

## Flutter App (single desktop UI)
- [x] Add autonomous agents page (status, start/stop, templates, logs).
- [x] Add MCP servers page (registry, health, connect/disconnect, diagnostics).
- [x] Add voice pipeline page (transcribe, optimize, auto-ingest).
- [ ] Add persistent operation logs page with filtering (gateway/agents/memory/audio).

## Docs / Ops
- [ ] Fetch and document reusable OpenClaw patterns adopted in REX.
- [x] Keep migration notes and architecture map updated in README.
- [x] Add E2E checklist for release gating.
