# REX — Contexte projet pour agents

## Source Of Truth — CRITIQUE

- **Repo OFFICIEL et UNIQUE** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche principale** : `main`
- **NE JAMAIS cloner ou travailler sur un autre dossier** (ex: `/_config/rex` est un ancien clone, NE PAS L'UTILISER).
- Si un autre agent travaille sur REX, il DOIT ouvrir ce repo, pas un clone.
- `CLAUDE.md` du root de ce repo = seule source de verite. Pas de copie ailleurs.

Ce fichier est le point d'entree rapide pour tout agent (Claude, Codex, Garry) qui travaille sur ce repo.
**Mettre a jour la section "En cours / Terminé" a chaque changement significatif.**

---

## Projet en bref

REX est un companion pour Claude Code : guards automatiques, memoire semantique, gateway Telegram, app macOS Flutter.

- **Repo :** `~/Documents/Developer/keiy/rex`
- **npm :** `rex-claude` v5.0.0 — `~/.nvm/versions/node/v22.20.0/bin/rex`
- **Monorepo :** pnpm workspaces
- **Stack :** TypeScript/Node (CLI), Dart/Flutter (app macOS), SQLite (memoire)

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
│       └── logger.ts      Centralized logging (console + file, levels, rotation)
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
- SQLite dans `~/.rex-memory/rex-memory.db`
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
| Plan detaille gateway streaming + training | `docs/plans/2026-03-05-rex-gateway-qwen-streaming-training.md` |
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

### 🔄 En cours / A faire

| Tache | Priorite | Detail |
|-------|----------|--------|
| Training pipeline research approfondie | BASSE | Benchmarks reels mlx-lm vs unsloth + eval dataset interne |
| Flutter Settings: Model Router section | BASSE | Afficher task→model mapping depuis getRouterSnapshot() |
| MCP compatibility check dans `rex doctor` | MOYENNE | Diagnostic clair si MCP mal configure |
| Pipeline no memory loss | MOYENNE | Memoire cloud Claude + semantic search locale + resume |
| Setup one-command doc | BASSE | `rex install` en 5 min (local + Telegram + agents + MCP) |

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
