# REX — Contexte projet pour agents

## Source Of Truth — CRITIQUE

- **Repo OFFICIEL et UNIQUE** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche principale** : `main`
- **NE JAMAIS cloner ou travailler sur un autre dossier** (ex: `/_config/rex` est un ancien clone, NE PAS L'UTILISER).
- Si un autre agent travaille sur REX, il DOIT ouvrir ce repo, pas un clone.
- `CLAUDE.md` du root de ce repo = seule source de verite. Pas de copie ailleurs.
- `docs/plans/action.md` = document d'execution one-shot. Il porte les regles operatoires pour l'agent externe qui construit REX, son lead et ses sous-agents de build.
- Si une doc secondaire contredit ce fichier ou `action.md`, corriger la doc secondaire.

Ce fichier est le point d'entree rapide pour tout agent (Claude, Codex, Garry) qui travaille sur ce repo.
**Mettre a jour la section "En cours / Terminé" a chaque changement significatif.**

---

## Projet en bref

REX est un companion pour Claude Code : guards automatiques, memoire semantique, gateway Telegram, app macOS Flutter.

- **Repo :** `~/Documents/Developer/keiy/rex`
- **npm :** `rex-claude` v6.0.0 — `~/.nvm/versions/node/v22.20.0/bin/rex`
- **Monorepo :** pnpm workspaces
- **Stack :** TypeScript/Node (CLI), Dart/Flutter (app macOS), SQLite (memoire)
- **Principe operatoire :** centraliser dynamiquement scripts, outils installes, hardware, services locaux, quotas et providers; proposer local/gratuit/owned-first, payant en dernier recours
- **Ordre d'integration :** CLI/script local d'abord, MCP ensuite, API ensuite, autre adaptation en dernier recours
- **Politique tools :** registry large autorise, mais integrations externes desactivees par defaut jusqu'au choix explicite du user
- **Topologie :** REX doit rester utile en mode 1 machine, petit parc (2-5) ou flotte large (10-30+) avec degradation propre
- **Continuite :** gateway, sync, memory et background doivent preserver puis rejouer; reponse differee acceptable, perte non
- **Doc d'execution one-shot :** `docs/plans/action.md` doit suffire a orienter un agent sans navigation supplementaire obligatoire
- **Separation des roles doc :** `CLAUDE.md` fixe le cap projet, `action.md` explique comment executer
- **Plans actifs :**
  - `docs/plans/action.md`
  - `docs/plans/backend-functions.md`
  - `docs/plans/frontend-design.md`
  - `docs/plans/sources.md`
  - `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`
  - `docs/plans/2026-03-07-rex-install-optimization-plan.md`
  - `docs/plans/2026-03-07-rex-v7-master-plan.md` (reference longue)

---

## Structure

```
packages/
├── cli/         Source du CLI rex (TypeScript, tsup)
│   └── src/
│       ├── index.ts       Entry point + commandes
│       ├── gateway.ts     Bot Telegram
│       ├── llm.ts         Interface Ollama
│       ├── optimize.ts    Analyse CLAUDE.md
│       ├── context.ts     Analyse projet
│       ├── ingest.ts      Indexation sessions
│       ├── prune.ts       Nettoyage memoire
│       ├── paths.ts       Centralized path definitions (~/.claude/rex/)
│       ├── config.ts      Unified config (config.json + fallback chain)
│       ├── migrate.ts     DB migration from legacy paths
│       ├── projects.ts    Auto project scanner + index
│       ├── recategorize.ts Bulk memory re-classification
│       ├── preload.ts     Smart SessionStart context injection
│       ├── self-improve.ts Lesson extraction + rule promotion
│       ├── daemon.ts      Unified background daemon
│       ├── router.ts      Task-aware model routing
│       ├── logger.ts      Centralized logging (console + file, levels, rotation)
│       ├── project-intent.ts  Signal-based intent detection (0 LLM)
│       ├── quick-setup.ts     rex setup --quick (zero-question auto-config)
│       ├── account-pool.ts    Multi-account Claude rotation + rate-limit tracking
│       ├── free-tiers.ts      Free tier API catalog (Groq/Cerebras/Together/Mistral/etc)
│       └── [backend/]    backup, budget, event-journal, guard-manager, hub, inventory,
│                         memory-check, node, observer, orchestrator, reflector, review,
│                         semantic-cache, sync-queue, sync, workflow, backend-runner
├── core/        Checks partagés (rex doctor)
├── memory/      Embed + search (nomic-embed-text + SQLite)
├── flutter_app/ App macOS native
│   └── lib/
│       ├── main.dart              Entry point + tray + sidebar
│       ├── services/rex_service.dart  Toute la logique process
│       ├── pages/health_page.dart
│       ├── pages/gateway_page.dart
│       ├── pages/memory_page.dart
│       ├── pages/voice_page.dart
│       ├── pages/optimize_page.dart
│       ├── pages/context_page.dart
│       ├── pages/settings_page.dart
│       └── theme.dart
└── app/         (supprime, legacy)
```

---

## Config utilisateur

Credentials et config dans `~/.claude/settings.json` sous la cle `env` :

```json
{
  "env": {
    "REX_TELEGRAM_BOT_TOKEN": "...",
    "REX_TELEGRAM_CHAT_ID":   "...",
    "REX_MAC_TAILSCALE_IP":   "100.112.24.122",
    "REX_MAC_ADDRESS":        "52:f1:cf:b2:a5:32",
    "OLLAMA_URL":             "http://localhost:11434"
  }
}
```

Guards installes dans `~/.claude/rex-guards/`.
Hooks dans `~/.claude/settings.json` (SessionStart/End, PreToolUse, PostToolUse).
LaunchAgents dans `~/Library/LaunchAgents/com.dstudio.rex-*.plist`.

---

## Commandes de build

```bash
# CLI
cd packages/cli && pnpm build   # ou depuis root: pnpm build

# Flutter app
cd packages/flutter_app
flutter build macos --debug
open build/macos/Build/Products/Debug/rex_app.app

# Test rex CLI
rex doctor
rex status
rex gateway   # lance le bot Telegram

# Daemon
rex daemon           # Start persistent background daemon

# Migration
rex migrate          # Migrate ~/.rex-memory/ to ~/.claude/rex/
rex recategorize     # Bulk re-classify memories
rex doctor --fix     # Auto-fix then health check
```

---

## Points critiques a connaitre

### Flutter app
- **Sandbox desactive** : `DebugProfile.entitlements` a `app-sandbox: false` — OBLIGATOIRE sinon tous les `Process.run` echouent silencieusement.
- **PATH** : le `_env` getter dans `rex_service.dart` injecte manuellement `~/.nvm/versions/node/v22.20.0/bin` dans le PATH. Si rex change de version Node, mettre a jour ce getter.
- **window_manager crash** : ne JAMAIS re-ajouter `waitUntilReadyToShow` dans `main.dart`. Incompatible avec `MacosWindowUtilsConfig().apply()`. Fix: `ensureInitialized()` + `setPreventClose(true)` seulement.
- **notifyListeners pendant build** : tous les appels service dans `initState` doivent etre dans `addPostFrameCallback`.
- **Provider pattern** : toute l'app utilise `context.read<RexService>()` / `Consumer<RexService>`. NE PAS revenir a `widget.service`.
- **Theme** : `theme.dart` exporte `RexColors` + extension `context.rex`. Accent = rouge `#E5484D`. Dark canvas = `#1C1C24`. Light canvas = `#F5F5F7`.
- **Theme toggle** : dans `_SidebarFooter` de `main.dart`, utilise `ValueListenableBuilder<ThemeMode>` + `themeModeNotifier` global. Pill toggle animé sun/moon.
- **Sidebar** : `minWidth: 220`, `isResizable: false` — NE PAS rendre resizable sinon les labels disparaissent.
- **Install process** : `flutter build macos --debug` puis `cp -R build/.../rex_app.app /Applications/REX.app && xattr -cr && codesign --deep --force --sign -`
- **9 pages** : Health, Voice, Audio, Memory, Gateway, Agents, MCP, Optimize, Settings
- **Settings** : 5 onglets (General, Claude, LLM, Files, Advanced) — NE PAS simplifier.

### Gateway Telegram
- Long polling (timeout 30s) dans une boucle `while(true)`
- `execSync` bloque le thread — pour les actions longues utiliser `runAsync` (execFile promisify)
- Rate limit Telegram editMessageText : 1 edit / 600ms minimum
- Credentials lus depuis `~/.claude/settings.json` ET depuis `process.env` (fallback)

### Logging
- Tous les modules CLI utilisent `createLogger(source)` de `logger.ts`
- Logs dual : console (coloré) + fichier persistant `~/.claude/rex/daemon.log`
- Niveaux : debug, info, warn, error — configurable via `configureLogger({ level })`
- `rex logs` pour voir les logs, `rex logs -f` pour tail live
- `--verbose` sur n'importe quelle commande → passe en debug level
- Rotation auto dans le daemon (10k lignes max, garde 5k)

### Memoire
- SQLite dans `~/.claude/rex/memory/rex.sqlite`
- Embeddings via `nomic-embed-text` Ollama
- Two-phase ingest : chunks TOUJOURS sauvés dans `~/.claude/rex/memory/pending/` d'abord (instant), puis embeddés lazily par `processPending()` (max 30/run, 500ms throttle)
- Lockfile `~/.claude/rex/memory/ingest.lock` empêche les process concurrents (stale après 10min)
- Config env : `REX_EMBED_THROTTLE_MS` (défaut 500), `REX_MAX_EMBED_PER_RUN` (défaut 30)

---

## En cours / Terminé

### ✅ Terminé (session 2026-03-05)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Memory categorization system (rex categorize + list-memories) | `packages/memory/src/categorize.ts`, `packages/cli/src/index.ts` |
| Memory page : chips cliquables → browser liste par catégorie | `memory_page.dart` |
| Settings Advanced : REX_CATEGORIZE_MODEL (Qwen/Claude) | `settings_page.dart` |
| RexService : runCategorize + listMemories + categorizingModel | `rex_service.dart` |
| Fix crash app (window_manager + MacosWindowUtils conflict) | `main.dart` |
| System tray : hide-to-tray, menu contextuel, click to show | `main.dart` |
| Telegram notify depuis l'app (curl direct + fallback script) | `gateway_page.dart`, `rex_service.dart` |
| Injection credentials Telegram dans tous les subprocess | `rex_service.dart` (`_env` getter) |
| Fix sandbox macOS (app-sandbox: false en debug) | `DebugProfile.entitlements` |
| Fix double notifyListeners pendant build (addPostFrameCallback) | `memory_page.dart`, `gateway_page.dart` |
| Fix isTranscribing detection (startsWith au lieu de ==) | `voice_page.dart` |
| Refonte theme (dark/light, textSecondary, codeBg, etc.) | `theme.dart` |
| Pages : Health, Memory, Gateway, Optimize, Context, Voice, Settings | `pages/` |
| Hotkey global Cmd+Shift+V pour Voice page | `main.dart` |
| REX CLI v4.0.1 : gateway, llm, setup, context, optimize --apply | `packages/cli/src/` |
| Gateway Telegram v3 : menu interactif, Wake-on-LAN, mode Qwen/Claude | `gateway.ts` |
| Gateway menu refactor : Quick actions + sous-menu Advanced | `packages/cli/src/gateway.ts` |
| Hammerspoon call watcher installé par `rex init` | `packages/cli/src/init.ts` |
| OpenClaw notes locales rafraîchies (patterns à réutiliser) | `~/.claude/docs/openclaw.md` |
| Voice: post-traitement Whisper -> optimisation prompt via LLM local (toggle + modèle) | `packages/flutter_app/lib/services/rex_service.dart`, `packages/flutter_app/lib/pages/settings_page.dart`, `packages/flutter_app/lib/pages/voice_page.dart` |
| Voice: auto start/stop recording piloté par `call-state.json` (Hammerspoon events) | `packages/flutter_app/lib/services/rex_service.dart`, `packages/flutter_app/lib/pages/settings_page.dart`, `packages/flutter_app/lib/pages/voice_page.dart` |
| Gateway: anti-double update handling (`processingUpdates`) | `packages/cli/src/gateway.ts` |
| Gateway: per-update error catch (evite pause 5s sur exception) | `packages/cli/src/gateway.ts` |
| Gateway: Claude free-text mode utilise dino animation + edit same msg | `packages/cli/src/gateway.ts` |
| Flutter gateway_page: timer 5s poll checkGateway() pour real-time status | `packages/flutter_app/lib/pages/gateway_page.dart` |
| Flutter rex_service: stopGateway() utilise pkill pour tuer process orphelins | `packages/flutter_app/lib/services/rex_service.dart` |
| categorize.ts: --dry-run flag corrige (n'etait pas passe a categorize()) | `packages/memory/src/categorize.ts` |
| categorize.ts: classifyWithClaude JSON extraction robuste (markdown fences + greedy) | `packages/memory/src/categorize.ts` |
| Gateway: Qwen streaming Telegram (`editMessageText` progressif) + params optimisés | `packages/cli/src/gateway.ts` |
| Gateway: commandes `/babysit` (Claude CLI) et `/codex` (Codex CLI) | `packages/cli/src/gateway.ts` |
| Gateway: actions lourdes passées en async (`runAsync`) | `packages/cli/src/gateway.ts` |
| Flutter Gateway: logs combinés + auto-refresh 10s | `packages/flutter_app/lib/pages/gateway_page.dart` |
| Training pipeline research (draft) | `docs/research/training-pipeline.md` |
| README mis a jour | `README.md` |
| Plan v7 actif (master + execution + addendum OpenClaw) | `docs/plans/2026-03-07-rex-v7-master-plan.md`, `docs/plans/action.md`, `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md` |
| Hybrid semantic consolidation (cosine 0.82 + Qwen summarize) | `packages/memory/src/categorize.ts`, `packages/cli/src/index.ts` |
| Memory page: bouton Consolidate + HOW IT WORKS section | `memory_page.dart` |
| Health page: Run Doctor button + Rex Setup quick action | `health_page.dart` |
| Task-aware model router (7 taches, prefix match, cache 60s) | `packages/cli/src/router.ts` |
| `rex models` command: routing table avec dots verts/jaunes | `packages/cli/src/index.ts` |
| llm.ts: detectModel() delegue a pickModel('gateway') | `packages/cli/src/llm.ts` |
| CCR config optimise: default=qwen3-coder:30b, background=qwen2.5:1.5b, think=deepseek-r1:8b | `~/.claude-code-router/config.json` |
| Init.ts: flutter build macos (ancienne app supprimee) | `packages/cli/src/init.ts` |
| Gateway: T-Rex animation 🦖↔🦕 sur tous les états de chargement | `packages/cli/src/gateway.ts` |
| Gateway: askQwenStream utilise pickModel('gateway') au lieu de hardcodé | `packages/cli/src/gateway.ts` |
| categorize.ts: detectClassifyModel() auto-detect (qwen3.5:9b first) | `packages/memory/src/categorize.ts` |
| Flutter _env: ajout ~/.local/bin dans PATH (fix Claude Code not found) | `packages/flutter_app/lib/services/rex_service.dart` |
| CLI agents autonomes: create/list/update/run/logs/start/stop/status + profils preconfig | `packages/cli/src/agents.ts`, `packages/cli/src/index.ts` |
| SessionStart auto-recommendation tools/skills via LLM (`rex agents recommend`) | `packages/cli/src/init.ts`, `packages/cli/src/agents.ts` |
| MCP manager CLI: list/add/remove/enable/disable/test + registry sync | `packages/cli/src/mcp.ts`, `packages/cli/src/index.ts` |
| Gateway Telegram: commandes agents/MCP (`/agents`, `/agent-run`, `/mcp`, etc.) | `packages/cli/src/gateway.ts` |
| Centralized hub `~/.claude/rex/` with paths.ts + config.ts | `packages/cli/src/paths.ts`, `packages/cli/src/config.ts` |
| DB migration from ~/.rex-memory/ to ~/.claude/rex/memory/ | `packages/cli/src/migrate.ts` |
| Project scanner with auto stack detection | `packages/cli/src/projects.ts` |
| Recategorize command for bulk memory classification | `packages/cli/src/recategorize.ts` |
| Smart SessionStart pre-loading (200 token budget) | `packages/cli/src/preload.ts` |
| Self-improvement engine (lessons, error patterns, rule promotion) | `packages/cli/src/self-improve.ts` |
| Unified daemon replacing 3 LaunchAgents | `packages/cli/src/daemon.ts`, `packages/cli/src/init.ts` |
| `rex doctor --fix` auto-repair | `packages/cli/src/index.ts` |
| Centralized logger (`createLogger(source)`) across all modules | `packages/cli/src/logger.ts` |
| Logger integration: daemon, recategorize, preload, self-improve, projects, migrate, index | all `src/*.ts` files |
| `rex logs` command (--lines=N, --follow/-f) to view daemon/CLI logs | `packages/cli/src/index.ts` |
| `--verbose` flag for debug-level logging on any command | `packages/cli/src/index.ts` |
| Unification 2 clones repo → main@4ea70dc unique | `CLAUDE.md`, git |
| Flutter: merge rex_service.dart (stash 1077 lignes + agents/mcp/audio methods) | `rex_service.dart` (1606 lignes) |
| Flutter: restauration settings_page.dart 5 onglets (General/Claude/LLM/Files/Advanced) | `settings_page.dart` (1912 lignes) |
| Flutter: restauration memory_page.dart (category chips, consolidate, search) | `memory_page.dart` (548 lignes) |
| Flutter: restauration gateway_page.dart (timer polling 5s, logs combines, start/stop) | `gateway_page.dart` (490 lignes) |
| Flutter: theme toggle pill animer sun/moon avec ValueListenableBuilder | `main.dart` |
| Flutter: sidebar fixe 220px non-resizable (fix labels qui disparaissent) | `main.dart` |
| Flutter: theme.dart RexColors avec accent rouge REX #E5484D | `theme.dart` |
| Nettoyage apps dupliquees (/Applications/REX.app unique, suppression rex_app.app + symlink) | install process |

### ✅ Terminé (session 2026-03-06 — REX v6)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| **Batch 1: UI Overhaul** | |
| Sidebar 10 items centree + page Logs centralisee | `main.dart`, `rex_sidebar.dart`, `logs_page.dart` |
| Logs: tabs Daemon/Gateway/Agents/MCP/CLI, auto-refresh, filtre niveau | `logs_page.dart` |
| Retrait logs des pages individuelles (Gateway, Agents, MCP) | `gateway_page.dart`, `agents_page.dart`, `mcp_page.dart` |
| Simplification UI globale (collapse forms, separateurs) | toutes pages |
| **Batch 2: Orchestrator + Chat** | |
| Profil orchestrator (Opus, 100 turns, supervise agents) | `agents.ts` |
| Chat UI Flutter pour orchestrator (input + messages scroll) | `agents_page.dart` |
| Agent teams (`team` field, `--team` flag) | `agents.ts` |
| Skills system (`rex skills list/add/show`, Markdown templates) | `skills.ts`, `index.ts` |
| **Batch 3: MCP Hub + Marketplace** | |
| MCP discover/search/install CLI commands | `mcp_registry.ts`, `index.ts` |
| Marketplace cache (20 serveurs populaires, `~/.claude/rex/mcp-marketplace.json`) | `mcp_registry.ts` |
| Flutter MCP page: marketplace search + install UI, collapsed add forms | `mcp_page.dart` |
| Agent-MCP binding (`mcpServers` field, `--mcp` flag, inject `--mcp-server`) | `agents.ts` |
| RexService: searchMarketplace, installMarketplace, discoverMcp | `rex_service.dart` |
| **Batch 4: Gateway + Multi-instance** | |
| Fix double reponse: `processedUpdateIds` mutex dans polling loop | `gateway.ts` |
| Qwen streaming: Ollama `/api/chat` stream + `editMessageText` progressif (800ms) | `gateway.ts` |
| `/chat` command Telegram → orchestrator agent (fallback Claude session) | `gateway.ts` |
| Multi-instance Claude: `CLAUDE_CONFIG_DIR` isole par agent (`~/.claude-agent-{id}/`) | `agents.ts` |
| **Batch 5: Cleanup + Docs** | |
| VPS Deployment section dans CLAUDE.md (systemd, headless, Ollama distant) | `CLAUDE.md` |
| **Memory + Watchdog** | |
| Delta ingest (file_size + lines_ingested tracking, re-process growing files) | `packages/memory/src/ingest.ts` |
| Watchdog agent profile (30min, auto-fix ingest/Ollama/LaunchAgents) | `agents.ts` |
| Background processes monitoring in Health page (ps aux + restart) | `rex_service.dart`, `health_page.dart` |
| Two-phase ingest: save to pending/ (instant) + embed lazily (30 chunks/run, 500ms throttle) | `packages/memory/src/ingest.ts` |
| Lockfile mutex preventing concurrent ingest processes (10min stale detection) | `packages/memory/src/ingest.ts` |
| Hooks consolidation: 4 Stop hooks → 1 background script (0 impact UX) | `~/.claude/rex-guards/stop-all.sh` |
| PostToolUse: 4 hooks → 2 combined fast scripts (<2s) | `~/.claude/rex-guards/post-edit-guard.sh`, `post-bash-guard.sh` |
| LaunchAgent ingest+categorize combo (1h cycle) | `com.dstudio.rex-ingest.plist` |

### ✅ Terminé (session 2026-03-07 — audit plan v7)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Verification repo officiel `~/Documents/Developer/keiy/rex` (et rejet du clone `_config/rex`) | `CLAUDE.md` |
| Audit executable confirme : `pnpm build`, `pnpm test`, `rex audit --strict`, `flutter build macos --debug` | repo |
| Addendum architecture OpenClaw booste: hub securise, Flutter-first, headless parity, brain VPS, no-memory-loss, Tailscale, WOL/doctor, pixel agents, LangGraph spike | `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`, `docs/plans/action.md`, `docs/plans/2026-03-07-rex-v7-master-plan.md` |

### ✅ Terminé (session 2026-03-08)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Fix Providers page crash: field name mismatch (`configured`/`tier` → `status`/`costTier`) | `providers_page.dart` |
| Safer JSON cast in service (`.whereType<>()` instead of `.cast<>()`) | `rex_service.dart` |
| Reflector module wired into CLI (`rex reflect`) and daemon (6h cycle) | `index.ts`, `daemon.ts` |
| Dead code cleanup in sync.ts (unused `stats` var, unused `_hubUrl` param) | `sync.ts` |
| README updated: Claude Code memory claims nuanced (auto-memory acknowledged) | `README.md` |
| Plans updated: system tray + memory verification + `/loop` monitoring items added | `CLAUDE.md` |
| REX monitor skill: `/loop` patterns for health, memory, sync, build, gateway | `dotfiles/skills/rex-monitor/SKILL.md` |
| Memory health check module (`rex memory-check`, `--json`, wired into doctor + daemon) | `memory-check.ts`, `index.ts`, `daemon.ts` |
| Budget data parsing fixed in providers page (actual CLI format vs expected) | `providers_page.dart` |
| Runbook field name fixed (`successCount` vs `usedCount`) | `providers_page.dart` |

### ✅ Terminé (session 2026-03-08 — backend + UI rework)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| **Backend: Event journal** (append-only SQLite, 6 event types, ack/replay) | `event-journal.ts`, `index.ts`, `daemon.ts` |
| **Backend: Semantic cache** (SHA256 prompt hashing, TTL, hit tracking) | `semantic-cache.ts`, `index.ts`, `daemon.ts` |
| **Backend: Backup/restore** (tar.gz SQLite+config, daily in daemon, rotate 7) | `backup.ts`, `index.ts`, `daemon.ts` |
| **Backend: Git workflow** (startFeature, startBugfix, workflowPR) | `workflow.ts`, `index.ts` |
| **Backend: Guard manager CLI** (list/enable/disable/logs) | `guard-manager.ts`, `index.ts` |
| **Backend: Review pipeline** (tsc, lint, secret scan, tests, graceful skip) | `review.ts`, `index.ts` |
| **Backend: Observer tables** (observations, habits, facts + CRUD + forgetting curve) | `observer.ts`, `reflector.ts`, `index.ts` |
| **Shared widget library** (RexCard, RexStatusChip, RexSection, RexEmptyState, RexErrorState, RexStatRow, RexProgressBar, RexToggleRow) | `widgets/rex_shared.dart` |
| **UI rework 9 pages** with shared widgets + consistent patterns | `health_page.dart`, `network_page.dart`, `providers_page.dart`, `memory_page.dart`, `gateway_page.dart`, `agents_page.dart`, `mcp_page.dart`, `logs_page.dart`, `optimize_page.dart` |
| **Fix Logs ANSI escape codes** (strip + deduplicate lines) | `logs_page.dart` |
| **Fix Providers empty state** (log line polluting JSON output) | `providers.ts`, `index.ts`, `rex_service.dart` |
| **Flutter _extractJson** helper (defensive JSON extraction from mixed CLI output) | `rex_service.dart` |
| **Fix _stripAnsi regex** (was missing non-m ANSI codes) | `rex_service.dart` |

### ✅ Terminé (session 2026-03-09)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| **Ingest ESM bug fix** (acquireLock() used require() in ESM — silent no-op for 2 days) | `packages/memory/src/ingest.ts` |
| **Adaptive ingest modes** (bulk/fast/smart/offline — dynamic, replaces SMART_INGEST env) | `packages/memory/src/ingest.ts` |
| **Vercel AI SDK v6 + free-tiers** (Groq/Cerebras/Together/Mistral/OpenRouter/DeepSeek) | `packages/cli/src/free-tiers.ts`, `llm.ts`, `providers.ts` |
| **rex free-tiers** command (status + --test validation) | `packages/cli/src/index.ts` |
| **Flutter UI rework** (shared widgets, network page, providers page, 8 pages updated) | `packages/flutter_app/lib/` |
| **project-intent.ts** (signal-based intent detection — zero LLM) | `packages/cli/src/project-intent.ts` |
| **preload.ts** wired to inject intent line in SessionStart context | `packages/cli/src/preload.ts` |
| **rex intent** CLI command (--debug, --json) | `packages/cli/src/index.ts` |
| **rex setup --quick** (zero-question: detect Ollama/API keys/Claude/Tailscale, write config) | `packages/cli/src/quick-setup.ts` |
| **account-pool.ts** (multi-account Claude rotation, rate-limit tracking, acquire/release) | `packages/cli/src/account-pool.ts` |
| **agents.ts: account pool integration** (selectAccount in runWithClaude, rate-limit detection) | `packages/cli/src/agents.ts` |
| **agents.ts: runWithCodex()** (Codex exec --full-auto --json, dispatch as model='codex') | `packages/cli/src/agents.ts` |
| **rex pool** command (list accounts, setup hint) | `packages/cli/src/index.ts` |
| **PR #6** feat/litellm-phase2 → main | GitHub |
| **Architecture decision** : Claude Code = seul orchestrateur user-facing, Codex = background worker | `CLAUDE.md` |
| **Living REX manifesto** + Setup wizard 5 étapes | `docs/plans/living-rex-vision.md`, `docs/plans/2026-03-09-rex-setup-wizard.md` |

### ✅ Terminé (session 2026-03-09 — hub + registry + recommendations)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Secure Hub: REX_HUB_TOKEN auth middleware, CORS hardening, v6.3.0 | `hub.ts` |
| Hub: GET /api/v1/nodes/health — aggregated healthy/stale/offline status | `hub.ts` |
| Hub: rex hub token — generate cryptographically secure 64-char token | `hub.ts`, `index.ts` |
| Governed Tool Registry: 14 tools, 9 capabilities, cli>mcp>api tier order | `tool-registry.ts` |
| Tool Registry: getToolForCapability(), syncAvailability(), enable/disable | `tool-registry.ts` |
| Tool Registry: CLI rex tools / check / enable / disable | `index.ts` |
| Inventory: detectProviders() includes all free tier (Groq, Cerebras, Together…) | `inventory.ts` |
| Inventory: generateRecommendations() — 7 rule-based, ordered by priority | `inventory.ts` |
| Inventory: rankResources() PROVIDER_COST map for accurate cost classification | `inventory.ts` |
| LiteLLM Config Generator: Ollama + free tier → litellm_config.yaml | `litellm-config.ts` |
| Auto-provider rotation: callWithAutoFallback() — tries all, skips rate-limited | `free-tiers.ts` |
| PR #7: feat/hub-registry-recommendations | GitHub |

### ✅ Terminé (session 2026-03-10 — adaptive loading + mesh + setup wizard + review UI)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| context-loader.ts: IntentContext → ContextProfile (7 intents, guards/MCPs/skills) | `context-loader.ts` |
| preload.ts: wired context-loader — buildContextProfile() remplace intentToPreloadLine() | `preload.ts` |
| rex-launcher.ts: single entry point (user tape `rex` pas `claude`) + PID + recovery | `rex-launcher.ts` |
| node-mesh.ts: REX Fabric — capability detection zero LLM, routeTask(), hub registration | `node-mesh.ts` |
| paths.ts: LAUNCHER_PID_PATH + RECOVERY_STATE_PATH | `paths.ts` |
| daemon.ts: buildLocalNodeInfo() + registerWithHub() toutes les 60s | `daemon.ts` |
| hub.ts: GET /api/nodes/status via getMeshStatus() | `hub.ts` |
| gateway.ts: routeTask('llm') avant handleText() — mesh routing | `gateway.ts` |
| index.ts: `rex` (no subcommand) → launchRex(), `rex kill`, `rex relaunch`, `rex mesh/nodes` | `index.ts` |
| §20 action.md: context-loader spec | `docs/plans/action.md` |
| §21 action.md: rex-launcher + node-mesh spec | `docs/plans/action.md` |
| §22 action.md: Token Economy rules | `docs/plans/action.md` |
| §23 action.md: REX uses REX — internal routing rule | `docs/plans/action.md` |
| setup-wizard.ts: parallel discovery (Promise.all) + wow moment display + organize phase | `setup-wizard.ts` |
| index.ts: `rex setup` → setupWizard(), first-run detection | `index.ts` |
| review_page.dart: Review UI — Quick/Full modes, banner, result rows, status chips | `review_page.dart` |
| rex_service.dart: runReview() + reviewResults + isReviewing state | `rex_service.dart` |
| main.dart + rex_sidebar.dart: ReviewPage wired (13 pages, shield icon) | `main.dart`, `rex_sidebar.dart` |
| §23 audit: zero direct SDK calls in any CLI file — all routed via orchestrator chain | all `cli/src/*.ts` |

### ✅ Terminé (session 2026-03-11 — UI pages + hub CLI fixes)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| **token_page.dart**: Token Analytics — burn rate, session stats, model breakdown | `pages/token_page.dart`, `rex_service.dart` |
| **observer_page.dart**: 4 tabs (Runbooks, Observations, Habits, Facts) + add forms | `pages/observer_page.dart` |
| **workflow_page.dart**: Git status + Backups + Journal/Cache intel | `pages/workflow_page.dart` |
| **projects_page.dart**: Project scanner UI — filter, stack chips, cards with relative dates | `pages/projects_page.dart` |
| **Sidebar + IndexedStack**: Observer, Workflow, Projects wired (19 pages total) | `main.dart`, `rex_sidebar.dart` |
| **CLI: `rex backup list/create --json`**: returns `{ backups }` / `{ success, path, rotated }` | `packages/cli/src/index.ts` |
| **CLI: `rex projects --json`**: returns `{ projects, total }` | `packages/cli/src/index.ts` |
| **CLI: `rex hub status --json`**: non-blocking status check via HTTP → `{ running, port, nodesCount }` | `hub.ts`, `index.ts` |
| **CLI: `rex hub start`**: background-spawn hub process, return immediately | `index.ts` |
| **CLI: `rex hub stop`**: pkill hub process | `index.ts` |
| **hub.ts: `getHubStatus()`**: exported function, HTTP GET /api/health with 3s timeout | `hub.ts` |
| **Flutter: `_loadHubStatus()`**: now calls `hub status --json` instead of blocking `hub --json` | `rex_service.dart` |
| **RexService**: loadObservations, loadHabits, loadFacts, loadBackups, loadGitStatus, loadProjects + action methods | `rex_service.dart` |
| CLI build ✅ (pnpm build — zero errors) | — |

### ✅ Terminé (session 2026-03-11 — debug pass + gateway + daemon adaptive)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| **Flutter debug pass**: fix 5 Dart errors (catch syntax, LinearProgressIndicator→RexProgressBar, doc_zipper icon) | `token_page.dart`, `workflow_page.dart` |
| **Daemon: adaptive ingestCycle()**: measures Ollama latency → urgency/backlog/slow-ollama/normal modes | `daemon.ts` |
| **Gateway: `/pool`, `/burn`, `/free`, `/intent` Telegram commands** | `gateway.ts` |
| **Gateway: Advanced menu expanded**: Free tiers + Pool + Burn rate buttons | `gateway.ts` |
| **Gateway: callback handlers** for `free_tiers`, `pool`, `burn_rate` | `gateway.ts` |
| **living-rex-vision.md**: mark adaptive scripts, multi-account, MCP marketplace as ✅ | `docs/plans/living-rex-vision.md` |
| Flutter build ✅ (clean) | — |
| CLI build ✅ (pnpm build — zero errors) | — |

### ✅ Terminé (session 2026-03-11 — health dashboard + projects UX)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Health page: Token Budget section (context %, daily %, burn rate, compact alert) | `health_page.dart` |
| Health page: Quick Setup button in actions bar | `health_page.dart` |
| Health page: loadBurnRate + checkSessionGuard on init + refresh | `health_page.dart` |
| Fixed field names to match CLI JSON (compactNeeded, burnRatePerHour, dailyTotal) | `health_page.dart` |
| Projects page: "Open in Claude" button per project card (rex launch --path) | `projects_page.dart` |
| Projects page: fix unsafe `.cast<String>()` → `.whereType<String>()` | `projects_page.dart` |
| `rex launch --path=<dir>` subcommand added to index.ts | `index.ts` |
| `launchProject(path)` + `runQuickSetup()` added to RexService | `rex_service.dart` |
| Network page: fix unsafe `.cast<>()` on hub nodes list | `network_page.dart` |
| Adaptive daemon ingest (latency probe + urgency/backlog/slow/normal modes) | `daemon.ts` |
| Gateway: /pool, /burn, /free, /intent commands + Advanced menu buttons + callbacks | `gateway.ts` |

### ✅ Terminé (session 2026-03-12 — cast fixes + model router)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Memory health stats in memory page (pending embeds, duplicates, orphans) | `memory_page.dart`, `rex_service.dart` |
| Fix all unsafe `.cast<>()` → `.whereType<>().toList()` across all pages + service | `providers_page.dart`, `observer_page.dart`, `token_page.dart`, `projects_page.dart`, `workflow_page.dart`, `mcp_page.dart`, `rex_service.dart` |
| `rex models --json` support via `getRouterSnapshot()` | `index.ts`, `router.ts` |
| Model Router section in providers page (shows task→model mapping) | `providers_page.dart` |
| `loadModelRouter()` added to RexService | `rex_service.dart` |
| Providers page loads model router on init | `providers_page.dart` |

### ✅ Terminé (session 2026-03-12 — embedding fix + orchestrator wiring)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Sidebar footer: burn rate display (Ctx%, Daily%, ⚡ /h, version) | `widgets/rex_sidebar.dart` |
| RexService: periodic burn-rate refresh timer (5min) + OpenRouter/DeepSeek API keys | `rex_service.dart` |
| Orchestrator: free-tier APIs (Groq/Cerebras/Together/Mistral/OpenRouter/DeepSeek) wired into FALLBACK_ORDER | `orchestrator.ts` |
| Fix memory-check: load sqlite-vec extension → embedding count now 5523/5523 (100%) | `memory-check.ts` |

### ✅ Terminé (session 2026-03-12 — curious proactive discovery)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| `curious.ts`: proactive discovery — Ollama library, GitHub trending (mcp-server + ai-agent), Hacker News AI filter | `packages/cli/src/curious.ts` |
| `rex curious [--json]` CLI command | `packages/cli/src/index.ts` |
| Daemon: curious cycle every 24h (wired in while loop) | `packages/cli/src/daemon.ts` |
| Gateway: `/curious` command + `🔭 Curious` button in Advanced menu | `packages/cli/src/gateway.ts` |
| Flutter `curious_page.dart`: filter bar (all/model/mcp/repo/news), NEW badge, URL copy, grouped by type | `packages/flutter_app/lib/pages/curious_page.dart` |
| RexService: `loadCurious()`, `runCuriousCheck()`, discoveries state | `packages/flutter_app/lib/services/rex_service.dart` |
| Sidebar: Curious item (scope icon) wired in sidebar + IndexedStack (20 pages total) | `main.dart`, `rex_sidebar.dart` |
| living-rex-vision.md: Curieux/proactif → ✅ | `docs/plans/living-rex-vision.md` |
| Fix memory-check.ts: sqlite-vec extension not loaded → embeddingCount was 0 | `packages/cli/src/memory-check.ts` |
| `dev-monitor.ts`: DevStatusReport, git activity (depth 3, 40 repos), session count, pending memory | `packages/cli/src/dev-monitor.ts` |
| `rex monitor [--json]` CLI command | `packages/cli/src/index.ts` |
| Gateway: `/monitor` command + `📊 Monitor` button + `case 'dev_monitor':` callback | `packages/cli/src/gateway.ts` |
| living-rex-vision.md: Monitor vie dev → ✅ | `docs/plans/living-rex-vision.md` |

### ✅ Terminé (session 2026-03-08 cont. — LiteLLM + free catalog + hub security)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| `free-models.ts`: catalogue complet (Ollama, Groq, Cerebras, Together, Mistral, OpenRouter, DeepSeek, Anthropic) avec RPM/TPM/daily quotas | `free-models.ts` |
| `rex models --catalog`: affichage rich du catalogue avec tiers, limites, coût | `index.ts` |
| `litellm.ts`: proxy LLM avec usage tracking, cooldown retry-after, queue sur exhaustion | `litellm.ts` |
| Hub `/api/chat`: endpoint unifié LLM via auto-fallback (OpenAI-compatible format) | `hub.ts` |
| Hub `/api/v1/llm/usage`: stats d'utilisation par provider | `hub.ts` |
| `rex llm-usage`: commande CLI pour stats par provider (--reset) | `index.ts` |
| Hub token auto-persist: génère + sauvegarde REX_HUB_TOKEN dans settings.json au 1er démarrage | `hub.ts` |
| `rex hub token`: affiche token existant ou en génère un (--new pour régénérer) | `index.ts` |
| Auth: dashboard `/` et `/api/health` publics, toutes autres routes protégées | `hub.ts` |
| fix(sync): self-sync loop prevented (isLocalHub guard) | `sync.ts` |
| docs(readme): REX repositionné comme superlayer au-dessus des LLMs | `README.md` |
| Gateway spooled replay: chatId in spooled event, notify on hub recovery, /replay command | `gateway.ts` |

### 🔄 En cours / A faire

**Phase 2 DONE, Phase 3 IN PROGRESS**:
- Cross-platform Flutter (Windows/Linux) — Phase 3 later
- Hub API: full routes done, VPS brain + Tailscale mesh partial
- Tailscale auto-join: Phase 3 — detect + guide + health in node-mesh.ts

---

## Vision REX — Architecture unifiee

REX = **hub centralisateur** de toutes les ressources disponibles pour un dev solo :
- **Hardware** : machines locales (Mac, VPS, GPU), Wake-on-LAN, Tailscale mesh
- **Free tiers** : Groq, Together AI, Cerebras, HuggingFace, Mistral free, Cloudflare AI Workers, Cohere free
- **Subscriptions** : Claude Max (Code+Sonnet+Opus), ChatGPT Plus, Codex, MiniMax, etc.
- **Local models** : Ollama (Qwen, DeepSeek, Llama, etc.), llamafile, llama.cpp
- **Tools/MCP** : marketplace dynamique, awesome-mcp-server, install one-click, activation/desactivation
- **Memory** : semantique partagee (SQLite + embeddings), accessible par TOUS les orchestrators

**Orchestrators** : **Claude Code = seul orchestrateur user-facing.** Codex = worker background uniquement (dispatché par REX en mode non-interactif via `codex exec --full-auto`). Tous les autres (ChatGPT, Gemini, etc.) sont des providers/workers, jamais des co-orchestrateurs.

**Principe 70/30** : 70% scripts/CLI/rules/open-source, 30% LLM. REX choisit dynamiquement : si des règles peuvent répondre, pas de LLM. Si l'intent est détecté par signal filesystem/git, pas de LLM. LLM uniquement quand les règles ne suffisent pas.

**Principe directeur** : tout est automatique, zero setup complique pour l'user. REX detecte, configure et propose. L'user valide ou override.

**Routing** : cache → script/CLI local → Ollama local → free tier API → subscription → pay-per-use. Toujours le moins cher qui peut faire le job.

---

### Phase 1 — Core (✅ DONE)

CLI, Gateway Telegram, Memory, Flutter app, Doctor, Daemon, Agents, MCP registry, Provider detection, Budget tracking, Event journal, Semantic cache, Backup/restore, Git workflow, Guard manager, Review pipeline, Observer/Reflector, Sync degraded mode, Install profiles, Orchestrator base, Resource inventory, Backend runner.

### Phase 2 — Integration & Marketplace (✅ DONE)

| Tache | Status | Detail |
|-------|--------|--------|
| **MCP Marketplace hub** | ✅ DONE | mcp_registry.ts + marketplace cache (20 serveurs), search/install CLI |
| **LiteLLM integration** | ✅ DONE | litellm.ts — proxy unifié avec usage tracking, cooldowns retry-after, request queue |
| **Providers API key config** | ✅ DONE | providers_page.dart + settings Advanced + callWithAutoFallback() |
| **Free model catalog** | ✅ DONE | free-models.ts — catalogue complet avec RPM/TPM/daily quotas par modèle |
| **Auto-provider rotation** | ✅ DONE | litellm.ts callWithFallback() — cooldown retry-after, queue sur exhaustion |
| **Context adaptive loading** | ✅ DONE | context-loader.ts + rex-launcher.ts — intent → guards/MCPs/skills à la volée |
| **Node mesh fabric** | ✅ DONE | node-mesh.ts — capability detection zero LLM, hub registration, routeTask() |
| **Setup wizard** | ✅ DONE | setup-wizard.ts — parallel discovery, wow moment, first-run detection |
| **Hub `/api/chat`** | ✅ DONE | Endpoint LLM unifié OpenAI-compatible + `/api/v1/llm/usage` stats |
| **Hub token security** | ✅ DONE | Auto-génère + persiste REX_HUB_TOKEN au 1er démarrage, dashboard public |
| **Proactive session management** | ✅ DONE | auto-compact 75%, recovery-state.json, rex-launcher.ts |

### Phase 3 — Hub & Multi-node (🔄 IN PROGRESS)

| Tache | Priorite | Detail |
|-------|----------|--------|
| **Hub API** | ✅ DONE | /health, /nodes, /tasks, /events, /chat, /memory, /monitor + auth token auto |
| **Sync durable** | ✅ DONE | Event journal append-only, sync-queue.ts, self-sync loop fixed |
| **Node mesh** | ✅ DONE | node-mesh.ts, hub registration, heartbeat, routeTask() |
| **Brain VPS** | 🔄 PARTIAL | Daemon + hub run on any machine; VPS deployment via systemd documented |
| **Tailscale mesh auto** | 🔜 NEXT | Auto-join nodes, tailscale status check wired in node-mesh.ts |
| **Tunnels + fallback** | FUTURE | SSH fallback, RustDesk option |
| **Cross-platform desktop** | FUTURE | Flutter for Windows + Linux (after macOS stable) |

### Phase 4 — Advanced (LATER)

| Tache | Priorite | Detail |
|-------|----------|--------|
| **LangGraph spike** | BASSE | Only after orchestrator stabilizes |
| **Training pipeline** | BASSE | Benchmarks mlx-lm vs unsloth + eval dataset |
| **Meeting bots** | BASSE | OSS integration (Otter AI alternative) |
| **Alternative to Ollama** | MOYENNE | llamafile/llama.cpp/LocalAI switchability |
| **Pixel agents fallback** | MOYENNE | `$machine@launch_pixel_agents` pattern |

---

## VPS Deployment (headless)

REX fonctionne aussi sur un VPS sans GUI. Adaptation :

- **CLI only** : pas de Flutter, installer uniquement `packages/cli` + `packages/memory`
- **Daemon** : `rex daemon` tourne via systemd au lieu de LaunchAgents
  ```ini
  # /etc/systemd/system/rex-daemon.service
  [Unit]
  Description=REX Daemon
  After=network.target

  [Service]
  Type=simple
  User=node
  ExecStart=/usr/local/bin/rex daemon
  Restart=always
  Environment=OLLAMA_URL=http://localhost:11434

  [Install]
  WantedBy=multi-user.target
  ```
- **Ollama** : peut etre distant via `OLLAMA_URL` (deja configurable)
- **Gateway Telegram** : interface principale sur VPS (KeepAlive via systemd)
- **Agents** : `CLAUDE_CONFIG_DIR` isole par agent (multi-instance)
- **Memory** : SQLite fonctionne partout, embeddings via Ollama local ou distant

---

## Regles de dev sur ce repo

- Pas de Co-Authored-By dans les commits
- Pas de mention Claude/AI dans les commits/PR
- `pnpm build` avant tout commit CLI
- `flutter build macos --debug` + lancer l'app pour verifier avant commit Flutter
- Toujours mettre a jour la section "En cours / Terminé" ci-dessus
