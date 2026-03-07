# REX v7 — The Living Network

*Design document — 2026-03-07*
*Remplace et corrige le plan Milo (milo-rex-todo-opus.md)*

---

## VISION

REX est un **reseau de compute distribue** qui exploite TOUTES les ressources disponibles
(hardware local, modeles locaux, free providers, open source) pour creer un compagnon
de developpement **autonome, vivant et economique**.

Objectif : reduire de 80%+ la dependance aux providers payants (Claude Code, Codex)
en routant intelligemment vers les ressources gratuites et locales.

**Principes fondamentaux :**

1. **Local-first, free-second, paid-last** — tout ce qui peut tourner en local tourne en local
2. **Un cerveau, N machines** — memoire centralisee, compute distribue
3. **Zero friction setup** — `rex init` detecte le hardware et configure tout
4. **Open source, universel** — fonctionne sur Mac, Linux, VPS, NAS, DGX Spark, RPi
5. **Autonome** — le daemon travaille meme quand tu dors (review, consolidation, monitoring)
6. **Token-efficient** — semantic cache + prompt compression + smart routing = minimum de tokens

---

## ARCHITECTURE

```
                    +-----------------------------------------+
                    |            REX Hub (cerveau)             |
                    |  Memory SQLite | Router | Daemon | API  |
                    |  Docker / Mac / VPS / NAS                |
                    +----+------------+------------+----------+
                         |            |            |
              Tailscale / LAN / WAN
                         |            |            |
                   +-----+--+  +------+---+  +----+--------+
                   |Mac Node|  |VPS Node  |  |GPU Node     |
                   |Ollama  |  |Docker    |  |RTX 3090     |
                   |Claude  |  |Gateway   |  |DGX Spark    |
                   |Codex   |  |24/7      |  |NAS storage  |
                   |GUI app |  |Crons     |  |Fine-tune    |
                   +--------+  +----------+  +-------------+
```

### REX Hub

Le cerveau central. Peut tourner sur n'importe quelle machine.
Contient la memoire, le routeur, le daemon, et l'API de controle.

- **Memoire** : SQLite + sqlite-vec (embeddings). Source unique de verite.
- **Router** : decide quel modele/provider/node utiliser pour chaque tache.
- **Daemon** : event-driven (chokidar + crons). Self-healing.
- **API REST** : permet aux nodes de s'enregistrer et recevoir des taches.
- **Docker** : `docker compose up` pour deploiement VPS en 2 minutes.

### REX Node

Agent leger (~50 lignes) qui s'enregistre aupres du Hub.
Chaque node expose ses capabilities via un heartbeat periodique.

```json
{
  "id": "mac-kevin",
  "type": "mac",
  "hostname": "MacBook-Pro-de-Keiy",
  "ip": "100.112.24.122",
  "capabilities": {
    "gpu": "Apple M1 Pro",
    "gpu_vram_gb": 16,
    "ram_gb": 16,
    "storage_free_gb": 245,
    "ollama": true,
    "ollama_models": ["nomic-embed-text", "qwen3.5:9b", "qwen2.5-coder:7b"],
    "claude_code": true,
    "codex": true,
    "docker": false
  },
  "status": "online",
  "last_heartbeat": "2026-03-07T21:00:00Z"
}
```

### Nodes supportes

| Type | Exemples | Capabilities typiques |
|------|----------|----------------------|
| **Mac** | M1/M2/M3/M4, 8-192GB | Ollama, Claude Code, Codex, GUI app, dev local |
| **Linux Desktop** | PC avec RTX 3090/4090 | Ollama GPU rapide, inference lourde, fine-tuning |
| **VPS** | Hostinger, Hetzner, OVH | Docker, 24/7, Gateway Telegram, crons |
| **NAS** | Synology, TrueNAS, Unraid | Stockage, backup, Docker leger |
| **DGX Spark** | NVIDIA GB10, 128GB unified | Modeles 200B params, inference pro, fine-tune |
| **Raspberry Pi** | RPi 4/5, 4-8GB | Node sentinelle, monitoring, relay |
| **Cloud GPU** | Lambda, Vast.ai, RunPod | Burst compute, fine-tuning, gros modeles |

### Communication inter-nodes

- **Tailscale** (recommande) : VPN mesh zero-config, chaque machine a une IP fixe
- **LAN direct** : mDNS/Bonjour pour les machines sur le meme reseau
- **WAN** : API REST avec auth token simple (JWT)
- **Protocole** : HTTP/JSON. Pas de WebSocket/gRPC — keep it simple.

### Registration flow

```
1. User installe rex sur une nouvelle machine
2. `rex init` detecte le hardware (GPU, RAM, modeles, services)
3. `rex network join <hub-url>` ou `rex network join --tailscale`
4. Le node envoie un heartbeat au Hub avec ses capabilities
5. Le Hub ajoute le node a network.json
6. Le node recoit ses taches assignees via polling (30s)
```

---

## BLOC 1 — PROVIDER MESH (priorite critique)

### 1.1 Multi-provider Router

Extension de `router.ts` pour supporter local + free + paid.

**Chaine de routing (ordre de priorite) :**

```
1. Semantic Cache (cosine > 0.95)     → reponse instantanee, 0 token
2. Ollama local                        → 0 cout, latence moyenne
3. Free providers (round-robin)        → 0 cout, rate limits
4. Paid cheap (Haiku, GPT-5-Mini)     → faible cout
5. Paid premium (Sonnet, GPT-5.4)     → dernier recours
6. Paid max (Opus, GPT-5.4 Pro)       → uniquement si user demande
```

### 1.2 Free providers integres

| Provider | API | Modeles cles | Quota gratuit | Usage REX |
|----------|-----|--------------|---------------|-----------|
| **Cerebras** | OpenAI-compat | Qwen3 235B, Llama 4 Scout | 1M tok/jour, 30 RPM | Code review, reasoning |
| **Groq** | OpenAI-compat | Llama 3.3 70B, DeepSeek R1 | 14,400 req/jour, 30 RPM | Streaming rapide, summarize |
| **Mistral** | OpenAI-compat | Codestral, Mistral Large | 1B tok/mois, 2 RPM | Code gen (batch, pas real-time) |
| **OpenRouter** | OpenAI-compat | 27 modeles free (Qwen3 Coder 480B) | 200 RPD (1000 avec $10 credit) | Gateway universel, fallback |
| **Google AI Studio** | SDK propre | Gemini 2.5 Pro/Flash | 100-250 RPD | Reasoning complexe, long context |
| **SambaNova** | OpenAI-compat | Llama 3.3 70B, 405B | 200K tok/jour, 30 RPM | Inference gros modeles |
| **Cloudflare Workers AI** | API propre | Llama 3.1, Mistral 7B | 10K neurons/jour | Edge inference |
| **DeepSeek** | OpenAI-compat | V3.2, R1 | 5M tok (30 jours signup) | Deep reasoning |

### 1.3 Modeles locaux Ollama (auto-detectes)

| RAM machine | Modeles installes par `rex init` | Taches |
|-------------|----------------------------------|--------|
| 8 GB | nomic-embed-text + llama3.2:1b | Embeddings + classification |
| 16 GB | + qwen2.5-coder:7b + qwen3.5:9b | + Code gen + review |
| 32 GB | + deepseek-r1:14b | + Reasoning profond |
| 48+ GB | + qwen3-coder-next:80b | + Agentic coding top-tier |
| 128 GB (DGX) | + modeles 70-200B non-quantises | + Tout en local |

### 1.4 Routing par tache

| Tache | Priorite 1 | Priorite 2 | Priorite 3 |
|-------|-----------|-----------|-----------|
| Embedding | Ollama nomic-embed-text | — | — |
| Classification/routing | Ollama llama3.2:1b | — | — |
| Summarize | Ollama qwen3.5:9b | Groq Llama 70B | Cerebras Qwen3 235B |
| Code completion | Ollama qwen2.5-coder:7b | Mistral Codestral | Groq DeepSeek R1 |
| Code review | Cerebras Qwen3 235B | Google Gemini 2.5 Pro | Claude Sonnet |
| Architecture/design | Google Gemini 2.5 Pro | OpenRouter Qwen3 Coder | Claude Opus |
| Debug complexe | Cerebras Qwen3 235B | Claude Sonnet | GPT-5.4 |
| Security audit | Semgrep (local) + Cerebras | Claude Sonnet | — |
| PR description | Groq Llama 70B | Ollama qwen3.5:9b | — |
| Commit message | Ollama qwen3.5:9b | — | — |

### 1.5 Semantic Cache

Avant chaque appel LLM :
1. Generer embedding du prompt (nomic-embed-text, local)
2. Chercher dans `llm_cache` si cosine > 0.95
3. Si hit → retourner reponse cachee (0 token, <10ms)
4. Si miss → appeler LLM, cacher le resultat

Table SQLite :
```sql
CREATE TABLE llm_cache (
  id INTEGER PRIMARY KEY,
  prompt_hash TEXT UNIQUE,
  prompt_embedding BLOB,
  response TEXT,
  model TEXT,
  task_type TEXT,
  created_at TEXT,
  hit_count INTEGER DEFAULT 0,
  ttl_hours INTEGER DEFAULT 168  -- 7 jours par defaut
);
```

Hit rate estime : 80%+ pour categorize, consolidate, commit messages.

### 1.6 Budget tracker

```
rex budget                    # consommation du mois par provider
rex budget --daily            # par jour
rex budget --provider cerebras
```

Tracking dans SQLite : chaque appel LLM logge provider, model, tokens_in, tokens_out, cost_usd, latency_ms.
Alertes configurable : "budget max $5/mois" → force local-only au-dela.

---

## BLOC 2 — ORCHESTRATEUR INTELLIGENT

### 2.1 Backends d'execution

REX peut deleguer l'execution de code a plusieurs backends :

| Backend | Modele | Quand l'utiliser | Integration |
|---------|--------|-----------------|-------------|
| **Claude Code** | Opus 4.6 / Sonnet 4.6 | Taches complexes, architecture, multi-fichiers | CLI `claude` |
| **Codex CLI** | GPT-5.4 / GPT-5-Codex-Mini | Code gen, review, multi-agent, CSV batch | CLI `codex` |
| **OpenCode** | N'importe quel LLM | Alternative open source, 75+ providers | CLI `opencode` |
| **Aider** | N'importe quel LLM | Edit + auto-commit, terminal pur | CLI `aider` |
| **Tabby** | Self-hosted | Copilot local, completion continue | Serveur local |

### 2.2 Strategie de delegation

```
rex delegate "refactor auth module"
  → REX analyse la complexite (fichiers impliques, deps, risque)
  → Complexity LOW  : Ollama local ou free provider direct
  → Complexity MED  : Codex Mini ou Aider + free provider
  → Complexity HIGH : Claude Code (Sonnet) ou Codex (GPT-5.4)
  → Complexity CRIT : Claude Code (Opus) — uniquement si user confirme
```

### 2.3 Token optimization

Pour chaque delegation a Claude Code / Codex :
1. **Pre-compute le contexte** : REX prepare un fichier CONTEXT.md avec seulement les infos pertinentes
2. **Prompt compression** : strip commentaires, whitespace, imports non pertinents
3. **Scope narrow** : passer uniquement les fichiers concernes, pas tout le repo
4. **Cache les resultats** : si la meme tache est relancee, reutiliser le cache

Economies estimees : 60-70% de tokens en moins par session Claude Code.

### 2.4 Codex integration

```typescript
// packages/cli/src/orchestrator.ts
interface OrchestratorBackend {
  name: 'claude-code' | 'codex' | 'opencode' | 'aider' | 'local';
  available: boolean;
  model: string;
  costPerToken: number;
  capabilities: ('code-gen' | 'review' | 'multi-file' | 'mcp' | 'computer-use')[];
}

// Detection automatique des backends installes
async function detectBackends(): Promise<OrchestratorBackend[]> {
  // which claude, which codex, which opencode, which aider
  // Pour chaque backend detecte, lire sa config et capabilities
}
```

---

## BLOC 3 — MEMOIRE CENTRALISEE

### 3.1 Observational Memory (pattern Mastra)

Remplace l'approche "dump tout dans SQLite" par un systeme intelligent :

**Observer** (SessionEnd hook) :
- Compresse l'historique de session en observations datees (~200-300 tokens)
- Extrait : decisions, blockers, patterns, erreurs, solutions
- Stocke dans table `observations`

**Reflector** (daemon, 1x/jour) :
- Reorganise et condense les observations
- Supprime les redondances (cosine > 0.90)
- Trouve les connexions entre observations
- Promeut les patterns recurrents en `rules`

Compression documentee : 5-40x sur les outputs d'outils. Score 95% sur LongMemEval.

### 3.2 Schema memoire unifie

```sql
-- Memoire factuelle (stable, connaissance)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  category TEXT,         -- 'api-pattern', 'stack-info', 'convention'
  content TEXT,
  source TEXT,           -- session_id, file_path, url
  confidence REAL,       -- 0.0 - 1.0
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  embedding BLOB,
  created_at TEXT
);

-- Memoire episodique (evenements, sessions)
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  project TEXT,
  type TEXT,             -- 'decision', 'blocker', 'solution', 'error', 'pattern'
  content TEXT,
  embedding BLOB,
  created_at TEXT,
  consolidated_into INTEGER REFERENCES observations(id)
);

-- Cache LLM (semantic)
CREATE TABLE llm_cache (
  id INTEGER PRIMARY KEY,
  prompt_hash TEXT UNIQUE,
  prompt_embedding BLOB,
  response TEXT,
  model TEXT,
  task_type TEXT,
  created_at TEXT,
  hit_count INTEGER DEFAULT 0,
  ttl_hours INTEGER DEFAULT 168
);

-- Network nodes
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT,
  hostname TEXT,
  ip TEXT,
  capabilities JSON,
  status TEXT DEFAULT 'offline',
  last_heartbeat TEXT
);
```

### 3.3 Forgetting curve

- Memories non-accedees depuis 30j → compressees (merged avec similaires)
- Memories non-accedees depuis 90j → archivees (retirees du search actif)
- Memories accedees frequemment → score de pertinence renforce
- Le Reflector gere ca automatiquement dans son cycle quotidien

### 3.4 Cross-node sync

La DB memoire est sur le Hub. Les nodes y accedent via l'API REST :
```
GET  /api/memory/search?q=<query>&limit=10
POST /api/memory/observe  { session_id, observations[] }
GET  /api/memory/context?project=<name>
```

Pour le mode offline (Mac sans reseau) :
- Le node garde une copie locale read-only de la DB (sync au reconnect)
- Les nouvelles observations sont queued et envoyees au Hub quand le reseau revient

---

## BLOC 4 — CODE REVIEW PIPELINE

### 4.1 Stack open source (tout gratuit, tout local)

| Outil | Role | Commande REX |
|-------|------|-------------|
| **Biome** | Lint + format JS/TS (20x ESLint) | `rex lint` |
| **Semgrep CE** | SAST, 3000+ regles, OWASP | `rex security --sast` |
| **Gitleaks** | Detection secrets (pre-commit, <1s) | `rex guard --secrets` |
| **TruffleHog** | Scan secrets profond (800+ types) | `rex security --secrets` |
| **OSV-Scanner** | Vulnerabilites deps (Google, multi-eco) | `rex security --deps` |
| **Knip** | Detection code mort | `rex clean --dead-code` |
| **PR-Agent** | AI code review (self-hosted + Ollama) | `rex review --ai` |
| **Act** | GitHub Actions en local | `rex ci` |

### 4.2 `rex review` — pipeline complet

```
rex review              # pipeline complet avant push
rex review --quick      # lint + secrets seulement (<5s)
rex review --ai         # + AI review via free provider
rex review --full       # + tests + security + coverage
```

Pipeline interne :
```
1. Biome lint + format          (local, <1s)
2. Gitleaks secret scan         (local, <1s)
3. TypeScript tsc --noEmit      (local, ~5s)
4. Semgrep SAST                 (local, ~10s)
5. OSV-Scanner deps             (local, ~3s)
6. Vitest --run                 (local, ~10s)
7. PR-Agent AI review           (free provider, ~30s)
8. Coverage check               (local, threshold configurable)
```

Si un check echoue → BLOQUE avec message precis + suggestion de fix.

### 4.3 `rex review --ai`

1. Genere le diff (`git diff main..HEAD`)
2. Injecte le contexte projet (CLAUDE.md + observations recentes)
3. Envoie a un free provider (Cerebras Qwen3 235B ou Groq Llama 70B)
4. Recoit : problemes, suggestions, verdict (ready / issues / blocker)
5. Sauvegarde dans `~/.claude/rex/reviews/<date>-<branch>.md`
6. Si free provider rate limited → fallback PR-Agent self-hosted avec Ollama

---

## BLOC 5 — GUARDS INTELLIGENTS

### 5.1 Guards existants (garder)

Les guards actuels dans `~/.claude/rex-guards/` restent en place.
Les nouveaux s'ajoutent sans casser l'existant.

### 5.2 Nouveaux guards

| Guard | Hook | Detecte | Action |
|-------|------|---------|--------|
| **secret-guard** | PreToolUse(Write/Edit) | `sk-`, `ghp_`, `Bearer `, passwords, cles hex 32+ | BLOCK |
| **any-type-guard** | PostToolUse(Write/Edit) | `any` TypeScript ajoutes (git diff) | WARNING + suggestion type |
| **console-log-guard** | PostToolUse(Write/Edit) | `console.log` hors /tests/ | WARNING + rappel logger |
| **a11y-guard** | PostToolUse(Write/Edit TSX) | img sans alt, button sans aria-label | WARNING + liste |
| **perf-guard** | PostToolUse(Write/Edit) | useEffect sans deps, API call en boucle | WARNING |
| **import-guard** | PostToolUse(Write/Edit TS) | imports non utilises | WARNING |
| **honesty-guard** | UserPromptSubmit | "c'est fait" / "ca marche" sans preuve | INJECT rappel verification |

### 5.3 Guard framework

Chaque guard suit la meme interface :
```bash
#!/bin/bash
# Input: TOOL_INPUT (JSON) via stdin, FILE_PATH en env
# Output: exit 0 = OK, exit 2 = BLOCK, stdout = message
# Perf: DOIT s'executer en <500ms
```

`rex guard list` — afficher tous les guards actifs
`rex guard add <name>` — installer un guard depuis le registry
`rex guard disable <name>` — desactiver temporairement

---

## BLOC 6 — DAEMON EVENT-DRIVEN

### 6.1 Architecture

Remplacer le polling pur par un systeme hybride evenements + crons :

```
[FSEvents Watcher (chokidar)] ──> [Event Queue] ──> [Event Processor]
     │                                │                     │
  ~/.claude/sessions/             prioritized            route to handler
  ~/.claude/rex/pending/          debounced
  git hooks (post-commit)
  node heartbeats

[Cron Scheduler] ──> [Event Queue]
  Toutes les heures : ingest + categorize
  Toutes les 6h : context refresh
  Chaque nuit : consolidate + forgetting curve + backup
  Toutes les 30s : node heartbeat check
```

### 6.2 Self-healing

- **Circuit breaker** : si Ollama echoue 3x → stop pendant 5 min
- **Degraded mode** : Ollama down → continuer les taches sans LLM (backup, cleanup, git)
- **Auto-restart** : LaunchAgent/systemd avec KeepAlive
- **Health broadcast** : le daemon publie son etat sur `/api/health`

### 6.3 Git hooks integration

```
post-commit  → rex daemon --event=commit  → extraire lecons, update project index
post-merge   → rex daemon --event=merge   → analyser changements, verifier conflits
pre-push     → rex review --quick         → bloquer si secrets ou lint fail
```

Installes automatiquement par `rex init`.

---

## BLOC 7 — WORKFLOWS

### 7.1 `rex workflow new-feature "<nom>"`

1. Cree branche `feat/<nom>` depuis main
2. Cree `FEATURE.md` avec template (objectif, scope, tests prevus)
3. Injecte le skill correspondant dans le contexte Claude Code
4. Active les guards pertinents

### 7.2 `rex workflow bug-fix "<description>"`

1. Cree branche `fix/<description>`
2. Injecte le skill debug dans le contexte
3. Force un test qui reproduit le bug AVANT de coder le fix
4. Cree `BUG.md` avec template (repro, hypotheses, solution)

### 7.3 `rex workflow pr`

1. Run `rex review --full` — BLOQUE si rouge
2. Genere description PR depuis commits + FEATURE.md/BUG.md
3. Ouvre la PR sur GitHub
4. Lance `rex review --ai` sur le diff
5. Attend les reviews automatisees, fix ce qui est valide

### 7.4 `rex workflow deploy [staging|prod]`

1. `rex review --full` → BLOQUE si rouge
2. Verifier CI vert
3. Pour prod : confirmation explicite + changelog auto
4. Post-deploy : `rex log deploy` pour tracabilite

---

## BLOC 8 — DOCKER DEPLOYMENT

### 8.1 Docker Compose

```yaml
# docker-compose.yml
version: "3.9"
services:
  rex-hub:
    image: ghcr.io/keiy78120/rex:latest
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3117:3117"     # API REST
    volumes:
      - rex-data:/data  # SQLite DB + logs
      - rex-config:/config
    environment:
      - REX_MODE=hub
      - REX_TELEGRAM_BOT_TOKEN=${REX_TELEGRAM_BOT_TOKEN}
      - REX_TELEGRAM_CHAT_ID=${REX_TELEGRAM_CHAT_ID}
      - OLLAMA_URL=${OLLAMA_URL:-http://ollama:11434}
    restart: unless-stopped
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    # GPU passthrough si disponible
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  rex-data:
  rex-config:
  ollama-models:
```

### 8.2 Dockerfile

```dockerfile
FROM node:22-slim
WORKDIR /app
RUN npm install -g rex-claude
# Pre-pull les modeles legers au build
RUN rex init --headless --skip-ollama
EXPOSE 3117
CMD ["rex", "daemon", "--hub"]
```

### 8.3 One-command VPS setup

```bash
# Sur un VPS Ubuntu/Debian :
curl -fsSL https://get.rex-cli.dev | bash
# Ou manuellement :
npm install -g rex-claude
rex init --docker
docker compose up -d
```

`rex init --docker` genere le docker-compose.yml adapte a la machine :
- Detecte GPU NVIDIA → ajoute le GPU passthrough
- Detecte RAM → pre-pull les modeles Ollama adaptes
- Configure Telegram si tokens fournis
- Configure Tailscale si installe

### 8.4 Modes de deploiement

| Mode | Commande | Ce qui tourne |
|------|----------|---------------|
| **Local** | `rex daemon` | Daemon + Gateway + Ollama local |
| **Hub** | `rex daemon --hub` | + API REST pour les nodes |
| **Docker** | `docker compose up` | Hub containerise + Ollama |
| **Headless** | `rex daemon --headless` | Pas de GUI, pas de Flutter |
| **Node** | `rex node start` | Agent leger, se connecte au Hub |

---

## BLOC 9 — HARDWARE AUTO-DETECTION

### 9.1 `rex init` — setup intelligent

```bash
rex init
# Detecte automatiquement :
# - OS (macOS/Linux/Docker)
# - CPU (Apple Silicon M1-M4 / x86 / ARM)
# - GPU (Metal / CUDA / ROCm / none)
# - RAM totale + disponible
# - Ollama installe ? version ? modeles ?
# - Claude Code installe ? version ?
# - Codex CLI installe ? version ?
# - OpenCode installe ?
# - Tailscale installe ? IP ?
# - Docker installe ?
# - Git version + config
#
# Puis configure :
# - Modeles Ollama adaptes a la RAM/GPU
# - Router avec les bons providers
# - Daemon (LaunchAgent macOS / systemd Linux / Docker)
# - Guards et hooks
# - Network node registration si Hub configure
```

### 9.2 Hardware profiles

```typescript
// packages/cli/src/hardware.ts
interface HardwareProfile {
  os: 'macos' | 'linux' | 'docker';
  cpu: { arch: string; cores: number; model: string };
  gpu: {
    type: 'apple-silicon' | 'nvidia' | 'amd' | 'none';
    model: string;
    vram_gb: number;
  };
  ram_gb: number;
  storage_free_gb: number;
  network: { tailscale: boolean; tailscale_ip?: string };
}

// Profiles types des users
const PROFILES = {
  'mac-8gb':    { ollama: ['nomic-embed-text', 'llama3.2:1b'], concurrent: 1 },
  'mac-16gb':   { ollama: ['nomic-embed-text', 'llama3.2:1b', 'qwen2.5-coder:7b', 'qwen3.5:9b'], concurrent: 2 },
  'mac-32gb':   { ollama: ['nomic-embed-text', 'llama3.2:3b', 'qwen2.5-coder:7b', 'qwen3.5:9b', 'deepseek-r1:14b'], concurrent: 3 },
  'mac-64gb+':  { ollama: ['nomic-embed-text', 'llama3.2:3b', 'qwen3-coder-next:80b'], concurrent: 4 },
  'linux-rtx3090': { ollama: ['nomic-embed-text', 'llama3.2:3b', 'qwen2.5-coder:7b', 'qwen3.5:9b', 'deepseek-r1:14b'], concurrent: 3 },
  'linux-rtx4090': { ollama: ['nomic-embed-text', 'qwen3-coder-next:80b'], concurrent: 4 },
  'dgx-spark':  { ollama: ['nomic-embed-text', 'qwen3-coder:full', 'llama3.1:70b'], concurrent: 6 },
  'vps-no-gpu': { ollama: ['nomic-embed-text', 'llama3.2:1b'], concurrent: 1 },
  'nas':        { ollama: [], concurrent: 0, role: 'storage-only' },
  'rpi':        { ollama: [], concurrent: 0, role: 'monitor-only' },
};
```

### 9.3 GPU detection

```typescript
// macOS : system_profiler SPDisplaysDataType
// Linux NVIDIA : nvidia-smi --query-gpu=name,memory.total --format=csv
// Linux AMD : rocm-smi
// Docker : check /dev/nvidia* ou NVIDIA_VISIBLE_DEVICES env

async function detectGPU(): Promise<GPUInfo> {
  if (process.platform === 'darwin') {
    // Apple Silicon → unified memory = RAM
    const sysinfo = execSync('sysctl -n machdep.cpu.brand_string').toString();
    return { type: 'apple-silicon', model: sysinfo, vram_gb: totalRAM };
  }
  // ... nvidia-smi, rocm-smi
}
```

---

## BLOC 10 — FLUTTER APP (evolution)

### 10.1 Nouvelles pages

Ajouter aux 9 pages existantes :

| Page | Contenu |
|------|---------|
| **Network** | Nodes connectes, status, capabilities, latence |
| **Providers** | Free providers status, quotas restants, budget tracker |
| **Review** | Derniers rapports de review, historique, stats |

### 10.2 Network Dashboard

- Carte visuelle des nodes (status online/offline)
- Pour chaque node : GPU, RAM, modeles, taches en cours
- Bouton "Wake" pour WoL (deja implemente)
- Bouton "Assign task" pour envoyer une tache a un node specifique

### 10.3 Provider Dashboard

- Barre de quota par provider (Cerebras: 800K/1M tokens today)
- Graph de consommation par jour/semaine
- Alertes quand un provider approche sa limite
- Stats de cache hit rate

---

## BLOC 11 — COACHING & SELF-IMPROVE

### 11.1 Honesty guard (existe pas encore)

Hook UserPromptSubmit. Si Claude/Codex dit "c'est fait" ou "ca marche" :
→ Injecter : "Preuve requise. Montrer : output test, screenshot, curl, ou build log."

### 11.2 Tech debt tracker

- Chaque `// TODO`, `// FIXME`, `// HACK` ajoute → logge dans `TECH_DEBT.md`
- `rex debt` → liste la dette technique
- `rex debt --stale 7` → dettes de plus de 7 jours

### 11.3 Self-improve (existe deja, etendre)

- Pattern Observational Memory pour le self-improve
- Le Reflector identifie les patterns d'erreur recurrents
- Promotion automatique en rule dans `~/.claude/rules/`
- Notification si une nouvelle rule est promue

---

## ORDRE D'IMPLEMENTATION

```
Phase 1 — Le Cerveau (semaine 1-2)
  Bloc 1.1-1.4 : Provider Mesh (router multi-provider + free tiers)
  Bloc 1.5     : Semantic Cache
  Bloc 3.1     : Observational Memory
  Bloc 6       : Daemon event-driven (chokidar)

Phase 2 — La Defense (semaine 2-3)
  Bloc 4       : Code Review Pipeline (Biome, Semgrep, Gitleaks, OSV, PR-Agent)
  Bloc 5       : Nouveaux Guards (7 guards)
  Bloc 6.3     : Git hooks integration

Phase 3 — Le Reseau (semaine 3-4)
  Bloc 8       : Docker deployment (Dockerfile, compose, one-command setup)
  Bloc 9       : Hardware auto-detection
  Architecture : Hub API REST + Node registration
  Communication : Tailscale integration

Phase 4 — L'Orchestrateur (semaine 4-5)
  Bloc 2       : Orchestrateur (Claude Code + Codex + OpenCode + Aider)
  Bloc 7       : Workflows (new-feature, bug-fix, pr, deploy)
  Bloc 1.6     : Budget tracker

Phase 5 — L'Interface (semaine 5-6)
  Bloc 10      : Flutter app (Network, Providers, Review pages)
  Bloc 11      : Coaching (honesty guard, tech debt, self-improve)
  Bloc 3.3     : Forgetting curve + memory cleanup
```

---

## CONTRAINTES TECHNIQUES

1. **Zero breaking change** — tout REX v6 continue de fonctionner
2. **Local-first** — donnees jamais hors machine sans consentement
3. **Open source** — tout le code est public, pas de secrets dans le repo
4. **Docker-ready** — chaque feature doit fonctionner en headless/Docker
5. **TypeScript strict** — zero `any`, zero `@ts-ignore`
6. **Tests** — chaque nouvelle commande a des tests
7. **Conventional commits** — enforced
8. **Fallback chain** — jamais bloquer. Local → free → cheap → premium → erreur claire
9. **Privacy** — aucune donnee envoyee sans consentement explicite
10. **Token budget** — chaque feature qui touche un LLM doit passer par le router + cache

---

## ERREURS CORRIGEES PAR RAPPORT AU PLAN MILO

| Erreur Milo | Correction |
|-------------|------------|
| "Tauri+React (app)" | Flutter macOS native (pas Tauri) |
| Paths `~/.rex/` | Migre vers `~/.claude/rex/` |
| Bloc 2 keylogger/clipboard | SUPPRIME — trop invasif, problemes privacy, hors scope |
| Bloc 3 "auto-setup modeles" | Deja fait dans v6 (`router.ts`, `rex models`) |
| Bloc 4.1 "auto-activation" | Deja fait (`preload.ts`, SessionStart hooks) |
| Bloc 9 "gateway" | Deja fait (Gateway Telegram operationnelle) |
| Bloc 10 "refonte Liquid Glass" | L'app Flutter existe avec 9 pages — evolution, pas refonte |
| Bloc 11 "routing dynamique" | Deja fait (`router.ts` avec 7 taches) |
| Pas de Docker | AJOUTE — deploiement VPS en 2 minutes |
| Pas de Codex CLI | AJOUTE — alternative a Claude Code |
| Pas de free providers | AJOUTE — 8 providers gratuits integres |
| Pas de network/bridge | AJOUTE — architecture Hub/Node distribuee |
| Pas de semantic cache | AJOUTE — reduce 80% des appels LLM |
| Pas d'auto-detection hardware | AJOUTE — profiles adaptes a chaque machine |

---

## OUTILS ET PROVIDERS — RESUME

### Free LLM Providers
| Provider | Quota gratuit | API |
|----------|--------------|-----|
| Cerebras | 1M tok/jour | OpenAI-compat |
| Groq | 14,400 req/jour | OpenAI-compat |
| Mistral | 1B tok/mois (2 RPM) | OpenAI-compat |
| OpenRouter | 27 modeles, 200 RPD | OpenAI-compat |
| Google AI Studio | Gemini 2.5 Pro, 100 RPD | SDK propre |
| SambaNova | 200K tok/jour | OpenAI-compat |
| DeepSeek | 5M tok (30j signup) | OpenAI-compat |
| Cloudflare Workers AI | 10K neurons/jour | API propre |

### Open Source Tools (tous gratuits)
| Outil | Role |
|-------|------|
| Biome | Lint + format |
| Semgrep CE | SAST securite |
| Gitleaks | Secret detection rapide |
| TruffleHog | Secret detection profonde |
| OSV-Scanner | Vulnerabilites deps |
| Knip | Code mort |
| PR-Agent | AI code review |
| Act | GitHub Actions local |
| OpenCode | AI coding CLI |
| Aider | AI coding + auto-commit |
| Tabby | Copilot self-hosted |
| chokidar | File watcher |

### Modeles locaux (Ollama)
| Modele | Taille | Usage |
|--------|--------|-------|
| nomic-embed-text | 137M | Embeddings |
| llama3.2:1b | 1B | Classification, routing |
| llama3.2:3b | 3B | Summarization legere |
| qwen2.5-coder:7b | 7B | Code generation |
| qwen3.5:9b | 9B | Code review + reasoning |
| deepseek-r1:14b | 14B | Deep reasoning |
| qwen3-coder-next:80b | 80B MoE | Agentic coding (32GB+ RAM) |

---

## SOURCES

### Free LLM Providers
- [Cerebras Free Tier](https://www.cerebras.ai/pricing) — 1M tokens/jour
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits) — LPU 2600 tok/s
- [Mistral Experiment Plan](https://help.mistral.ai/en/articles/455206) — tous modeles gratuits
- [OpenRouter Free Models](https://costgoat.com/pricing/openrouter-free-models) — 27 modeles
- [Google Gemini Free Tier](https://ai.google.dev/gemini-api/docs/pricing)
- [SambaNova Cloud Plans](https://cloud.sambanova.ai/plans)
- [DeepSeek API Pricing](https://costgoat.com/pricing/deepseek-api)
- [Every Free AI API 2026](https://awesomeagents.ai/tools/free-ai-inference-providers-2026/)

### Open Source Tools
- [PR-Agent](https://github.com/qodo-ai/pr-agent) — AI code review self-hosted
- [Semgrep CE](https://semgrep.dev/products/community-edition/) — SAST gratuit
- [Gitleaks](https://github.com/gitleaks/gitleaks) — secret detection
- [TruffleHog](https://github.com/trufflesecurity/trufflehog) — 800+ secret types
- [OSV-Scanner](https://github.com/google/osv-scanner) — Google dep scanner
- [Knip](https://knip.dev/) — dead code detection
- [Biome](https://biomejs.dev/) — lint + format Rust-based
- [Act](https://github.com/nektos/act) — GitHub Actions local
- [OpenCode](https://github.com/opencode-ai/opencode) — AI coding CLI, 95K stars
- [Tabby](https://www.tabbyml.com/) — self-hosted Copilot

### Architecture Patterns
- [Mastra Observational Memory](https://mastra.ai/docs/memory/observational-memory) — 95% LongMemEval
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) — unified LLM abstraction
- [chokidar v5](https://github.com/paulmillr/chokidar) — FSEvents file watcher
- [Self-Improving Coding Agents](https://addyosmani.com/blog/self-improving-agents/)

### Hardware
- [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) — $4,699, 128GB
- [Codex CLI](https://developers.openai.com/codex/cli/) — GPT-5.4, multi-agent
- [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) — 1M context, computer use
