# REX — BACKEND FUNCTIONS

Plan simple pour tout le backend fonctionnel de REX.

---

## 1. Mission

Construire le backend REX comme un systeme fiable, simple et local-first.

Le backend couvre :

- CLI
- daemon
- gateway
- memory
- sync
- API hub
- routing
- inventory des ressources
- runbooks / success memory
- install / bootstrap logic

---

## 2. Priorites

### Priorite 1 — Ne rien perdre

A implementer avant toute sophistication :

- journal append-only
- spool local
- queue persistante
- ack
- replay
- backup simple

Cela vaut pour :

- gateway messages
- notifications
- memory observations
- delegated tasks
- background jobs
- sync events

### Priorite 2 — Utiliser ce que l'user possede deja

Ordre de decision :

1. cache
2. script ou CLI deja installe
3. service local
4. machine possedee
5. provider gratuit
6. quota abonnement
7. payant explicite

### Priorite 3 — Garder le backend headless

Le backend doit tourner sans Flutter sur :

- VPS
- Linux headless
- node distant

### Priorite 4 — Rester simple

- pas de reimplementation OSS bas niveau inutile
- pas de complexite reseau gratuite
- pas de couche payante avant les options locales/free

---

## 3. Blocs backend

### A. Routing

Responsabilites :

- resource inventory
- selection owned-first
- fallback chain
- budget tracking
- run explanation

Fichiers cibles :

- `packages/cli/src/router.ts`
- `packages/cli/src/providers.ts`
- `packages/cli/src/resource_inventory.ts`
- `packages/cli/src/budget.ts`

### B. Orchestrator

Responsabilites :

- choisir le bon backend
- unifier Agent SDK / OpenAI SDK / pipes / Ollama
- garder une interface simple

Fichiers cibles :

- `packages/cli/src/orchestrator.ts`
- `packages/cli/src/backend-runner.ts`

### C. Gateway

Responsabilites :

- surface de continuite
- journaliser avant traitement
- streamer si possible
- spooler si besoin
- replayer a la reprise

Fichiers cibles :

- `packages/cli/src/gateway.ts`
- `packages/cli/src/adapters/`

### D. Memory

Responsabilites :

- ingest local
- pending queue
- observations / lessons / runbooks / success memory
- reinjection au bon moment

Fichiers cibles :

- `packages/memory/src/ingest.ts`
- `packages/cli/src/preload.ts`
- `packages/cli/src/self-improve.ts`
- `packages/cli/src/observer.ts`
- `packages/cli/src/reflector.ts`

### E. Daemon

Responsabilites :

- scheduler central
- reconcile
- organize
- reflect
- prune
- health checks

Fichiers cibles :

- `packages/cli/src/daemon.ts`

### F. Hub + Sync

Responsabilites :

- API nodes/tasks/events
- sync inter-node
- spool local et queue hub
- ack/replay
- mode degrade si le hub prefere tombe

Fichiers cibles :

- `packages/cli/src/hub.ts`
- `packages/cli/src/node.ts`
- `packages/cli/src/sync.ts`
- `packages/cli/src/sync-queue.ts`

---

## 4. Topologies a couvrir

### Solo

- une seule machine
- pas de hub obligatoire
- pas de Tailscale obligatoire
- tout doit rester utile

### Small Cluster

- 2 a 5 machines
- un hub prefere si disponible
- sinon une machine principale peut tenir le role

### Fleet

- 10 a 30+ machines
- inventory + tags + groupes
- heartbeats compacts
- scheduling groupe/tag
- pas de bavardage continu inutile

---

## 5. Sous-agents backend

### Agent-Router

Mission : inventory + routing + budget

### Agent-Orchestrator

Mission : backend runners + delegate

### Agent-Gateway

Mission : adapters + resilience + continuity

### Agent-Memory

Mission : ingest + observations + runbooks + reinjection

### Agent-Daemon

Mission : scheduler + reconcile + organize + reflect

### Agent-Network

Mission : hub API + registration + health

### Agent-Sync

Mission : queue + ack + replay + degrade modes

### Agent-MCP

Mission : registry gouverne + recommandations + activation explicite

---

## 6. Defaults d'implementation

Si un choix n'est pas bloque par le user, prendre ces defaults :

- Tailscale first
- VPS prefere mais non obligatoire
- SQLite pour la persistance locale simple
- scripts shell/TS avant re-ecriture Rust/Go
- Node/TypeScript tant que le profiling ne prouve pas le besoin contraire
- background tasks non destructives et idempotentes

---

## 7. Definition of Done

Le backend est bon si :

- il ne perd pas les evenements critiques
- il fonctionne en solo, small cluster et fleet degradee
- il sait utiliser scripts/CLIs/hardware/free tiers avant les providers payants
- il reste operable sans GUI
- il est testable et observable
- il reste plus simple que la somme des integrations qu'il orchestre
