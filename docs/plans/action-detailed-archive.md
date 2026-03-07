# REX v7 — ACTION PLAN (execution guide)

> **Ce fichier est le point d'entree obligatoire pour executer REX v7.**
> Il resume la logique d'execution et reference les autres fichiers a lire selon le sujet.
> Chaque sous-agent doit lire CE fichier avant de coder quoi que ce soit.

**Source of truth** : `/Users/keiy/Documents/Developer/keiy/rex`
**Branche** : `main`
**Plan complet** : `docs/plans/2026-03-07-rex-v7-master-plan.md` (reference, pas obligatoire a lire)
**Addendum de cadrage** : `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md` (obligatoire avant toute implementation hub/network)
**Side plan install/optimisation** : `docs/plans/2026-03-07-rex-install-optimization-plan.md`
**Date** : 2026-03-07

---

## 0. LECTURE OBLIGATOIRE DES SOUS-AGENTS

Avant toute implementation, chaque sous-agent doit :

1. lire ce fichier `docs/plans/action.md`
2. lire `CLAUDE.md` racine
3. lire seulement les fichiers references par son bloc
4. produire pour lui-meme un resume court avant d'agir

Format de resume attendu :

- mission exacte
- fichiers autorises a modifier
- contraintes d'architecture
- tests/verifications attendus
- points encore flous a ne pas supposer

Le sous-agent ne doit pas relire tout le repo si ce n'est pas necessaire.
Il doit resumer pour lui-meme, reduire son scope, puis agir.

### Fichiers de reference minimaux

- **Toujours** :
  - `CLAUDE.md`
  - `AGENTS.md`
  - `README.md`
  - `docs/plans/action.md`
- **Si sujet architecture/reseau/hub** :
  - `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`
  - `docs/plans/2026-03-07-rex-v7-master-plan.md`
- **Si sujet install/deploy/perf** :
  - `docs/plans/2026-03-07-rex-install-optimization-plan.md`
- **Si sujet Flutter UI** :
  - `packages/flutter_app/lib/services/rex_service.dart`
  - pages Flutter concernees
- **Si sujet CLI/runtime** :
  - `packages/cli/src/index.ts`
  - modules concernes

---

## 0. PRE-FLIGHT CHECKLIST

**RIEN ne commence tant que ces 8 points ne sont pas verts.**

```bash
# 1. Repo propre
cd ~/Documents/Developer/keiy/rex
git status  # doit etre sur main, clean

# 2. Build CLI passe
pnpm build  # zero erreur

# 3. Build Flutter passe
cd packages/flutter_app && flutter build macos --debug  # zero erreur
cd ../..

# 4. Ollama running
curl -s http://localhost:11434/api/tags | jq '.models | length'  # >= 1

# 5. Rust toolchain
rustc --version   # >= 1.80
cargo --version
# Si absent: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 6. napi-rs CLI
npm list -g @napi-rs/cli 2>/dev/null || npm install -g @napi-rs/cli

# 7. VPS accessible
ssh vps "echo ok"  # doit repondre "ok" (alias Tailscale ou direct)

# 8. Disk space
df -h .  # minimum 5GB libre
```

Si un point echoue → corriger AVANT de continuer. Pas de workaround.

---

## 0bis. GARDE-FOUS D'ARCHITECTURE

Avant toute feature v7 reseau/hub, appliquer ces regles :

1. **User-owned first**. Cache, scripts, outils installes, services locaux et hardware possede avant toute depense ou quota LLM.
2. **Flutter reste l'UI operateur principale**. Pas de rewrite Next.js par defaut.
3. **Headless-first obligatoire**. Toute action critique doit aussi exister via CLI, gateway ou API.
4. **OpenClaw = inspiration de capacites, pas de design UI**.
5. **VPS = hub prefere** quand disponible, mais jamais point de perte de donnees.
6. **Zero memory loss avant sync temps reel** : journal append-only, spool offline, queue persistante, ack, replay.
7. **Tailscale first** pour joindre les nodes; auth applicative par token/JWT court.
8. **Pixel agents** = fallback machine-specific, jamais prerequis du VPS.
9. **LangGraph** = spike borne uniquement apres stabilisation de l'orchestrateur simple.
10. **Une seule API REX**. Flutter desktop et dashboard distant consomment la meme surface API.
11. **Script-first pour les routines**. Build, test, deploy, release, recovery et autres actions repetitives doivent devenir des scripts/runbooks avant d'etre rejouees manuellement.
12. **VPS = headless par defaut**. Pas d'UI Flutter requise sur VPS; CLI, daemon, gateway et API uniquement.
13. **Ordre de resolution des outils** : CLI local d'abord, MCP ensuite si utile, API ensuite, autre integration en dernier recours.
14. **Registry large, activation stricte**. Les tools externes sont connus par REX mais restent desactives par defaut; activation sur choix user ou recommandation explicite avec confirmation.
15. **Pas de doublon OSS**. Si YOLO Sandbox ou un autre composant open source gere deja correctement une couche technique, REX integre et orchestre au lieu de la reimplementer.
16. **Topologie adaptable**. Toute feature reseau/hub doit fonctionner en mode 1 machine, petit parc (2-5) et flotte large (10-30+) avec fallback degrade explicite.
17. **Gateway = continuite**. Les messages, taches, observations et notifications de gateway doivent etre journalises et rejouables; repondre plus tard est acceptable, perdre ne l'est pas.

Si une implementation viole un de ces points, elle doit etre reframee avant coding.

---

## 1. INTERFACES PARTAGEES (creer AVANT tout agent)

Creer `packages/cli/src/interfaces/` avec les types partages. **Tous les agents importent depuis ce dossier.** Aucun agent ne redefinit ces types.

### Fichier : `packages/cli/src/interfaces/provider.ts`

```typescript
export interface ProviderAdapter {
  name: string;
  type: 'free' | 'paid-cheap' | 'paid-premium' | 'paid-max' | 'local';
  enabled: boolean;
  priority: number;

  health(): Promise<{ ok: boolean; latencyMs: number }>;
  generate(prompt: string, opts?: GenerateOpts): Promise<GenerateResult>;
  stream(prompt: string, opts?: GenerateOpts): AsyncGenerator<string>;
}

export interface GenerateOpts {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  taskType?: TaskType;
  systemPrompt?: string;
}

export interface GenerateResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
}

export type TaskType =
  | 'embed' | 'classify' | 'summarize' | 'code' | 'review'
  | 'architecture' | 'debug' | 'security' | 'pr' | 'commit'
  | 'voice' | 'gateway' | 'background';
```

### Fichier : `packages/cli/src/interfaces/backend.ts`

```typescript
export interface BackendRunner {
  name: string;
  type: 'agent-sdk' | 'openai-sdk' | 'pipe' | 'ollama';
  available(): Promise<boolean>;
  chat(message: string, sessionId: string): AsyncGenerator<string>;
  endSession(sessionId: string): void;
}
```

### Fichier : `packages/cli/src/interfaces/gateway.ts`

```typescript
export interface GatewayAdapter {
  name: string;
  platform: 'telegram' | 'discord' | 'slack' | 'web';
  sessionId: string;

  start(): Promise<void>;
  stop(): void;
  sendMessage(chatId: string, text: string): Promise<void>;
  editMessage(chatId: string, msgId: string, text: string): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
}

export interface InboundMessage {
  chatId: string;
  text: string;
  from: string;
  platform: string;
  timestamp: number;
}

export type AdapterFactory = (config: Record<string, unknown>) => GatewayAdapter | null;
```

### Fichier : `packages/cli/src/interfaces/memory.ts`

```typescript
export interface Embedder {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface MemoryStore {
  search(query: string, limit?: number): Promise<MemoryResult[]>;
  add(item: MemoryItem): Promise<void>;
  delete(id: string): Promise<void>;
  stats(): Promise<MemoryStats>;
}

export interface MemoryResult {
  id: string;
  text: string;
  score: number;
  category?: string;
  createdAt: string;
}

export interface MemoryItem {
  text: string;
  source: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStats {
  totalChunks: number;
  totalCategories: number;
  pendingChunks: number;
  dbSizeBytes: number;
}
```

### Fichier : `packages/cli/src/interfaces/sync.ts`

```typescript
export interface SyncMessage {
  id: string;
  type: 'memory' | 'config' | 'task' | 'observation' | 'file';
  source: string;       // node ID
  target: string;       // node ID ou '*' (broadcast)
  payload: unknown;
  timestamp: number;    // Unix ms
  ack?: boolean;
}

export interface SyncNode {
  id: string;
  name: string;
  role: 'hub' | 'node' | 'gpu-node';
  lastSeen: number;
  online: boolean;
}
```

### Fichier : `packages/cli/src/interfaces/index.ts`

```typescript
export * from './provider.js';
export * from './backend.js';
export * from './gateway.js';
export * from './memory.js';
export * from './sync.js';
```

**Action** : creer ces 6 fichiers dans `packages/cli/src/interfaces/`. Commit : `feat(interfaces): add shared v7 type definitions`.

---

## 2. SCAFFOLD RUST (creer AVANT Batch 3)

### 2a. `packages/embed-rs/` — Embeddings natifs

```bash
mkdir -p packages/embed-rs
cd packages/embed-rs
napi new --name @rex/embed-rs --targets x86_64-apple-darwin,aarch64-apple-darwin,x86_64-unknown-linux-gnu
```

**Cargo.toml** minimal :
```toml
[package]
name = "rex-embed-rs"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async"] }
napi-derive = "2"
fastembed = "5"

[build-dependencies]
napi-build = "2"
```

**src/lib.rs** :
```rust
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub async fn embed(text: String) -> Result<Vec<f64>> {
    let model = TextEmbedding::try_new(InitOptions {
        model_name: EmbeddingModel::NomicEmbedTextV15,
        show_download_progress: false,
        ..Default::default()
    }).map_err(|e| Error::from_reason(format!("embed init: {e}")))?;

    let embeddings = model.embed(vec![text], None)
        .map_err(|e| Error::from_reason(format!("embed run: {e}")))?;

    Ok(embeddings[0].iter().map(|&x| x as f64).collect())
}

#[napi]
pub fn dimensions() -> u32 {
    768 // nomic-embed-text-v1.5
}
```

**package.json** :
```json
{
  "name": "@rex/embed-rs",
  "version": "0.1.0",
  "napi": {
    "name": "embed-rs",
    "triples": {
      "defaults": true,
      "additional": ["aarch64-apple-darwin"]
    }
  },
  "scripts": {
    "build": "napi build --release",
    "test": "node -e \"const m = require('./index.js'); m.embed('test').then(v => console.log('dims:', v.length))\""
  }
}
```

### 2b. `crates/rex-sync/` — Sync server Rust

```bash
mkdir -p crates/rex-sync/src
```

**crates/rex-sync/Cargo.toml** :
```toml
[package]
name = "rex-sync"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
rusqlite = { version = "0.32", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

**crates/rex-sync/src/main.rs** (skeleton) :
```rust
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tracing::{info, error};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let addr = "0.0.0.0:3118";
    let listener = TcpListener::bind(addr).await?;
    info!("rex-sync listening on {addr}");

    while let Ok((stream, peer)) = listener.accept().await {
        tokio::spawn(async move {
            match accept_async(stream).await {
                Ok(ws) => {
                    info!("New connection from {peer}");
                    // TODO: handle_connection(ws).await
                }
                Err(e) => error!("WebSocket error from {peer}: {e}"),
            }
        });
    }

    Ok(())
}
```

**Action** : creer ces fichiers. Commit : `chore: scaffold Rust packages (embed-rs + rex-sync)`.

---

## 3. BATCHES D'EXECUTION

### BATCH 1 — LE CERVEAU (4 agents paralleles)

**Quand** : immediatement apres section 1 (interfaces) commitee.
**Duree** : 5-7 jours.
**Commande** :

```bash
# Creer les worktrees
git worktree add ../rex-b1-router  -b feat/bloc-1-router
git worktree add ../rex-b1-cache   -b feat/bloc-1-cache
git worktree add ../rex-b1-memory  -b feat/bloc-3-memory
git worktree add ../rex-b1-daemon  -b feat/bloc-7-daemon
```

#### Agent-Router (worktree `rex-b1-router`)

**Mission** : Provider Mesh — routing intelligent multi-provider et multi-ressource.

**Fichiers a creer** :
- `packages/cli/src/providers.ts` — ProviderAdapter implementations (8 free + Ollama + paid stubs)
- `packages/cli/src/budget.ts` — table `token_usage`, `rex budget` CLI
- `packages/cli/src/resource_inventory.ts` — scripts, outils, services, machines, quotas detectes
- Refactor `packages/cli/src/router.ts` — importer depuis interfaces, supporter les providers

**Le sous-agent commence par se resumer** :
- mission : router par ressource avant de router par provider
- fichiers : `providers.ts`, `budget.ts`, `resource_inventory.ts`, `router.ts`
- contraintes : owned-first, free-first, VPS headless, une seule API
- verification : tests unitaires routing + `pnpm build`

**Schema SQL** (dans `packages/memory/src/migrations/003_providers.sql`) :
```sql
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost_usd REAL DEFAULT 0,
  latency_ms INTEGER,
  task_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_usage_provider ON token_usage(provider, created_at);
CREATE INDEX idx_usage_date ON token_usage(created_at);
```

**Tests** (`packages/cli/tests/providers.test.ts`) :
- Provider health check mock
- Routing selection par task type
- Fallback chain (provider A fail → B)
- Resource-first selection (script/local tool -> local node -> free -> paid)
- Budget tracking insert + query

**Definition of Done** :
- [ ] `pnpm build` passe
- [ ] 8 free providers implementes (health + generate stubs)
- [ ] Le routeur explique pourquoi une ressource possedee a ete choisie avant un provider payant
- [ ] `rex budget` affiche les stats
- [ ] `rex providers health` affiche le status
- [ ] Tests passent (`vitest run packages/cli/tests/providers.test.ts`)

**Commandes CLI a ajouter dans index.ts** :
```
rex providers health    # check tous les providers
rex providers list      # liste enable/disable + priority
rex budget              # consommation du mois
rex budget --daily      # par jour
rex resources           # inventaire scripts/outils/services/machines/quotas detectes
```

---

#### Agent-Cache (worktree `rex-b1-cache`)

**Mission** : Semantic Cache — reponses LLM cachees par similarite cosine.

**Fichiers a creer** :
- `packages/cli/src/cache.ts` — SemanticCache class
- Migration SQL `packages/memory/src/migrations/004_cache.sql`

**Schema SQL** :
```sql
CREATE TABLE IF NOT EXISTS llm_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_hash TEXT UNIQUE NOT NULL,
  prompt_embedding BLOB NOT NULL,
  response TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT,
  tokens_saved INTEGER DEFAULT 0,
  hit_count INTEGER DEFAULT 0,
  ttl_hours INTEGER DEFAULT 168,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_cache_hash ON llm_cache(prompt_hash);
CREATE INDEX idx_cache_ttl ON llm_cache(created_at, ttl_hours);
```

**Logique** :
```typescript
// cache.ts — schema
export class SemanticCache {
  constructor(private db: Database, private embedder: Embedder) {}

  async lookup(prompt: string, threshold = 0.95): Promise<string | null> {
    const embedding = await this.embedder.embed(prompt);
    // vec_distance_cosine avec sqlite-vec
    // Si score > threshold → return response + increment hit_count
    // Sinon → null
  }

  async store(prompt: string, response: string, model: string, taskType: string): Promise<void> {
    // Hash + embed + insert
  }

  async invalidate(olderThanHours?: number): Promise<number> {
    // DELETE WHERE created_at < datetime('now', '-{ttl} hours')
  }

  async stats(): Promise<{ entries: number; hitRate: number; tokensSaved: number }> {
    // Aggregate query
  }
}
```

**Tests** :
- Cache miss → null
- Cache hit → retourne response, incremente hit_count
- TTL expiration → auto-purge
- Stats accuracy

**Definition of Done** :
- [ ] `pnpm build` passe
- [ ] `rex cache stats` CLI fonctionne
- [ ] Tests passent
- [ ] Cache integre dans le routing (si SemanticCache.lookup hit → skip provider)

---

#### Agent-Memory (worktree `rex-b1-memory`)

**Mission** : Observational Memory — apprendre automatiquement des sessions.

**Fichiers a creer** :
- `packages/cli/src/observer.ts` — hook SessionEnd, extrait observations
- `packages/cli/src/reflector.ts` — daemon cycle, consolide observations en regles
- Refactor `packages/memory/src/embed.ts` — implementer interface `Embedder`

**Le sous-agent commence par se resumer** :
- mission : retenir echecs ET succes/runbooks
- fichiers : `observer.ts`, `reflector.ts`, `embed.ts`, fichiers memory associes
- contraintes : pas de perte, categories success/runbook/deploy/workflow, reinjection utile
- verification : tests observations + `pnpm build`

**Schema SQL** (migration `005_observations.sql`) :
```sql
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('decision','pattern','error','solution','preference','blocker','success','runbook','deploy','workflow','machine-profile')),
  content TEXT NOT NULL,
  embedding BLOB,
  confidence REAL DEFAULT 0.5,
  occurrences INTEGER DEFAULT 1,
  promoted_to_rule BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_obs_type ON observations(type);
CREATE INDEX idx_obs_confidence ON observations(confidence DESC);
```

**Observer** (hook SessionEnd) :
```typescript
// observer.ts
export async function observeSession(sessionLog: string): Promise<Observation[]> {
  // 1. Envoyer le log session a un LLM local (qwen3.5:9b ou haiku)
  // 2. Prompt : "Extrais les decisions, patterns, erreurs, solutions ET succes reproductibles de cette session"
  // 3. Parser le JSON retourne
  // 4. Embedder chaque observation
  // 5. Dedup par cosine > 0.90 (update occurrences au lieu d'insert)
  // 6. Insert dans observations table
}
```

**Reflector** (cycle daemon) :
```typescript
// reflector.ts
export async function reflect(): Promise<void> {
  // 1. Charger les observations avec occurrences >= 3 et confidence > 0.7
  // 2. Grouper par type
  // 3. Pour chaque groupe, generer une "regle candidate"
  // 4. Si la regle candidate a > 5 occurrences → promouvoir en fichier ~/.claude/rules/
  // 5. Logger les actions
}
```

**Tests** :
- Observer extrait les bons types d'observations
- Dedup fonctionne (2 observations similaires → 1 avec occurrences=2)
- Reflector promouvoit les observations frequentes
- Embedder interface respectee (Ollama backend)

**Definition of Done** :
- [ ] `pnpm build` passe
- [ ] Observer installe comme hook SessionEnd
- [ ] `rex observations` CLI liste les observations
- [ ] Reflector tourne dans le daemon
- [ ] Tests passent
- [ ] `Embedder` interface implementee pour Ollama (futur : Rust via napi-rs)
- [ ] Les succes/runbooks sont distingues des erreurs/lessons et reinjectables au bon moment

---

#### Agent-Daemon (worktree `rex-b1-daemon`)

**Mission** : Daemon event-driven — remplacer les crons par un event system.

**Fichiers a modifier** :
- Refactor `packages/cli/src/daemon.ts` — event queue + scheduled tasks

**Architecture** :
```typescript
// daemon.ts refactor
interface DaemonEvent {
  type: 'file-change' | 'schedule' | 'network' | 'health' | 'user';
  source: string;
  data: unknown;
  timestamp: number;
}

interface ScheduledTask {
  name: string;
  interval: string;  // cron expression
  enabled: boolean;
  handler: () => Promise<void>;
  lastRun?: number;
  failures: number;
}

// Event queue
const eventQueue: DaemonEvent[] = [];

// Scheduled tasks (remplacent les LaunchAgents)
const tasks: ScheduledTask[] = [
  { name: 'ingest',     interval: '0 * * * *',  enabled: true, handler: runIngest, failures: 0 },
  { name: 'categorize', interval: '30 * * * *', enabled: true, handler: runCategorize, failures: 0 },
  { name: 'health',     interval: '*/15 * * *', enabled: true, handler: runHealthCheck, failures: 0 },
  { name: 'reconcile',  interval: '*/10 * * * *', enabled: true, handler: runReconcilePending, failures: 0 },
  { name: 'organize',   interval: '15 * * * *', enabled: true, handler: runBackgroundOrganize, failures: 0 },
  { name: 'reflect',    interval: '0 3 * * *',  enabled: true, handler: runReflect, failures: 0 },
  { name: 'prune',      interval: '0 4 * * 0',  enabled: true, handler: runPrune, failures: 0 },
];

// Circuit breaker : 3 fails → pause 5min
```

**Tests** :
- Event queue processing
- Scheduled task execution + cron parsing
- Circuit breaker (3 fails → pause → resume)
- Graceful shutdown
- Pending reconcile / replay logic
- Background organize logic sans perte

**Definition of Done** :
- [ ] `pnpm build` passe
- [ ] `rex daemon` lance le nouveau daemon event-driven
- [ ] Toutes les anciennes taches LaunchAgent fonctionnent via le scheduler
- [ ] `reconcile` rejoue les elements pending des qu'un backend/node redevient sain
- [ ] `organize` peut classer/consolider avec scripts, local LLM ou free tier sans bloquer le systeme
- [ ] Circuit breaker teste
- [ ] Tests passent

---

### MERGE BATCH 1

```bash
# Apres tous les agents Done :
cd ~/Documents/Developer/keiy/rex

# Merge dans l'ordre (resolver les conflits index.ts a la main)
git merge feat/bloc-1-router   --no-ff -m "feat(router): provider mesh with 8 free providers and budget tracking"
git merge feat/bloc-1-cache    --no-ff -m "feat(cache): semantic LLM cache with cosine similarity"
git merge feat/bloc-3-memory   --no-ff -m "feat(memory): observational memory with observer and reflector"
git merge feat/bloc-7-daemon   --no-ff -m "feat(daemon): event-driven daemon with scheduled tasks"

# Valider
pnpm build && pnpm test

# Cleanup worktrees
git worktree remove ../rex-b1-router
git worktree remove ../rex-b1-cache
git worktree remove ../rex-b1-memory
git worktree remove ../rex-b1-daemon
```

---

### BATCH 2 — LA DEFENSE (3 agents paralleles)

**Quand** : apres Batch 1 merged.
**Duree** : 3-5 jours.

```bash
git worktree add ../rex-b2-review   -b feat/bloc-5-review
git worktree add ../rex-b2-security -b feat/bloc-5-security
git worktree add ../rex-b2-guards   -b feat/bloc-6-guards
```

#### Agent-Review

**Mission** : `rex review` — pipeline lint + security + AI review.

**Fichier** : `packages/cli/src/review.ts`

**Pipeline** :
```
1. biome lint (--reporter json)
2. tsc --noEmit (type check)
3. gitleaks detect (secrets)
4. semgrep scan (vulnerabilites)
5. osv-scanner (deps)
6. Tests existants (npm test)
7. AI review via LLM (Cerebras ou Sonnet)
8. Rapport agrege → terminal + JSON
```

Chaque etape retourne `{ pass: boolean; findings: Finding[]; durationMs: number }`.
Le pipeline est configurable (enable/disable chaque etape dans config.json).

**CLI** : `rex review` (staged changes), `rex review --all` (tout le projet), `rex review --pre-push` (hook).

**DoD** : pipeline fonctionne, `rex review` affiche rapport, tests.

---

#### Agent-Security

**Mission** : outils security standalone.

**Fichier** : `packages/cli/src/security.ts`

**Outils** :
- Gitleaks : `gitleaks detect --source . --report-format json`
- TruffleHog : `trufflehog filesystem . --json`
- OSV-Scanner : `osv-scanner --lockfile package-lock.json`
- Semgrep : `semgrep scan --config auto --json`

Chaque outil wrappe dans une fonction async qui retourne des `Finding[]`.
Installation auto si absent (`which gitleaks || brew install gitleaks`).

**CLI** : `rex security scan`, `rex security install` (installe les outils manquants).

**DoD** : 4 outils integres, `rex security scan` fonctionne, tests.

---

#### Agent-Guards

**Mission** : 7 nouveaux guards dans `~/.claude/rex-guards/`.

**Guards a creer** :

| Guard | Trigger | Action |
|-------|---------|--------|
| `secret-leak-guard.sh` | PostToolUse:Write/Edit | Scanne le fichier pour patterns secrets (API keys, tokens) |
| `any-type-guard.sh` | PostToolUse:Write/Edit | Detecte `any` dans les fichiers .ts |
| `force-push-guard.sh` | PreToolUse:Bash | Bloque `git push --force` sauf sur branches perso |
| `large-file-guard.sh` | PostToolUse:Write | Warn si fichier > 500KB |
| `env-commit-guard.sh` | PreToolUse:Bash | Bloque `git add .env` ou `git add *secret*` |
| `console-log-guard.sh` | PostToolUse:Write/Edit | Warn si `console.log` ajoute dans du code non-debug |
| `todo-limit-guard.sh` | PostToolUse:Write/Edit | Warn si > 20 TODOs dans le projet |

Chaque guard : bash script, < 50 lignes, exit 0 (pass) ou exit 2 (block) ou echo warning.

**DoD** : 7 guards crees, testes manuellement, registres dans settings.json hooks.

---

### MERGE BATCH 2

```bash
git merge feat/bloc-5-review   --no-ff -m "feat(review): code review pipeline with 7 stages"
git merge feat/bloc-5-security --no-ff -m "feat(security): gitleaks, trufflehog, osv-scanner, semgrep integration"
git merge feat/bloc-6-guards   --no-ff -m "feat(guards): 7 new guards (secrets, types, force-push, large-file, env, console, todo)"
pnpm build && pnpm test
# Cleanup worktrees
```

---

### BATCH 3 — LE RESEAU + RUST (4 agents paralleles)

**Quand** : apres Batch 2 merged.
**Duree** : 7-10 jours (le plus gros batch).

```bash
git worktree add ../rex-b3-network  -b feat/bloc-9-network
git worktree add ../rex-b3-sync     -b feat/sync-server
git worktree add ../rex-b3-embed    -b feat/embed-rs
git worktree add ../rex-b3-docker   -b feat/bloc-9-docker
```

#### Agent-Network

**Mission** : Hub API REST + node registration.

**Fichiers** : `packages/cli/src/hub.ts`, `packages/cli/src/node.ts`

**API REST** (port 3117) :
```
POST   /api/v1/nodes/register     { id, name, role, capabilities }
GET    /api/v1/nodes               Liste des nodes
POST   /api/v1/nodes/:id/heartbeat
POST   /api/v1/tasks/queue         Enqueue une tache
GET    /api/v1/tasks/pending       Taches en attente pour ce node
POST   /api/v1/tasks/:id/complete  Marquer tache terminee
GET    /api/v1/health              Status hub
```

Utiliser le built-in `node:http` (pas de framework, le hub est simple).
Auth : JWT token genere par `rex network init`, valide par le hub.

**CLI** :
```
rex network init      # generer JWT + config hub
rex network status    # afficher les nodes connectes
rex network join      # rejoindre un hub existant (saisir hub URL + token)
```

**DoD** : Hub demarre, node s'enregistre, heartbeat fonctionne, tests API.

---

#### Agent-Sync

**Mission** : WebSocket sync + SQLite queue.

**Fichiers** : `packages/cli/src/sync.ts`, `packages/cli/src/sync-queue.ts`

**Le sync Node.js** (pas le Rust standalone — celui-ci vient en Phase 6 comme optimisation) :

```typescript
// sync.ts
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 3118 });
const clients = new Map<string, WebSocket>();  // nodeId → ws

wss.on('connection', (ws, req) => {
  // Auth : verifier JWT dans le header
  // Register le node
  // Sur message : router vers le bon handler
  // Sur close : marquer offline, queue les messages
});
```

**Queue** (migration `006_sync_queue.sql`) :
```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  source_node TEXT NOT NULL,
  target_node TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  delivered_at TEXT,
  ack_at TEXT
);
CREATE INDEX idx_queue_target ON sync_queue(target_node, delivered_at);
CREATE INDEX idx_queue_pending ON sync_queue(delivered_at) WHERE delivered_at IS NULL;
```

**Catch-up** : quand un node se reconnecte, le hub envoie tous les messages non-delivered pour ce node.

**CLI** :
```
rex sync status       # afficher queue size, nodes online
rex sync flush        # forcer l'envoi des messages queues
```

**DoD** : WebSocket server fonctionne, messages queues si offline, catch-up au reconnect, tests.

---

#### Agent-Embed-RS

**Mission** : Embeddings Rust natifs via napi-rs.

**Dossier** : `packages/embed-rs/` (scaffold de la section 2a)

**Taches** :
1. Implementer `embed()` et `embedBatch()` en Rust via fastembed
2. Creer un wrapper TypeScript (`packages/embed-rs/index.ts`) qui expose l'interface `Embedder`
3. Fallback : si le build napi echoue, retourner l'implementation Ollama existante
4. Benchmark : comparer Rust vs Ollama API (temps par chunk)

```typescript
// packages/embed-rs/index.ts
import type { Embedder } from '../cli/src/interfaces/memory.js';

let nativeModule: any;
try {
  nativeModule = require('./rex-embed-rs.node');
} catch {
  nativeModule = null;
}

export class RustEmbedder implements Embedder {
  name = 'fastembed-rs';
  dimensions = 768;

  async embed(text: string): Promise<Float32Array> {
    if (!nativeModule) throw new Error('Native module not available, use OllamaEmbedder');
    const arr = await nativeModule.embed(text);
    return new Float32Array(arr);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

export function isRustAvailable(): boolean {
  return nativeModule !== null;
}
```

**DoD** : `cargo build --release` passe, `npm run test` embed retourne 768 dimensions, benchmark documente.

---

#### Agent-Docker

**Mission** : Dockeriser REX pour le VPS.

**Fichiers** : `docker/Dockerfile`, `docker/docker-compose.yml`, `docker/.env.example`

**Dockerfile** (multi-stage) :
```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json packages/cli/
COPY packages/core/package.json packages/core/
COPY packages/memory/package.json packages/memory/
RUN corepack enable && pnpm install --frozen-lockfile
COPY packages/ packages/
RUN pnpm build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/packages/cli/dist ./dist
COPY --from=builder /app/packages/cli/package.json .
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3117 3118
CMD ["node", "dist/index.js", "daemon"]
```

**docker-compose.yml** :
```yaml
services:
  rex-hub:
    build: .
    ports:
      - "3117:3117"  # API REST
      - "3118:3118"  # WebSocket sync
    volumes:
      - rex-data:/root/.claude/rex
    environment:
      - OLLAMA_URL=http://ollama:11434
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-data:/root/.ollama
    restart: unless-stopped

volumes:
  rex-data:
  ollama-data:
```

**CLI** : `rex init --docker` genere les fichiers Docker dans le projet courant.

**DoD** : `docker compose build` passe, `docker compose up` lance hub + ollama, tests smoke.

---

### MERGE BATCH 3

```bash
git merge feat/bloc-9-network  --no-ff -m "feat(network): hub API REST with node registration and JWT auth"
git merge feat/sync-server     --no-ff -m "feat(sync): WebSocket sync server with SQLite queue and catch-up"
git merge feat/embed-rs        --no-ff -m "feat(embed): native Rust embeddings via fastembed-rs + napi-rs"
git merge feat/bloc-9-docker   --no-ff -m "feat(docker): Dockerfile multi-stage + docker-compose for VPS deployment"
pnpm build && pnpm test
```

---

### BATCH 4 — ORCHESTRATEUR + GATEWAY + MCP (4 agents paralleles)

**Quand** : apres Batch 3 merged.
**Duree** : 7-10 jours.

```bash
git worktree add ../rex-b4-orchestrator -b feat/bloc-2-orchestrator
git worktree add ../rex-b4-gateway      -b feat/bloc-17-gateway
git worktree add ../rex-b4-mcp          -b feat/bloc-15-mcp
git worktree add ../rex-b4-cli          -b feat/bloc-14-cli
```

#### Agent-Orchestrator

**Mission** : BackendRunner implementations (Agent SDK, OpenAI SDK, pipe, Ollama).

**Fichiers** : `packages/cli/src/orchestrator.ts`, `packages/cli/src/backend-runner.ts`

**Le sous-agent commence par se resumer** :
- mission : choisir le meilleur backend deja possede avant les backends couteux
- fichiers : `orchestrator.ts`, `backend-runner.ts`
- contraintes : local/owned -> free -> subscription/sdk -> pipe
- verification : fallback teste + `rex delegate` smoke test

Implementer l'interface `BackendRunner` pour chaque backend :
- `AgentSdkRunner` — `@anthropic-ai/claude-agent-sdk`, multi-turn, streaming
- `OpenAiSdkRunner` — `openai` npm, streaming
- `ClaudePipeRunner` — `claude -p`, single-turn fallback
- `CodexPipeRunner` — `codex -p`, single-turn fallback
- `OllamaRunner` — HTTP API `/api/chat`, streaming

`rex delegate` analyse la complexite et choisit le backend.
Fallback chain : ressource locale suffisante → hardware possede → free providers → subscription/quota → pipe fallback → erreur explicite.

**DoD** : tous les runners implementes, `rex delegate "test task"` fonctionne, fallback teste.

---

#### Agent-Gateway

**Mission** : Rewrite complet du gateway avec Agent SDK + adapter registry.

**Fichiers** : rewrite `packages/cli/src/gateway.ts` + creer `packages/cli/src/adapters/telegram.ts`

**Architecture** :
```
gateway.ts (core)
  ├── adapter registry (Map<string, AdapterFactory>)
  ├── backend registry (Map<string, BackendRunner>)
  ├── streamToAdapter() — streaming unifie tous backends
  ├── command router (mode, delegate, session, reset, help)
  └── fallback chain (local/owned → free → subscription/sdk → pipe → erreur)

adapters/telegram.ts — implementation GatewayAdapter pour Telegram
adapters/index.ts — auto-register tous les adapters
```

**IMPORTANT** : le gateway actuel (2323 lignes) est un monolithe. Le rewrite :
1. Garde la logique Telegram existante dans `adapters/telegram.ts`
2. Extrait le backend switching dans des `BackendRunner` (importe depuis orchestrator)
3. Le streaming utilise `AsyncGenerator<string>` commun a tous les backends

**Le sous-agent commence par se resumer** :
- mission : gateway unifie sur la meme logique de resource routing
- fichiers : `gateway.ts`, `adapters/telegram.ts`, `adapters/index.ts`
- contraintes : pas de logique web-only, headless usable, fallback explicite
- verification : Telegram + 2 backends + `pnpm build`
4. Les commandes sont dans un `Map<string, CommandHandler>`

**DoD** : gateway fonctionne avec Telegram + au moins 2 backends (Ollama + Agent SDK ou pipe), tests.

---

#### Agent-MCP

**Mission** : MCP Hub centralise les integrations sans perdre le controle operateur.

**Fichiers** : refactor `packages/cli/src/mcp_registry.ts` + creer `packages/cli/src/mcp_hub.ts` + ajuster `packages/cli/src/preload.ts` si necessaire

**Le sous-agent commence par se resumer** :
- mission : registry MCP large mais gouverne, compatible avec le resource routing REX
- fichiers : `mcp_registry.ts`, `mcp_hub.ts`, `preload.ts`, commandes MCP liees
- contraintes : outils externes desactives par defaut, CLI-first puis MCP puis API, recommandations explicables, pas d'auto-enable silencieux
- verification : `pnpm build`, tests MCP, `rex mcp list`, `rex mcp auto`, `rex mcp scan`

- Integration mcporter si disponible, sinon mode direct (MCP SDK)
- Auto-selection par stack = **recommandation**, pas activation silencieuse (detecte dans `preload.ts` → propose les bons MCPs)
- `mcp-scan` integration pour security check
- FastMCP custom tools REX (memory-search, delegate, observe)
- Registry broad inspire d'OpenClaw + complete pour REX : filesystem, GitHub, Context7, Playwright, Fetch/Brave/Firecrawl, SQLite/Postgres, Google Workspace, Cloudflare, Slack, Linear, Notion, Sentry, Grafana, etc.
- Etat par defaut :
  - tools REX internes et locaux safe = activables immediatement
  - integrations externes = `disabled` tant que l'user n'a pas valide
- Ordre de resolution attendu pour une capacite :
  1. wrapper CLI local si l'outil existe deja
  2. MCP si ca apporte une valeur structuree claire
  3. API directe si MCP n'apporte rien ou n'existe pas
  4. autre adaptation seulement en dernier recours

**CLI existantes** a enrichir :
```
rex mcp list       # + indicateur "recommended for current project"
rex mcp check      # + mcp-scan security report
rex mcp hub start  # lance le hub MCP (mcporter daemon)
rex mcp enable <name>   # activation explicite
rex mcp disable <name>  # retour a l'etat safe
rex mcp auto            # propose les outils pertinents pour le projet courant
```

**DoD** : registry large documente, suggestions par stack fonctionnent sans auto-enable, mcp-scan integre, priorite CLI/MCP/API respectee, tests.

---

#### Agent-CLI

**Mission** : Menu interactif + workflows + --json output.

**Fichiers** : `packages/cli/src/menu.ts`, `packages/cli/src/workflow.ts`

**Menu** : `rex` sans argument → menu interactif (inquirer/prompts) :
```
? Que veux-tu faire ?
> Doctor         (health check)
  Review         (code review pipeline)
  Delegate       (envoyer une tache)
  Memory         (search / stats)
  Gateway        (start / status)
  Agents         (list / run)
  Budget         (consommation)
  Settings       (ouvrir config)
```

**Workflows** (`rex workflow <name>`) :
- `new-feature` : branch → implement → review → PR
- `bug-fix` : identify → fix → test → PR
- `deploy` : review → build → test → deploy → notify

**Regle** :
- si un workflow repetitif existe deja en script/runbook, le workflow doit le reutiliser au lieu de re-faire la sequence a la main
- build, test et deploy doivent preferer des scripts explicites du projet quand ils existent

**--json** : toutes les commandes supportent `--json` pour output machine-readable.

**DoD** : menu fonctionne, 3 workflows, --json sur les commandes principales, tests.

---

### MERGE BATCH 4

Meme process que les precedents. **Attention** : `gateway.ts` est un rewrite complet — bien tester avant merge.

---

### BATCH 5 — FLUTTER + COACHING (3 agents paralleles)

**Quand** : apres Batch 4 merged.
**Duree** : 5-7 jours.

```bash
git worktree add ../rex-b5-flutter-core  -b feat/flutter-core
git worktree add ../rex-b5-flutter-extra -b feat/flutter-extra
git worktree add ../rex-b5-coaching      -b feat/bloc-16-coaching
```

#### Agent-Flutter-Core

**Pages** :
- `network_page.dart` — nodes connectes, sync status, queue size, WebSocket indicator
- `providers_page.dart` — provider list toggle, quota bars, routing chain visualisation, budget graph

**Le sous-agent commence par se resumer** :
- mission : surface de pilotage Flutter pour desktop aujourd'hui, mobile secondaire plus tard
- fichiers : pages Flutter de son scope + `packages/flutter_app/lib/services/rex_service.dart` si necessaire
- contraintes : macOS-first aujourd'hui, cible macOS/Windows/Linux ensuite; iPhone/Android seulement comme telecommande future via la meme API; l'UI pilote sans etre requise sur VPS
- verification : `flutter build macos --debug`

#### Agent-Flutter-Extra

**Pages** :
- `review_page.dart` — lancer `rex review`, afficher rapport, historique
- `sandbox_page.dart` — status sandbox, logs, profils actifs et provenance du runtime (YOLO/Anthropic/autre)

**Le sous-agent commence par se resumer** :
- mission : enrichir l'UI sans en faire une dependance systeme
- fichiers : pages Flutter de son scope + `packages/flutter_app/lib/services/rex_service.dart` si necessaire
- contraintes : API unique REX, dashboard distant secondaire, mobile futur seulement consommateur de l'API, aucune logique critique uniquement dans l'UI
- verification : `flutter build macos --debug`

#### Agent-Coaching

**Fichier** : `packages/cli/src/coaching.ts`
- Honesty guard : detecte quand l'agent invente (hallucination check)
- Tech debt tracker : scanne TODO/FIXME/HACK, score par fichier
- Self-improve extension : enrichir le self-improve existant avec les observations

---

### BATCH 6 — DEPLOY + POLISH (Kevin + agents)

**Quand** : apres Batch 5 merged.
**Duree** : 3-5 jours.

1. **Kevin** : deploy Docker sur VPS, connecter Mac comme node
2. **Agent-Docs** : README v7, installation guide, migration v6→v7
3. **Agent-Test** : tests E2E (Mac → VPS sync, offline queue, gateway multi-backend)
4. **Agent-Bun** (optionnel) : `bun build --compile` pour distribution binaire

---

## 4. REGLES POUR CHAQUE AGENT

Coller ce bloc dans le prompt de CHAQUE agent lance :

```
## REGLES AGENT REX v7

1. Tu travailles dans un GIT WORKTREE isole. Ne touche JAMAIS aux fichiers hors de ton scope.
2. Importe les types UNIQUEMENT depuis `packages/cli/src/interfaces/`.
3. Ne redeclare JAMAIS un type qui existe dans interfaces/.
4. Ecris des TESTS pour chaque fonction publique. Utilise vitest.
5. `pnpm build` DOIT passer avant de declarer "done".
6. Ajoute tes commandes CLI dans un fichier `<ton-module>.commands.ts`, PAS dans index.ts directement.
7. Utilise `createLogger('<ton-module>')` de `logger.ts` pour le logging.
8. SQL : requetes parametrees UNIQUEMENT. Jamais de concatenation.
9. Gere les erreurs : try/catch sur tout I/O, messages clairs, pas de crash silencieux.
10. Config : lis depuis `loadConfig()` de `config.ts`. N'invente pas de nouveau fichier config.
11. Convention commits : `feat(scope): description` ou `fix(scope): description`.
12. NE MENTIONNE JAMAIS Claude, AI, ou un assistant dans les commits/PR.
13. Si tu bloques > 15min sur un probleme, ARRETE et decris le probleme dans un fichier BLOCKERS.md.

Plan complet si besoin de contexte : docs/plans/2026-03-07-rex-v7-master-plan.md
Interfaces : packages/cli/src/interfaces/
Config : packages/cli/src/config.ts
Logger : packages/cli/src/logger.ts
Paths : packages/cli/src/paths.ts
```

---

## 5. ANTI-PATTERNS — CE QUI VA FOIRER SI ON NE FAIT PAS ATTENTION

| Piege | Prevention |
|-------|-----------|
| 2 agents modifient `index.ts` → conflit merge | Chaque agent cree `<module>.commands.ts`, le Lead merge les imports |
| Agent SDK pas encore dispo (npm private beta) | Tester `npm install @anthropic-ai/claude-agent-sdk` d'abord. Si echec → implementer uniquement pipe + Ollama |
| napi-rs build echoue sur CI/VPS Linux | Fournir des binaires pre-build OU fallback Ollama embeddings |
| WebSocket sur Tailscale instable | Heartbeat toutes les 30s + reconnect automatique avec backoff |
| SQLite concurrent write dans sync queue | WAL mode + retry on SQLITE_BUSY (max 5 retries, 100ms backoff) |
| Bun compile incompatible better-sqlite3 | Tester AVANT de s'engager. Fallback : `node --experimental-sea` ou npm classique |
| Gateway rewrite casse Telegram existant | Garder `gateway.ts.backup` AVANT le rewrite. Test Telegram end-to-end avant merge. |
| `pnpm build` casse apres merge | Toujours merger un agent a la fois, build entre chaque merge |
| Memory DB migration echoue | Toutes les migrations sont idempotentes (`CREATE TABLE IF NOT EXISTS`) |
| Agent tourne en boucle sans finir | Timeout 2h par agent. Si pas fini → arreter, analyser, relancer avec scope reduit |

---

## 6. VALIDATION FINALE (avant npm publish v7)

```bash
# 1. Build complet
pnpm build  # zero erreur

# 2. Tests
pnpm test   # tous passent

# 3. Flutter
cd packages/flutter_app && flutter build macos --debug && cd ../..

# 4. Docker
cd docker && docker compose build && docker compose up -d
sleep 10
curl http://localhost:3117/api/v1/health  # { "ok": true }
docker compose down && cd ..

# 5. CLI smoke test
rex doctor           # 9/9 checks pass
rex providers health # au moins Ollama + 1 free OK
rex budget           # affiche $0.00
rex review           # pipeline runs
rex cache stats      # 0 entries, 0% hit rate
rex network status   # "standalone mode" (pas de hub)
rex sync status      # "no sync configured"
rex mcp list         # liste les MCPs installes
rex gateway          # demarre, envoie un message test, arrete

# 6. Version bump
cd packages/cli
npm version major    # 6.2.0 → 7.0.0
cd ../..
pnpm build

# 7. Publish
npm publish packages/cli --access public
```

---

## RESUME

| Batch | Agents | Duree | Prerequis |
|-------|--------|-------|-----------|
| **0** | Kevin (setup) | 1 jour | Rien |
| **1** | Router + Cache + Memory + Daemon | 5-7 jours | Batch 0 |
| **2** | Review + Security + Guards | 3-5 jours | Batch 1 |
| **3** | Network + Sync + Embed-RS + Docker | 7-10 jours | Batch 2 |
| **4** | Orchestrator + Gateway + MCP + CLI | 7-10 jours | Batch 3 |
| **5** | Flutter Core + Flutter Extra + Coaching | 5-7 jours | Batch 4 |
| **6** | Deploy + Docs + Tests E2E + Bun | 3-5 jours | Batch 5 |
| **TOTAL** | 18 agents | **~6-7 semaines** | |
