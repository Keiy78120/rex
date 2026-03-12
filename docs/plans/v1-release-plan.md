# REX V1 Release Plan

> Target: REX V1 stable — feature-parity with OpenClaw + REX-specific additions
> Status: 85-90% complete → this plan covers the remaining 10-15%
> Date: 2026-03-12

## Phase A — TypeScript Strict (12 errors → 0)

Priority: **CRITICAL** — blocks build confidence

### A1. agent-runtime.ts (9 errors)
- `OllamaTool` type missing `name`, `description`, `input_schema` → define proper interface
- `ChatCompletionMessageToolCall` union type → narrow with type guard on `.function`
- `ToolResult` not assignable to `string` → extract `.output` field
- `findLast` needs `es2023` → update tsconfig `lib` to include `es2023`
- Parameter `m` implicit `any` → add type annotation

### A2. ai-providers.ts (1 error)
- `LanguageModelV1` renamed to `LanguageModel` in Vercel AI SDK → update import

### A3. anti-vibecoding.ts (1 error)
- Function called with 1 arg, expects 3 → fix call site

### A4. pane-relay.ts (1 error)
- Function called with 1 arg, expects 3 → fix call site

## Phase B — Build & Package

### B1. Clean build
- `pnpm build` → zero warnings
- Verify `dist/` output is correct

### B2. Binary packaging
- `scripts/build-binary.sh` → test on macOS
- Verify `rex` command works from installed binary

## Phase C — Flutter Polish

### C1. Deprecation warnings
- `use_build_context_synchronously` → add mounted checks
- `minSize` deprecated in window_manager → use replacement API

### C2. All 26 pages load without error
- Smoke test each page via sidebar navigation

## Phase D — Integration Testing

### D1. CLI → Flutter round-trip
- `rex status --json` → Flutter parses correctly
- `rex providers ai --json` → Settings OpenAI tab displays
- `rex search --json` → Memory page displays results

### D2. Gateway stability
- `rex gateway` runs 1h without crash
- Telegram messages route correctly through REX Identity Layer

### D3. Daemon stability
- `rex daemon` runs 1h without memory leak
- Daily summary fires at configured hour

## Phase E — Documentation

### E1. Update CLAUDE.md
- Mark V1 as reached
- Update file counts, test counts

### E2. README user-facing
- Install instructions
- Quick start guide
- Feature overview

---

## Execution Order

1. **Phase A** (sub-agents, parallel) — fix all 12 tsc errors
2. **Phase B** (sequential) — build validation
3. **Phase C** (sub-agent) — Flutter fixes
4. **Phase D** (manual) — integration smoke tests
5. **Phase E** (sub-agent) — docs update
