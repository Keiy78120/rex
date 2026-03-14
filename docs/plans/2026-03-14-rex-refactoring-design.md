# REX Refactoring — Design Doc

> Date : 14/03/2026
> Auteur : Kevin (D-Studio)
> Objectif : Réorganiser 155 fichiers à plat → 13 domaines propres (~45 fichiers)
> Bénéfices : maintenabilité, training rex-worker, onboarding, open-source

---

## CONTEXTE

REX a grandi organiquement de 0 à 155 fichiers TypeScript (~48,600 lignes) dans `packages/cli/src/`. Tout est à plat, pas de dossiers. Des fichiers se chevauchent :
- 3 fichiers intent (engine, classifier, registry)
- 8 fichiers LLM/providers
- 4 fichiers monitoring
- 4 fichiers setup
- `index.ts` = 4,327 lignes (40+ commandes)
- `gateway.ts` = 3,199 lignes (bot + streaming + menus)

Conséquences :
- Difficile de comprendre l'architecture pour un humain ou un modèle
- Duplication de logique entre fichiers
- Imports circulaires potentiels
- Frein au training de rex-worker (le modèle doit comprendre 155 fichiers)

## CE QUE REX EST

REX = OS d'intelligence vivant. Il est :
- **Toujours actif** — daemon 30+ cycles, proactif, self-healing, self-debug
- **Repaire universel** — templates, code, tools, providers, boilerplates, scripts, CLI, MCP, skills, guards, rules, memory
- **Multi-LLM orchestrator** — surcouche terminal ou via IDE, tous les comptes agents au même endroit
- **Client agents factory** — crée des agents séparés que REX monitore (debug, fix, evolve, self-heal)
- **Fleet logger** — log tout pour training, auto-training de modèles
- **Audio/meeting logger** — capture meetings, events, voice
- **Zero data loss** — sync tout, mémoire distribuée, ne perd rien
- **CURIOUS** — résolution proactive de problèmes en fond silencieux
- **Bonnes pratiques** — méthodes dev, OWASP, patterns, anti-vibecoding intégrés

## PRINCIPES DU REFACTORING

1. **Additive only** — on ne casse rien, on déplace et fusionne
2. **Même exports** — les API publiques ne changent pas, juste les chemins d'import
3. **1 domaine = 1 dossier = 1 index.ts** — point d'entrée clair
4. **Fusionner ≠ supprimer** — le code est combiné, pas jeté
5. **Tests doivent passer** — après chaque fusion, `pnpm test` doit être vert
6. **Imports mis à jour** — grep + replace systématique après chaque déplacement

---

## ARCHITECTURE CIBLE

```
packages/cli/src/
├── brain/              ← REX Core (identité, routing, orchestration)
│   ├── index.ts           export unifié du domaine
│   ├── identity.ts        REX_SYSTEM_PROMPT + pipeline 5 étapes
│   ├── routing.ts         6 tiers + intent (3 fichiers → 1)
│   ├── orchestrator.ts    relay race + relay engine + persistence
│   └── tool-injector.ts   sélection dynamique tools
│
├── gateway/            ← Communication externe
│   ├── index.ts
│   ├── telegram.ts        bot Telegram + streaming (split du monolithe)
│   ├── hub.ts             API HTTP port 7420
│   ├── adapter.ts         Telegram API helpers
│   └── mcp-server.ts      MCP server pour agents
│
├── fleet/              ← Fleet, sync, nodes
│   ├── index.ts
│   ├── mesh.ts            discovery Tailscale + routing + scoring + thermal
│   ├── sync.ts            sync bidirectionnel + queue (2→1)
│   └── pairing.ts         (futur P1) Docker-based fleet pairing
│
├── signals/            ← Monitoring, watchdog, events
│   ├── index.ts
│   ├── detector.ts        20+ signaux système (hardware/services/dev/providers)
│   ├── watchdog.ts        health checks 60s
│   ├── journal.ts         event journal SQLite
│   └── patterns.ts        pattern detection + observer (2→1)
│
├── agents/             ← Agents, clients, templates
│   ├── index.ts
│   ├── runtime.ts         runAgent/streamAgent + tools dynamiques
│   ├── factory.ts         client factory + account pool (2→1)
│   ├── curious.ts         découverte proactive + open loops
│   └── templates/         6 personas (dg/ceo/coo/drh/freelance/dev)
│
├── providers/          ← LLM backends & budget (8→3)
│   ├── index.ts
│   ├── registry.ts        tous providers + free tiers + models + capabilities
│   ├── backend.ts         abstraction LLM + litellm
│   └── budget.ts          tracking + burn rate + semantic cache
│
├── security/           ← Guards, scanner, session
│   ├── index.ts
│   ├── scanner.ts         vulnérabilités MCP/skills/packages
│   ├── guards.ts          manager + AST parser (2→1)
│   └── session.ts         session guard
│
├── tools/              ← Tools, MCPs, skills, resources
│   ├── index.ts
│   ├── registry.ts        tool registry + adapter formats (2→1)
│   ├── resources.ts       resource hub + skills discovery (2→1)
│   └── mcp.ts             mcp-discover + mcp_registry (2→1)
│
├── training/           ← Training, self-improve
│   ├── index.ts
│   ├── pipeline.ts        collect → export → train → deploy
│   ├── improve.ts         self-improve + reflector + lessons (2→1)
│   └── worker.ts          (futur P1) rex-worker dataset generators
│
├── setup/              ← Install, wizard (4→2)
│   ├── index.ts
│   ├── wizard.ts          setup wizard 4 phases
│   └── install.ts         install + setup + quick-setup (3→1)
│
├── commands/           ← Commandes CLI (split de index.ts 4327L)
│   ├── index.ts           register toutes les commandes sur program
│   ├── core.ts            doctor, status, daemon, watchdog, install
│   ├── memory.ts          ingest, categorize, search, prune, recategorize
│   ├── fleet.ts           fleet, sync, nodes, mesh
│   ├── dev.ts             review, workflow, lint, context, projects
│   ├── agents.ts          agents, relay, client, templates
│   ├── tools.ts           hub, mcp, skills, guard
│   └── admin.ts           backup, migrate, audit, optimize, budget
│
├── ui/                 ← TUI, dashboard
│   ├── dashboard.ts       status dashboard renderer
│   └── tui.ts             React/Ink terminal UI
│
├── utils/              ← Utilitaires partagés
│   ├── config.ts          config loading/saving
│   ├── paths.ts           chemins centralisés
│   ├── logger.ts          factory createLogger
│   ├── sandbox.ts         isolation macOS/Docker
│   ├── docker.ts          helpers Docker
│   └── db.ts              migrations + helpers SQLite
│
├── hooks/              ← Claude Code hooks (inchangé)
│   ├── rex-budget-check/
│   ├── rex-morning-digest/
│   └── rex-snapshot/
│
└── mini-modes/         ← Mini-modes (inchangé)
    ├── engine.ts
    ├── check-budget.mode.ts
    ├── check-fleet.mode.ts
    ├── search-memory.mode.ts
    ├── search-project.mode.ts
    └── save-idea.mode.ts
```

---

## TABLE DE FUSION

### brain/ (5 fichiers ← 10 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `identity.ts` | rex-identity.ts | ~500 |
| `routing.ts` | orchestration-policy.ts + intent-engine.ts + intent-classifier.ts + intent-registry.ts + router.ts | ~900 |
| `orchestrator.ts` | orchestrator.ts + relay-engine.ts + pane-relay.ts | ~1400 |
| `tool-injector.ts` | tool-injector.ts (déplacement seul) | ~335 |

### gateway/ (4 fichiers ← 3 fichiers + split)

| Nouveau fichier | Sources | Lignes estimées |
|----------------|---------|----------------|
| `telegram.ts` | gateway.ts (split: bot + streaming + menus) | ~2500 |
| `hub.ts` | hub.ts (déplacement) | ~994 |
| `adapter.ts` | gateway-adapter.ts (déplacement) | ~457 |
| `mcp-server.ts` | rex-mcp-server.ts (déplacement) | ~353 |

### fleet/ (2 fichiers ← 5 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `mesh.ts` | node-mesh.ts + node.ts | ~960 |
| `sync.ts` | sync.ts + sync-queue.ts + codex-sync.ts | ~1020 |

### signals/ (4 fichiers ← 7 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `detector.ts` | signal-detector.ts (déplacement) | ~318 |
| `watchdog.ts` | watchdog.ts + monitor-daemon.ts | ~650 |
| `journal.ts` | event-journal.ts (déplacement) | ~183 |
| `patterns.ts` | pattern-detector.ts + observer.ts + dev-monitor.ts | ~940 |

### agents/ (4 fichiers ← 6 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `runtime.ts` | agent-runtime.ts + lang-graph.ts | ~1350 |
| `factory.ts` | client-factory.ts + account-pool.ts + agents.ts | ~1920 |
| `curious.ts` | curious.ts + proactive-dispatch.ts | ~1050 |

### providers/ (3 fichiers ← 8 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `registry.ts` | providers.ts + ai-providers.ts + free-tiers.ts + free-models.ts + llm.ts | ~1540 |
| `backend.ts` | llm-backend.ts + litellm.ts + litellm-config.ts | ~990 |
| `budget.ts` | budget.ts + burn-rate.ts + semantic-cache.ts | ~855 |

### security/ (3 fichiers ← 4 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `scanner.ts` | security-scanner.ts (déplacement) | ~420 |
| `guards.ts` | guard-manager.ts + guard-ast.ts | ~409 |
| `session.ts` | session-guard.ts (déplacement) | ~338 |

### tools/ (3 fichiers ← 7 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `registry.ts` | tool-registry.ts + tool-adapter.ts | ~830 |
| `resources.ts` | resource-hub.ts + skills.ts | ~866 |
| `mcp.ts` | mcp-discover.ts + mcp_registry.ts | ~1325 |

### training/ (2 fichiers ← 4 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `pipeline.ts` | training.ts + recategorize.ts | ~647 |
| `improve.ts` | self-improve.ts + reflector.ts | ~629 |

### setup/ (2 fichiers ← 4 fichiers)

| Nouveau fichier | Sources fusionnées | Lignes estimées |
|----------------|-------------------|----------------|
| `wizard.ts` | setup-wizard.ts (déplacement) | ~568 |
| `install.ts` | install.ts + setup.ts + quick-setup.ts | ~1123 |

### commands/ (7 fichiers ← index.ts 4327L)

Split de index.ts en groupes de commandes thématiques.

### utils/ (6 fichiers ← fichiers existants)

Déplacements simples de config.ts, paths.ts, logger.ts, sandbox.ts, docker.ts + fusion db-migrations.ts + migrate.ts.

---

## FICHIERS NON DÉPLACÉS (restent ou supprimés)

| Fichier | Action | Raison |
|---------|--------|--------|
| `init.ts` (1299L) | Absorber dans `setup/install.ts` | Fait partie du setup |
| `audit.ts` | Absorber dans `commands/admin.ts` | Simple commande |
| `config-lint.ts` | Absorber dans `utils/config.ts` | Validation config |
| `context.ts` + `context-loader.ts` + `preload.ts` | Absorber dans `brain/identity.ts` | Gestion contexte = identité |
| `audio.ts` + `voice.ts` + `audio-logger.ts` | `media/` ou `utils/media.ts` | Domaine audio |
| `review.ts` + `workflow.ts` | `commands/dev.ts` | Commandes dev |
| `meeting.ts` | `utils/meeting.ts` | Feature standalone |
| `app.ts` | `commands/core.ts` | Commande app |
| `backup.ts` + `prune.ts` + `optimize.ts` | `commands/admin.ts` | Commandes admin |
| `benchmark.ts` + `load-test.ts` | `utils/benchmark.ts` | Outils perf |
| `vps-deploy.ts` | `fleet/deploy.ts` | Déploiement fleet |
| `anti-vibecoding.ts` | `security/` | Anti-patterns |
| `living-cache.ts` | `utils/cache.ts` | Cache adaptatif |
| `rex-runner.ts` + `rex-launcher.ts` | `brain/runner.ts` | Exécution .rex files |
| `lint-loop.ts` | `tools/lint.ts` | Linting automatique |
| `secrets.ts` | `security/secrets.ts` | Gestion secrets |
| `inventory.ts` + `projects.ts` + `project-init.ts` + `project-intent.ts` | `tools/projects.ts` | Gestion projets |

---

## ORDRE D'EXÉCUTION

Le refactoring se fait **domaine par domaine**, chaque étape est un commit séparé :

### Phase 1 — Fondations (pas de fusion, juste déplacements)
1. Créer les dossiers (`brain/`, `gateway/`, etc.)
2. Déplacer `utils/` (config, paths, logger) — 0 risque
3. Mettre à jour les imports dans les fichiers qui les consomment
4. `pnpm test` → vert

### Phase 2 — Split du monolithe index.ts
5. Extraire les commandes dans `commands/*.ts`
6. `index.ts` ne fait plus que `import + program.parse()`
7. `pnpm test` → vert

### Phase 3 — Fusions simples (fichiers qui ne sont importés que par 1-2 consumers)
8. `security/` : guards + AST → `guards.ts`
9. `setup/` : install + setup + quick-setup → `install.ts`
10. `training/` : self-improve + reflector → `improve.ts`
11. `pnpm test` → vert

### Phase 4 — Fusions moyennes
12. `brain/` : 3 intents → `routing.ts`
13. `providers/` : 8 fichiers → 3
14. `signals/` : 4 monitoring → 2
15. `pnpm test` → vert

### Phase 5 — Fusions complexes (fichiers les plus importés)
16. `agents/` : runtime + factory + pool
17. `tools/` : registry + adapter + resources + skills + MCP
18. `fleet/` : mesh + node + sync
19. `pnpm test` → vert

### Phase 6 — Split gateway.ts (le plus gros)
20. `gateway/telegram.ts` (bot + streaming, ~2500L)
21. Tout le reste dans `gateway/`
22. `pnpm test` → vert

### Phase 7 — Nettoyage
23. Supprimer les anciens fichiers (les sources des fusions)
24. Mettre à jour `docs/REX-MODULES.md` avec la nouvelle structure
25. Mettre à jour `CLAUDE.md` section Structure
26. Build final + test final

---

## IMPACT SUR REX-WORKER

Après refactoring, le dataset rex-worker est trivial à générer :

```
Domaine → Fichier principal → Tâche rex-worker
brain/routing.ts       → intent_route
brain/tool-injector.ts → tool_select
signals/detector.ts    → signal_action
memory/categorize.ts   → memory_categorize
fleet/mesh.ts          → fleet_dispatch
security/scanner.ts    → guard_check
providers/budget.ts    → budget_check
agents/curious.ts      → discovery_filter
```

**1 domaine = 1 tâche rex-worker = 1 section du dataset**

---

## MÉTRIQUES CIBLES

| Métrique | Avant | Après |
|----------|-------|-------|
| Fichiers dans cli/src/ | 155 à plat | ~45 dans 13 dossiers |
| Plus gros fichier | 4,327L (index.ts) | ~2,500L (gateway/telegram.ts) |
| Domaines clairs | 0 | 13 |
| Duplication logique | 8 zones identifiées | 0 |
| Temps pour comprendre l'archi | Long | 13 index.ts suffisent |
| Tests | 1449 passent | 1449 passent (aucun changement) |

---

## RISQUES

| Risque | Mitigation |
|--------|-----------|
| Imports cassés après déplacement | Grep systématique + tsconfig paths aliases |
| Tests qui échouent pendant la fusion | 1 commit par domaine, test entre chaque |
| Exports manquants | Chaque `index.ts` re-export tout ce que l'ancien fichier exportait |
| Regressions fonctionnelles | Build + test après chaque étape, pas de changement de logique |
