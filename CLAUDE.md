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

> Historique détaillé dans git log. Ce fichier garde uniquement le statut courant.

### ✅ Phases 1-3 complètes (sessions 2026-03-05 → 2026-03-13)

**Phase 1 — Core** : CLI (35+ commands), Gateway Telegram, Memory (SQLite+embeddings), Flutter app (20+ pages), Doctor, Daemon, Agents, MCP registry, Provider detection, Budget, Event journal, Semantic cache, Backup, Git workflow, Guard manager, Review pipeline, Observer/Reflector, Orchestrator, Resource inventory.

**Phase 2 — Integration** : MCP Marketplace, LiteLLM proxy, Free tier catalog (Groq/Cerebras/Together/Mistral), Auto-provider rotation, Context adaptive loading, Node mesh fabric, Setup wizard, Hub `/api/chat`, Hub token security, Proactive session management.

**Phase 3 — Hub & Multi-node** : Hub API (/health /nodes /tasks /events /chat /memory /monitor), Sync durable (event journal + ack/replay), Node mesh (heartbeat + routeTask), VPS deploy (`rex vps setup`), Tailscale mesh auto, MCP security scanner, Lint-loop, Resource Hub (MCPs+guards+skills catalog), curious.ts (HF/Simon/LocalLLaMA RSS), Ingest visibility (speed/ETA/lastEmbed).

**Modules clés** (tous dans `packages/cli/src/`) :
`curious.ts`, `dev-monitor.ts`, `daemon.ts`, `gateway.ts`, `hub.ts`, `orchestrator.ts`, `litellm.ts`, `free-tiers.ts`, `project-intent.ts`, `context-loader.ts`, `node-mesh.ts`, `memory-check.ts`, `observer.ts`, `reflector.ts`, `backup.ts`, `sync.ts`, `review.ts`, `workflow.ts`, `guard-manager.ts`, `resource-hub.ts`, `rex-mcp-server.ts`, `security-scanner.ts`, `lint-loop.ts`

**Flutter** (20+ pages) : health, memory, gateway, voice, agents, mcp, optimize, logs, settings, network, providers, review, workflow, projects, observer, token, curious, dev-monitor, resource-hub, sidebar.

### 🔄 En cours / A faire

**Déférés (hors scope actuel)** :
- Cross-platform Flutter (Windows/Linux) — Phase 4
- B2B factory / dashboard multi-tenant — produit séparé
- Clipboard logger — couche native macOS
- VPS install + Garry memory migration — accès SSH requis

**Prochaines priorités opérationnelles** :
- [ ] Installer REX sur VPS (`docs/vps-install.md`)
- [ ] Migrer mémoire Garry → REX (`docs/garry-migration.md`)
- [ ] `rex snapshot` (BLOC 19 — compaction resilience) — pas encore implémenté

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

### Phase 3 — Hub & Multi-node (✅ DONE)

| Tache | Priorite | Detail |
|-------|----------|--------|
| **Hub API** | ✅ DONE | /health, /nodes, /tasks, /events, /chat, /memory, /monitor + auth token auto |
| **Sync durable** | ✅ DONE | Event journal append-only, sync-queue.ts, self-sync loop fixed |
| **Node mesh** | ✅ DONE | node-mesh.ts, hub registration, heartbeat, routeTask() |
| **Brain VPS** | ✅ DONE | `rex vps setup <user@host>` — SSH deploy daemon+gateway+systemd; `rex vps status` |
| **Tailscale mesh auto** | ✅ DONE | persistDiscoveredHub() + tailscaleMeshCycle() every 5min in daemon |
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
