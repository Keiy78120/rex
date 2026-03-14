# REX — Inventaire complet des modules (14/03/2026)

> 155 fichiers TypeScript · ~48,600 lignes · 4 packages
> Ce document sert de base pour le training de rex-worker et la réorganisation.

---

## STRUCTURE ACTUELLE

```
packages/
├── cli/src/           131 fichiers · 45,640 lignes  ← LE CŒUR
├── core/src/           11 fichiers ·    511 lignes  ← Health checks
├── memory/src/          9 fichiers ·  1,720 lignes  ← Mémoire sémantique
└── flutter_app/        26 pages Dart              ← App macOS
```

---

## CLI — PAR DOMAINE

### 🧠 IDENTITÉ & INTELLIGENCE (2 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `rex-identity.ts` | 499 | Pipeline 5 étapes : memory → events → intent → scripts → LLM. Génère REX_SYSTEM_PROMPT |
| `lang-graph.ts` | 587 | StateGraph LangChain avec tool use pour raisonnement multi-étapes |

### 🚀 ENTRY POINT & CONFIG (4 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `index.ts` | 4,327 | Entry point commander.js, 40+ commandes CLI |
| `config.ts` | 100 | Charge/sauve `~/.claude/rex/config.json` avec fallback chain |
| `paths.ts` | 54 | Tous les chemins centralisés (REX_DIR, RELAY_DIR, etc.) |
| `logger.ts` | 69 | Factory `createLogger(source)` — jamais console.log direct |

### 📡 GATEWAY & COMMUNICATION (5 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `gateway.ts` | 3,199 | Bot Telegram + WebSocket + streaming Qwen/Claude + menus |
| `gateway-adapter.ts` | 457 | Adapter Telegram API (sendMessage, editMessage, etc.) |
| `hub.ts` | 994 | Serveur HTTP API (port 7420), 50+ endpoints, auth token |
| `rex-mcp-server.ts` | 353 | Serveur MCP pour exposer les outils REX aux agents |
| `pane-relay.ts` | 312 | Collaboration multi-LLM dans un pane partagé |

### 🔀 ROUTING & ORCHESTRATION (8 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `orchestration-policy.ts` | 253 | 6 tiers routing (SCRIPT→LOCAL→FREE→SONNET→OPUS→CODEX), 0 LLM |
| `orchestrator.ts` | 528 | Relay race async avec profils Specialist |
| `relay-engine.ts` | 661 | Pipeline RxJS + persistence datée (RELAY-YYYY-MM-DD-HHhMM.md) |
| `router.ts` | 145 | Logique de routing par task type |
| `intent-engine.ts` | 223 | Détection d'intent (regex → Ollama si ambigu) |
| `intent-classifier.ts` | 149 | Classification d'intent par catégorie |
| `intent-registry.ts` | 218 | Registry de living scripts + matching rule-based |
| `agent-runtime.ts` | 760 | Moteur d'exécution agents (runAgent/streamAgent + tools dynamiques) |

### 🛠️ TOOLS & CAPABILITIES (6 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `tool-injector.ts` | 334 | Sélection dynamique de tools par intent/model/health |
| `tool-adapter.ts` | 386 | Formate 9 tools aux formats OpenAI/Ollama |
| `tool-registry.ts` | 444 | Catalogue de tools avec système de tiers |
| `resource-hub.ts` | 438 | Catalogue unifié (mcp/guard/skill/script/boilerplate) |
| `skills.ts` | 428 | Découverte et gestion des skills |
| `mcp-discover.ts` | 392 | Découverte + installation MCPs (20+ curated) |
| `mcp_registry.ts` | 933 | Registry MCP servers complet |

### 🤖 AGENTS & CLIENTS (5 fichiers + templates)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `agents.ts` | 1,034 | CRUD agents + multi-account pool |
| `agent-runtime.ts` | 760 | (voir ROUTING) Exécution avec tools dynamiques |
| `client-factory.ts` | 520 | Provisioning clients (3 tiers: free/pro/enterprise) |
| `account-pool.ts` | 369 | Rotation 5 comptes Claude |
| `agent-templates/` | 888 | 6 personas : dg, ceo, coo, drh, freelance, dev |

### 📊 SIGNAUX & MONITORING (7 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `signal-detector.ts` | 318 | 20+ signaux système (hardware/services/dev/providers), cache 30s |
| `watchdog.ts` | 400 | Health checks cycliques (60s) |
| `event-journal.ts` | 183 | Journal événements SQLite |
| `observer.ts` | 483 | Observer pattern + runbooks |
| `dev-monitor.ts` | 253 | Git activity + commits monitoring |
| `monitor-daemon.ts` | 251 | Monitoring du daemon lui-même |
| `pattern-detector.ts` | 208 | Reconnaissance de patterns récurrents |

### 🧬 DAEMON & CYCLES (3 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `daemon.ts` | 951 | 30+ cycles background (health/ingest/maintenance/sync/curious/budget) |
| `proactive-dispatch.ts` | 319 | Signal → action dispatcher |
| `curious.ts` | 736 | Découverte proactive (modèles/MCPs/repos/patterns/open loops) |

### 🧪 TRAINING & AMÉLIORATION (4 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `training.ts` | 512 | Pipeline collect→export→train (mlx-lm/unsloth/openai) |
| `reflector.ts` | 416 | Extraction de leçons depuis les sessions |
| `self-improve.ts` | 213 | Base de leçons + patterns d'erreurs |
| `recategorize.ts` | 135 | Re-catégorisation bulk de la mémoire |

### 🔐 SÉCURITÉ (4 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `security-scanner.ts` | 420 | Scan vulnérabilités MCPs/skills/packages (OWASP) |
| `session-guard.ts` | 338 | Contrôle d'accès session-level |
| `guard-manager.ts` | 227 | Enable/disable guards |
| `guard-ast.ts` | 182 | Parser de conditions pour guards |

### 🌐 FLEET & SYNC (5 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `node-mesh.ts` | 633 | Fleet discovery Tailscale + routing par capability/score/thermal |
| `node.ts` | 328 | Découverte de noeuds fleet |
| `sync.ts` | 404 | Coordinateur sync bidirectionnel |
| `sync-queue.ts` | 318 | Queue de sync SQLite |
| `codex-sync.ts` | 300 | Sync avec Codex |

### 💰 BUDGET & COÛT (3 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `budget.ts` | 377 | Tracking tokens + budgets quotidiens |
| `burn-rate.ts` | 309 | Analytics de consommation |
| `semantic-cache.ts` | 169 | Cache de résultats de requêtes |

### 🤖 LLM & PROVIDERS (8 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `llm.ts` | 48 | Détection modèle disponible |
| `llm-backend.ts` | 297 | Abstraction backend LLM local |
| `litellm.ts` | 383 | Intégration LiteLLM proxy |
| `litellm-config.ts` | 310 | Config LiteLLM |
| `providers.ts` | 413 | Registry de providers |
| `ai-providers.ts` | 201 | Constantes GPT/Anthropic |
| `free-tiers.ts` | 374 | Chaîne d'API gratuites |
| `free-models.ts` | 508 | Capacités et statut des modèles free |

### 📦 PROJETS & INVENTORY (4 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `inventory.ts` | 632 | Inventaire ressources/capabilities |
| `projects.ts` | 161 | Liste projets + détection CWD |
| `project-init.ts` | 336 | Détection stack (Next.js, Flutter, CakePHP, etc.) |
| `project-intent.ts` | 363 | Intent depuis la structure projet |

### 🖥️ UI TERMINAL (2 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `ink-tui.ts` | 533 | TUI React/Ink pour le terminal |
| `dashboard.ts` | 351 | Renderer du dashboard status |

### ⚙️ SETUP & INSTALL (4 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `setup-wizard.ts` | 568 | Wizard 4 phases (Discovery→Wow→Organize→Summary) |
| `install.ts` | 495 | Workflow d'installation complet |
| `setup.ts` | 354 | Infrastructure de setup |
| `quick-setup.ts` | 274 | Setup rapide simplifié |

### 🔧 UTILITAIRES (22 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `init.ts` | 1,299 | Initialisation complète REX |
| `sandbox.ts` | 309 | Isolation macOS seatbelt + Docker |
| `docker.ts` | 80 | Helpers Docker |
| `backup.ts` | 149 | Backup mémoire + config |
| `prune.ts` | 210 | Nettoyage mémoire/cache/logs |
| `optimize.ts` | 171 | Optimisation système |
| `migrate.ts` | 84 | Migration de données |
| `db-migrations.ts` | 293 | Migrations schéma SQLite |
| `audit.ts` | 175 | Audit de configuration |
| `config-lint.ts` | 334 | Lint de la config |
| `context.ts` | 196 | Gestion du contexte |
| `context-loader.ts` | 175 | Chargement de contexte |
| `preload.ts` | 239 | Preload de données |
| `review.ts` | 342 | Code review automatique |
| `workflow.ts` | 334 | Gestion workflows |
| `secrets.ts` | 250 | Gestion secrets/credentials |
| `vps-deploy.ts` | 291 | Déploiement VPS |
| `benchmark.ts` | 245 | Benchmarking LLM |
| `load-test.ts` | 184 | Tests de charge |
| `lint-loop.ts` | 222 | Boucle lint→fix→re-lint |
| `living-cache.ts` | 283 | Cache adaptatif |
| `anti-vibecoding.ts` | 97 | Anti-patterns detection |

### 🔊 AUDIO & VOIX (3 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `audio.ts` | 238 | Gestion audio |
| `voice.ts` | 290 | Commande vocale |
| `audio-logger.ts` | 145 | Logger audio |

### 🎯 MINI-MODES (6 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `mini-modes/engine.ts` | 191 | Moteur mini-modes (modes légers sans full daemon) |
| `check-budget.mode.ts` | 73 | Mini-mode : vérifier budget |
| `check-fleet.mode.ts` | 70 | Mini-mode : vérifier fleet |
| `search-memory.mode.ts` | 68 | Mini-mode : recherche mémoire |
| `search-project.mode.ts` | 95 | Mini-mode : recherche projet |
| `save-idea.mode.ts` | 71 | Mini-mode : sauver une idée |

### 🪝 HOOKS (3 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `rex-budget-check/handler.ts` | 60 | Hook : vérification budget avant action |
| `rex-morning-digest/handler.ts` | 63 | Hook : digest matinal |
| `rex-snapshot/handler.ts` | 42 | Hook : snapshot état système |

### 🧩 DIVERS (5 fichiers)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `app.ts` | 273 | Gestion de l'app Flutter depuis CLI |
| `call.ts` | 168 | Appels directs à des fonctions |
| `meeting.ts` | 443 | Gestion de meetings/notes |
| `backend-runner.ts` | 105 | Runner de tâches backend |
| `rex-runner.ts` | 365 | Exécuteur de fichiers .rex (literate programming) |
| `rex-launcher.ts` | 285 | Launcher multi-profil |

---

## PACKAGES/CORE (11 fichiers · 511 lignes)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `index.ts` | 45 | `runAllChecks()` — orchestre tous les health checks |
| `types.ts` | 21 | Types partagés |
| `environment.ts` | 52 | Validation variables d'env |
| `memory.ts` | 51 | Health check SQLite |
| `config.ts` | 42 | Validation settings.json |
| `mcp-servers.ts` | 42 | Vérification MCPs disponibles |
| `hooks.ts` | 34 | Validation hooks |
| `rules.ts` | 34 | Validation fichiers rules |
| `guards.ts` | 31 | Validation guards |
| `docs-cache.ts` | 27 | Validation cache docs |
| `plugins.ts` | 24 | Vérification plugins |

---

## PACKAGES/MEMORY (9 fichiers · 1,720 lignes)

| Fichier | Lignes | Ce que ça fait |
|---------|--------|----------------|
| `ingest.ts` | 745 | Two-phase ingest (pending/ + embed lazy, 30 chunks, 500ms throttle) |
| `categorize.ts` | 469 | Auto-catégorisation via Ollama (qwen2.5:1.5b par défaut) |
| `hybrid-search.ts` | 160 | BM25 FTS5 + vector RRF fusion (alpha=0.7, k=60) |
| `reindex.ts` | 97 | Reconstruction index |
| `server.ts` | 69 | Service HTTP mémoire |
| `embed.ts` | 44 | Embedding nomic-embed-text (768 dims) |
| `search.ts` | 35 | Recherche vectorielle |
| `cli-search.ts` | 42 | Wrapper CLI pour recherche |
| `bridge.ts` | 58 | Bridge Cloudflare Worker |

---

## 🔴 OBSERVATIONS POUR RÉORGANISATION

### Problèmes identifiés

1. **`index.ts` = 4,327 lignes** — trop gros, 40+ commandes dans un seul fichier
2. **`gateway.ts` = 3,199 lignes** — bot Telegram + streaming + menus dans un fichier
3. **Duplication intent** : `intent-engine.ts` + `intent-classifier.ts` + `intent-registry.ts` = 3 fichiers pour la même fonction
4. **Duplication routing** : `router.ts` + `orchestration-policy.ts` + `orchestrator.ts` = chevauchement
5. **Duplication providers** : `providers.ts` + `ai-providers.ts` + `free-tiers.ts` + `free-models.ts` + `llm.ts` + `llm-backend.ts` + `litellm.ts` + `litellm-config.ts` = 8 fichiers LLM
6. **Duplication monitoring** : `watchdog.ts` + `monitor-daemon.ts` + `observer.ts` + `dev-monitor.ts` = 4 fichiers monitoring
7. **Duplication setup** : `setup-wizard.ts` + `install.ts` + `setup.ts` + `quick-setup.ts` = 4 fichiers setup
8. **Duplication tools** : `tool-injector.ts` + `tool-adapter.ts` + `tool-registry.ts` = 3 fichiers tools

### Regroupements proposés pour rex-worker training

Pour que rex-worker comprenne REX clairement, chaque **domaine** doit avoir **1 point d'entrée** clair :

| Domaine | Fichier principal | Rex-worker task |
|---------|------------------|-----------------|
| **Routing** | `orchestration-policy.ts` | `intent_route` |
| **Tools** | `tool-injector.ts` | `tool_select` |
| **Signals** | `signal-detector.ts` | `signal_action` |
| **Memory** | `packages/memory/` | `memory_categorize` |
| **Fleet** | `node-mesh.ts` | `fleet_dispatch` |
| **Security** | `security-scanner.ts` | `guard_check` |
| **Budget** | `budget.ts` | `budget_check` |
| **Curious** | `curious.ts` | `discovery_filter` |

### Priorité de refactoring

1. **P0** — Split `index.ts` en command groups (commands/*.ts)
2. **P0** — Split `gateway.ts` en gateway-core + gateway-streaming + gateway-menus
3. **P1** — Fusionner les 3 fichiers intent en 1 seul `intent.ts`
4. **P1** — Fusionner les 8 fichiers LLM en 3 max (`llm-router.ts`, `llm-providers.ts`, `llm-config.ts`)
5. **P2** — Fusionner les 4 fichiers monitoring en `monitor.ts` + `monitor-types.ts`
6. **P2** — Fusionner les 4 fichiers setup en `setup.ts` + `setup-wizard.ts`
