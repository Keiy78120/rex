# REX — État complet du système (13/03/2026)

> Document vivant. Mis à jour après chaque session.
> Objectif : ne RIEN oublier. Chaque module, chaque fonctionnalité, chaque TODO.

---

## Architecture 3 couches

### Couche 1 — REX Core (cerveau toujours allumé)
70% scripts / 30% LLM. Intent detection, mémoire, signaux, crons, fleet sync, watchdog.

### Couche 2 — REX Code (surcouche dev)
REX Scan, contexte dynamique, améliore Claude Code + Codex. Les gros modèles = outils, pas le cerveau.

### Couche 3 — REX Relay (orchestration multi-AI)
RELAY.md partagé, dated files, /loop d'IAs, fleet. LLMs collaborent, pas compétition.

---

## ✅ CE QUI EST FAIT (production-ready)

### Identity & System Prompts
- [x] `rex-identity.ts` — REX_SYSTEM_PROMPT avec architecture 3 couches complète
- [x] Gateway Qwen (`askQwenStream`) — system message REX injecté
- [x] Gateway Claude API (`askClaudeApiStream`) — system param REX injecté
- [x] Gateway fallback (`askClaude`) — prompt préfixé REX
- [x] `rex llm` CLI — system prompt REX
- [x] `agent-runtime.ts` — REX_SYSTEM_PROMPT injecté dans tous les agents

### Relay System
- [x] `relay-engine.ts` — RxJS pipeline (Ollama→Groq→Haiku→Sonnet→Opus)
- [x] Relay persistence — fichiers datés `RELAY-YYYY-MM-DD-HHhMM.md`
- [x] Atomic writes — tmp→rename pour crash safety
- [x] Incremental save — persist après chaque stage du relay
- [x] `rex relay "<task>"` CLI avec `--mentor` et `--json`
- [x] `rex relay list` / `rex relay show <name>` / `rex relay search <query>`
- [x] `paths.ts` — `RELAY_DIR` + `relayFilePath()` + auto-create dans `ensureRexDirs()`

### Dynamic Tool Injection
- [x] `tool-injector.ts` — sélection dynamique par intent/model/health
- [x] 9 tools dans le registry avec metadata (intents, tokenCost, priority)
- [x] Model budgets — qwen2.5:1.5b (2 tools) → Claude (9 tools)
- [x] Health-aware — si Ollama down, skip memory tools
- [x] Runtime `registerTool()` / `unregisterTool()` pour MCP discovery
- [x] `agent-runtime.ts` — wire `selectTools()` remplace `getRexTools()` statique

### Orchestration & Routing
- [x] `orchestration-policy.ts` — 6 tiers (0=SCRIPT → 5=CODEX), 0 LLM pour routing
- [x] `rex route "<message>"` + `--explain` + `--json`
- [x] Confidence levels par tier pour routing correct

### Memory System
- [x] SQLite + sqlite-vec (nomic-embed-text 768 dims)
- [x] Hybrid search (BM25 FTS5 + vector RRF)
- [x] Two-phase ingest — pending/ (instant) + embed lazy (30 chunks, 500ms throttle)
- [x] `rex ingest` / `rex categorize` / `rex search --hybrid`
- [x] Adaptive ingest modes (bulk/fast/smart/offline)

### Gateway & Comms
- [x] Telegram bot (`@claude_keiy_bot`) — long polling, streaming Qwen/Claude
- [x] Guard auto (Stop) + skill `/notify`
- [x] Rate limit protection (1 edit/600ms Telegram)
- [x] Advanced menu (📊 Monitor, etc.)

### Daemon
- [x] `daemon.ts` — 30+ cycles (health, ingest, maintenance, sync, curious, budget)
- [x] Daily Telegram summary à 22h (configurable)
- [x] Smart alerts — disk < 5GB, pending > 100 → Telegram notify
- [x] Stuck ingest detection + auto-cleanup

### Dev Monitor
- [x] `dev-monitor.ts` — zero-LLM monitoring (git activity, sessions, pending)
- [x] `findGitRepos()` depth-3 discovery
- [x] Hub API: GET `/api/v1/monitor`

### Training & Fine-tune
- [x] `training.ts` — collect→export→run (mlx-lm Apple Silicon ou OpenAI fine-tune)
- [x] Flutter: training_page.dart — Dataset/Jobs/Routing tabs

### Agent Templates
- [x] 5 personas (dg/drh/ceo/coo/freelance) avec `create*Agent()`
- [x] @openai/agents SDK, JSON schema params

### User Cycles
- [x] `user-cycles.ts` — XState (AWAKE_ACTIVE→IDLE→SLEEPING→WAKING_UP)
- [x] Sleep score multi-facteurs
- [x] SLEEPING → `allowedTiers: ['local']` only

### Watchdog
- [x] `watchdog.ts` — cycle 60s checks
- [x] `rex watchdog` / `rex watchdog start`

### Resource Hub
- [x] `resource-hub.ts` — catalog unifié (mcp/guard/skill/script/boilerplate/tool)
- [x] 20+ built-in + awesome-mcp-servers + awesome-claude-code
- [x] `rex hub list/search/install/update`

### Security
- [x] `security-scanner.ts` — mcp-scan, skill-scanner, injection regex
- [x] 11 guards auto-installés (force-push, large-file, env-commit, todo-limit, etc.)

### CI/CD
- [x] GitHub Actions — unit + build + security audit
- [x] Désactivé en auto (workflow_dispatch only) pour stop spam

### Flutter App (macOS native)
- [x] 26 pages (Health, Voice, Audio, Memory, Gateway, Agents, MCP, Optimize, Settings, Training, Hub, Clients, etc.)
- [x] RexService provider, shared widgets, theme system
- [x] Native macOS toolbar navigation

### Docs
- [x] `CLAUDE.md` — entry point agents, 3-layer architecture
- [x] `docs/VISION.md` — manifeste 3 couches
- [x] `docs/REX-BRAIN.md` — logique complète
- [x] `docs/plans/living-rex-vision.md` — vision Kevin formalisée
- [x] `docs/plans/action.md` — plan d'action complet

### TypeScript & Build
- [x] `npx tsc --noEmit --strict` → 0 erreurs
- [x] 713+ tests vitest, < 2s
- [x] tsup ESM build

---

## 🔧 CE QUI RESTE À FAIRE

### P0 — Script→Memory direct save (no LLM)
**Fichiers :** `signal-detector.ts` (319L, 7 APIs publiques), `daemon.ts` (952L), `packages/memory/`

Signal detector est **complet** : hardware (CPU/RAM/disk + pressure levels), services (Ollama/Hub/Daemon/Gateway/Tailscale), dev (git repo/branch/uncommitted/pending chunks/last commit), providers (13 API keys). Cache 30s.

Le gap : les signaux sont **exposés via API** (`detectSignals()`, `isUnderPressure()`, `hasLLMBackend()`, etc.) et **lus par le daemon** pour gating — mais **jamais persistés en mémoire**. Un commit git, une alerte disk, un changement de branche → ça disparaît après 30s de cache.

**À implémenter :**
- [ ] `saveSignalToMemory(signal)` — mapping signal → memory entry (subject, observation, type=fact)
- [ ] Wire dans daemon : après chaque `detectSignals()` cycle, diff avec le précédent → save les changements significatifs (nouveau commit, nouvelle branche, pressure change, provider down/up)
- [ ] Pas d'embeddings à ce stade — save en pending/, embed au prochain cycle ingest
- [ ] Dedup : ne pas sauver le même signal 2x (hash du contenu ou timestamp guard)

### P0 — Brain device obligatoire au setup
**Fichiers :** `setup-wizard.ts` (569L, 4 phases complètes)

Le wizard Discovery détecte déjà : Ollama, hardware (CPU/RAM/GPU/disk), Claude/Codex, Tailscale, free-tier APIs (Groq/Cerebras/Together/Mistral/OpenRouter/DeepSeek), git repos, LaunchAgents, MCPs, sessions. Organize écrit config.json.

Le gap : **aucune notion de "brain device"**. Tout est local-only. Pas de question "quel device est le cerveau 24/7 ?"

**À implémenter :**
- [ ] Phase 1 (Discovery) : ajouter brain device probe — détecter si on est sur le brain ou un fleet node
- [ ] Si Tailscale actif : scanner les peers pour trouver un hub existant (port 7420)
- [ ] Options : "Ce Mac = le brain" / VPS (IP/SSH) / "Rejoindre un brain existant" / "Setup later"
- [ ] Si "Setup later" → warning mode dégradé (pas de daemon 24/7, pas de fleet)
- [ ] Persister dans `config.json` → `brain: { type, host, port, isSelf }`
- [ ] Si brain = remote → tester connectivité avant de continuer

### P1 — Fleet pairing via Docker
**Fichiers :** `node-mesh.ts` (634L), Dockerfile (62L), docker-compose.yml (87L), docker-compose.vps.yml (53L)

Node mesh est **complet** : capability detection (13 types), scoring, thermal gating, Tailscale auto-discovery, task routing (`routeTask(type)`), hub registration, mesh-cache offline. Docker **existe** déjà : multi-stage build, 3 services (hub/daemon/gateway), compose dev + VPS + sandbox.

Le gap : **pas de pairing automatique**. Un admin doit manuellement configurer Docker sur chaque node. Pas de `rex fleet pair`.

**À implémenter :**
- [ ] `fleet-pairing.ts` — orchestre le pairing depuis le brain
- [ ] `rex fleet pair <host>` → SSH au host, vérifie Docker, pull image REX, lance compose
- [ ] `rex fleet unpair <host>` → SSH, docker-compose down --volumes, supprime config
- [ ] `rex fleet disconnect <host>` → docker-compose stop (données conservées)
- [ ] `rex fleet reconnect <host>` → docker-compose start
- [ ] Auto-detect env du node cible (via `signal-detector` over SSH)
- [ ] Générer compose adapté : RPi=lightweight (hub only), PC GPU=full (hub+daemon+ollama)
- [ ] Le Dockerfile existant est déjà multi-stage Node 22 Alpine — juste ajouter multi-arch build

### P1 — Wizard UI — Consent data sources
**Fichiers :** `setup-wizard.ts`, nouveau `data-sources.ts`

L'user doit choisir CE QUE REX peut lire/sync. Privacy-first.

**À implémenter :**
- [ ] Phase dans le wizard pour data source selection
- [ ] Sources supportées :
  - WhatsApp (macOS/iOS only) → choisir quelles conversations
  - iMessage → choisir quels contacts
  - Obsidian vaults → choisir quels vaults
  - Git repos → choisir lesquels (auto-detected)
  - Calendar → choisir quels calendriers
  - Browser history → opt-in uniquement
- [ ] Chaque source = toggle ON/OFF + granularité (conversations, contacts, repos)
- [ ] Config persistée dans `~/.claude/rex/data-sources.json`
- [ ] `rex sources list` / `rex sources add <type>` / `rex sources remove <type>`
- [ ] Ingest respecte strictement ces choix (ne lit JAMAIS plus que ce qui est autorisé)

### P1 — Fleet sync auto
**Fichiers :** `daemon.ts`, `node-mesh.ts`

**À implémenter :**
- [ ] Sync relay files entre brain et fleet nodes
- [ ] Sync memory DB (brain = source of truth, nodes = replicas read-only)
- [ ] Sync config changes (brain → fleet push)
- [ ] Temp files pour crash safety pendant sync
- [ ] Conflict resolution : brain always wins
- [ ] Bandwidth-aware : compress avant sync, skip si réseau lent

### P1 — REX Worker Model (fine-tune dédié)
**Plan complet :** `docs/plans/rex-worker-model.md`

Modèle Qwen 3.5 fine-tuné spécialisé pour toutes les fonctions autonomes REX.

**Architecture multi-taille :**
- **rex-worker-mini (0.8B Q4, ~500MB)** → VPS CPU, RPi — routing, signals, guards
- **rex-worker (4B Q4, ~2.5GB)** → Mac, PC — toutes les tâches REX

**6 tâches :** intent routing, tool selection, signal→action, memory categorize, fleet dispatch, guard check.

**Dataset :** 2000-3000 exemples générés depuis REX (orchestration-policy, tool-injector, signal-detector, memory DB, security-scanner).

**Training :** Unsloth QLoRA (RTX 3090, ~15min) ou mlx-lm LoRA (Mac, ~30min).

**Self-improvement :** corrections Claude/Opus → re-train weekly → convergence.

**À implémenter :**
- [ ] Collecteurs de dataset spécialisés dans `training.ts`
- [ ] Pipeline `rex train collect/validate/split/run/eval/deploy`
- [ ] Intégration dans `orchestration-policy.ts` (tier LOCAL = rex-worker)
- [ ] Self-improvement loop dans `daemon.ts`
- [ ] Fleet deploy (`rex train deploy --fleet`)

### P2 — REX Scan (Couche 2 — Code)
**Fichiers :** nouveau `rex-scan.ts`

À l'install, REX scanne les projets dev de l'user pour détecter stack, MCPs, et créer/update docs.

**À implémenter :**
- [ ] Scan tous les repos dans ~/Developer (ou path configuré)
- [ ] Détecte : package.json, pubspec.yaml, composer.json, requirements.txt, Cargo.toml, go.mod
- [ ] Pour chaque projet : stack, frameworks, test runner, CI, MCPs existants
- [ ] Crée/update `~/.claude/rex/projects/<name>/context.json`
- [ ] Suggère MCPs pertinents non installés (via resource-hub)

### P2 — Open-source prep
- [ ] Nettoyer les emails/tokens des commits
- [ ] README orienté utilisateur (install en 1 commande)
- [ ] License (MIT ou Apache 2.0)
- [ ] Contributing guide
- [ ] Issue templates

### P3 — V1 Stable release
- [ ] Design doc final
- [ ] All P0 + P1 implementés
- [ ] E2E tests sur parcours critiques
- [ ] Documentation utilisateur complète
- [ ] npm publish `rex-claude`

---

## ⚡ QUICK REFERENCE — Commandes CLI

```bash
# Core
rex doctor          # health check
rex status          # état système
rex install         # one-command setup

# Memory
rex ingest          # indexer sessions
rex categorize      # auto-tag
rex search "query"  # recherche sémantique
rex search --hybrid # BM25 + vector

# Relay
rex relay "task"    # lancer un relay
rex relay list      # voir les relays
rex relay show X    # lire un relay
rex relay search X  # chercher dans les relays

# Routing
rex route "msg"     # voir le routing decision
rex route --explain # détail du routing

# Fleet
rex fleet status    # état des noeuds
rex fleet pair X    # (TODO) pairing Docker
rex fleet unpair X  # (TODO) supprimer
rex fleet disconnect/reconnect X # (TODO) temp stop/start

# Hub
rex hub list        # catalogue
rex hub search X    # chercher
rex hub install X   # installer
rex hub update      # mettre à jour

# Daemon
rex daemon          # lancer le daemon
rex watchdog        # single check
rex watchdog start  # boucle 60s

# Dev
rex llm "prompt"    # LLM direct (avec REX identity)
rex agents          # liste agents
rex client:create   # créer un client
rex client:list     # lister clients
```

---

## 📊 MODULES — ÉTAT DÉTAILLÉ

| Module | Lignes | Status | Notes |
|--------|--------|--------|-------|
| `index.ts` | ~2000 | ✅ | 40+ CLI commands |
| `hub.ts` | 994 | ✅ | 50+ API endpoints, port 7420 |
| `daemon.ts` | 952 | ✅ | 13 background cycles, circuit breaker |
| `curious.ts` | 736 | ✅ | 6 discovery sources, Telegram dispatch |
| `node-mesh.ts` | 634 | ✅ | Fleet discovery/routing/scoring |
| `setup-wizard.ts` | 569 | ✅ | 4-phase setup, zero LLM |
| `security-scanner.ts` | 420 | ✅ | MCP threat detection, 24h cache |
| `mcp-discover.ts` | 392 | ✅ | 20+ curated MCPs, offline-first |
| `tool-injector.ts` | 335 | ✅ | Dynamic tool selection |
| `signal-detector.ts` | 319 | ✅ | 20+ signals, 7 public APIs |
| `sandbox.ts` | 309 | ✅ | macOS seatbelt + Docker isolation |
| `relay-engine.ts` | ~400 | ✅ | RxJS pipeline + persistence |
| `self-improve.ts` | 213 | ✅ | Lesson extraction + patterns |
| `orchestration-policy.ts` | ~200 | ✅ | 6-tier routing, zero LLM |
| `user-cycles.ts` | ~200 | ✅ | XState AWAKE/SLEEPING |
| `watchdog.ts` | ~150 | ✅ | 60s health checks |
| **Docker** | ~210 | ✅ | Dockerfile + 3 compose files |

**Total : ~9000+ lignes TypeScript implémentées, 0 stubs**

---

## 📁 STRUCTURE FICHIERS CLÉ

```
packages/cli/src/
├── index.ts              ← entry point (40+ commandes)
├── rex-identity.ts       ← REX_SYSTEM_PROMPT, identity pipeline
├── gateway.ts            ← Telegram bot, streaming LLM
├── orchestrator.ts       ← relay chain LLM
├── relay-engine.ts       ← RxJS pipeline + persistence datée
├── orchestration-policy.ts ← 6 tiers routing (0 LLM)
├── tool-injector.ts      ← dynamic tool selection
├── tool-adapter.ts       ← 9 tools Ollama/OpenAI format
├── agent-runtime.ts      ← runAgent/streamAgent avec tools dynamiques
├── daemon.ts             ← 30+ cycles background
├── signal-detector.ts    ← 20+ signaux système (scripts purs)
├── curious.ts            ← proactive discovery
├── dev-monitor.ts        ← git activity monitoring
├── user-cycles.ts        ← XState (AWAKE/IDLE/SLEEPING)
├── watchdog.ts           ← health checks 60s
├── setup-wizard.ts       ← 4 phases onboarding
├── node-mesh.ts          ← fleet capabilities/routing
├── paths.ts              ← tous les chemins centralisés
├── config.ts             ← config unifiée
├── logger.ts             ← createLogger(source)
├── event-journal.ts      ← journal événements
├── pane-relay.ts         ← multi-LLM pane collaboration
├── hub.ts                ← Hub API (port 7420)
├── resource-hub.ts       ← catalogue tools/mcps/skills
├── security-scanner.ts   ← scan sécurité
├── mcp-discover.ts       ← MCP discovery
├── training.ts           ← fine-tune pipeline
├── sandbox.ts            ← Docker sandbox
├── self-improve.ts       ← amélioration autonome
├── litellm.ts            ← wrapper LLM + routing
├── free-tiers.ts         ← providers gratuits
├── account-pool.ts       ← multi-comptes rotation
└── agent-templates/      ← 5 personas (dg/drh/ceo/coo/freelance)

packages/memory/src/
├── index.ts              ← entry point
├── vector.ts             ← sqlite-vec embeddings
├── bm25.ts               ← FTS5 search
└── hybrid-search.ts      ← RRF fusion

packages/flutter_app/lib/
├── main.dart             ← entry
├── rex_service.dart      ← toute la logique métier
├── theme.dart            ← RexColors
└── pages/                ← 26 pages
```

---

## 🔑 DÉCISIONS ARCHITECTURALES (ne pas changer)

1. **70/30 rule** — 70% scripts, 30% LLM. Jamais l'inverse.
2. **Script-first** — si un script peut répondre, 0 LLM appelé
3. **Dated relay files** — RELAY-YYYY-MM-DD-HHhMM.md, jamais un fichier qui grossit
4. **Atomic writes** — tmp→rename pour tout fichier critique
5. **Brain = source of truth** — fleet nodes = replicas, brain wins conflicts
6. **Privacy-first** — user choisit CE QUE REX peut lire, jamais plus
7. **REX identity everywhere** — tout LLM call a le system prompt REX
8. **Dynamic tool injection** — chaque requête reçoit les tools pertinents, pas tous
9. **0 LLM pour le routing** — orchestration-policy.ts route par regex/rules
10. **Additive only** — ne jamais casser du code qui marche
11. **Dual memory — zero data loss** — voir section dédiée ci-dessous

---

## 🧠 MÉMOIRE DISTRIBUÉE — ZERO DATA LOSS

### Principe
Chaque device REX a **deux couches de mémoire** :
- **Local** : SQLite sur le device (`~/.rex-memory/rex-memory.db`) — toujours disponible, même offline
- **Brain** : SQLite sur le brain (VPS/Mac 24/7) — source de vérité, accessible par tous les nodes

### Flow d'ingestion
```
Signal détecté (git commit, fichier, activité, etc.)
  │
  ▼
Save local immédiat (pending/ → SQLite local)
  │ ← zero LLM, zero réseau, instant
  ▼
Embed lazy (prochain cycle ingest, 30 chunks/run, 500ms throttle)
  │
  ▼
Sync vers brain (prochain cycle daemon auto-sync, 5min)
  │ ← bidirectionnel, brain wins en cas de conflit
  ▼
Brain redistribue aux autres nodes (push ou pull au prochain sync)
```

### Garanties
- **Offline-first** : un device déconnecté continue d'ingérer en local. Rien ne se perd.
- **Reconnect = catch-up** : au retour en ligne, diff local vs brain → sync les manquants
- **Brain down** : les nodes continuent de fonctionner en autonomie locale. Quand le brain revient, tout se resync.
- **Crash safety** : atomic writes (tmp→rename) + pending/ queue = si process kill mid-write, on reprend au dernier état cohérent
- **Pas de duplication** : dedup par hash de contenu lors du sync (même signal détecté par 2 nodes → 1 seule entrée)

### Ce que ça ingère automatiquement (fond, sans LLM)
- Git : commits, branches, PR, merges → direct mémoire
- Fichiers : créations/modifications significatives → pending/
- Signaux système : disk pressure, RAM, services up/down → fact entries
- Sessions Claude Code / Codex → ingest JSONL
- Relay : chaque RELAY.md complété → indexé
- Curious : découvertes (modèles, MCPs, repos trending) → mémoire
- Patterns : erreurs récurrentes, lessons learned → auto-extracted

### Architecture sync fleet
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mac (node)    │     │  Brain (VPS)    │     │   PC (node)     │
│                 │     │                 │     │                 │
│ SQLite local    │────▶│ SQLite master   │◀────│ SQLite local    │
│ pending/        │ sync│ = source truth  │sync │ pending/        │
│ relay/          │     │ relay/          │     │ relay/          │
│ mesh-cache.json │     │ fleet registry  │     │ mesh-cache.json │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───── Tailscale ───────┴───── Tailscale ───────┘
```

**Résultat : REX = mémoire distribuée qui ne perd jamais rien, sync tout, et optimise en fond.**
