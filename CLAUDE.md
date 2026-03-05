# REX — Contexte projet pour agents

## Source Of Truth
- `CLAUDE.md` principal = celui du root de ce repo.
- Repo principal: `/Users/keiy/Documents/Developer/keiy/rex`
- Tout clone miroir (ex: `/_config/rex`) doit être synchronisé depuis ce root pour éviter la dérive.

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
└── app/         Ancienne app Tauri (archivee, ignorer)
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
- Si Ollama off au moment de l'ingest → les chunks bruts vont dans `~/.rex-memory/pending/`

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
| Init.ts: suppression reference Tauri → flutter build macos | `packages/cli/src/init.ts` |
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

### 🔄 En cours / A faire

| Tache | Priorite | Detail |
|-------|----------|--------|
| Training pipeline research approfondie | BASSE | Benchmarks reels mlx-lm vs unsloth + eval dataset interne |
| Rex daemon LaunchAgent (com.dstudio.rex-daemon) | HAUTE | `rex init` installs, KeepAlive, replaces 3 old agents |
| Flutter Settings: Model Router section | BASSE | Afficher task→model mapping depuis getRouterSnapshot() |
| Flutter app rebuild requis | HAUTE | `cd packages/flutter_app && flutter build macos --debug` — inclure tous les derniers changements CLI (logger, daemon, recategorize, preload, self-improve, projects, logs command) |

**Plan complet :** `docs/plans/2026-03-05-rex-gateway-qwen-streaming-training.md`

### TODO MCP + Agents autonomes (a ne pas oublier)

- [ ] Definir le scope exact "OpenClaw-like pour REX" : garder seulement ce qui sert en local/macOS + Telegram.
- [ ] Faire un inventaire compare de ce qui existe deja dans REX vs OpenClaw (local VPS Milo/Garry + docs OpenClaw) et lister les gaps.
- [x] Creer 3 profils preconfigures d'agents autonomes : `read`, `analyse`, `code-review` + presets `advanced` et `ultimate`.
- [x] Definir un format de config unique d'agent (nom, modele, outils, limites, cron, memoire, objectifs).
- [x] Implementer le moteur d'execution agent (boucle plan -> action -> verification -> resume) avec garde-fous anti-boucle.
- [x] Ajouter cron/wakeup des agents (jobs planifies) + etat d'execution persistant.
- [x] Integrer gestion erreurs/retry/timeouts avec journaux exploitables (telemetrie locale).
- [x] Ajouter commandes Telegram pour agents (`/agents`, `create`, `start`, `stop`, `status`, `logs`) + menu simple/advanced.
- [ ] Brancher un chat de test agent dans l'UI Flutter (demarrage manuel, logs live, arret d'urgence).
- [x] Concevoir un MCP global interconnecte (serveurs locaux + distants) avec registry et tests de sante.
- [ ] Ajouter verification de compatibilite MCP au setup (`rex init`/`rex doctor`) et diagnostic clair.
- [ ] Finaliser pipeline "no memory loss" : memoire cloud Claude + semantic search locale + embeddings + resume local.
- [ ] Ajouter consolidation auto memoire (dedup/summarize) pour limiter tokens sans perdre l'historique utile.
- [ ] Completer pipeline call logger : detection event app -> capture audio (entree/sortie) -> transcription -> optimisation prompt.
- [ ] Documenter le setup one-command complet (local + Telegram + agents + MCP) en mode "install en 5 min".
- [ ] Ajouter tests d'integration end-to-end (agent autonome, recovery, redemarrage, reprise de contexte).

---

## Regles de dev sur ce repo

- Pas de Co-Authored-By dans les commits
- Pas de mention Claude/AI dans les commits/PR
- `pnpm build` avant tout commit CLI
- `flutter build macos --debug` + lancer l'app pour verifier avant commit Flutter
- Toujours mettre a jour la section "En cours / Terminé" ci-dessus
