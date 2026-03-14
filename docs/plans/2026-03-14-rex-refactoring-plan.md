# REX Refactoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize 155 flat files into 13 domain folders (~45 files), fusing duplicates, without breaking any of the 1449 tests.

**Architecture:** Move files into domain folders, create index.ts re-exports per domain. Use shim files at old paths during transition to avoid breaking imports. Update imports progressively, remove shims at the end.

**Tech Stack:** TypeScript, tsup, pnpm, vitest

**Critical constraints:**
- `logger.js` has 85 importers, `paths.js` has 53 → need shims
- All 112 test files import from `../../src/filename.js` → update after each domain
- `pnpm test` must pass after EVERY task
- `pnpm build` must pass after EVERY task
- Each task = 1 git commit

---

### Task 1: Create domain folder structure

**Files:**
- Create: `src/utils/`, `src/brain/`, `src/gateway/`, `src/fleet/`, `src/signals/`, `src/agents/`, `src/providers/`, `src/security/`, `src/tools/`, `src/training/`, `src/setup/`, `src/commands/`, `src/ui/`

**Step 1: Create all directories**

```bash
cd packages/cli
mkdir -p src/{utils,brain,gateway,fleet,signals,agents,providers,security,tools,training,setup,commands,ui}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "refactor: create domain folder structure (13 directories)"
```

---

### Task 2: Move utils (config, paths, logger) + create shims

**Files:**
- Move: `src/config.ts` → `src/utils/config.ts`
- Move: `src/paths.ts` → `src/utils/paths.ts`
- Move: `src/logger.ts` → `src/utils/logger.ts`
- Move: `src/docker.ts` → `src/utils/docker.ts`
- Move: `src/db-migrations.ts` → `src/utils/db-migrations.ts`
- Move: `src/migrate.ts` → `src/utils/migrate.ts`
- Create: `src/utils/index.ts` (re-exports)
- Create: shim `src/config.ts`, `src/paths.ts`, `src/logger.ts` (re-export from utils/)

**Step 1: Move files**

```bash
mv src/config.ts src/utils/config.ts
mv src/paths.ts src/utils/paths.ts
mv src/logger.ts src/utils/logger.ts
mv src/docker.ts src/utils/docker.ts
mv src/db-migrations.ts src/utils/db-migrations.ts
mv src/migrate.ts src/utils/migrate.ts
```

**Step 2: Create shims at old paths** (critical — 85+53+9 importers)

```typescript
// src/config.ts (shim)
export * from './utils/config.js'

// src/paths.ts (shim)
export * from './utils/paths.js'

// src/logger.ts (shim)
export * from './utils/logger.js'

// src/docker.ts (shim)
export * from './utils/docker.js'

// src/db-migrations.ts (shim)
export * from './utils/db-migrations.js'

// src/migrate.ts (shim)
export * from './utils/migrate.js'
```

**Step 3: Create src/utils/index.ts**

```typescript
export * from './config.js'
export * from './paths.js'
export * from './logger.js'
export * from './docker.js'
export * from './db-migrations.js'
export * from './migrate.js'
```

**Step 4: Build + test**

```bash
pnpm build && pnpm test
```
Expected: 1449 tests pass, build succeeds

**Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move utils (config, paths, logger, docker, db) to utils/"
```

---

### Task 3: Move security/ (low-risk, few consumers)

**Files:**
- Move: `src/security-scanner.ts` → `src/security/scanner.ts`
- Move: `src/session-guard.ts` → `src/security/session.ts`
- Merge: `src/guard-manager.ts` + `src/guard-ast.ts` → `src/security/guards.ts`
- Move: `src/secrets.ts` → `src/security/secrets.ts`
- Create: `src/security/index.ts`
- Create: shims at old paths
- Update: test imports in `tests/unit/guard-manager.test.ts`, `tests/unit/guard-ast.test.ts`, `tests/unit/session-guard.test.ts`, `tests/unit/security-scanner.test.ts`, `tests/unit/secrets.test.ts`, `tests/integration/secrets.test.ts`

**Step 1: Move files and create merged guards.ts**

Move `security-scanner.ts`, `session-guard.ts`, `secrets.ts`. Merge `guard-manager.ts` and `guard-ast.ts` by copying both contents into `security/guards.ts` (AST types + parser first, then manager logic).

**Step 2: Create shims at old paths**

```typescript
// src/security-scanner.ts
export * from './security/scanner.js'
// src/session-guard.ts
export * from './security/session.js'
// src/guard-manager.ts
export * from './security/guards.js'
// src/guard-ast.ts
export * from './security/guards.js'
// src/secrets.ts
export * from './security/secrets.js'
```

**Step 3: Create src/security/index.ts**

Re-export all public APIs from scanner, session, guards, secrets.

**Step 4: Update test imports**

Replace `../../src/guard-manager.js` → `../../src/security/guards.js` (or keep shim path).

**Step 5: Build + test**

```bash
pnpm build && pnpm test
```

**Step 6: Commit**

```bash
git commit -m "refactor: move security (scanner, guards, session, secrets) to security/"
```

---

### Task 4: Move training/ (low-risk, few consumers)

**Files:**
- Move: `src/training.ts` → `src/training/pipeline.ts`
- Merge: `src/self-improve.ts` + `src/reflector.ts` → `src/training/improve.ts`
- Move: `src/recategorize.ts` → `src/training/recategorize.ts`
- Create: `src/training/index.ts`, shims
- Update: test imports

**Steps:** Same pattern as Task 3 — move, shim, index, test, commit.

```bash
git commit -m "refactor: move training (pipeline, improve, recategorize) to training/"
```

---

### Task 5: Move setup/ (low-risk)

**Files:**
- Move: `src/setup-wizard.ts` → `src/setup/wizard.ts`
- Merge: `src/install.ts` + `src/setup.ts` + `src/quick-setup.ts` → `src/setup/install.ts`
- Create: `src/setup/index.ts`, shims
- Update: test imports

**Steps:** Same pattern.

```bash
git commit -m "refactor: move setup (wizard, install) to setup/"
```

---

### Task 6: Move ui/ (trivial)

**Files:**
- Move: `src/dashboard.ts` → `src/ui/dashboard.ts`
- Move: `src/ink-tui.ts` → `src/ui/tui.ts`
- Create: `src/ui/index.ts`, shims

```bash
git commit -m "refactor: move ui (dashboard, tui) to ui/"
```

---

### Task 7: Move signals/ (medium-risk)

**Files:**
- Move: `src/signal-detector.ts` → `src/signals/detector.ts`
- Move: `src/watchdog.ts` → `src/signals/watchdog.ts`
- Move: `src/event-journal.ts` → `src/signals/journal.ts`
- Merge: `src/pattern-detector.ts` + `src/observer.ts` + `src/dev-monitor.ts` + `src/monitor-daemon.ts` → `src/signals/patterns.ts` + `src/signals/watchdog.ts`
- Create: `src/signals/index.ts`, shims

**Note:** `watchdog.ts` absorbs `monitor-daemon.ts`. `patterns.ts` absorbs `pattern-detector.ts` + `observer.ts`. `dev-monitor.ts` stays or gets absorbed into patterns.

```bash
git commit -m "refactor: move signals (detector, watchdog, journal, patterns) to signals/"
```

---

### Task 8: Move fleet/ (medium-risk)

**Files:**
- Merge: `src/node-mesh.ts` + `src/node.ts` → `src/fleet/mesh.ts`
- Merge: `src/sync.ts` + `src/sync-queue.ts` + `src/codex-sync.ts` → `src/fleet/sync.ts`
- Move: `src/vps-deploy.ts` → `src/fleet/deploy.ts`
- Create: `src/fleet/index.ts`, shims

```bash
git commit -m "refactor: move fleet (mesh, sync, deploy) to fleet/"
```

---

### Task 9: Move providers/ (medium-risk, 8→3 files)

**Files:**
- Merge: `src/providers.ts` + `src/ai-providers.ts` + `src/free-tiers.ts` + `src/free-models.ts` + `src/llm.ts` → `src/providers/registry.ts`
- Merge: `src/llm-backend.ts` + `src/litellm.ts` + `src/litellm-config.ts` → `src/providers/backend.ts`
- Merge: `src/budget.ts` + `src/burn-rate.ts` + `src/semantic-cache.ts` → `src/providers/budget.ts`
- Create: `src/providers/index.ts`, shims

**Note:** This is one of the largest fusions. Verify all exports are preserved.

```bash
git commit -m "refactor: move providers (registry, backend, budget) to providers/ — 8 files → 3"
```

---

### Task 10: Move brain/ (high-value, core of REX)

**Files:**
- Move: `src/rex-identity.ts` → `src/brain/identity.ts`
- Merge: `src/orchestration-policy.ts` + `src/intent-engine.ts` + `src/intent-classifier.ts` + `src/intent-registry.ts` + `src/router.ts` → `src/brain/routing.ts`
- Merge: `src/orchestrator.ts` + `src/relay-engine.ts` + `src/pane-relay.ts` → `src/brain/orchestrator.ts`
- Move: `src/tool-injector.ts` → `src/brain/tool-injector.ts`
- Create: `src/brain/index.ts`, shims

```bash
git commit -m "refactor: move brain (identity, routing, orchestrator, tool-injector) to brain/"
```

---

### Task 11: Move tools/ (medium-risk)

**Files:**
- Merge: `src/tool-registry.ts` + `src/tool-adapter.ts` → `src/tools/registry.ts`
- Merge: `src/resource-hub.ts` + `src/skills.ts` → `src/tools/resources.ts`
- Merge: `src/mcp-discover.ts` + `src/mcp_registry.ts` → `src/tools/mcp.ts`
- Move: `src/lint-loop.ts` → `src/tools/lint.ts`
- Create: `src/tools/index.ts`, shims

```bash
git commit -m "refactor: move tools (registry, resources, mcp, lint) to tools/"
```

---

### Task 12: Move agents/ (medium-risk)

**Files:**
- Move: `src/agent-runtime.ts` → `src/agents/runtime.ts`
- Merge: `src/agents.ts` + `src/client-factory.ts` + `src/account-pool.ts` → `src/agents/factory.ts`
- Merge: `src/curious.ts` + `src/proactive-dispatch.ts` → `src/agents/curious.ts`
- Move: `src/lang-graph.ts` → `src/agents/lang-graph.ts`
- Move: `src/agent-templates/` → `src/agents/templates/`
- Create: `src/agents/index.ts`, shims

```bash
git commit -m "refactor: move agents (runtime, factory, curious, templates) to agents/"
```

---

### Task 13: Move gateway/ (high-risk, biggest file)

**Files:**
- Move: `src/gateway.ts` → `src/gateway/telegram.ts` (no split yet — just move)
- Move: `src/gateway-adapter.ts` → `src/gateway/adapter.ts`
- Move: `src/hub.ts` → `src/gateway/hub.ts`
- Move: `src/rex-mcp-server.ts` → `src/gateway/mcp-server.ts`
- Create: `src/gateway/index.ts`, shims

**Note:** gateway.ts (3199L) stays as one file for now. Splitting it is a separate task — too risky to split + move simultaneously.

```bash
git commit -m "refactor: move gateway (telegram, adapter, hub, mcp-server) to gateway/"
```

---

### Task 14: Split index.ts into commands/

**Files:**
- Create: `src/commands/core.ts` — doctor, status, daemon, watchdog, install
- Create: `src/commands/memory.ts` — ingest, categorize, search, prune, recategorize
- Create: `src/commands/fleet.ts` — fleet, sync, nodes
- Create: `src/commands/dev.ts` — review, workflow, lint, context, projects
- Create: `src/commands/agents.ts` — agents, relay, client, templates
- Create: `src/commands/tools.ts` — hub, mcp, skills, guard
- Create: `src/commands/admin.ts` — backup, migrate, audit, optimize, budget
- Create: `src/commands/index.ts` — registerAllCommands(program)
- Modify: `src/index.ts` — slim down to import commands + program.parse()

**Note:** This is the biggest single change. Each command group extracts ~500-800 lines from index.ts. Do one group at a time, test between each.

**Step 1:** Extract `core.ts` (doctor, status, daemon, watchdog)
**Step 2:** Test → green
**Step 3:** Extract `memory.ts`
**Step 4:** Test → green
**Step 5-12:** Continue for each group
**Step 13:** Final test + commit

```bash
git commit -m "refactor: split index.ts (4327L) into 7 command groups in commands/"
```

---

### Task 15: Move remaining files to appropriate domains

**Files:**
- `src/audio.ts` + `src/voice.ts` + `src/audio-logger.ts` → `src/utils/media.ts`
- `src/meeting.ts` → `src/utils/meeting.ts`
- `src/sandbox.ts` → `src/utils/sandbox.ts`
- `src/benchmark.ts` + `src/load-test.ts` → `src/utils/benchmark.ts`
- `src/context.ts` + `src/context-loader.ts` + `src/preload.ts` → `src/brain/context.ts`
- `src/inventory.ts` + `src/projects.ts` + `src/project-init.ts` + `src/project-intent.ts` → `src/tools/projects.ts`
- `src/rex-runner.ts` + `src/rex-launcher.ts` → `src/brain/runner.ts`
- `src/living-cache.ts` → `src/utils/cache.ts`
- `src/anti-vibecoding.ts` → `src/security/anti-vibecoding.ts`
- `src/review.ts` + `src/workflow.ts` → `src/tools/workflow.ts`
- `src/backup.ts` + `src/prune.ts` + `src/optimize.ts` → `src/utils/maintenance.ts`
- `src/config-lint.ts` → `src/utils/config-lint.ts`
- `src/init.ts` → `src/setup/init.ts`
- `src/audit.ts` → `src/utils/audit.ts`
- `src/app.ts` → `src/utils/app.ts`
- `src/call.ts` + `src/backend-runner.ts` → `src/utils/runner.ts`
- Shims at old paths
- Update test imports

```bash
git commit -m "refactor: move remaining files to domain folders"
```

---

### Task 16: Update all test imports to use new paths

**Files:**
- Modify: all 112 test files in `tests/unit/` and `tests/integration/`

**Step 1:** For each test file, replace `../../src/filename.js` with `../../src/domain/filename.js`

**Step 2:** Build + test

```bash
pnpm build && pnpm test
```

**Step 3:** Commit

```bash
git commit -m "refactor: update all test imports to use domain paths"
```

---

### Task 17: Remove shim files

**Files:**
- Delete: all `src/*.ts` shim files (re-exports)

**Step 1:** List all shim files (files that contain only `export * from`)
**Step 2:** Delete them
**Step 3:** Build + test — should still pass since tests now use domain paths
**Step 4:** Commit

```bash
git commit -m "refactor: remove shim re-export files — all imports use domain paths"
```

---

### Task 18: Update documentation

**Files:**
- Modify: `CLAUDE.md` — update Structure section
- Modify: `docs/REX-MODULES.md` — update with new structure
- Modify: `docs/REX-STATUS.md` — update file references
- Modify: `.claude/rules/project.md` — update structure section

```bash
git commit -m "docs: update all references to new domain folder structure"
```

---

### Task 19: Final verification

**Step 1:** Full build
```bash
pnpm build
```

**Step 2:** Full test
```bash
pnpm test
```

**Step 3:** Verify no orphan imports
```bash
grep -r "from '\.\./\.\./src/[a-z]" tests/ | grep -v "/utils/" | grep -v "/brain/" | grep -v "/gateway/" | grep -v "/fleet/" | grep -v "/signals/" | grep -v "/agents/" | grep -v "/providers/" | grep -v "/security/" | grep -v "/tools/" | grep -v "/training/" | grep -v "/setup/" | grep -v "/commands/" | grep -v "/ui/" | grep -v "/mini-modes/" | grep -v "/hooks/"
```
Expected: 0 results (no imports pointing to old flat paths)

**Step 4:** Commit tag
```bash
git tag refactor/domain-structure-v1
```

---

## Execution Notes

- **Total: 19 tasks, ~19 commits**
- **Estimated time: 3-4 hours** (mostly mechanical moves + grep/replace)
- **Risk mitigation:** shims ensure nothing breaks during transition
- **Rollback:** each task is 1 commit, `git revert` any single task if needed
- **Parallel-safe:** NO — tasks must be sequential (each depends on previous)
