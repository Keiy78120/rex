# REX v7 — MASTER PLAN

*Plan definitif v5 — 2026-03-07*
*Fusionne : design v7 + YOLO Sandbox + PRs Milo (#4, #5) + MCP Hub + CLI Menu + Securite OWASP*
*v5 : Open source a aspirer (OpenClaw/NanoClaw/Goose/Mem0/OpenCode/LiteLLM), optimisation langages hybride (Rust/Go/Bun), agent team execution parallele*
*v4 : Gateway refonte Agent SDK (fix diagnostic), sync temps reel VPS/Mac/PC (WebSocket + queue), Obsidian backup, audit complet*
*v3 : Flutter UI complete, skills annotations, resilience audit (R1-R7), multi-plateforme, gateway multi-platform, device bridge, Agent SDK first (OAuth + API key)*
*19 blocs, 6 phases, 23 subagents, 5 sections transversales, 6 projets open source aspires, strategie hybride Rust/TS*
*Auteur : REX (session Opus 4.6)*

---

## VISION — JARVIS FOR DEVELOPERS

REX est un **systeme nerveux pour developpeurs**. Un reseau distribue, autonome et vivant
qui centralise toute la puissance de calcul disponible (Mac, VPS, GPU, NAS) et orchestre
intelligemment les modeles locaux, les providers gratuits et les abonnements payants pour
creer un compagnon qui :

- **Centralise ce que tu possedes deja** — scripts, CLIs, services locaux, hardware, abonnements, quotas
- **Connait ta vie de dev** — projets, habitudes, preferences, decisions passees
- **Apprend et s'optimise** — chaque session le rend meilleur
- **Retient les succes reproductibles** — deploys, runbooks, recettes machine-specific et sequences qui marchent
- **Reagit et propose** — detecte les problemes avant toi, suggere des ameliorations
- **Orchestre tout** — Claude Code, Codex, modeles locaux, free APIs, scripts open source
- **Centralise** — une memoire, un routeur, un MCP hub, accessible 24/7 depuis n'importe ou
- **Connecte tout** — Drive, Gmail, GitHub, Slack, Monday, DBs, cloud via MCP hub centralise
- **Economise** — 80%+ de reduction de tokens payants grace au routing intelligent

**Analogie** : OpenClaw = un agent qui brule des tokens a chaque respiration.
REX = un cerveau qui DECIDE puis DELEGUE au meilleur outil/modele/machine disponible.

---

## PRINCIPES TRANSVERSAUX

> Addendum de cadrage a lire avec ce document :
> `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`

### P0. User-owned-first, cost-last

REX doit toujours raisonner sur les ressources dans cet ordre :

1. cache local
2. script ou outil deterministe deja installe
3. service local ou CLI deja disponible
4. hardware possede par l'user (machine courante, node distant, VPS, GPU node)
5. provider gratuit
6. quota d'abonnement deja possede
7. API payante explicite

Le routeur REX ne choisit pas juste un modele.
Il choisit d'abord la meilleure ressource suffisante parmi ce que l'user possede deja.

### P0bis. CLI-first, MCP-second, API-third

Quand REX cherche une capacite d'action, il doit raisonner sur les integrations dans cet ordre :

1. script ou CLI deja present
2. MCP pertinent
3. API directe
4. autre adaptation en dernier recours

Cette regle evite de complexifier le systeme quand un wrapper local ou un script suffit.

### P0ter. Registry large, tools externes desactives par defaut

REX peut maintenir un grand registry de tools inspires d'OpenClaw et d'autres ecosystems utiles.
Mais les integrations externes restent `disabled` par defaut.

Seuls les composants REX internes ou les wrappers locaux safe peuvent etre disponibles immediatement.
Tout le reste suit cette logique :

- detection du besoin ou de la stack
- recommandation explicable
- confirmation user
- activation

L'auto-selection doit proposer, jamais activer silencieusement.

### P0quater. Integrer avant de reimplementer

Quand une brique open source gere deja bien une couche technique, REX doit privilegier :

1. integration
2. orchestration
3. observabilite
4. policy layer

... avant toute reimplementation.

REX ne re-code pas un moteur complet juste pour "posseder" la fonctionnalite.
Il ajoute ce qui lui est propre : resource routing, policies, UX, healthchecks, memory, audit trail.

### P1. Tout est configurable via l'UI Flutter

Chaque parametre REX DOIT etre modifiable depuis l'app Flutter.
Le CLI et l'UI lisent/ecrivent le **meme fichier** `~/.claude/rex/config.json`.
Toute modif dans l'UI → persistee → le CLI la voit. Et inversement.

**Regle** : si un bloc ajoute un parametre configurable, il DOIT specifier :
1. La cle dans `config.json`
2. La commande CLI pour le modifier
3. L'endroit dans l'UI Flutter ou il apparait

### P1bis. Flutter-first, headless-always

REX garde une regle simple :

- **Flutter** = console operateur principale
- **CLI + Gateway + API** = parite obligatoire pour toutes les actions critiques
- **Pas de rewrite web par defaut**

Le hub securise et les dashboards distants doivent exposer les memes donnees a Flutter, au CLI et au gateway, sans faire de l'UI web la nouvelle source de verite.
La cible produit doit couvrir Flutter desktop sur macOS, Windows et Linux, meme si l'etat actuel du repo reste macOS-first.
Une surface mobile iPhone/Android pourra exister plus tard comme telecommande/observateur, mais seulement via la meme API.
Le VPS doit rester totalement operable sans UI Flutter.

### P1quinquies. Topology-aware by default

REX doit s'adapter au parc reel de l'user, pas a un setup idealise.

Trois echelles doivent etre prises en charge explicitement :

1. **Solo** : une seule machine, mode local complet, zero dependance hub
2. **Petit parc** : 2 a 5 machines, hub prefere si present, coordination simple
3. **Fleet** : 10 a 30+ machines, tags/groupes, inventaire agrege, limits et healthchecks plus stricts

Une feature qui ne marche qu'en mode "Mac + VPS + GPU" est incomplete.

### P1sexies. Gateway = continuity layer

La gateway REX n'est pas seulement un point d'entree Telegram/Discord/Web.
Elle doit etre pensee comme une couche de continuite entre les nodes.

Regle :

- si le hub prefere est vivant, il centralise
- si le hub prefere tombe, un node encore vivant doit pouvoir spooler, journaliser et reprendre plus tard
- aucune donnee critique ne doit exiger que "tout soit online maintenant"

Donc la gateway et la sync partagent les memes garanties :

1. append-only local
2. spool local par node
3. queue persistante
4. ack
5. replay

### P1ter. Copier OpenClaw sur les capacites, pas sur la forme

OpenClaw inspire :

- le hub permanent
- les routes securisees
- la centralisation des agents
- les fallbacks entre backends

REX ne copie pas :

- une interface surchargee
- une dependance au web dashboard pour operer
- des couches d'abstraction non prouvees

### P1quater. Zero-loss avant sophistication

Avant d'ajouter LangGraph, Rust ou toute optimisation infra, REX doit garantir :

1. journal append-only local
2. spool offline
3. queue persistante cote hub
4. ack/replay
5. reprise apres crash sans perte

### P2. Config schema unifie

```typescript
interface RexConfig {
  // Bloc 1 — Provider Mesh
  providers: {
    [name: string]: {
      enabled: boolean;
      priority: number;       // 1 = highest
      apiKey?: string;        // chiffre AES-256
      rateLimit?: number;     // RPM custom
    };
  };
  routing: {
    chain: ('cache' | 'ollama-local' | 'ollama-remote' | 'free' | 'paid-cheap' | 'paid-premium' | 'paid-max')[];
    taskOverrides: { [taskType: string]: string };  // task → provider force
  };
  cache: {
    enabled: boolean;
    cosineTreshold: number;   // defaut 0.95
    ttlHours: number;         // defaut 168
    maxEntries: number;       // defaut 10000
  };
  budget: {
    monthlyLimitUsd: number | null;  // null = illimite
    alertThreshold: number;          // 0.8 = alerte a 80%
    dailyReport: boolean;
  };

  // Bloc 2 — Orchestrator
  orchestrator: {
    backends: {
      claude: {
        enabled: boolean;
        mode: 'agent-sdk' | 'pipe' | 'off';
        authMode: 'oauth' | 'api-key';
        plan?: 'pro' | 'max';         // si oauth
        apiKey?: string;               // si api-key (chiffre)
        defaultModel: string;          // 'opus-4-6' | 'sonnet-4-6' | 'haiku-4-5'
      };
      openai: {
        enabled: boolean;
        mode: 'sdk' | 'pipe' | 'off';
        authMode: 'oauth' | 'api-key';
        apiKey?: string;               // si api-key (chiffre)
        defaultModel: string;          // 'gpt-5.4' | 'gpt-5-codex-mini' | 'o3'
      };
      ollama: {
        enabled: boolean;
        url: string;                   // defaut http://localhost:11434
        models: string[];              // auto-detectes
      };
      opencode: { enabled: boolean };
      aider: { enabled: boolean };
    };
    complexity: {
      lowThreshold: number;    // score en dessous = LOW
      highThreshold: number;   // score au dessus = HIGH
      critRequiresConfirm: boolean;
    };
    accounts: { [name: string]: { configDir: string; isActive: boolean } };
  };

  // Bloc 3 — Memory
  memory: {
    forgettingCurve: {
      compressDays: number;    // defaut 30
      archiveDays: number;     // defaut 90
    };
    reflector: {
      schedule: string;        // cron expression, defaut "0 3 * * *"
      minOccurrences: number;  // defaut 3 (pour promotion en rule)
      dedupeThreshold: number; // cosine, defaut 0.90
    };
    maxPendingChunks: number;  // defaut 30
    embedThrottleMs: number;   // defaut 500
  };

  // Bloc 4 — Sandbox
  sandbox: {
    mode: 'light' | 'full' | 'off';
    autoDetect: boolean;       // auto-switch light→full si risque
    networkWhitelist: string[]; // domaines autorises
    riskThresholds: {
      forceLight: string[];    // patterns de commande → light
      forceFull: string[];     // patterns → full
      requireConfirm: string[]; // patterns → confirm user
    };
  };

  // Bloc 5 — Review
  review: {
    pipeline: {
      biome: { enabled: boolean };
      gitleaks: { enabled: boolean };
      tsc: { enabled: boolean };
      semgrep: { enabled: boolean };
      osv: { enabled: boolean };
      tests: { enabled: boolean; command?: string };
      aiReview: { enabled: boolean; provider?: string };
      coverage: { enabled: boolean; threshold: number };
    };
    prePush: boolean;  // bloquer push si review fail
  };

  // Bloc 6 — Guards
  guards: {
    [name: string]: {
      enabled: boolean;
      severity: 'block' | 'warn' | 'info';
    };
  };

  // Bloc 7 — Daemon
  daemon: {
    crons: {
      [name: string]: {
        interval: string;
        enabled: boolean;
      };
    };
    circuitBreaker: {
      maxFails: number;        // defaut 3
      pauseMinutes: number;    // defaut 5
    };
    eventDebounceMs: number;   // defaut 1000
  };

  // Bloc 9 — Network
  network: {
    mode: 'local' | 'hub' | 'node';
    hubUrl?: string;
    tailscale: { enabled: boolean; ip?: string };
    jwt: { secret?: string; rotationDays: number };
    nodes: { [id: string]: { mac?: string; wolEnabled: boolean } };
  };

  // LLM Backend
  llm: {
    backend: 'ollama' | 'llama-cpp' | 'localai' | 'llamafile';
    url: string;               // defaut http://localhost:11434
    apiFormat: 'ollama' | 'openai';
  };

  // Bloc 12 — Voice
  voice: {
    provider: 'groq' | 'ollama';
    postProcess: boolean;
    postProcessModel?: string;
    autoIngest: boolean;
  };

  // Bloc 15 — MCP
  mcp: {
    framework: 'mcporter' | 'sdk';
    autoSelect: boolean;
    servers: {
      [name: string]: {
        enabled: boolean;
        source: string;
        config?: Record<string, unknown>;
      };
    };
    scanOnAdd: boolean;       // mcp-scan auto
  };

  // Bloc 17 — Gateway
  gateway: {
    adapters: {
      telegram: { enabled: boolean; botToken?: string; chatId?: string };
      discord:  { enabled: boolean; botToken?: string; guildId?: string };
      slack:    { enabled: boolean; botToken?: string; channelId?: string };
      web:      { enabled: boolean; port: number };
    };
    defaultAdapter: 'telegram' | 'discord' | 'slack' | 'web';
    notifications: { channels: string[] };
  };

  // Bloc 18 — Devices
  devices: {
    pairingCode?: string;
    role: 'node' | 'hub' | 'gpu-node' | 'nas' | 'headless';
    autoWake: boolean;           // reveiller les devices si besoin
  };

  // Bloc 19 — Snapshots
  snapshots: {
    autoPreShot: boolean;       // defaut true
    maxSnapshots: number;       // defaut 50
    budgetTokens: number;       // defaut 400
    restoreOnStart: boolean;    // defaut true
  };

  // UI
  ui: {
    theme: 'dark' | 'light' | 'system';
    language: 'fr' | 'en';
    sidebarCollapsed: boolean;
  };
}
```

### P3. Flutter Settings Hub

Les 5 onglets Settings actuels (General, Claude, LLM, Files, Advanced) ne suffisent plus.
v7 adopte un **Settings Hub** : page Settings avec navigation par domaine.

```
Settings Hub
├── General          (theme, langue, sidebar)
├── Accounts         (Claude/Codex accounts, switch)
├── Providers        (enable/disable, priority, API keys, quotas)
├── Routing          (chain order, task overrides, complexity thresholds)
├── Memory           (forgetting curve, reflector schedule, embed config)
├── Sandbox          (mode, whitelist, risk thresholds)
├── Review           (pipeline steps enable/disable, coverage threshold)
├── Guards           (list, toggle, severity, create custom)
├── Daemon           (cron schedules, circuit breaker, event config)
├── Network          (mode, hub URL, Tailscale, nodes, WoL)
├── MCP              (recommend-by-stack, scan-on-add, framework choice)
├── Gateway          (adapters enable/disable, tokens, notification routing)
├── Voice            (provider, post-process, auto-ingest)
├── Devices          (role, pairing, auto-wake)
├── Budget           (monthly limit, alerts, daily report)
├── Snapshots        (auto pre-shot, max count, budget tokens)
└── Advanced         (debug, logs level, experimental features)
```

Chaque section est un widget independant, lazy-loaded.
La page Settings utilise un `ListView` lateral pour la navigation.

### P4. Testing par phase

Chaque phase a ses propres tests. PAS seulement Phase 6.

| Phase | Tests requis | Runner |
|-------|-------------|--------|
| Phase 1 | Unit tests router, cache, memory observer, snapshot | `vitest` |
| Phase 2 | Integration tests review pipeline, guard scripts | `vitest` + shell |
| Phase 3 | Integration tests Hub API, Docker smoke test | `vitest` + `curl` |
| Phase 4 | Integration tests delegate, MCP hub, sandbox | `vitest` + Docker |
| Phase 5 | Flutter widget tests, golden tests UI | `flutter test` |
| Phase 6 | E2E full stack (CLI → Hub → Node → back) | Custom + `vitest` |

**Skills obligatoires** : `test-strategy` avant d'ecrire les tests, `build-validate` apres chaque phase.

### P5. Migration v6 → v7

```bash
rex migrate --v7
# 1. Backup config.json existant
# 2. Migrer les cles config vers le nouveau schema RexConfig
# 3. Migrer LaunchAgents → daemon cron config
# 4. Detecter les anciens guards → register dans le nouveau system
# 5. Migrer les MCP servers du settings.json → config.json mcp section
# 6. Conserver toute la DB memoire (backward compatible)
# 7. Generer rapport de migration
```

Compatible v6 : si `config.json` n'a pas les nouvelles cles, REX utilise les defaults.
Aucune donnee perdue. Aucune breaking change sur la DB.

### P6. Vercel AI SDK comme abstraction LLM

Tous les providers (Ollama, Cerebras, Groq, Mistral, OpenRouter, Google, etc.) passent par
le Vercel AI SDK (`ai` npm package). Avantages :
- Interface unifiee `generateText()` / `streamText()`
- Providers officiels : `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mistral`
- Providers community : `@ai-sdk/groq`, `ollama-ai-provider`, `@ai-sdk/deepseek`
- OpenAI-compat (Cerebras, SambaNova, OpenRouter) : via `@ai-sdk/openai` avec `baseURL` custom
- Streaming natif
- Tool calling unifie
- Pas besoin de maintenir N clients differents

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';

// Le router choisit le provider, l'interface reste la meme
const result = await generateText({
  model: router.pickModel(taskType),
  prompt: task,
});
```

---

## HARDWARE DE REFERENCE (Kevin)

| Machine | Specs | Role REX |
|---------|-------|----------|
| **Mac** | M1 Pro, 16GB RAM | Dev principal, GUI Flutter, Claude Code, Codex |
| **VPS Hostinger** | 2 vCPU, 8GB RAM, 96GB disk, Ubuntu 24.04 | Hub 24/7, Gateway Telegram, API REST |
| **PC RTX 3090** | RTX 3090 24GB VRAM, RAM variable | GPU Node — inference lourde, modeles 70B+ |

**Hardware que les users pourraient avoir :**
Mac (8-192GB) / Linux + GPU (RTX 3060-4090, AMD, Intel Arc) / VPS divers /
NAS (Synology, TrueNAS, Unraid) / DGX Spark (128GB, $4,699) /
Raspberry Pi / Cloud GPU (Lambda, Vast.ai, RunPod)

---

## ARCHITECTURE RESEAU

```
                    +-----------------------------------------+
                    |            REX Hub (VPS 24/7)            |
                    |  Memory | Router | Daemon | API | Sandbox|
                    |  Sync Engine | Message Queue (SQLite)    |
                    |  WebSocket Server (:3118)                |
                    |  Gateway Telegram/Discord/Web            |
                    +----+------------+------------+----------+
                         |            |            |
              Tailscale VPN mesh (IPs fixes, chiffre)
              + WebSocket bidirectionnel (temps reel)
                         |            |            |
                   +-----+--+  +------+---+  +----+--------+
                   |Mac Node|  |VPS Node  |  |GPU Node     |
                   |Ollama  |  |Hub Docker|  |RTX 3090     |
                   |AgentSDK|  |Gateway TG|  |Ollama GPU   |
                   |Codex   |  |Sandbox   |  |Fine-tune    |
                   |GUI app |  |Crons 24/7|  |Gros modeles |
                   |WS sync |  |WS server |  |WS sync      |
                   +--------+  +----------+  +-------------+
```

**Sync** : WebSocket bidirectionnel entre Hub et nodes.
Si un node est offline → messages queues sur le Hub (SQLite).
Au reconnect → catch-up sync automatique (voir section SYNC TEMPS REEL).

### Wake-on-LAN Strategy

Le VPS (toujours on) peut reveiller les machines locales :
1. **Mac M1** : PAS de WoL traditionnel. Alternative : Tailscale keepalive (Mac reste joignable tant qu'il ne dort pas) + `caffeinate -d` pendant les heures de travail + SSH wake si en veille legere
2. **PC GPU** : WoL classique (MAC address + broadcast)
3. Le daemon VPS detecte qu'une tache necessite du GPU → wake le PC → delegue → le PC se rendort
4. Commande : `rex wake <node-id>` ou automatique via le router

### Communication

- **Tailscale** : VPN mesh zero-config. Chaque machine a une IP fixe 100.x.y.z
- **Auth** : JWT token genere par `rex network init` (rotation 30j)
- **Protocole temps reel** : WebSocket bidirectionnel (port 3118) pour sync instantanee
- **Protocole API** : HTTP/JSON via l'API REST du Hub (port 3117) pour commandes one-shot
- **Offline** : SQLite queue sur le Hub, catch-up sync au reconnect (voir section SYNC TEMPS REEL)
- **Conflict resolution** : Last-Write-Wins (LWW) par timestamp — pas de CRDT (overkill pour mono-user)

### 9.x Connectivite persistante et fallback

REX doit verifier si Tailscale suffit reellement entre Mac / Windows / Linux / VPS :

- `tailscale status` → noeuds vus
- `tailscale ping` → latence + chemin
- `tailscale netcheck` → NAT/relay/direct
- statut de connexion : `direct`, `peer-relay`, `relay`

Ordre recommande :

1. **Tailscale direct** si possible
2. **Tailscale peer-relay** si acceptable
3. **Tailscale SSH** pour le command/control
4. **SSH classique par cles** si Tailscale indisponible
5. **RustDesk self-hosted** si vrai remote desktop necessaire
6. **Input Leap** si besoin local de clavier/souris partage

REX doit presenter ces fallbacks comme des capacites annexes, pas comme des dependances du hub.

---

## BLOC 1 — PROVIDER MESH (priorite critique)

### 1.1 Chaine de routing

```
Tache arrive
  │
  ├─ 0. Resource Planner → detecte besoin reel + ressources possedees + cout/quota/latence
  ├─ 1. Semantic Cache (cosine > 0.95) → reponse instantanee, 0 token
  ├─ 2. Script local / outil deja installe → 0 cout, resultat deterministe si possible
  ├─ 3. Service local / CLI local (machine courante) → 0 cout marginal
  ├─ 4. Owned hardware distant (VPS / GPU Node / autre machine via Tailscale) → 0 cout marginal
  ├─ 5. Free providers (round-robin avec health check) → 0 cout
  ├─ 6. Subscription / cheap SDK (quota ou faible cout) → si local/free insuffisant
  ├─ 7. Premium SDK → dernier recours auto
  ├─ 8. SDK max (Agent SDK Opus) → UNIQUEMENT si user demande
  └─ 9. FALLBACK TOTAL → notification user "Aucune ressource suffisante disponible"
         + queue la tache pour retry dans 5min
         + si offline → cache local only + message "Mode offline"
```

**Health check par provider** : ping toutes les 5min en background (daemon).
Si un provider fail 3x → auto-disable + notification. Re-enable apres 30min.
`rex providers health` → rapport status de tous les providers.

**Regle de sortie** : si REX saute une option locale/gratuite, il doit pouvoir expliquer pourquoi
(outil absent, hardware indisponible, modele insuffisant, latence trop forte, quota epuise, tache non adaptee).

### 1.1bis Resource Planner

Avant tout choix de provider/backend, REX construit un snapshot dynamique :

- scripts disponibles
- outils installes (`claude`, `codex`, `aider`, `opencode`, etc.)
- services actifs (Ollama, whisper, gateway, docker, MCP)
- machines joignables (Mac, Windows, Linux, VPS, GPU node)
- cout estime
- quota restant
- latence estimee

Sortie attendue :

```json
{
  "task": "deploy",
  "candidateOrder": [
    "local-script:deploy_prod.sh",
    "ssh-node:vps-hostinger",
    "tool:claude-code",
    "free-provider:cerebras",
    "paid-provider:claude-sonnet"
  ],
  "why": [
    "script local detecte pour ce repo",
    "VPS joignable via Tailscale direct",
    "aucun cout payant necessaire pour cette tache"
  ]
}
```

### 1.2 Free providers

| Provider | API | Quota gratuit | Forces | Limites |
|----------|-----|---------------|--------|---------|
| **Cerebras** | OpenAI-compat | 1M tok/jour, 30 RPM | Ultra-rapide (2600 tok/s), Qwen3 235B | Context 8K free |
| **Groq** | OpenAI-compat | 14,400 req/jour, 30 RPM | Vitesse LPU, Whisper gratuit | Modeles limites |
| **Mistral** | OpenAI-compat | 1B tok/mois, 2 RPM | TOUS modeles dont Codestral | 2 RPM = batch only |
| **OpenRouter** | OpenAI-compat | 27 modeles, 200 RPD | Gateway universel, failover auto | 200 RPD bas |
| **Google AI Studio** | SDK Google | Gemini 2.5 Pro, 100 RPD | Meilleur reasoning gratuit | API non-standard |
| **SambaNova** | OpenAI-compat | 200K tok/jour, 30 RPM | Llama 405B gratuit | Quota limite |
| **DeepSeek** | OpenAI-compat | 5M tok (30j) | Pas de rate limit, cache -90% | Trial 30j |
| **Cloudflare** | API propre | 10K neurons/jour | Edge, zero latence | Petits modeles |

**Implementation** : adapter `router.ts` avec interface `Provider` unifiee.
Tous les providers OpenAI-compat utilisent le meme client (Vercel AI SDK ou openai-node).
Google AI Studio → wrapper adapte.

### 1.3 Modeles locaux (auto-detection RAM/GPU)

| Profil | RAM | Modeles | Concurrent |
|--------|-----|---------|------------|
| **mac-8gb / vps-no-gpu** | 8GB | nomic-embed-text, llama3.2:1b | 1 |
| **mac-16gb** | 16GB | + qwen2.5-coder:7b, qwen3.5:9b | 2 |
| **mac-32gb** | 32GB | + deepseek-r1:14b | 3 |
| **mac-64gb+** | 64GB+ | + qwen3-coder-next:80b | 4 |
| **linux-rtx3090** | 24GB VRAM | nomic, llama3.2:3b, qwen2.5-coder:7b, qwen3.5:9b, deepseek-r1:14b | 3 |
| **linux-rtx4090** | 24GB VRAM | + qwen3-coder-next:80b (quantized) | 4 |
| **dgx-spark** | 128GB unified | Modeles 70-200B non-quantises | 6 |

### 1.4 Routing par tache

| Tache | Prio 1 (owned/free) | Prio 2 (owned/free) | Prio 3 (cout) |
|-------|----------------------|----------------------|----------------|
| Embedding | Ollama nomic-embed-text local | node distant possede | — |
| Classification | petit modele local | node distant possede | — |
| Summarize | Ollama qwen3.5:9b local | Groq Llama 70B | — |
| Code completion | outil/script local si possible, sinon Ollama coder local | GPU node possede / Codestral free | — |
| Code review | outils locaux (tests, lint, semgrep, diff) + modele local/free | Cerebras Qwen3 235B | Claude Sonnet |
| Architecture | memoire + contexte + modele local/free suffisant | Gemini 2.5 Pro | Claude Opus |
| Debug complexe | logs/tests/scripts locaux + modele local/free | Claude Sonnet | GPT-5.4 |
| Security audit | Semgrep local + scripts locaux | Cerebras | Claude Sonnet |
| PR description | Ollama local | Groq Llama 70B | — |
| Commit message | Ollama qwen3.5:9b | — | — |
| Voice transcription | Whisper local | Groq Whisper (gratuit) | — |
| Voice optimization | Ollama qwen3.5:9b | node distant possede | — |

### 1.4bis Success Memory / Runbooks

REX doit stocker deux classes de memoire distinctes :

- **failure lessons** : ce qui a casse et comment l'eviter
- **success runbooks** : ce qui a marche et peut etre rejoue

Categories minimales a ajouter :

- `success`
- `runbook`
- `deploy`
- `workflow`
- `machine-profile`

Exemples de capture :

- deploy reussi
- procedure setup stable
- sequence de recovery reussie
- commande exacte qui fonctionne sur une machine donnee

Injection attendue :

- au demarrage de session si le repo/machine matche
- avant une tache similaire (`deploy`, `build`, `release`, `meeting-bot-setup`)
- dans `rex context` et `rex preload`

### 1.5 Semantic Cache

```sql
CREATE TABLE llm_cache (
  id INTEGER PRIMARY KEY,
  prompt_hash TEXT UNIQUE,
  prompt_embedding BLOB,
  response TEXT,
  model TEXT,
  task_type TEXT,
  tokens_saved INTEGER,
  created_at TEXT,
  hit_count INTEGER DEFAULT 0,
  ttl_hours INTEGER DEFAULT 168
);
```

Hit rate estime : 80%+ pour taches repetitives (categorize, summarize, commit msg).
Economie : des milliers de tokens/jour.

### 1.6 Budget Tracker

```
rex budget                     # consommation du mois
rex budget --daily             # par jour
rex budget --provider cerebras # par provider
rex budget --set-limit 5       # max $5/mois → force local au-dela
```

Table `token_usage(provider, model, tokens_in, tokens_out, cost_usd, latency_ms, timestamp)`.

### 1.7 Flutter UI — Providers Page

- **Provider list** : toggle enable/disable, drag-to-reorder priority
- **Quota bars** : consommation temps reel (Cerebras 800K/1M, Groq 12K/14.4K)
- **Routing chain** : visualisation du flow (cache → local → free → paid), drag-to-reorder
- **Cache stats** : hit rate %, tokens saved today/week/month
- **Budget** : graphe consommation jour/semaine/mois, limite mensuelle editable, alerte threshold
- **Task routing** : tableau task → provider assigne, editable (override possible)
- **Config** : `Settings Hub > Providers` + `Settings Hub > Routing` + `Settings Hub > Budget`

---

## BLOC 2 — ORCHESTRATEUR INTELLIGENT

### 2.1 Main Backends — SDK First

REX utilise les SDKs officiels comme voie principale, les CLIs en pipe mode comme fallback :

| Backend | SDK / CLI | Modeles | Role | Auth |
|---------|-----------|---------|------|------|
| **Agent SDK** (principal) | `@anthropic-ai/claude-agent-sdk` | Opus 4.6, Sonnet 4.6, Haiku 4.5 | Architecture, code, review, multi-turn sessions | OAuth (Pro/Max) OU API key |
| **OpenAI SDK** (principal) | `openai` / `@ai-sdk/openai` | GPT-5.4, Codex Mini, o3 | Code gen, computer use, batch | OAuth (Plus) OU API key |
| **claude -p** (fallback) | Claude Code CLI pipe mode | Idem Agent SDK | Fallback si SDK non voulu (single-turn simple) | OAuth (Pro/Max) |
| **codex -p** (fallback) | Codex CLI pipe mode | Idem OpenAI SDK | Fallback si SDK non voulu (single-turn simple) | OAuth (Plus) |
| **OpenCode** | CLI direct | Free providers | CLI coding agent 100% gratuit | Free |
| **Aider** | CLI direct | Free providers | Edit + auto-commit | Free |
| **Ollama** | HTTP API | Local models | Taches triviales, embed, classify | Aucune |

**Avantages SDK vs CLI pipe** :
- Multi-turn sessions persistantes (pas de re-appel avec contexte)
- Streaming temps reel vers Flutter UI
- Token metriques exactes (pas d'estimation)
- Prompt caching automatique (-90% sur contexte repete)
- Batch API (-50% sur taches non-urgentes)
- Custom tools injectables (memory search, observe, delegate)
- MCP servers injectables programmatiquement

### 2.2 Backend Detection & Setup

Au premier `rex init` ou `rex setup`, REX detecte et configure les backends.
**Deux modes d'auth par SDK** : OAuth (subscription) ou API key (pay-per-token).

```
rex setup
  │
  ├─ Claude backend :
  │   ├─ ANTHROPIC_API_KEY present ? → Agent SDK (API key mode)
  │   │   └─ Prompt caching + batch API + metriques exactes
  │   ├─ claude --version + subscription ? → Agent SDK (OAuth mode)
  │   │   └─ Warning : "prompt caching et batch non dispo en OAuth"
  │   ├─ claude --version sans rien ? → claude -p (pipe fallback)
  │   └─ Rien → Claude backend SKIPPED
  │
  ├─ OpenAI backend :
  │   ├─ OPENAI_API_KEY present ? → OpenAI SDK (API key mode)
  │   ├─ codex --version + subscription ? → Codex CLI (OAuth mode)
  │   └─ Rien → OpenAI backend SKIPPED
  │
  ├─ Ollama accessible ? → Local backend active
  ├─ Free providers → toujours actifs (0 config)
  └─ Resume : "Backends actifs : Agent SDK OAuth (Opus/Sonnet), OpenAI SDK (GPT-5.4), Ollama, 8 free providers"
```

**Setup interactif VPS (headless)** :
```bash
rex setup
# > Pas de GUI detectee (headless mode)
# >
# > === Claude Backend ===
# > Mode : [1] API key (pay-per-token, prompt caching)
# >         [2] Subscription OAuth (Pro/Max flat rate)
# >         [3] Skip
# > Choix : 2
# > Lancement auth OAuth... (ouvre un lien ou code device)
# > Connecte ! Claude Max detecte.
# > Warning : prompt caching et batch API non disponibles en mode OAuth.
# >
# > === OpenAI Backend ===
# > Mode : [1] API key (pay-per-token)
# >         [2] Subscription OAuth (ChatGPT Plus)
# >         [3] Skip
# > Choix : 1
# > OPENAI_API_KEY ? [coller]
# > Connecte ! GPT-5.4 disponible.
# >
# > === Local ===
# > Ollama URL ? [http://localhost:11434] → OK, 3 modeles detectes
# > Telegram bot token ? [coller ou Enter pour skip]
# >
# > Config sauvee dans ~/.claude/rex/config.json (permissions 600)
# > Run "rex doctor" pour verifier
```

**Setup macOS (avec GUI)** :
- Meme flow en CLI, OU via Flutter app Settings > API Keys
- L'app Flutter a des champs securises (password fields) pour les API keys
- Bouton "Login with Claude" pour OAuth (ouvre le browser)
- Bouton "Login with OpenAI" pour OAuth Codex
- Les credentials sont stockees dans `~/.claude/rex/config.json` (permissions 600)
- JAMAIS dans un fichier versionne

**Config resultante** :
```json
{
  "backends": {
    "claude": {
      "mode": "oauth",
      "plan": "max",
      "models": ["opus-4-6", "sonnet-4-6", "haiku-4-5"]
    },
    "openai": {
      "mode": "api-key",
      "models": ["gpt-5.4", "gpt-5-codex-mini", "o3"]
    },
    "ollama": {
      "url": "http://localhost:11434",
      "models": ["qwen3.5:9b", "nomic-embed-text"]
    }
  }
}
```

### 2.3 `rex delegate`

```bash
rex delegate "refactor auth module"
# REX analyse :
# - Nombre de fichiers impliques (git diff + imports)
# - Complexite cyclomatique estimee
# - Presence de tests existants
# - Risque (securite ? DB ? API publique ?)
#
# Puis choisit le backend + modele optimal :
# TRIVIAL → Ollama local
# LOW     → Aider + free provider (Cerebras Qwen3 235B)
# MED     → OpenAI SDK Codex Mini ou OpenCode + free
# HIGH    → Agent SDK Sonnet 4.6 ou OpenAI SDK GPT-5.4
# CRIT    → Agent SDK Opus 4.6 (confirmation user requise)
#
# Fallback si SDK indisponible :
# Agent SDK down → claude -p (si abo) → free providers
# OpenAI SDK down → codex -p (si abo) → free providers
```

### 2.4 Token Optimization Strategy

Pour CHAQUE delegation a un provider payant (SDK ou CLI) :

1. **Prompt caching** (Agent SDK only) :
   - System prompt (CLAUDE.md + project context) = cache prefix
   - Cache hit = -90% sur le contexte (~$0.30/MTok au lieu de $3/MTok)
   - REX structure ses prompts pour maximiser le cache prefix commun

2. **Batch API** (Agent SDK + OpenAI SDK) :
   - Taches non-urgentes (reviews, consolidation, categorize) → batch
   - -50% sur le prix token
   - Resultat en <24h (souvent <1h)

3. **Context pre-computation** :
   - Seulement les fichiers concernes (pas tout le repo)
   - CLAUDE.md tronque aux sections pertinentes
   - Observations recentes (5 max)

4. **Session reuse** (Agent SDK only) :
   - Multi-turn = 1 session pour N echanges au lieu de N appels isoles
   - Le contexte reste en memoire cote serveur

5. **Result caching** (REX semantic cache) :
   - Hash (prompt + fichiers) → si meme requete → cache local
   - Reviews cachees 7j, code gen 1j

**Economie estimee : 85-95% de reduction vs usage naif par-token.**

### 2.5 Multi-account Management (from Milo PR #5)

```bash
rex accounts add work        # Cree profil avec ses propres API keys
rex accounts add personal    # Cree un autre profil
rex accounts switch work     # Bascule les cles actives
rex accounts list            # Affiche tous les comptes + actif
```

Chaque compte a ses propres API keys, settings, rules, projects.
**Compatibilite** : fonctionne avec Agent SDK (API keys) ET claude -p (CLAUDE_CONFIG_DIR).
**Note securite** : sanitiser les noms (regex `^[a-zA-Z0-9_-]+$`), cles en permission 600.

### 2.6 Flutter UI — Orchestrator

- **Backends page** : cards pour chaque backend (Agent SDK, OpenAI SDK, claude -p, codex -p, Ollama, OpenCode, Aider)
  - Status : connected/disconnected/fallback
  - Toggle enable/disable
  - API key input (securise, masque)
  - Token usage en temps reel (SDK only)
- **Delegate history** : tableau des delegations (tache, backend, complexite, duree, cout, resultat)
- **Complexity thresholds** : sliders LOW/MED/HIGH/CRIT dans Settings Hub > Routing
- **Accounts** : liste comptes, switch actif, add/remove dans Settings Hub > Accounts
- **Token stats** : tokens par backend, par jour, par projet — graphe (SDK = exact, CLI = estimation)
- **Cost dashboard** : depenses par jour/semaine/mois, projection, alerte budget

---

## BLOC 3 — MEMOIRE CENTRALISEE (JARVIS BRAIN)

### 3.1 Observational Memory (pattern Mastra)

**Observer** — hook SessionEnd :
```
Session terminee
  → Compresse l'historique en observations (~200-300 tokens)
  → Extrait : decisions, blockers, patterns, erreurs, solutions
  → Stocke dans table `observations` avec embeddings
  → Tag le projet, la branche, le type
```

**Reflector** — daemon cycle quotidien :
```
Chaque nuit a 3h :
  → Lit toutes les observations des 7 derniers jours
  → Deduplique (cosine > 0.90)
  → Identifie les patterns recurrents
  → Promeut les patterns en `rules` (si 3+ occurrences)
  → Archive les observations > 90 jours
  → Compresse les observations 30-90 jours (merge similaires)
```

### 3.2 Schema

```sql
-- Faits stables (conventions, API patterns, stack info)
CREATE TABLE facts (
  id INTEGER PRIMARY KEY,
  category TEXT,
  content TEXT,
  source TEXT,
  confidence REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  embedding BLOB,
  created_at TEXT
);

-- Observations (decisions, events, sessions)
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  project TEXT,
  type TEXT,  -- decision | blocker | solution | error | pattern | habit
  content TEXT,
  embedding BLOB,
  created_at TEXT,
  consolidated_into INTEGER REFERENCES observations(id)
);

-- Habitudes utilisateur (apprises automatiquement)
CREATE TABLE habits (
  id INTEGER PRIMARY KEY,
  pattern TEXT,      -- "toujours cree branche avant commit"
  frequency INTEGER, -- nombre d'occurrences observees
  confidence REAL,
  first_seen TEXT,
  last_seen TEXT
);

-- Cache LLM semantique
CREATE TABLE llm_cache (
  id INTEGER PRIMARY KEY,
  prompt_hash TEXT UNIQUE,
  prompt_embedding BLOB,
  response TEXT,
  model TEXT,
  task_type TEXT,
  tokens_saved INTEGER,
  created_at TEXT,
  hit_count INTEGER DEFAULT 0,
  ttl_hours INTEGER DEFAULT 168
);

-- Nodes reseau
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT,
  hostname TEXT,
  ip TEXT,
  capabilities JSON,
  status TEXT DEFAULT 'offline',
  last_heartbeat TEXT
);

-- Token usage
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY,
  provider TEXT,
  model TEXT,
  task_type TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  cached BOOLEAN DEFAULT FALSE,
  timestamp TEXT
);
```

### 3.3 Forgetting Curve

- 0-30 jours : actif, searchable, poids normal
- 30-90 jours : compresse (merge similaires), poids reduit
- 90+ jours : archive (hors du search actif, accessible via `rex memory --archive`)
- Acces frequent → renforce (le compteur `access_count` influence le ranking)

### 3.4 Backup & Recovery

```bash
rex backup                      # copie DB + config → ~/.claude/rex/backups/
rex backup --restore <date>     # restore depuis un backup
rex memory reindex              # re-embed toute la DB (si modele change)
rex memory reindex --dry-run    # montre ce qui serait reindex sans le faire
```

Daemon cron : backup quotidien a 2h (avant reflector a 3h).
Retention : 7 derniers backups, rotation automatique.
Format : `backup-YYYY-MM-DD.tar.gz` (DB SQLite + config.json + guards).
Si reflector rate sa fenetre (machine eteinte) → catch-up au prochain demarrage.

### 3.5 Cross-Node Sync

Hub API endpoints :
```
GET  /api/memory/search?q=<query>&limit=10     → recherche semantique
POST /api/memory/observe                        → ajouter observations
GET  /api/memory/context?project=<name>         → contexte projet
GET  /api/memory/facts?category=<cat>           → faits par categorie
POST /api/memory/sync                           → sync node → hub
```

Mode offline : queue locale dans `~/.claude/rex/offline-queue.jsonl`, flush au reconnect.

### 3.6 Ce que REX connait de toi (appris automatiquement)

- **Projets actifs** : detectes par `rex projects` (scan ~/Documents/Developer/)
- **Stack preferee** : observee depuis les deps des projets
- **Habitudes de commit** : frequence, style, heures de travail
- **Patterns de debug** : quand tu bloques, quelle approche tu prends
- **Erreurs recurrentes** : les erreurs que tu fais souvent → rules auto
- **Preferences UI** : quels composants tu reutilises, quel design system
- **Workflow** : branche avant commit ? tests avant push ? review avant merge ?

### 3.7 Flutter UI — Memory Page (enrichir existant)

- **Observations browser** : timeline filtrable par projet/type/date, expandable cards
- **Facts browser** : liste par categorie, confidence score, edit/delete
- **Habits** : liste des habitudes detectees, frequency, confidence
- **Forgetting curve** : visualisation graphique (actif → compress → archive), params editables
- **Reflector status** : derniere execution, prochaine, observations promues en rules
- **Stats** : total memories, observations/jour, cache hit rate, embeddings pending
- **Config** : `Settings Hub > Memory` (compress/archive days, reflector schedule, thresholds)

---

## BLOC 4 — YOLO SANDBOX (execution isolee)

### 4.1 Pourquoi

Les agents IA (Claude Code, Codex) executent du code sur ta machine.
Risques : `rm -rf`, modification de fichiers hors scope, installation de deps malveillantes.
Solution : sandboxer l'execution dans un container isole.

### 4.2 Architecture hybride

Principe : REX n'implemente pas un sandbox engine maison.
REX orchestre des runtimes existants et expose une interface unique.

**Mode leger (quotidien)** — Anthropic sandbox-runtime :
- Pas de Docker, restrictions OS-level (`sandbox-exec` macOS, `bubblewrap` Linux)
- Filesystem restreint au dossier projet
- Reseau restreint (whitelist GitHub, npm, pypi)
- Zero overhead, startup instantane
- Ideal pour les taches quotidiennes

**Mode complet (taches risquees)** — Yolobox / Docker :
- Container Docker avec tous les runtimes
- Dossier projet monte, home directory NON monte
- sudo complet dans le container
- Docker-in-Docker pour build/test
- Ideal pour : installer des deps inconnues, tester du code genere, CI local

### 4.3 Integration REX

Couche REX attendue :

- choix du runtime (`light` / `full` / `off`)
- mapping risque -> profil sandbox
- healthcheck du runtime installe
- logs et status unifies
- fallback si un runtime n'est pas disponible

Ce que REX n'a pas a refaire si l'OSS le fournit deja :

- isolation kernel / container
- policy engine bas niveau du sandbox
- image/runtime complet de sandbox
- primitives d'IPC internes au sandbox

```bash
rex sandbox shell                    # shell interactif dans sandbox
rex sandbox run "npm test"           # executer commande sandboxee
rex sandbox claude "fix auth bug"    # Claude Code dans sandbox
rex sandbox codex "add feature"      # Codex dans sandbox
rex sandbox --mode=light             # sandbox OS-level (defaut)
rex sandbox --mode=full              # sandbox Docker

# Auto-sandbox : configurable dans rex config
rex config set sandbox.auto true     # TOUT s'execute en sandbox par defaut
rex config set sandbox.mode light    # light par defaut, full si risque detecte
```

### 4.4 Risk Detection automatique

REX analyse la tache avant execution et decide du mode :
- Tache lit des fichiers seulement → pas de sandbox
- Tache modifie du code existant → sandbox light
- Tache installe des deps / `npm install` → sandbox full
- Tache touche a la config systeme → sandbox full + confirmation user

Le role de REX ici est de classifier et router, pas de reinventer le runtime.

### 4.5 Self-hosted sur VPS

```yaml
# Ajout au docker-compose.yml du Hub
services:
  rex-sandbox:
    image: <runtime-officiel-ou-image-validee>
    privileged: true  # pour Docker-in-Docker
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - sandbox-workdir:/workspace
    networks:
      - rex-network
```

Les agents distants (via Gateway Telegram) executent leur code dans ce sandbox.
Aucun risque pour le VPS host.

### 4.6 Outils sandbox compares

| Outil | Type | Self-host | Startup | Integration |
|-------|------|-----------|---------|-------------|
| **Anthropic sandbox-runtime** | OS-level | Natif | Instant | Claude Code natif |
| **Yolobox** | Docker | Oui | ~2s | Claude/Codex/Gemini/OpenCode |
| **Daytona** | Docker | Oui | 200ms | SDK TypeScript |
| **microsandbox** | microVM | Oui (KVM) | <200ms | MCP |
| **E2B** | Firecracker | Cloud (self exp.) | <200ms | SDK TypeScript |

**Recommandation** : Anthropic sandbox-runtime pour le mode light (quotidien),
Yolobox pour le mode full (Docker), les deux integres derriere une couche REX mince.

### 4.7 Flutter UI — Sandbox Page

- **Status** : mode actif (light/full/off), sessions en cours
- **Sessions** : liste des sandboxes actives, logs live, bouton kill
- **Risk log** : historique des detections de risque (commande, niveau, decision)
- **Whitelist editor** : domaines autorises, ajouter/retirer
- **Mode switch** : toggle light/full/off
- **Config** : `Settings Hub > Sandbox` (mode, auto-detect, whitelist, risk patterns)

---

## BLOC 5 — CODE REVIEW PIPELINE

### 5.1 Stack (tout gratuit, tout local)

| Outil | Role | Commande REX | Temps |
|-------|------|-------------|-------|
| **Biome** | Lint + format JS/TS | `rex lint` | <1s |
| **Gitleaks** | Secret detection rapide | `rex guard --secrets` | <1s |
| **Semgrep CE** | SAST 3000+ regles | `rex security --sast` | ~10s |
| **OSV-Scanner** | Deps vulnerabilites | `rex security --deps` | ~3s |
| **TruffleHog** | Secret scan profond | `rex security --secrets-deep` | ~30s |
| **Knip** | Code mort | `rex clean --dead-code` | ~5s |
| **PR-Agent** | AI code review | `rex review --ai` | ~30s |
| **Act** | GitHub Actions local | `rex ci` | variable |

### 5.2 `rex review`

```bash
rex review               # pipeline complet
rex review --quick        # lint + secrets (<5s)
rex review --ai           # + AI review free provider
rex review --full         # + tests + security + coverage
rex review --pre-push     # mode gate : bloque le push si fail
```

Pipeline :
```
1. Biome lint + format check        (local, <1s)
2. Gitleaks secret scan             (local, <1s)
3. TypeScript tsc --noEmit          (local, ~5s)
4. Semgrep SAST                     (local, ~10s)
5. OSV-Scanner deps                 (local, ~3s)
6. Vitest --run (si existe)         (local, ~10s)
7. PR-Agent AI review               (free provider ou Ollama, ~30s)
8. Coverage > seuil                 (configurable, defaut 60%)
```

Chaque etape : OK (vert) / WARNING (jaune) / FAIL (rouge + bloque) / SKIPPED (gris, outil absent).

**Outils manquants = skip graceful, JAMAIS crash.**
```
$ rex review
  1. Biome lint:          SKIPPED (not installed — run `npm i -D @biomejs/biome`)
  2. Gitleaks:            OK (0 secrets)
  3. TypeScript tsc:      OK (0 errors)
  4. Semgrep:             SKIPPED (not installed — run `brew install semgrep`)
  ...
```
`rex review --install-deps` → installe automatiquement tous les outils manquants.

### 5.3 Flutter UI — Review Page

- **Pipeline dashboard** : 8 etapes avec toggle enable/disable chacune
- **Run review** : bouton lance `rex review` sur le projet courant, resultat live
- **Historique** : liste des reviews passees, expandable (details par etape)
- **Coverage** : threshold editable, graphe progression
- **Pre-push toggle** : activer/desactiver le blocage push
- **Config** : `Settings Hub > Review` (pipeline steps, thresholds, AI provider)

---

## BLOC 6 — GUARDS INTELLIGENTS

### 6.1 Garder les guards v6 existants

Guards actuels dans `~/.claude/rex-guards/` : inchanges, backward compatible.

### 6.2 Nouveaux guards

| Guard | Hook | Detecte | Action |
|-------|------|---------|--------|
| **secret-guard** | PreToolUse(Write/Edit) | sk-, ghp_, Bearer, cles hex 32+ | BLOCK |
| **any-type-guard** | PostToolUse(Write/Edit) | `any` TypeScript ajoutes | WARNING + type suggestion |
| **console-log-guard** | PostToolUse(Write/Edit) | console.log hors tests | WARNING |
| **a11y-guard** | PostToolUse(Write/Edit TSX) | img sans alt, button sans aria-label | WARNING |
| **perf-guard** | PostToolUse(Write/Edit) | useEffect sans deps, API en boucle | WARNING |
| **import-guard** | PostToolUse(Write/Edit TS) | imports non utilises | WARNING |
| **honesty-guard** | UserPromptSubmit | "c'est fait" sans preuve | INJECT verification |

### 6.3 Guard CLI

```bash
rex guard list                    # guards actifs
rex guard add secret-guard        # installer depuis registry
rex guard disable perf-guard      # desactiver temporairement
rex guard create my-guard         # creer un guard custom
```

Interface uniforme : `exit 0` = OK, `exit 2` = BLOCK, stdout = message.
**Timeout hard 500ms** — si un guard depasse → kill + skip + log warning.
Si un guard timeout 3x de suite → auto-disable + notification user.
Process isolation : chaque guard tourne dans un child process separe, jamais dans le main thread.

### 6.4 Flutter UI — Guards

- **Guards list** : tous les guards avec toggle enable/disable, severity badge (block/warn/info)
- **Guard logs** : derniers triggers par guard (timestamp, fichier, action prise)
- **Add guard** : depuis registry REX ou custom (script path)
- **Guard editor** : pour les guards custom, editeur basique avec preview
- **Config** : `Settings Hub > Guards` (same view, accessible aussi depuis la sidebar)

---

## BLOC 7 — DAEMON EVENT-DRIVEN

### 7.1 Architecture hybride (events + crons)

```
[chokidar FSEvents]        [Cron Scheduler]        [Network Events]
  ~/.claude/sessions/        1h : ingest+categorize    Node heartbeat (30s)
  ~/.claude/rex/pending/     6h : context refresh      WoL triggers
  git hooks                  3h : consolidate          Task assignments
        │                       │                          │
        └───────────> [Event Queue (prioritized)] <────────┘
                              │
                      [Event Processor]
                        route to handler
                        debounce (1s)
                        circuit breaker
                        max 1000 events (oldest-first eviction)
                        priority: git > session > file > network
```

### 7.2 Self-healing

- **Circuit breaker** : 3 fails → pause 5min → retry
- **Degraded mode** : Ollama down → taches non-LLM continuent
- **Auto-restart** : LaunchAgent (macOS) / systemd (Linux) / Docker restart policy
- **Health API** : `GET /api/health` → status de chaque composant
- **Watch ignore** : `node_modules/`, `.git/`, `build/`, `dist/`, `.next/`, `__pycache__/`
- **RAM guard** : si RSS daemon > 512MB → restart automatique en mode polling (plus lent, moins RAM)

### 7.3 Git hooks

```bash
# Installes par rex init
post-commit  → rex daemon --event=commit   # extraire lecons
post-merge   → rex daemon --event=merge    # analyser changements
pre-push     → rex review --quick          # bloquer si fail
```

### 7.4 Flutter UI — Daemon (dans Health page enrichie)

- **Daemon status** : running/stopped, uptime, mode (local/hub/headless)
- **Event queue** : events en attente, processing, completed (live)
- **Cron schedule** : tableau des crons avec toggle enable/disable, next run, last run
- **Circuit breaker** : status par handler (OK/tripped/paused), reset button
- **Health components** : Ollama, Claude Code, Codex, Tailscale, Docker — status par composant
- **Config** : `Settings Hub > Daemon` (cron intervals, circuit breaker params, debounce)

---

## BLOC 8 — WORKFLOWS (from Milo)

### 8.1 `rex workflow new-feature "<nom>"`

1. Cree branche `feat/<nom>` depuis main
2. Cree FEATURE.md (template : objectif, scope, acceptance criteria)
3. Injecte skills pertinents (detectes par stack)
4. Active guards pertinents
5. Log dans observations : "Feature started: <nom>"

### 8.2 `rex workflow bug-fix "<description>"`

1. Cree branche `fix/<description>`
2. Injecte skill debug
3. Force test reproduisant le bug AVANT le fix
4. Cree BUG.md (repro, hypotheses, solution)

### 8.3 `rex workflow pr`

1. `rex review --full` → BLOQUE si rouge
2. Genere description PR (commits + FEATURE.md/BUG.md)
3. Push + ouvre PR GitHub
4. `rex review --ai` sur le diff
5. Attend reviews auto, fix ce qui est valide

### 8.4 `rex workflow deploy [staging|prod]`

1. `rex review --full` → bloque si rouge
2. CI vert ?
3. Prod : confirmation + changelog auto
4. Post-deploy : log + monitoring check

### 8.5 Flutter UI — Workflows

- **Active workflows** : liste des workflows en cours (branche, type, etape actuelle)
- **Quick actions** : boutons "New Feature", "Bug Fix", "PR", "Deploy"
- **Templates** : gestion des templates de workflow (FEATURE.md, BUG.md)
- **History** : workflows termines, duree, resultats

---

## BLOC 9 — DOCKER DEPLOYMENT

### 9.1 Docker Compose (VPS)

```yaml
# NOTE: pas de `version:` — deprecie depuis Docker Compose v2.x
services:
  rex-hub:
    image: ghcr.io/keiy78120/rex:latest
    ports:
      - "3117:3117"
    volumes:
      - rex-data:/data
      - rex-config:/config
    environment:
      REX_MODE: hub
      REX_TELEGRAM_BOT_TOKEN: ${REX_TELEGRAM_BOT_TOKEN}
      REX_TELEGRAM_CHAT_ID: ${REX_TELEGRAM_CHAT_ID}
      OLLAMA_URL: http://ollama:11434
      REX_JWT_SECRET: ${REX_JWT_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3117/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      ollama:
        condition: service_healthy

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  rex-sandbox:
    image: <runtime-officiel-ou-image-validee>
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - sandbox-workdir:/workspace
    networks:
      - rex-network

  traefik:
    image: traefik:v3
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - traefik-certs:/certs
    command:
      - --providers.docker=true
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true

volumes:
  rex-data:
  rex-config:
  ollama-models:
  sandbox-workdir:
  traefik-certs:

networks:
  rex-network:
```

### 9.2 One-command setup

```bash
# Option 1 : script install
curl -fsSL https://get.rex-cli.dev | bash

# Option 2 : npm + docker
npm install -g rex-claude
rex init --docker
docker compose up -d

# Option 3 : pure Docker (VPS sans Node)
docker compose up -d  # depuis le repo clone
```

`rex init --docker` :
- Detecte GPU → GPU passthrough
- Detecte RAM → modeles Ollama adaptes
- Genere `.env` avec tokens (interactif)
- Genere `docker-compose.yml` adapte
- Propose Tailscale-only en premier pour dashboard/API distants
- Si exposition HTTP publique demandee : Traefik + allowlist stricte + auth

### 9.3 Dashboard distant / API exposee

Ordre recommande :

1. **Tailnet only** : dashboard/API acces uniquement via Tailscale
2. **VPS + Traefik** : seulement si acces hors tailnet requis

Regles :

- une seule API REX dans le mono-repo
- le dashboard distant consomme cette API
- seuls les appareils user autorises doivent pouvoir joindre l'endpoint
- si Traefik est expose, combiner allowlist IP + auth applicative
- Configure Tailscale si present
- Cree systemd service pour auto-start

### 9.3 Modes

| Mode | Commande | Tourne |
|------|----------|--------|
| **Local** | `rex daemon` | Daemon + Ollama local |
| **Hub** | `rex daemon --hub` | + API REST + network |
| **Docker** | `docker compose up` | Hub + Ollama + Sandbox containeurises |
| **Headless** | `rex daemon --headless` | Pas de GUI Flutter |
| **Node** | `rex node start` | Agent leger → Hub |

### 9.4 Note VPS sizing

Le VPS Kevin (2 vCPU, 8GB RAM) est **juste** pour Hub + Ollama + Sandbox simultanes.
Recommandation : Ollama sur le VPS uniquement avec petits modeles (1.5b, 3b).
Les modeles 7b+ → deleguer au Mac ou au PC GPU via le reseau.
Si le VPS est sature → desactiver Ollama sur le VPS, garder uniquement Hub + Gateway + Sandbox.

### 9.5 Flutter UI — Network Page (nouvelle)

- **Nodes map** : liste des machines (Mac, VPS, PC GPU) avec status online/offline, specs
- **WoL buttons** : reveiller une machine a distance (deja dans gateway, exposer dans l'UI)
- **Task routing** : tableau des taches en cours et quelle machine les execute
- **Latence** : ping par node, graphe temps reel
- **Docker status** : containers actifs sur le Hub (si mode Docker)
- **Config** : `Settings Hub > Network` (mode, hub URL, Tailscale, nodes, WoL)

---

## BLOC 10 — HARDWARE AUTO-DETECTION

### 10.1 `rex init` intelligent

```bash
rex init
# Auto-detecte :
# OS, CPU, GPU (Apple Silicon/NVIDIA/AMD/none), RAM, stockage
# Ollama, Claude Code, Codex, OpenCode, Aider (versions)
# Docker, Tailscale, Git
#
# Configure :
# Modeles Ollama adaptes
# Router + providers
# Daemon (LaunchAgent/systemd/Docker)
# Guards + hooks
# Network registration si Hub
```

### 10.2 `hardware.ts`

```typescript
interface HardwareProfile {
  os: 'macos' | 'linux' | 'docker';
  cpu: { arch: string; cores: number; model: string };
  gpu: { type: 'apple-silicon' | 'nvidia' | 'amd' | 'none'; model: string; vram_gb: number };
  ram_gb: number;
  storage_free_gb: number;
  network: { tailscale: boolean; tailscale_ip?: string };
  backends: { claude_code: boolean; codex: boolean; opencode: boolean; aider: boolean };
}
```

### 10.3 WoL Mac M1 — workaround

Les Mac Apple Silicon ne supportent PAS le WoL traditionnel (magic packet).
Workaround : Tailscale keepalive. Le Mac reste joignable tant que Tailscale tourne.
Alternative : `caffeinate` schedule (empeche le sleep pendant les heures de travail).
Pour le PC GPU : WoL classique fonctionne (carte reseau Ethernet).

### 10.4 Flutter UI — Hardware (dans Health page enrichie)

- **Hardware profile** : CPU, GPU, RAM, stockage — detecte au `rex init`, affiche dans Health
- **Modeles recommandes** : liste des modeles Ollama adaptes au hardware, bouton "Install"
- **Backends detectes** : Claude Code, Codex, OpenCode, Aider — versions, status
- **Config** : pas de section Settings dediee, expose dans `Settings Hub > General`

---

## BLOC 11 — PROJECT BOOTSTRAP (from Milo PR #5)

### 11.1 `rex project init`

```bash
rex project init
# Detecte stack (Next.js, React, Flutter, Python, Go, etc.)
# Cree CLAUDE.md adapte au stack
# Init git si absent
# Cree repo GitHub (gh repo create)
# Configure branch protection
# Copie .github/ templates (CI, review, dependabot)
# Installe skills adaptes au stack (SKILL_MAP)
# Cree docs/ skeleton
```

### 11.2 SKILL_MAP (from Milo preload.ts rewrite + community research)

```typescript
// Skills internes REX (28 bundled) + community skills top-installs
const SKILL_MAP: Record<string, string[]> = {
  // Stack-specific (REX bundled)
  'next':       ['ux-flow', 'ui-craft', 'seo', 'perf', 'vercel-react-best-practices'],
  'react':      ['ux-flow', 'ui-craft', 'vercel-react-best-practices'],
  'drizzle':    ['db-design'],
  'prisma':     ['db-design'],
  'vitest':     ['test-strategy'],
  'playwright': ['test-strategy'],
  'tailwind':   ['ui-craft', 'web-design-guidelines'],
  'express':    ['api-design', 'auth-patterns'],
  'fastify':    ['api-design', 'auth-patterns'],
  'flutter':    ['ui-craft'],
  'python':     ['test-strategy'],
  'go':         ['test-strategy', 'api-design'],

  // Toujours actifs (via superpowers plugin)
  '_always':    ['brainstorming', 'writing-plans', 'test-driven-development',
                 'systematic-debugging', 'verification-before-completion',
                 'code-review', 'build-validate'],
};
```

### 11.3 Ecosystem Skills (recherche Mars 2026)

**SKILL.md est un standard cross-platform** : Claude Code, Codex CLI, Gemini CLI, Cursor, Antigravity.
Les skills REX sont donc portables vers tous ces outils.

**Top skills communautaires (par installs sur skills.sh)** :

| Rank | Skill | Installs | Auteur | REX integre ? |
|------|-------|----------|--------|---------------|
| 1 | find-skills | 418K | vercel-labs | Via `rex skills search` |
| 2 | vercel-react-best-practices | 176K | vercel-labs | Auto (SKILL_MAP) |
| 3 | web-design-guidelines | 137K | vercel-labs | Auto (SKILL_MAP) |
| 4 | remotion-best-practices | 126K | remotion | Opt-in |
| 5 | frontend-design | 124K | Anthropic | Auto (toujours) |

**Plugins recommandes** :

| Plugin | Stars | Pourquoi |
|--------|-------|----------|
| **superpowers** (obra) | 42K+ | TDD + planning + code review — deja installe |
| **VibeSec** | — | OWASP Top 10:2025, checklists 20+ langages — securite |
| **OpenPaw** (38 skills) | — | Git, Telegram, Discord, Obsidian — kit utilitaire |

**Registries disponibles** :

| Registry | Taille | Acces |
|----------|--------|-------|
| skills.sh (Vercel) | Officiel | `npx skills` |
| SkillsMP | 400K+ indexes | skillsmp.com |
| awesome-agent-skills (VoltAgent) | 500+ cross-platform | GitHub |

REX v7 integre ces skills via `rex skills search` (cherche dans skills.sh + SkillsMP)
et `rex skills install <name>` (telecharge le SKILL.md dans le projet).

### 11.4 GitHub Auto-Setup (from Milo github_setup.ts)

Templates pre-fabriques dans `dotfiles/.github/` :
- `workflows/ci.yml` — lint + test + build
- `workflows/gemini-review.yml` — AI review sur PR
- `dependabot.yml` — updates auto deps
- `PULL_REQUEST_TEMPLATE.md`
- `ISSUE_TEMPLATE/bug_report.md`
- `ISSUE_TEMPLATE/feature_request.md`

Deployes en background par `rex project init` (fire-and-forget).

### 11.5 Flutter UI — Bootstrap (dans la page existante)

- Pas de page dediee — `rex project init` est un one-shot CLI
- **Health page** : section "Projects" — liste des projets detectes par `rex projects`
- **Quick action** : bouton "Init Project" dans Health → lance `rex project init` sur le CWD
- Le resultat (CLAUDE.md cree, skills installes, GitHub repo) s'affiche dans les logs

---

## BLOC 12 — VOICE INTEGRATION

### 12.1 Mode actuel (garder)

Bouton dans l'app Flutter → enregistre → Whisper local → transcription.
Post-traitement via LLM local (toggle dans Settings).
Auto start/stop pilote par `call-state.json` (Hammerspoon).

### 12.2 Optimisation voice

- **Groq Whisper** gratuit (14,400 req/jour) → meilleure qualite que Whisper local
- **Fallback** : Ollama whisper si Groq rate limited
- **Post-traitement** : Ollama qwen3.5:9b pour restructurer/resumer
- **Ingestion auto** : les transcriptions → memoire REX → searchable

### 12.3 Mode "tiny" voice (pour les notes rapides)

```bash
rex voice "note rapide sur le bug auth"
# → Ollama llama3.2:1b structure la note
# → Stocke dans observations
# → Accessible via rex search
```

### 12.4 Flutter UI — Voice (page existante enrichie)

La page Voice existe deja. v7 ajoute :
- **Provider selector** : Groq Whisper (gratuit) vs Ollama Whisper (local) — toggle dans la page
- **Transcription history** : liste des transcriptions passees, searchable
- **Auto-ingest toggle** : les transcriptions → memoire REX automatiquement
- **Tiny voice** : bouton "Quick Note" → enregistrement court → observation
- **Config** : `Settings Hub > Voice` (provider, post-process model, auto-ingest)

### 12.5 Meeting bots type Otter AI

REX doit supporter un sous-systeme "meeting bot" distinct du simple micro local :

- provisioning automatise
- join bot
- capture audio/transcript
- summarize
- persistence dans la memoire REX

Ordre de priorite :

1. integrer une brique open source existante si elle couvre 80% du besoin
2. automatiser son setup via scripts/agents REX
3. ne reimplementer que la colle REX (auth, memory, routing, replay)

Use cases :

- bot de reunion qui rejoint Zoom/Meet/Teams
- transcript stocke comme runbook / note / action items
- injection ulterieure dans `rex search`, `rex context`, `rex preload`

---

## BLOC 13 — FLUTTER ARCHITECTURE

Target produit :

- macOS : support principal immediat
- Windows : support desktop cible
- Linux : support desktop cible

Le dashboard distant, s'il existe, reste une vue secondaire sur l'API du hub.

### 13.1 Pages (v7 — 14 pages total)

| Page | Status | Contenu principal |
|------|--------|-------------------|
| **Health** | Existe | Doctor, hardware, daemon status, projects list, quick actions |
| **Memory** | Existe | Search, categories, consolidate, observations, facts, habits |
| **Gateway** | Existe | Telegram bot status, start/stop, logs |
| **Voice** | Existe | Record, transcribe, post-process, quick note |
| **Agents** | Existe | Agent list, orchestrator chat, delegate history |
| **MCP** | Existe | Servers list, marketplace, add/remove/toggle, scan |
| **Optimize** | Existe | CLAUDE.md analysis, suggestions |
| **Logs** | Existe | Daemon/Gateway/Agents/MCP/CLI tabs |
| **Settings** | Existe → **Settings Hub** | 14 domaines (voir P3) |
| **Network** | **NOUVEAU** | Nodes, WoL, task routing, latence, Docker status |
| **Providers** | **NOUVEAU** | Quotas, budget, cache stats, routing chain |
| **Review** | **NOUVEAU** | Pipeline dashboard, run, history, coverage |
| **Sandbox** | **NOUVEAU** | Status, sessions, risk log, whitelist |
| **Workflows** | **NOUVEAU** | Active workflows, quick actions, templates, history |

Note plateforme :

- desktop Flutter = surface principale cross-platform
- mobile Flutter futur = surface secondaire de pilotage
- VPS/headless = aucune UI requise, seulement CLI/API/gateway

### 13.2 State Management (CRITIQUE)

`rex_service.dart` fait 1600+ lignes. v7 le decoupe :

```
RexService (orchestrateur)
├── HealthService     — doctor, hardware, daemon
├── MemoryService     — search, categorize, consolidate, observe
├── GatewayService    — bot control, logs
├── VoiceService      — record, transcribe, post-process
├── AgentService      — agent CRUD, orchestrator, delegate
├── McpService        — servers, marketplace, scan
├── NetworkService    — nodes, WoL, sync
├── ProviderService   — quotas, budget, cache, routing
├── ReviewService     — pipeline, run, history
├── SandboxService    — shell, run, sessions
├── WorkflowService   — new-feature, bug-fix, pr, deploy
└── ConfigService     — config.json read/write, Settings Hub
```

Chaque service est un `ChangeNotifier` independant, injecte via `MultiProvider`.
`RexService` reste comme facade legere qui delegue aux sous-services.
Migration progressive : extraire un service a la fois, garder les anciens getters pour compatibilite.

### 13.3 Settings Hub Implementation

La page Settings passe de 5 onglets a 14 domaines (voir P3).
Implementation : `SettingsHub` widget avec `ListView` lateral + `IndexedStack` pour le contenu.
Chaque domaine = un widget Stateless qui lit/ecrit `ConfigService`.

### 13.4 Design System (garder l'existant)

- Theme : `theme.dart` avec `RexColors`, accent rouge `#E5484D`, dark/light
- Composants : `macos_ui` widgets (sidebar, toolbar, sheets)
- Pattern : `context.rex` extension pour acceder aux tokens
- Skill `ui-craft` applique sur toutes les nouvelles pages

---

## BLOC 14 — CLI MENU INTERACTIF

### 14.1 Pourquoi

Les CLIs sont le format ideal pour les LLMs (parsing facile, pas de GUI overhead).
Les users aussi preferent une navigation structuree plutot que de memoriser 30 commandes.
REX doit avoir un menu interactif comme point d'entree principal.

### 14.2 `rex` (sans argument)

```
$ rex

  REX v7.0.0 — Jarvis for Developers

  [1] Status & Health
  [2] Memory (search, ingest, categorize, consolidate)
  [3] Agents (create, run, list, delegate)
  [4] MCP Servers (list, add, remove, marketplace)
  [5] Providers (status, budget, cache stats)
  [6] Network (nodes, wake, sync)
  [7] Review (lint, security, AI review)
  [8] Sandbox (shell, run, claude, codex)
  [9] Workflows (new-feature, bug-fix, pr, deploy)
  [10] Voice (record, transcribe, note)
  [11] Settings (config, accounts, guards)
  [12] Logs (daemon, gateway, agents)

  > _
```

Chaque option ouvre un sous-menu contextuel.
Navigation par numero, fleches, ou texte libre (fuzzy match).

### 14.3 Sous-menu MCP (exemple)

```
  MCP Servers

  Active (5):
    [G] GitHub          github/github-mcp-server
    [P] Playwright      microsoft/playwright-mcp
    [W] Google Workspace  googleworkspace/cli
    [C] Context7        context7
    [F] Filesystem      @anthropic/filesystem

  [a] Add server (from registry or URL)
  [r] Remove server
  [m] Marketplace (browse 8,590+ servers)
  [s] Scan security (mcp-scan)
  [t] Test all connections
  [b] Back

  > _
```

### 14.4 LLM-friendly output

Toutes les commandes supportent `--json` pour output structuree :
```bash
rex mcp list --json          # JSON parseable par LLM
rex status --json            # idem
rex memory search "x" --json # idem
```

Le menu interactif utilise `@inquirer/prompts` (lightweight, TS natif).

---

## BLOC 15 — MCP HUB CENTRALISE

### 15.1 Architecture

```
                    +----------------------------------+
                    |        REX MCP Hub               |
                    |  mcporter (proxy/discovery)      |
                    |  + FastMCP (custom REX tools)    |
                    +----+----------+----------+------+
                         |          |          |
              +----------+   +------+---+  +--+--------+
              | GitHub   |   | Google   |  | Playwright|
              | MCP      |   | Workspace|  | MCP       |
              +----------+   +----------+  +-----------+
              | Context7 |   | Cloudflare|  | Slack    |
              +----------+   +----------+  +-----------+
              | Brave    |   | Monday   |  | Sentry   |
              +----------+   +----------+  +-----------+
              | SQLite   |   | Firecrawl|  | Custom...|
              +----------+   +----------+  +-----------+
```

**mcporter** = proxy central (daemon mode, auto-discovery, auth)
**FastMCP** = expose les tools custom de REX comme MCP server

### 15.2 MCP Servers par categorie

#### Tier 1 — Core local/safe

| Serveur | Repo | Pourquoi |
|---------|------|----------|
| **Filesystem** | Anthropic officiel | Operations fichiers securisees |
| **GitHub** | `github/github-mcp-server` | PRs, issues, actions, repos |
| **Sequential Thinking** | Anthropic officiel | Reasoning structure |
| **Memory** | REX custom (FastMCP) | Memory search, ingest, observe |

Par defaut :

- `Memory` et les tools REX internes peuvent rester disponibles
- les serveurs externes, y compris Tier 1, restent desactives tant que l'user ne les active pas
- REX peut les recommander automatiquement, jamais les activer silencieusement

#### Tier 2 — Recommandees par stack

| Stack detectee | MCP servers recommandes |
|----------------|---------------------|
| **Next.js / React** | Context7, Playwright, Sentry, Vercel |
| **Flutter** | Context7, Figma |
| **Python** | Context7, PostgreSQL |
| **Cloudflare** | Cloudflare MCP (2500+ endpoints) |
| **Any web project** | Playwright, Brave Search, Firecrawl |
| **DB project** | PostgreSQL / SQLite / Legion (multi-DB) |

#### Tier 3 — Google Workspace (opt-in)

| Serveur | Install |
|---------|---------|
| **Google Workspace** | `rex mcp add google-workspace` |
| Services : Gmail, Drive, Calendar, Sheets, Docs, Chat, Tasks, Forms, Admin | `gws mcp` via mcporter |
| **Securite** : `--sanitize` (Model Armor), AES-256-GCM credentials | Auto via mcporter auth |
| **Limitation** : comptes @gmail.com bug scope #119, besoin OAuth Cloud project | Documenter dans setup |

#### Tier 4 — Productivite (opt-in)

| Serveur | Source | Recommande si |
|---------|--------|---------------|
| **Monday** | mcporter | `monday.com` dans bookmarks ou `.monday-token` existe |
| **Slack** | `korotovsky/slack-mcp-server` | `SLACK_TOKEN` dans env |
| **Linear** | Officiel | `.linear` dans projet |
| **Notion** | Community | `NOTION_TOKEN` dans env |

#### Tier 5 — Cloud & Infra (opt-in)

| Serveur | Source | Recommande si |
|---------|--------|---------------|
| **Cloudflare** | `cloudflare/mcp` | `wrangler.toml` dans projet |
| **AWS** (13 serveurs) | `awslabs/mcp` | `~/.aws/credentials` existe |

#### Tier 6 — Monitoring (opt-in)

| Serveur | Source | Recommande si |
|---------|--------|---------------|
| **Sentry** | Officiel | `SENTRY_DSN` dans env ou `.sentryclirc` |
| **Grafana** | Officiel | `GRAFANA_URL` dans env |

#### Tier 7 — Recherche & Web

| Serveur | Source | Eligible si |
|---------|--------|------------|
| **Context7** | MCP officiel | besoin docs libs / reference primaire |
| **Brave Search** | Officiel | `BRAVE_API_KEY` |
| **Exa** | MCP | `EXA_API_KEY` |
| **Firecrawl** | MCP | `FIRECRAWL_API_KEY` |
| **Fetch** | Anthropic officiel | fallback web minimal |

### 15.3 Context-Aware Auto-Selection

```typescript
// Dans preload.ts — enrichir le SKILL_MAP existant
const MCP_MAP: Record<string, string[]> = {
  'next':        ['context7', 'playwright', 'sentry'],
  'react':       ['context7', 'playwright'],
  'flutter':     ['context7', 'figma'],
  'cloudflare':  ['cloudflare-mcp'],
  'drizzle':     ['postgresql', 'sqlite'],
  'prisma':      ['postgresql'],
  'tailwind':    ['context7'],
  'express':     ['context7', 'sentry'],
  'fastify':     ['context7', 'sentry'],
  'python':      ['context7'],
  'go':          ['context7'],
};

// rex preload detecte la stack → recommande les MCP servers pertinents
// l'activation reste explicite cote user / settings / CLI
```

**Regle produit** :

- le registry MCP peut etre large, y compris des outils peu utilises mais utiles selon contexte
- les integrations externes restent desactivees par defaut
- `rex mcp auto` produit une liste recommandee avec justification
- aucune activation silencieuse en SessionStart
- si un CLI local ou script local couvre deja le besoin, il reste prioritaire sur le MCP

### 15.4 REX comme MCP Server (FastMCP)

REX expose ses propres tools comme un MCP server pour que Claude Code/Codex puissent les appeler :

```typescript
import { FastMCP } from 'fastmcp';

const rexMcp = new FastMCP({ name: 'rex', version: '7.0.0' });

rexMcp.addTool({
  name: 'rex_memory_search',
  description: 'Search REX semantic memory',
  parameters: z.object({ query: z.string(), limit: z.number().default(5) }),
  execute: async ({ query, limit }) => searchMemory(query, limit),
});

rexMcp.addTool({
  name: 'rex_delegate',
  description: 'Delegate a task to the best available model/backend',
  parameters: z.object({ task: z.string(), complexity: z.enum(['low','med','high','crit']).optional() }),
  execute: async ({ task, complexity }) => delegate(task, complexity),
});

rexMcp.addTool({
  name: 'rex_observe',
  description: 'Record an observation to memory',
  parameters: z.object({ content: z.string(), type: z.string() }),
  execute: async ({ content, type }) => observe(content, type),
});

// + rex_budget, rex_nodes, rex_review, rex_sandbox, etc.
```

### 15.5 CLI MCP

```bash
rex mcp list                         # servers actifs + status
rex mcp add <name>                   # depuis registry (8,590+ servers)
rex mcp add <github-url>             # depuis GitHub
rex mcp remove <name>                # desactiver + nettoyer
rex mcp scan                         # mcp-scan securite (tool pinning)
rex mcp test                         # test toutes les connexions
rex mcp marketplace [query]          # chercher dans le registry
rex mcp auto                         # recommande les serveurs pertinents pour le projet courant
rex mcp enable <name>                # activation explicite
rex mcp disable <name>               # retour a l'etat safe
```

### 15.6 Flutter UI — MCP Management

Depuis la page MCP de l'app Flutter :
- **Liste servers actifs** avec status (vert/rouge/jaune)
- **Bouton "+"** → add server (search marketplace ou URL)
- **Toggle** enable/disable par server
- **Auto-detect** bouton → scanne le projet et propose les MCP pertinents
- **Security scan** bouton → lance mcp-scan
- **Config** par server (env vars, auth tokens)

---

## BLOC 16 — COACHING & SELF-IMPROVE

### 16.1 Honesty Guard

Hook UserPromptSubmit. Detecte "c'est fait", "ca marche", "done" sans preuve :
→ Injecte rappel : "Preuve requise (test output, screenshot, curl, build log)."

### 16.2 Tech Debt Tracker

```bash
rex debt                    # liste // TODO, FIXME, HACK du projet
rex debt --stale 7          # > 7 jours non resolus
rex debt --add "refactor X" # ajouter manuellement
```

### 16.3 Self-Improve (etendre l'existant)

- Observational Memory → le Reflector identifie les patterns d'erreur
- 3+ occurrences d'un pattern → promotion automatique en rule
- Notification au user : "Nouvelle regle promue : [description]"
- `rex rules` → liste toutes les regles (auto + manuelles)

### 16.4 Proactive Suggestions

Le daemon analyse les observations recentes et propose :
- "Tu as fait la meme erreur 3 fois cette semaine → voici une rule"
- "Ce projet n'a pas de tests → `rex workflow add-tests` ?"
- "Ton budget Cerebras approche 80% → switcher vers Groq ?"
- Via Gateway Telegram : notifications push

### 16.5 Flutter UI — Coaching (dans Health page)

- **Tech debt** : section dans Health — nombre de TODO/FIXME/HACK, stale > 7j en rouge
- **Rules auto** : liste des regles promues automatiquement, avec source (observations)
- **Suggestions** : notifications proactives du daemon (budget, erreurs recurrentes, tests manquants)
- **Config** : `Settings Hub > Advanced` (enable/disable proactive suggestions)

---

## BLOC 17 — GATEWAY MULTI-PLATFORM (REFONTE CRITIQUE)

### 17.1 Etat actuel — DIAGNOSTIC

**PROBLEME MAJEUR** : Kevin n'a JAMAIS reussi a parler a Claude ou Codex via le gateway Telegram.
Seul Qwen local fonctionne. Le path Claude est techniquement present dans gateway.ts mais casse.

**Audit du code actuel** (`packages/cli/src/gateway.ts`, ~2100 lignes) :
- Default mode = `'qwen'`. La commande `/mode` toggle vers Claude mais c'est rarement utilise.
- Path Claude : `claudeSession()` → `runClaudeAsync(['-p', prompt])` → `spawn('claude', args)`
- **Probleme 1** : `spawn('claude', ['-p', prompt])` est one-shot. Pas de session multi-turn. Chaque message = un nouveau process Claude qui recharge tout le contexte → lent, couteux, pas de conversation.
- **Probleme 2** : Detection de session nestee (`isInsideClaudeCode()`) bloque si le gateway tourne dans Claude Code. Sur VPS via LaunchAgent/systemd c'est OK, mais en dev c'est bloquant.
- **Probleme 3** : Pas de retry, pas de timeout, pas de fallback. Si `claude -p` echoue → silence.
- **Probleme 4** : Pas de streaming vers Telegram pour Claude (alors que Qwen a le streaming via `editMessageText`).
- **Probleme 5** : `/babysit` et `/codex` existent dans d'anciennes branches mais pas sur main actuel.

**Root cause** : le gateway utilise `claude -p` (pipe mode) qui est la pire integration possible.
Agent SDK resout TOUS ces problemes (multi-turn, streaming, retry, tools, metrics).

### 17.2 Nouvelle architecture — Agent SDK Gateway

```typescript
// gateway-backend.ts — remplace claudeSession() / runClaudeAsync()

import { AgentClient } from '@anthropic-ai/claude-agent-sdk';
import OpenAI from 'openai';

interface GatewayBackend {
  name: string;
  type: 'agent-sdk' | 'openai-sdk' | 'pipe' | 'ollama';
  available(): Promise<boolean>;
  chat(message: string, sessionId: string): AsyncGenerator<string>;  // streaming
  endSession(sessionId: string): void;
}

class AgentSdkBackend implements GatewayBackend {
  name = 'claude-agent-sdk';
  type = 'agent-sdk' as const;
  private sessions = new Map<string, AgentClient>();

  async available(): Promise<boolean> {
    // Verifie auth (OAuth ou API key) + connectivity
    return true;
  }

  async *chat(message: string, sessionId: string): AsyncGenerator<string> {
    let client = this.sessions.get(sessionId);
    if (!client) {
      client = new AgentClient({
        model: config.backends.claude.defaultModel,
        // OAuth → utilise le token du subscription
        // API key → utilise ANTHROPIC_API_KEY
      });
      this.sessions.set(sessionId, client);
    }
    // Multi-turn : le client garde le contexte de conversation
    const stream = client.sendMessage(message, { stream: true });
    for await (const chunk of stream) {
      yield chunk.text;  // streaming vers Telegram via editMessageText
    }
  }

  endSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

class OpenAiSdkBackend implements GatewayBackend {
  name = 'openai-sdk';
  type = 'openai-sdk' as const;
  private client = new OpenAI();
  private histories = new Map<string, Array<{role: string, content: string}>>();

  async *chat(message: string, sessionId: string): AsyncGenerator<string> {
    const history = this.histories.get(sessionId) || [];
    history.push({ role: 'user', content: message });
    const stream = await this.client.chat.completions.create({
      model: config.backends.openai.defaultModel,
      messages: history,
      stream: true,
    });
    let full = '';
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      full += text;
      yield text;
    }
    history.push({ role: 'assistant', content: full });
    this.histories.set(sessionId, history);
  }
}

// Fallback chain pour le gateway
const GATEWAY_BACKENDS: GatewayBackend[] = [
  new OllamaBackend(),       // 1. local/owned si suffisant
  new PipeBackend('claude'), // 2. outil deja installe / quota possede
  new PipeBackend('codex'),  // 3. outil deja installe / quota possede
  new AgentSdkBackend(),     // 4. SDK abonnement/API si besoin reel
  new OpenAiSdkBackend(),    // 5. autre SDK si besoin reel
];
```

### 17.3 Streaming Telegram unifie

```typescript
// Meme pattern que askQwenStream() mais pour TOUS les backends

async function streamToTelegram(
  chatId: string,
  backend: GatewayBackend,
  message: string,
  sessionId: string
): Promise<void> {
  // 1. Envoie message initial avec animation T-Rex
  const sentMsg = await sendMessage(chatId, '🦖 ...');
  let buffer = '';
  let lastEdit = 0;

  // 2. Stream du backend
  for await (const chunk of backend.chat(message, sessionId)) {
    buffer += chunk;
    const now = Date.now();
    // Rate limit Telegram: 1 edit / 800ms minimum
    if (now - lastEdit > 800) {
      await editMessageText(chatId, sentMsg.message_id, buffer);
      lastEdit = now;
    }
  }

  // 3. Edit final avec le texte complet
  await editMessageText(chatId, sentMsg.message_id, buffer);
}
```

### 17.4 Commandes gateway enrichies

| Commande | Avant (casse) | Apres (Agent SDK) |
|----------|--------------|-------------------|
| `/mode claude` | spawn claude -p (one-shot, pas de streaming) | Agent SDK multi-turn + streaming |
| `/mode codex` | N'existait pas sur main | OpenAI SDK multi-turn + streaming |
| `/mode qwen` | Fonctionne (Ollama stream) | Inchange |
| `/chat` | Tentait orchestrator agent | Utilise le backend actif avec session |
| `/babysit` | N'existait pas sur main | Agent SDK avec tools activees |
| `/delegate <task>` | N'existait pas | `rex delegate` via gateway (route selon complexite) |
| `/session` | N'existait pas | Affiche session en cours, backend, tokens consommes |
| `/reset` | N'existait pas | Termine la session Agent SDK, repart de zero |

### 17.5 Abstraction Gateway Adapter (multi-canal)

```typescript
interface GatewayAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (msg: GatewayMessage) => void): void;
  sendText(chatId: string, text: string): Promise<string>;  // retourne msgId
  editText(chatId: string, msgId: string, text: string): Promise<void>;
  sendFile(chatId: string, path: string): Promise<void>;
}

interface GatewayMessage {
  platform: 'telegram' | 'discord' | 'slack' | 'web';
  chatId: string;
  userId: string;
  text: string;
  command?: string;
  attachments?: string[];
  sessionId: string;  // NOUVEAU — pour multi-turn Agent SDK
}
```

Un seul handler de commandes, N adapters. Ajouter un canal = implementer l'interface.

### 17.6 Canaux prevus

| Canal | Priorite | Adapter | Quand |
|-------|----------|---------|-------|
| **Telegram** | Phase 1 (existe, a refactorer) | `TelegramAdapter` | Refonte Agent SDK |
| **Discord** | Phase 4 | `DiscordAdapter` (discord.js) | Si user a un serveur Discord |
| **Slack** | Phase 4 | `SlackAdapter` (Bolt SDK) | Si user a un workspace Slack |
| **Web Dashboard** | Phase 5 | `WebAdapter` (WebSocket) | Interface web embarquee dans le Hub |
| **CLI interactif** | Phase 4 | `CliAdapter` (deja le menu rex) | Toujours disponible |

### 17.7 Web Dashboard (embarque dans le Hub)

```
REX Hub (VPS)
  └── /dashboard (port 3117)
      ├── Chat (meme interface que Telegram mais dans le browser)
      ├── Status (nodes, providers, memory, sync)
      ├── Logs (live tail via WebSocket)
      └── Quick Actions (delegate, review, deploy)
```

Framework : simple HTML + HTMX (pas de React/Next — c'est un dashboard leger).
WebSocket pour les mises a jour temps reel.
Auth : JWT (meme que l'API Hub).
Accessible depuis n'importe quel device avec un navigateur (telephone, tablette, TV).

### 17.8 Configuration par canal

```typescript
// Dans RexConfig
gateway: {
  adapters: {
    telegram: { enabled: boolean; botToken?: string; chatId?: string };
    discord:  { enabled: boolean; botToken?: string; guildId?: string };
    slack:    { enabled: boolean; botToken?: string; channelId?: string };
    web:      { enabled: boolean; port: number };  // defaut 3117
  };
  defaultAdapter: 'telegram' | 'discord' | 'slack' | 'web';
  defaultBackend: 'claude' | 'codex' | 'qwen' | 'auto';  // NOUVEAU — quel LLM par defaut
  notifications: {
    channels: string[];  // quels canaux recoivent les notifications push
  };
};
```

### 17.9 Gateway Resilience

```
Message arrive sur Telegram/Discord/Slack/Web
  │
  ├─ 1. Backend Agent SDK Claude → stream vers adapter
  │     Si fail (401/500/timeout 30s) →
  ├─ 2. Backend OpenAI SDK → stream vers adapter
  │     Si fail →
  ├─ 3. Backend Ollama local → stream vers adapter
  │     Si fail →
  ├─ 4. Backend claude -p (pipe, one-shot) → envoie reponse complete
  │     Si fail →
  └─ 5. Message erreur : "Aucun backend disponible. rex doctor pour diagnostic."
         + queue le message pour retry dans 2min
```

**Chaque fallback** → notification user : "Backend X indisponible, bascule vers Y"
**Timeout par backend** : 30s pour SDK, 60s pour pipe, 10s pour Ollama
**Rate limit respecte** : si Telegram 429 → backoff exponentiel (1s, 2s, 4s, max 30s)

**Garantie de continuite** :

- le message entrant est journalise avant traitement
- si aucun backend ne repond, il reste spoule pour retry
- si le hub principal tombe, le node encore vivant garde sa file locale
- a la reprise, les messages, evenements et observations sont reconcilies via ack/replay
- l'objectif n'est pas "repondre toujours tout de suite", mais "ne rien perdre"

### 17.10 Flutter UI — Gateway Page (enrichir)

- **Backend actif** : indicateur visuel du backend en cours (Agent SDK / OpenAI / Qwen / Pipe)
- **Session status** : tokens consommes, duree, nombre de turns
- **Adapters list** : Telegram / Discord / Slack / Web — toggle enable/disable chacun
- **Status par adapter** : connected/disconnected, messages today, last activity
- **Config par adapter** : tokens, IDs, dans Settings Hub
- **Notifications routing** : choisir quels canaux recoivent les push
- **Backend switch** : dropdown pour changer le backend par defaut

---

## BLOC 18 — DEVICE BRIDGE & ONBOARDING (NOUVEAU)

### 18.1 Probleme

Un user a un Mac, un VPS, un PC GPU, un telephone. Comment tout connecter ?
Aujourd'hui il faut configurer chaque machine manuellement. C'est penible.
REX doit rendre le setup multi-device aussi simple qu'un QR code ou une commande.

### 18.2 Onboarding flow (premiere machine)

```
1. npm install -g rex-claude
2. rex init
   → Detecte hardware (BLOC 10)
   → Configure Ollama + modeles
   → Installe guards + hooks
   → Configure daemon
   → Genere une cle de pairing : "REX-XXXX-YYYY-ZZZZ"
   → Affiche : "Pour connecter une autre machine : rex join REX-XXXX-YYYY-ZZZZ"
```

### 18.3 Onboarding flow (machines suivantes)

```
# Sur le VPS ou PC GPU :
rex join REX-XXXX-YYYY-ZZZZ
  → Contacte la premiere machine (via Tailscale ou IP directe)
  → Recupere config de base (providers, memory hub URL, JWT token)
  → Detecte hardware local → choisit son role (hub/node/gpu-node)
  → S'enregistre aupres du Hub
  → Sync initiale de la memoire
  → "Connected! This machine is now a GPU node."
```

### 18.4 Setup guides par scenario

| Scenario | Machines | Setup |
|----------|----------|-------|
| **Solo Mac** | Mac uniquement | `rex init` → tout local, pas de reseau |
| **Mac + VPS** | Mac dev + VPS 24/7 | Mac: `rex init`, VPS: `rex init --hub && docker compose up` + `rex join` depuis Mac |
| **Mac + VPS + GPU** | 3 machines | VPS = Hub, Mac = node, PC = gpu-node. `rex join` sur Mac et PC |
| **Mac + NAS** | Mac + Synology | NAS: Docker mode headless, `rex join` |
| **Tout local** | Un seul PC puissant | `rex init` → mode local, pas de hub |

### 18.4bis Exceptions et fallback par taille de parc

#### A. User avec 1 seule machine

- pas de `rex init --hub` requis
- pas de Tailscale requis
- pas de sync inter-node requise
- la machine locale devient :
  - routeur
  - memoire
  - daemon
  - execution node
- si une page ou commande depend d'un concept multi-node, elle doit afficher un fallback propre :
  - "Single-machine mode"
  - "Ajoutez une machine plus tard avec `rex join`"

#### B. User avec 2 a 5 machines

- topologie par defaut recommandee
- un hub prefere si un VPS ou un node stable existe
- sinon une machine principale peut assumer temporairement le role de hub
- Tailscale + wake + healthchecks prennent de la valeur
- les commandes peuvent encore adresser un node individuel sans necessiter de groupes complexes

#### C. User avec 10 a 30+ machines

- REX doit passer d'une logique "liste de machines" a une logique "inventory + groups + tags"
- examples de tags : `hub`, `gpu`, `cpu-only`, `always-on`, `office`, `lab`, `personal`
- les actions doivent supporter :
  - targeting par tag/groupe
  - limites de concurrence
  - backoff et rate limiting par groupe
  - health score agrege
- l'inventaire doit privilegier snapshots et heartbeats compacts, pas du bavardage continu machine par machine

#### D. Exceptions structurantes

- **Aucun VPS** :
  - hub local sur la machine principale
  - zero blocage produit
- **Aucun GPU** :
  - petits modeles locaux + providers gratuits + payant en dernier recours
- **Trop de nodes offline** :
  - REX bascule vers les nodes healthy
  - les nodes offline restent dans l'inventaire sans bloquer les workflows
- **30 nodes mais budget faible** :
  - inventaire et orchestration oui
  - sync/detail/monitoring agressifs non
- **Seulement mobile + 1 machine distante plus tard** :
  - mobile = observateur/pilotage
  - cerveau et execution restent sur node/hub

### 18.5 Tailscale auto-setup

```bash
rex network init
  → Verifie si Tailscale est installe
  → Si non : propose install (brew install tailscale / apt install tailscale)
  → Si oui : verifie login
  → Configure les tags (rex-hub, rex-node)
  → Genere les Grants (deny-by-default)
  → Teste la connectivite entre les machines enregistrees
  → "Network ready! 3 nodes connected."
```

### 18.6 Pre-requis par machine

| Role | Minimum | Recommande | Obligatoire |
|------|---------|------------|-------------|
| **Node (Mac dev)** | macOS, Node 20+, 8GB RAM | 16GB RAM, Ollama | Tailscale |
| **Hub (VPS)** | Linux, 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM, Docker | Tailscale, Node 20+ |
| **GPU Node** | Linux, NVIDIA GPU, 8GB VRAM | RTX 3090+ 24GB VRAM | Tailscale, Ollama, NVIDIA drivers |
| **NAS** | Docker support | Synology DS923+ | Tailscale, Docker |
| **Headless** | Linux, Node 20+ | — | Node 20+ |

### 18.7 `rex devices` (status)

```bash
rex devices
  Mac-Kevin          online    macOS    M1 Pro 16GB    node       latency: local
  VPS-Hostinger      online    Linux    2vCPU 8GB      hub        latency: 24ms
  PC-RTX3090         offline   Linux    RTX 3090       gpu-node   last seen: 2h ago
                                                                   → rex wake pc-rtx3090
```

### 18.8 Flutter UI — Devices (dans Network page)

- **Device list** : toutes les machines avec role, status, specs, latence
- **Add device** : genere un code de pairing, affiche les instructions
- **Wake** : bouton WoL/caffeinate par device
- **Remove** : detacher une machine du reseau
- **Role switch** : changer le role d'une machine (node → gpu-node, etc.)

---

## BLOC 19 — COMPACTION RESILIENCE

### 19.1 Pourquoi

Les sessions longues avec Claude Code/Codex atteignent la limite de contexte.
La compaction (auto ou `/compact`) supprime du contexte — et perd des infos critiques.
REX doit **pre-sauvegarder** le contexte avant compaction pour zero perte.

### 19.2 Pre-shot Compaction

```
Session en cours
  │
  ├─ Hook SessionEnd (ou detection auto ~70% contexte)
  │   → rex snapshot --session
  │   → Sauvegarde dans ~/.claude/rex/snapshots/:
  │     - Fichiers modifies + paths
  │     - Commandes build/test decouvertes
  │     - Branche + PR en cours
  │     - Erreurs rencontrees
  │     - Contexte tache + requirements user
  │     - Decisions prises dans la session
  │
  ├─ Compaction se produit
  │
  └─ SessionStart (nouvelle session ou post-compact)
      → rex preload enrichi avec le dernier snapshot
      → Le contexte critique est reinjecte automatiquement
```

### 19.3 Snapshot Schema

```typescript
interface SessionSnapshot {
  sessionId: string;
  timestamp: string;
  project: string;
  branch: string;
  pr?: number;
  modifiedFiles: string[];
  buildCommands: string[];
  testCommands: string[];
  errors: string[];
  decisions: string[];
  taskContext: string;      // resume de ce qu'on faisait
  userRequirements: string; // ce que le user a demande
  observations: string[];   // observations extraites
}
```

Stocke dans `~/.claude/rex/snapshots/{sessionId}.json`.
Le preload.ts lit le dernier snapshot du projet courant et l'injecte dans le contexte.
Budget : 300-400 tokens max pour le snapshot reinjecte.

### 19.4 CLI

```bash
rex snapshot                    # snapshot manuel de la session courante
rex snapshot --list             # liste des snapshots
rex snapshot --restore <id>     # reinjecter un snapshot dans le contexte
rex snapshot --auto             # activer le pre-shot automatique (defaut: on)
```

### 19.5 Integration daemon

Le daemon surveille `~/.claude/projects/` pour detecter les compactions (fichiers `.jsonl` tronques).
Quand une compaction est detectee → extraction automatique des infos cles → snapshot.

### 19.6 Flutter UI — Snapshots (dans Memory page)

- **Snapshots list** : derniers snapshots par projet, expandable
- **Restore** : bouton pour reinjecter un snapshot dans la prochaine session
- **Auto toggle** : activer/desactiver le pre-shot automatique
- **Config** : `Settings Hub > Memory` (auto-snapshot, max snapshots, budget tokens)

---

## SYNC TEMPS REEL VPS / MAC / PC (CRITIQUE)

### S1. Architecture — VPS = Hub Central Permanent

```
                VPS (Hub permanent 24/7)
               ┌───────────────────────────┐
               │  WebSocket Server (3118)   │
               │  Message Queue (SQLite)    │
               │  Memory Hub (semantic DB)  │
               │  Task Queue (pending)      │
               │  Sync Engine              │
               │  Gateway Telegram/Discord │
               └─────────┬───────┬─────────┘
                    WS    │       │    WS
              ┌───────────┘       └───────────┐
              │                               │
     ┌────────┴────────┐            ┌─────────┴────────┐
     │  Mac Node       │            │  PC GPU Node     │
     │  Flutter app    │            │  Ollama GPU      │
     │  Claude Code    │            │  Fine-tune       │
     │  Dev principal  │            │  Gros modeles    │
     │  Local memory   │            │  Local memory    │
     └─────────────────┘            └──────────────────┘
```

**Principe** : le VPS ne tombe JAMAIS (24/7), il queue TOUT. Quand Mac ou PC se reconnectent → catch-up sync.

En pratique, le plan doit aussi assumer le cas degrade :

- si le VPS tombe, le Mac ou le PC peuvent continuer a spooler localement
- si un seul node reste vivant, il devient point de preservation temporaire
- si plusieurs nodes survivent, la consolidation reprend des qu'un chemin sain re-apparait

Le bon invariant n'est donc pas "le VPS est toujours la".
Le bon invariant est : **tant qu'au moins un node survit, REX preserve et re-joue**.

### S2. Transport — WebSocket + Tailscale

```typescript
// sync-server.ts (sur le Hub VPS)
import { WebSocketServer } from 'ws';

interface SyncMessage {
  type: 'memory' | 'task' | 'observation' | 'snapshot' | 'config' | 'file';
  action: 'create' | 'update' | 'delete' | 'sync-request';
  nodeId: string;
  timestamp: number;      // Unix ms — Last-Write-Wins
  payload: any;
  ack?: string;           // ID pour confirmation de reception
}

const wss = new WebSocketServer({ port: 3118 });

// Chaque node connecte reçoit les messages en temps reel
// Si un node est offline → les messages sont queues dans SQLite
```

**Pourquoi WebSocket et pas polling** :
- Latence ~50ms vs ~5s (polling 5s interval)
- Bidirectionnel : le Mac peut aussi pusher vers le VPS en temps reel
- Connexion persistante via Tailscale (IP fixe, chiffre)
- Reconnexion auto avec backoff exponentiel (1s, 2s, 4s, max 30s)

### S3. Queue Offline — SQLite sur le VPS

```sql
-- Table sync_queue sur le VPS
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_node TEXT NOT NULL,          -- 'mac-kevin', 'pc-rtx3090', '*' (broadcast)
  message_type TEXT NOT NULL,         -- 'memory', 'task', 'observation', etc.
  payload TEXT NOT NULL,              -- JSON
  created_at INTEGER NOT NULL,        -- timestamp Unix ms
  delivered_at INTEGER DEFAULT NULL,  -- NULL = pas encore delivre
  ack_at INTEGER DEFAULT NULL,        -- NULL = pas encore confirme
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5
);

CREATE INDEX idx_queue_target ON sync_queue(target_node, delivered_at);
CREATE INDEX idx_queue_pending ON sync_queue(delivered_at) WHERE delivered_at IS NULL;
```

**Pourquoi SQLite** (pas Redis, RabbitMQ, etc.) :
- Zero dependance supplementaire (REX utilise deja SQLite pour la memoire)
- Persistant sur disque (survit aux redemarrages VPS)
- ACID — pas de perte de messages
- Performant pour les volumes de REX (~100-1000 messages/jour, pas millions)
- WAL mode = lectures concurrentes sans bloquer les ecritures

### S4. Catch-up Sync — Reconnexion

```
Mac se reconnecte apres 3h offline
  │
  ├─ 1. WebSocket reconnecte au VPS
  │
  ├─ 2. Mac envoie : { type: 'sync-request', lastSyncTimestamp: 1741373400000 }
  │
  ├─ 3. VPS repond avec tout ce qui s'est passe depuis lastSyncTimestamp :
  │     ├─ 12 nouvelles observations (sessions Codex sur VPS)
  │     ├─ 3 taches completees
  │     ├─ 1 snapshot de session
  │     ├─ 5 nouveaux chunks de memoire semantique
  │     └─ 2 modifications config
  │
  ├─ 4. Mac applique les changements dans l'ordre chronologique
  │     → Memoire semantique : INSERT les nouveaux chunks + re-embed si necessaire
  │     → Observations : merge dans le local memory (LWW — Last-Write-Wins)
  │     → Taches : mise a jour status
  │     → Config : merge (LWW par cle)
  │
  ├─ 5. Mac envoie ses propres changements locaux accumules :
  │     ├─ Sessions Claude Code locales → observations extraites
  │     ├─ Fichiers modifies localement
  │     └─ Snapshots de session
  │
  └─ 6. VPS confirme + propage aux autres nodes connectes
```

### S5. Memory Sync — Semantique + Court Terme + Observations

**3 types de memoire a synchroniser** :

| Type | Stockage | Sync strategy | Conflit |
|------|----------|---------------|---------|
| **Semantique** (chunks embeddes) | SQLite + sqlite-vec | Append-only. Nouveaux chunks repliques. Embeddings recalcules localement si Ollama dispo, sinon stockes pre-calcules. | Pas de conflit (append-only, ID unique) |
| **Court terme** (session facts) | JSON dans `~/.claude/rex/short-term/` | LWW par fichier. Chaque session genere un fichier `{sessionId}.json`. | LWW timestamp. Meme session = meme node = pas de conflit. |
| **Observations** (patterns extraits) | SQLite table `observations` | LWW par observation_id. Le Reflector du daemon merge. | LWW. Si 2 nodes observent la meme chose → le plus recent gagne. |

```typescript
// memory-sync.ts
interface MemorySync {
  // Push local changes to hub
  pushToHub(changes: MemoryChange[]): Promise<void>;

  // Pull from hub (catch-up)
  pullFromHub(since: number): Promise<MemoryChange[]>;

  // Apply remote changes locally
  applyRemote(changes: MemoryChange[]): Promise<ApplyResult>;
}

interface MemoryChange {
  type: 'semantic-chunk' | 'observation' | 'short-term' | 'snapshot';
  action: 'insert' | 'update' | 'delete';
  id: string;
  timestamp: number;
  data: any;
  embedding?: number[];  // Pre-calcule pour les nodes sans Ollama
  sourceNode: string;
}
```

### S6. Temp Folder — Buffer de reconnexion

Quand un node se reconnecte et recoit beaucoup de donnees d'un coup, on ne les injecte pas directement dans la DB — on passe par un **temp folder organise** :

```
~/.claude/rex/sync-incoming/
├── 2026-03-07T22-15-00/              # Timestamp de la sync
│   ├── semantic-chunks/               # Nouveaux chunks a embedder
│   │   ├── chunk-abc123.json
│   │   └── chunk-def456.json
│   ├── observations/                  # Nouvelles observations
│   │   └── obs-789.json
│   ├── short-term/                    # Sessions d'autres nodes
│   │   └── session-vps-1741373400.json
│   ├── snapshots/                     # Snapshots de session
│   │   └── snap-codex-session.json
│   ├── tasks/                         # Taches a traiter
│   │   └── task-review-pr-42.json
│   └── _manifest.json                 # Resume : 12 items, 3 types
```

**Workflow** :
1. Donnees recues → ecrites dans temp folder (instantane, pas de processing)
2. `_manifest.json` cree avec le resume
3. Daemon local detecte le nouveau dossier (chokidar watch)
4. Processing async : embeds les chunks, merge les observations, relance les taches
5. Quand tout est traite → dossier supprime (ou archive si `config.sync.keepHistory`)
6. Notification : "Sync complete : 12 items from VPS (5 memories, 3 tasks, 2 observations, 2 snapshots)"

### S7. Task Queue — Relance automatique

Quand un node se reconnecte, les taches qui lui etaient destinees sont relancees :

```typescript
interface QueuedTask {
  id: string;
  type: 'delegate' | 'review' | 'deploy' | 'babysit' | 'ingest';
  targetNode: string;        // 'mac-kevin', 'pc-rtx3090', 'any'
  payload: any;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  queuedReason: string;      // 'node-offline', 'rate-limited', 'scheduled'
  maxRetries: number;
  retryCount: number;
  expiresAt?: number;        // Certaines taches expirent (ex: review PR deja merge)
}

// Sur reconnexion du Mac :
// 1. VPS envoie les taches pending pour 'mac-kevin'
// 2. Mac filtre les taches expirees
// 3. Mac execute par priorite (critical first)
// 4. Mac confirme execution → VPS supprime de la queue
```

### S8. Conflict Resolution — Last-Write-Wins (LWW)

**Pas de CRDT** — c'est overkill pour un outil personnel mono-user.
LWW (Last-Write-Wins) par timestamp suffisant car :
- Un seul user (Kevin)
- Rarement 2 devices editent la meme donnee simultanement
- Si conflit → le plus recent gagne (comportement previsible)

```typescript
function resolveConflict(local: SyncItem, remote: SyncItem): SyncItem {
  // Simple LWW — le plus recent gagne
  return local.timestamp > remote.timestamp ? local : remote;
}
```

**Exception** : memoire semantique = append-only, pas de conflit possible.

### S9. CLI Sync

```bash
rex sync                     # Force sync manuelle avec le Hub
rex sync --status            # Etat de la sync (last sync, pending items, queue size)
rex sync --pull              # Pull only (ne push pas les changements locaux)
rex sync --push              # Push only
rex sync --history           # Historique des syncs recentes
rex devices --sync           # Affiche la derniere sync par device
```

### S10. Configuration sync

```typescript
// Dans RexConfig
sync: {
  enabled: boolean;               // defaut: true si hub configure
  hubUrl: string;                 // ws://100.x.y.z:3118 (Tailscale)
  syncInterval: number;           // heartbeat interval en ms (defaut 30000)
  keepHistory: boolean;           // garder les temp folders apres processing
  maxQueueAge: number;            // expiration des messages en queue (defaut 7j)
  syncOnReconnect: boolean;       // catch-up automatique (defaut: true)
  syncTypes: {
    memory: boolean;              // sync memoire semantique
    observations: boolean;        // sync observations
    shortTerm: boolean;           // sync sessions court terme
    tasks: boolean;               // sync taches
    snapshots: boolean;           // sync compaction snapshots
    config: boolean;              // sync config (attention: LWW)
  };
};
```

### S11. Flutter UI — Sync (dans Network page)

- **Sync status** : dernier sync timestamp, items pending, queue size
- **Force sync** : bouton "Sync Now"
- **Sync history** : timeline des syncs recentes avec details (X items pushed, Y pulled)
- **Per-type toggle** : activer/desactiver la sync par type (memory, tasks, etc.)
- **Conflict log** : si un LWW a resolve un conflit, le logger ici

---

## KNOWLEDGE SOURCES — OBSIDIAN + SELF-HOSTABLE (NOUVEAU)

### KS1. Vision

REX ne doit pas se limiter aux sessions Claude Code comme source de connaissance.
Les developpeurs ont des notes, docs, wikis, journaux dans des outils self-hostables.
REX doit pouvoir ingerer ces sources pour enrichir sa memoire semantique.

### KS2. Obsidian Vault — Source principale

Kevin utilise un vault Obsidian (`~/Documents/Obsidian Vault/`) avec `obsidian-livesync` (sync cross-device).

**Double usage** :
1. **Backup** : copier le plan REX + recherches dans le vault pour ne rien perdre
2. **Ingest** : ingerer les notes Obsidian dans la memoire semantique REX

#### Backup — plan dans le vault

```
Documents/Obsidian Vault/
└── 02 - Projects/
    ├── REX - PROJECT OPEN SOURCE.md     # Page existante (mise a jour avec liens)
    └── REX/                              # Sous-dossier dedie
        ├── REX v7 Master Plan.md         # Copie du plan complet
        ├── REX v7 Decisions Log.md       # Decisions et recherches
        └── REX v7 Audit.md              # Audit, risques, points bloquants
```

**Direction** : repo `docs/plans/` → vault (one-way). Le repo git reste la source de verite.
**LiveSync** : propage automatiquement aux autres appareils de Kevin.

#### Ingest — vault dans REX

```bash
rex ingest --obsidian                    # Indexe tout le vault
rex ingest --obsidian --folder "02 - Projects"  # Indexe un dossier specifique
rex search "architecture sync"           # Cherche dans sessions ET vault
```

**Implementation** :
- Scanner les fichiers `.md` du vault
- Chunker (meme logique que l'ingest sessions)
- Embedder via nomic-embed-text (Ollama)
- Stocker dans SQLite avec `source: 'obsidian'` pour distinguer
- Delta ingest : tracker les fichiers deja ingeres (taille + mtime)

### KS3. Autres sources self-hostables

REX doit avoir une interface pluggable pour ingerer d'autres outils open source / self-hostables :

| Source | Type | Implementation | Priorite |
|--------|------|----------------|----------|
| **Obsidian** | Markdown vault local | Scan `.md` files, chunk, embed | Phase 4 |
| **Logseq** | Markdown/org-mode local | Meme pattern qu'Obsidian (`.md` files) | Phase 5 |
| **Joplin** | SQLite DB locale | Lire la DB Joplin, extraire le contenu | Phase 5 |
| **Outline** | Self-hosted wiki (API REST) | Fetcher via API, chunker, embedder | Phase 5 |
| **BookStack** | Self-hosted wiki (API REST) | Fetcher via API | Phase 6 |
| **Silverbullet** | Markdown wiki navigateur | Scan dossier local | Phase 6 |
| **Anytype** | Local-first knowledge base | Export markdown → ingest | Phase 6 |
| **Zettlr** | Academic markdown editor | Scan dossier local | Phase 6 |

#### Interface pluggable

```typescript
interface KnowledgeSource {
  name: string;
  type: 'local-fs' | 'sqlite-db' | 'rest-api';
  scan(): AsyncGenerator<KnowledgeItem>;   // Yield les items a ingerer
  delta(since: number): AsyncGenerator<KnowledgeItem>;  // Items modifies depuis timestamp
}

interface KnowledgeItem {
  id: string;
  source: string;      // 'obsidian', 'logseq', 'joplin', etc.
  title: string;
  content: string;
  path?: string;       // Chemin fichier ou URL
  updatedAt: number;
  tags?: string[];
}

// Pour les sources Markdown locales (Obsidian, Logseq, Silverbullet, Zettlr)
class LocalMarkdownSource implements KnowledgeSource {
  constructor(private rootDir: string, private name: string) {}
  // Scan .md files, respecte .gitignore et exclusions
}

// Pour les sources API REST (Outline, BookStack)
class RestApiSource implements KnowledgeSource {
  constructor(private baseUrl: string, private apiKey: string) {}
  // Paginate API, fetcher contenu
}
```

### KS4. Configuration

```typescript
// Dans RexConfig
knowledge: {
  sources: {
    obsidian?: {
      enabled: boolean;
      path: string;           // ~/Documents/Obsidian Vault/
      folders?: string[];     // Dossiers specifiques (defaut: tout)
      exclude?: string[];     // Dossiers a exclure (ex: '.obsidian', '99 - Archive')
    };
    logseq?: { enabled: boolean; path: string };
    joplin?: { enabled: boolean; dbPath: string };
    outline?: { enabled: boolean; url: string; apiKey: string };
  };
  autoIngest: boolean;        // Ingerer automatiquement via daemon (defaut: false)
  ingestInterval: number;     // Si auto, interval en minutes (defaut: 60)
};
```

### KS5. Flutter UI — Knowledge Sources (dans Memory page)

- **Sources list** : Obsidian / Logseq / Joplin / Outline — toggle enable/disable
- **Config par source** : path, credentials, dossiers
- **Status** : derniere ingest, nombre de chunks, espace utilise
- **Manual ingest** : bouton "Ingest Now" par source
- **Search filter** : dans Memory search, filtrer par source (sessions / obsidian / etc.)

---

## COMPATIBILITE MULTI-PLATEFORME (CRITIQUE)

### Plateformes supportees

| Plateforme | Status | Role typique | Particularites |
|------------|--------|-------------|----------------|
| **macOS (Apple Silicon)** | PRINCIPAL | Dev, GUI Flutter, node | Tout fonctionne |
| **macOS (Intel)** | SUPPORTE | Dev, node | Pas de GPU Metal pour gros modeles |
| **Linux (x86 + GPU)** | SUPPORTE | Hub, GPU node, VPS | Pas de Flutter GUI, pas de LaunchAgents |
| **Linux (x86 sans GPU)** | SUPPORTE | Hub, VPS headless | Modeles petits uniquement (CPU), pas de sandbox-exec |
| **Linux (ARM)** | PARTIEL | Raspberry Pi, NAS | Performances limitees, petits modeles |
| **Windows (WSL2)** | EXPERIMENTAL | Dev secondaire, GPU node | Via WSL2 uniquement, pas de support natif |
| **Docker** | SUPPORTE | Hub, sandbox, VPS | Containerise, pas de GUI |

### Ce qui marche / marche pas par plateforme

| Feature | macOS | Linux + GPU | Linux VPS (no GPU) | Windows WSL2 | Docker |
|---------|-------|-------------|-------------------|--------------|--------|
| CLI (`rex`) | OK | OK | OK | OK | OK |
| Flutter app | OK | NON | NON | NON | NON |
| Ollama / LLM local | OK (Metal) | OK (CUDA) | LIMITE (CPU, petits modeles) | OK (CUDA via WSL2) | OK |
| Embeddings (nomic) | OK | OK | OK (CPU) | OK | OK |
| Sandbox light (OS-level) | OK (sandbox-exec) | OK (bubblewrap) | OK (bubblewrap) | PARTIEL | N/A |
| Sandbox full (Docker) | OK | OK | OK | OK | OK (DinD) |
| LaunchAgents | OK | NON → systemd | NON → systemd | NON → cron/systemd | NON → cron |
| Hammerspoon (call watcher) | OK | NON | NON | NON | NON |
| Voice (microphone) | OK | OK (si micro) | NON | OK (si micro) | NON |
| Tailscale | OK | OK | OK | OK | OK |
| Gateway Telegram | OK | OK | OK | OK | OK |
| Web Dashboard | OK | OK | OK | OK | OK |
| WoL receive | NON (M1) | OK | N/A (toujours on) | OK | N/A |
| Agent SDK (Claude) | OK | OK | OK | OK | OK |
| OpenAI SDK (Codex) | OK | OK | OK | OK | OK |
| OAuth setup (browser) | OK (natif) | OK (xdg-open) | DEVICE CODE (pas de browser) | OK (natif) | DEVICE CODE |

### Fallbacks automatiques par plateforme

```typescript
// Dans hardware.ts — adapte le comportement au runtime
function getPlatformFallbacks(hw: HardwareProfile): PlatformConfig {
  const config: PlatformConfig = {
    daemon: 'launchagent',    // macOS default
    sandbox: 'sandbox-exec',  // macOS default
    voiceEnabled: true,
    guiEnabled: true,
    llmBackend: 'ollama',     // default
  };

  if (hw.os === 'linux') {
    config.daemon = 'systemd';
    config.sandbox = 'bubblewrap';
    config.guiEnabled = false;  // pas de Flutter
    if (!hw.gpu || hw.gpu.type === 'none') {
      // VPS sans GPU — modeles restreints
      config.llmProfiles = ['vps-no-gpu']; // llama3.2:1b, nomic seulement
    }
  }

  if (hw.os === 'docker') {
    config.daemon = 'cron';    // pas de systemd dans Docker
    config.sandbox = 'docker'; // DinD
    config.guiEnabled = false;
    config.voiceEnabled = false;
  }

  // Windows via WSL2 — detecte automatiquement
  if (hw.os === 'linux' && isWSL()) {
    config.voiceEnabled = detectMicrophone();
  }

  return config;
}
```

### Fallbacks automatiques par topologie

```typescript
type TopologyMode = 'solo' | 'small-cluster' | 'fleet';

function detectTopologyMode(nodes: NodeProfile[]): TopologyMode {
  if (nodes.length <= 1) return 'solo';
  if (nodes.length <= 5) return 'small-cluster';
  return 'fleet';
}

function getTopologyFallbacks(mode: TopologyMode): TopologyPolicy {
  switch (mode) {
    case 'solo':
      return {
        requireHub: false,
        preferLocalExecution: true,
        syncStrategy: 'none-or-local-spool',
        targeting: 'single-node',
      };
    case 'small-cluster':
      return {
        requireHub: false,
        preferStableHubIfPresent: true,
        syncStrategy: 'full',
        targeting: 'node-or-role',
      };
    case 'fleet':
      return {
        requireHub: true,
        preferGroupedScheduling: true,
        syncStrategy: 'batched-and-aggregated',
        targeting: 'group-or-tag',
      };
  }
}
```

### `rex init` — detection et avertissements

```
$ rex init    # sur un VPS Linux sans GPU

  REX v7.0.0 — Setup

  Hardware detecte:
    OS: Linux (Ubuntu 24.04)
    CPU: 2x vCPU (x86_64)
    GPU: aucun
    RAM: 8 GB
    Stockage: 92 GB libre

  Configuration adaptee:
    [OK] CLI installe
    [OK] Daemon: systemd
    [OK] Sandbox: bubblewrap (light mode)
    [OK] Gateway Telegram
    [OK] Embeddings: nomic-embed-text (CPU)
    [OK] LLM local: llama3.2:1b (CPU, petit modele)
    [WARN] Pas de GPU — modeles > 3B non recommandes (tres lent)
    [WARN] Pas de Flutter GUI — utiliser CLI + Gateway Telegram + Web Dashboard
    [WARN] Pas de microphone — Voice desactive
    [WARN] Pas de Hammerspoon — Call watcher desactive
    [INFO] Pour les gros modeles, connecter un GPU node: rex join <code>

  === Backends AI ===
  Claude : [1] OAuth (Pro/Max subscription)  [2] API key  [3] Skip
  > 1
  [VPS detecte — pas de browser, device code flow]
  Allez sur https://claude.ai/device et entrez le code: REX-A7K9
  En attente... connecte ! (Claude Max)
  [INFO] Mode OAuth: prompt caching et batch API non disponibles

  OpenAI : [1] OAuth (ChatGPT Plus)  [2] API key  [3] Skip
  > 2
  OPENAI_API_KEY : sk-****
  Connecte ! GPT-5.4 disponible.

  Continuer ? [Y/n]
```

### LLM Backend abstraction

Ollama est le backend par defaut mais REX doit pouvoir fonctionner avec d'autres :

```typescript
interface LlmBackend {
  name: string;
  type: 'ollama' | 'llama-cpp' | 'localai' | 'vllm' | 'llamafile';
  url: string;                    // ex: http://localhost:11434
  apiFormat: 'ollama' | 'openai'; // format de l'API
  listModels(): Promise<string[]>;
  generate(prompt: string, model: string, opts?: GenOpts): Promise<string>;
  generateStream(prompt: string, model: string, opts?: GenOpts): AsyncIterable<string>;
  embed(text: string, model: string): Promise<number[]>;
  isHealthy(): Promise<boolean>;
}

// Tous les backends qui exposent une API OpenAI-compatible
// sont utilisables via le meme client (Vercel AI SDK)
```

| Backend | API | Forces VPS | Faiblesses |
|---------|-----|------------|------------|
| **Ollama** | Propre + OpenAI-compat | Simple, models hub, embedding | Lourd (Go binary ~100MB), UI inutile sur VPS |
| **llama.cpp server** | OpenAI-compat | Ultra-leger, C++, meme moteur qu'Ollama | Pas de model hub, gestion manuelle |
| **LocalAI** | OpenAI-compat | Docker-first, embeddings, TTS, images | Plus lourd |
| **llamafile** | OpenAI-compat | Single binary, zero install | Un fichier par modele, pas de hub |

**Recommandation par plateforme** :
- **macOS (dev)** : Ollama (GUI utile, model hub, setup simple)
- **VPS headless** : Ollama OU llama.cpp server (plus leger, meme moteur)
- **Docker** : Ollama image OU LocalAI (Docker-native)
- **Edge / minimal** : llamafile (single binary, zero dep)

Configurable via `config.json` :
```json
{
  "llm": {
    "backend": "ollama",
    "url": "http://localhost:11434",
    "apiFormat": "openai"
  }
}
```

### Tools VPS-incompatibles — user warnings

REX DOIT prevenir l'user quand une feature n'est pas disponible sur sa plateforme.
OpenClaw ne le fait pas — on fait mieux.

```typescript
// Au demarrage + dans rex doctor
const PLATFORM_WARNINGS: Record<string, PlatformWarning[]> = {
  'linux-no-gpu': [
    { feature: 'Gros LLM (>3B)', reason: 'Pas de GPU', alternative: 'Connecter un GPU node via rex join' },
    { feature: 'Flutter GUI', reason: 'Linux headless', alternative: 'Utiliser CLI + Gateway Telegram + Web Dashboard' },
    { feature: 'Voice', reason: 'Pas de micro', alternative: 'Voice desactive, utiliser rex voice via un node Mac' },
    { feature: 'Call watcher', reason: 'Pas de Hammerspoon', alternative: 'Desactive (macOS only)' },
    { feature: 'Sandbox light', reason: 'sandbox-exec = macOS only', alternative: 'bubblewrap utilise a la place' },
  ],
  'docker': [
    { feature: 'Flutter GUI', reason: 'Container', alternative: 'Web Dashboard sur le port expose' },
    { feature: 'Voice', reason: 'Container', alternative: 'Desactive' },
    { feature: 'systemd', reason: 'Container', alternative: 'cron interne ou supervisord' },
  ],
  'windows-wsl2': [
    { feature: 'LaunchAgents', reason: 'Pas macOS', alternative: 'Scheduled Tasks Windows ou cron WSL' },
    { feature: 'Hammerspoon', reason: 'macOS only', alternative: 'Desactive' },
    { feature: 'sandbox-exec', reason: 'macOS only', alternative: 'Docker sandbox ou WSL isolation' },
  ],
};
```

### rex doctor — rapport plateforme

```
$ rex doctor   # sur VPS

  Platform: Linux (Ubuntu 24.04) — no GPU
  Mode: Hub + Headless

  [OK] Node.js v22.20.0
  [OK] rex-claude v7.0.0
  [OK] Ollama v0.8.x (CPU mode)
  [OK] Tailscale v1.82
  [OK] Docker v27.x
  [OK] bubblewrap (sandbox light)
  [OK] systemd (daemon)
  [OK] Gateway Telegram connected
  [WARN] No GPU — large models will be very slow
  [WARN] No GUI — use CLI, Telegram, or Web Dashboard
  [WARN] No microphone — Voice disabled
  [INFO] 2 features unavailable on this platform (see rex doctor --platform)

  Overall: HEALTHY (with platform limitations)
```

---

## RESILIENCE & FALLBACKS (CRITIQUE)

### R1. Provider Mesh — degradation gracieuse

```
Scenario: TOUS les free providers down + Ollama down
  → Notification user : "Aucun provider gratuit disponible"
  → Bascule auto vers SDK cheap (Agent SDK Haiku) si configure
  → Si budget.monthlyLimitUsd atteint → BLOCK + message "Limite atteinte"
  → JAMAIS de fail silencieux

Scenario: Agent SDK down (API Anthropic indisponible)
  → Fallback 1 : outil local deja installe (`claude -p`, `codex -p`, `aider`, `opencode`)
  → Fallback 2 : Ollama local ou node possede
  → Fallback 3 : free providers
  → Fallback 4 : autre SDK payant/abonnement si explicitement configure
  → Notification user : "Agent SDK indisponible, fallback vers [X]"

Scenario: OAuth token expire ou rate-limited
  → Agent SDK detecte 401/429
  → Si API key aussi configuree → switch automatique vers API key
  → Sinon → fallback vers pipe mode ou free providers
  → Notification user : "OAuth limit atteinte, basculé vers [X]"

Scenario: Ollama pas installe ou pas demarre
  → rex doctor detecte + propose "ollama serve" ou install
  → Le router SKIP les niveaux local et passe aux free providers
  → Warning dans les logs, pas de crash

Scenario: DeepSeek trial expire (30j)
  → Health check periodique (daemon) → detecte 401/403
  → Auto-disable le provider dans config.json
  → Notification user : "DeepSeek trial expire, desactive"

Scenario: Provider change ses quotas
  → Health check quotidien : test ping + 1 req basique par provider
  → Si fail 3x consecutif → auto-disable + notification
  → `rex providers health` — rapport status de tous les providers

Scenario: User a ZERO credentials (Zero Paid mode)
  → rex setup detecte et informe clairement
  → Active uniquement : Ollama + free providers + OpenCode + Aider
  → Message : "REX fonctionne en mode gratuit. Pour plus de puissance : rex setup"
  → JAMAIS de crash, toujours fonctionnel
```

### R2. Integrite memoire

```
Scenario: Embedding model change (ex: nomic-embed-text v1 → v2)
  → Detecte mismatch model version dans metadata
  → `rex memory reindex` — re-embed toute la DB avec le nouveau modele
  → Pendant le reindex : search degrade (cosine moins precis) mais fonctionne
  → Background daemon task, throttled, pas de downtime

Scenario: Conflit sync Hub/Node
  → Strategie : Last-Write-Wins + merge observations (jamais supprimer)
  → En cas de conflit sur un fact : garder les deux, flag "conflicted"
  → `rex memory conflicts` — affiche les conflits a resoudre manuellement

Scenario: Reflector rate sa fenetre (machine eteinte a 3h)
  → Au prochain demarrage : detecte "last_reflector_run > 24h"
  → Execute le reflector immediatement en background
  → Catch-up : consolide les N jours manques

Scenario: Corruption SQLite
  → `rex doctor --fix` : detecte corruption, attempt VACUUM
  → Si irrecuperable : restore depuis backup
  → Backup : `rex backup` — copie DB + config vers ~/.claude/rex/backups/
  → Daemon cron : backup quotidien a 2h (avant reflector a 3h)
  → Retention : 7 derniers backups (rotation automatique)
```

### R3. Hardware & Infrastructure

```
Scenario: Docker pas installe
  → sandbox full mode INDISPONIBLE → fallback auto vers sandbox light
  → `rex sandbox` → message "Docker requis pour mode full, utilise mode light"
  → `rex doctor` → warning "Docker non detecte, sandbox full desactive"

Scenario: sandbox-exec (macOS) deprecie par Apple
  → Monitorer les release notes macOS
  → Plan B : bubblewrap portage macOS ou Docker light (alpine container)
  → Le mode sandbox light est abstrait derriere interface → facile a changer l'impl

Scenario: Stockage sandbox sature
  → Daemon cron : cleanup containers arretes > 1h (docker container prune)
  → Cleanup images orphelines > 7j
  → Alerte si disk free < 5GB sur le VPS
  → `rex sandbox cleanup` — nettoyage manuel

Scenario: VPS disque plein
  → Daemon surveille disk usage (toutes les 30min)
  → 80% → warning log + notification Telegram
  → 90% → auto-cleanup (logs rotation, container prune, oldest Ollama models)
  → 95% → ALERT CRITIQUE + stop sandbox + stop Ollama → mode hub-only

Scenario: GPU detection echoue
  → Fallback explicite : `gpu.type = 'none'` dans HardwareProfile
  → Tous les modeles GPU → ignores, seuls les petits modeles CPU utilises
  → Log warning, pas crash

Scenario: Ollama model download echoue (internet coupe, disque plein)
  → Detecte fichier partiel dans ~/.ollama/
  → `rex doctor --fix` → supprime partiels + re-tente
  → Jamais de modele corrompu dans la liste des disponibles
```

### R4. Services tiers resilience

```
Scenario: MCP server crash
  → Circuit breaker par MCP server (3 fails → pause 5min → retry)
  → Les AUTRES servers continuent de fonctionner
  → Auto-restart du server en erreur (mcporter gere)
  → Si crash permanent → auto-disable + notification

Scenario: Outils review pas installes (Biome, Semgrep, etc.)
  → Chaque etape du pipeline : try/catch avec skip graceful
  → "Biome: SKIPPED (not installed)" au lieu de crash
  → `rex review --install-deps` → installe les outils manquants
  → `rex doctor` → verifie la presence de chaque outil

Scenario: PR-Agent free tier limite
  → Fallback : AI review via Ollama local (qwen3.5:9b) ou free provider (Cerebras)
  → Meme format de sortie que PR-Agent
  → Configurable : `review.aiReview.provider: 'pr-agent' | 'ollama' | 'cerebras'`
```

### R5. Guard & Daemon resilience

```
Scenario: Guard depasse 500ms
  → Timeout hard a 500ms → kill le process guard
  → Log warning "guard X timeout, skipped"
  → La session continue sans blocage
  → Si un guard timeout 3x de suite → auto-disable avec notification

Scenario: Event queue daemon sature
  → Max 1000 events en queue
  → Oldest-first eviction si plein
  → Log warning "event queue full, dropping oldest events"
  → Events critiques (git commit, session end) ont priorite haute, jamais drop

Scenario: chokidar RAM sur gros repo
  → Ignorer node_modules, .git, build/, dist/, .next/
  → Configurable : `daemon.watchIgnore: string[]` dans config
  → Si RSS > 512MB → restart daemon avec mode polling (plus lent, moins de RAM)
```

### R6. Mode Offline (explicite)

| Feature | Online | Offline |
|---------|--------|---------|
| Ollama local | OK | OK |
| Memory search | OK | OK |
| Memory ingest | OK | OK (pending/ queue) |
| Semantic cache | OK | OK |
| Guards | OK | OK |
| Review (local tools) | OK | OK (Biome, tsc, Gitleaks) |
| Review (AI) | OK | DEGRADE (Ollama local) |
| Free providers | OK | INDISPONIBLE |
| Paid providers | OK | INDISPONIBLE |
| MCP servers (distant) | OK | INDISPONIBLE |
| Telegram Gateway | OK | INDISPONIBLE (queue locale) |
| Cross-node sync | OK | QUEUE (offline-queue.jsonl) |
| Skills install | OK | CACHE LOCAL (deja installes) |
| Snapshots | OK | OK |
| Flutter app | OK | OK (tout local) |

**Regle** : REX DOIT rester fonctionnel sans internet pour toutes les taches locales.
Seuls les providers distants et la sync reseau sont bloques.

### R7. Multi-session & edge cases

```
Scenario: Deux sessions Claude Code sur le meme projet
  → Snapshots avec sessionId unique (UUID)
  → Preload restore : propose le snapshot le plus recent, pas de conflit
  → Memory observations : chaque session a son session_id → pas de merge involontaire

Scenario: User n'a pas GitHub
  → `rex project init` : skip GitHub steps, log "GitHub CLI non detecte, skip repo creation"
  → Toutes les features GitHub (PR, issues) → skip graceful + message
  → Le reste fonctionne normalement

Scenario: User n'a pas Telegram
  → `rex gateway` → "Telegram non configure, set REX_TELEGRAM_BOT_TOKEN dans settings"
  → Daemon, memory, review, guards → tout fonctionne sans Telegram
  → Les notifications push → fallback vers logs locaux ou desktop notification (macOS)

Scenario: npm/pnpm install echoue pendant rex init
  → Chaque etape d'init est independante et idempotente
  → Fail a l'etape 3 → log erreur + continue les etapes 4-N
  → `rex doctor --fix` rattrape les etapes echouees
  → Jamais d'etat "half-installed" bloquant
```

---

## SECURITE GLOBALE

### Corrections PRs Milo

| Fichier | Faille | Fix |
|---------|--------|-----|
| `accounts.ts` | Command injection via nom de compte | Regex `^[a-zA-Z0-9_-]+$` |
| `accounts.ts` | Path traversal via nom | Meme regex + `path.resolve` check |
| `project_init.ts` | Command injection via nom de dossier | `shellEscape()` ou regex |
| `gemini-review.yml` | Injection via `github.base_ref` | Utiliser `${{ env.BASE_REF }}` |
| `install.sh` | Lua heredoc injection | Quote le heredoc |
| Chemins DB | `~/.rex-memory/` obsolete | Corriger vers `~/.claude/rex/memory/` |

### MCP Security (OWASP MCP Top 10 — 2026)

30 CVEs en 60 jours sur les MCP servers. 38% des 500+ servers scannes n'ont aucune auth.

| Risque OWASP | Description | Defense REX |
|---|---|---|
| MCP01 Token Mismanagement | Credentials hard-codes, tokens dans logs | mcporter auth (token caching chiffre), jamais de tokens dans logs |
| MCP02 Excessive Agency | Permissions trop larges | Least-privilege par tool, confirmation user pour actions destructives |
| MCP03 Command Injection | Commandes shell via input non sanitise | Input validation + regex sur tous les params shell |
| MCP04 Supply Chain | Dependencies compromises | `mcp-scan` tool pinning (hash descriptions, alert on change) |
| MCP07 Insufficient Auth | Pas de verification d'identite | mcporter auth OAuth, Tailscale identite WireGuard |
| Tool Poisoning | Instructions cachees dans descriptions | `mcp-scan` scan + proxy mode, description length limits |
| Shadow MCP | Servers non-approuves | `rex mcp list` inventaire, scan periodique |
| Context Over-Sharing | Data qui leak entre sessions | Isolation contexte par projet, pas de cross-project MCP state |

### Outils securite MCP

| Outil | Role | Integration REX |
|---|---|---|
| **mcp-scan** (Invariant Labs) | Scan + proxy MCP, tool pinning, detection rug-pull | `rex mcp scan` — obligatoire avant activation |
| **Tailscale Aperture** (alpha) | AI gateway, intercepte chaque tool call, audit logs, credentials centralises | Route tout le traffic LLM via Aperture quand GA |
| **Google Model Armor** | Anti-injection pour Google Workspace MCP | Active via `--sanitize` flag |

### Network Security (Tailscale)

| Mesure | Implementation |
|---|---|
| **Deny-by-default** | Aucune communication sans Grant explicite |
| **Tags** | `tag:rex-hub`, `tag:rex-node`, `tag:mcp-server` |
| **Grants (pas ACLs)** | Chaque tag ne peut atteindre que ses destinations requises |
| **GitOps** | Fichier policy versionne dans le repo REX |
| **Credentials centralises** | Un seul API key par provider sur le hub, pas distribue aux nodes |
| **WireGuard** | Chiffrement point-a-point, identite cryptographique (pas besoin de JWT/mTLS en plus) |

### Sandbox Security

| Couche | Outil | Protection |
|---|---|---|
| **Filesystem** | sandbox-runtime (Seatbelt macOS / bubblewrap Linux) | Read+write CWD only, deny outside |
| **Network** | Deny-all + whitelist domaines | Pas d'acces reseau sauf GitHub, npm, pypi explicites |
| **Process** | seccomp-bpf (Linux) | Syscalls restreints au minimum |
| **Container** | Docker + overlay FS | Base read-only, ephemeral writable layer |
| **Prompt Injection** | Input sanitization + context isolation (Spotlighting) | Strip `<system>`, `<\|im_start\|>` des resultats MCP |

### Checklist securite pour chaque nouveau MCP server

1. `rex mcp scan <server>` — tool pinning + vulnerability check
2. Verifier permissions demandees (least-privilege)
3. Verifier source (GitHub officiel > community > unknown)
4. Tester en sandbox avant activation production
5. Monitorer les changements de description (rug-pull detection)

**TOUS les fixes Milo + toute la stack securite sont obligatoires.**

---

## ARCHITECTURE D'INTEGRATION CLAUDE — AGENT SDK FIRST

REX utilise l'**Agent SDK** (`@anthropic-ai/claude-agent-sdk`) comme voie principale d'integration avec Claude. C'est le meme SDK qu'OpenClaw et NanoClaw — multi-turn, streaming, tools, MCP, full control. `claude -p` reste un fallback pour les users qui preferent leur subscription flat-rate.

### L0. Agent SDK — Voie principale

L'Agent SDK donne a REX tout ce que `claude -p` ne peut pas :

| Feature | Agent SDK | `claude -p` |
|---------|-----------|-------------|
| **Multi-turn** | Sessions persistantes, contexte continu | Single-turn, chaque appel isole |
| **Streaming** | `StreamEvent` temps reel vers Flutter UI | stdout buffer, pas de vrai streaming |
| **Tool use** | Controle total (custom tools + MCP) | `--allowedTools` pour restreindre seulement |
| **Modele switching** | Switch Opus↔Sonnet mid-session | Fixe par appel (`--model`) |
| **Token metriques** | Usage exact par appel (input/output/cache) | Invisible (subscription) |
| **Temperature/params** | Full API params | Aucun controle |
| **Concurrence** | Limite API rate (genereuse) | Max ~2-3 sessions abo |
| **Hooks/lifecycle** | SDK lifecycle hooks natifs | SessionStart fire, le reste partiel |
| **Permission requests** | Surfacables vers l'UI | Pas de confirmation possible |
| **Session management** | Resume, pause, context window control | Aucun |

**Authentification — deux options** :

| Auth | Comment | Avantages | Pour qui |
|------|---------|-----------|----------|
| **OAuth subscription** | Login Claude Pro/Max via Agent SDK | Flat rate ($20-$200/mois), 0 surprise sur la facture | Usage personnel, dev local, experimentation |
| **API key** | `ANTHROPIC_API_KEY` pay-per-token | Prompt caching (-90%), batch API (-50%), metriques exactes | Usage intensif, production, couts optimises |

Anthropic a clarifie : l'OAuth est autorise pour l'usage personnel/local. La restriction vise les produits commerciaux tiers, pas les outils personnels comme REX.

**Pricing API key** : Opus 4.6 = $5/$25 per MTok, Sonnet 4.6 = $3/$15 per MTok.
**Batch API** : -50% sur les taches non-urgentes (reviews, consolidation).
**Prompt caching** : -90% sur les prefixes repetes (CLAUDE.md, context projet). API key only.

**Warning a l'user** : `rex setup` affiche clairement les deux options et leurs trade-offs.
Si OAuth choisi → warning "prompt caching et batch API non disponibles en mode subscription".

### L1. Architecture d'integration

```
Tache arrive dans REX
  │
  ├─ Complexity TRIVIAL → Ollama local (gratuit, 0 latence)
  ├─ Complexity LOW    → Free providers (Cerebras, Groq, Mistral)
  ├─ Complexity MED    → Agent SDK Sonnet 4.6 (ou OpenAI SDK Codex Mini)
  ├─ Complexity HIGH   → Agent SDK Opus 4.6 (ou OpenAI SDK GPT-5.4)
  ├─ Complexity CRIT   → Agent SDK Opus 4.6 + confirmation user
  │
  └─ FALLBACK si SDK non configure :
     ├─ `claude -p` pipe mode (si Claude Code installe)
     ├─ `codex -p` pipe mode (si Codex installe)
     └─ OpenCode/Aider + free providers
```

**Interface unifiee** : `BackendRunner` abstrait tous les backends derriere la meme interface :

```typescript
interface BackendRunner {
  type: 'agent-sdk' | 'openai-sdk' | 'claude-pipe' | 'codex-pipe' | 'opencode' | 'aider' | 'ollama';
  authMode: 'oauth' | 'api-key' | 'none';
  available(): Promise<boolean>;
  delegate(task: DelegateTask): AsyncGenerator<DelegateEvent>;
  streaming: boolean;      // true pour SDKs, false pour pipe
  multiTurn: boolean;      // true pour SDKs, false pour pipe
  tokenMetrics: boolean;   // true pour API key, estimation pour OAuth/pipe
  promptCaching: boolean;  // true pour API key only
  batchApi: boolean;       // true pour API key only
}
```

**Detection auto** (au premier `rex setup`) :
1. Agent SDK disponible ? (OAuth OU API key) → backend principal Claude
2. OpenAI SDK disponible ? (OAuth OU API key) → backend principal OpenAI
3. `claude -p` installe ? → fallback pipe Claude
4. `codex -p` installe ? → fallback pipe Codex
5. Ollama accessible ? → backend local
6. Toujours actif : 8 free providers + OpenCode/Aider
7. Rien du tout ? → mode Zero Claude (free + local only)

### L2. Pourquoi Agent SDK et pas juste `claude -p`

"On fait comme OpenClaw avec Agent SDK" — Kevin

Anthropic a clarifie apres la controverse OAuth (jan-fev 2026) :
- **Usage personnel (OAuth) = autorise** pour le dev local et l'experimentation
- **Usage commercial** = API key requise
- REX = outil personnel open source, surcouche d'amelioration, usage personnel = OK
- L'Agent SDK est la voie d'integration **prevue et encouragee** par Anthropic
- OpenClaw et NanoClaw utilisent le meme pattern

L'Agent SDK donne a REX les capacites d'un vrai orchestrateur :
- Sessions multi-turn avec contexte persistant (vs N appels isoles en pipe mode)
- Streaming en temps reel vers l'UI Flutter (vs buffer stdout)
- Custom tools REX injectes dans chaque session (memory search, observe, delegate)
- MCP servers injectes programmatiquement
- Token metriques exactes pour le budget tracker (API key mode)
- Prompt caching automatique (API key mode — context projet = cache hit)
- Permission requests surfacables vers l'UI (vs zero confirmation en pipe)

**Note** : `rex setup` propose les deux auth (OAuth subscription + API key) avec warning clair sur les differences. L'user choisit. Meme chose pour OpenAI (OAuth ChatGPT Plus + API key).

### L3. Optimisation des couts

REX optimise agressivement quel que soit le mode d'auth :

**Mode API key** (pay-per-token) :

| Technique | Economie estimee |
|-----------|-----------------|
| **Prompt caching** | -90% sur le context repete (CLAUDE.md, project context) |
| **Batch API** | -50% sur les taches non-urgentes (reviews, consolidation) |
| **Routing intelligent** | 80%+ des taches → local/free, seul CRIT/HIGH → SDK |
| **Context pre-compute** | Fichiers pertinents only, CLAUDE.md tronque, 200-400 tokens budget |
| **Session reuse** | Multi-turn = 1 session au lieu de N appels isoles |
| **Semantic cache** | Meme question = reponse cachee, zero token |

Estimation : ~$1.50-$2.50/mois pour un dev solo intensif.

**Mode OAuth** (subscription flat rate) :

| Technique | Benefice |
|-----------|----------|
| **Routing intelligent** | Economise le quota subscription (messages/5min limit) |
| **Semantic cache** | Meme question = 0 message consomme du quota |
| **Session reuse** | Multi-turn = 1 session au lieu de N sessions isolees |
| **Context pre-compute** | Sessions plus courtes = quota preservé |
| **Local/free first** | 80%+ des taches ne touchent meme pas le quota |

Avantage OAuth : cout fixe et previsible, pas de surprise sur la facture.
Inconvenient : pas de prompt caching ni batch API (fonctions API key only).

### L4. Codex CLI — complement, pas remplacement

Codex CLI (`codex -p`) reste utile comme backend alternatif :
- `--approval-mode full-auto` = zero confirmation (sandbox)
- GPT-5.4 = 1M context window
- Computer use capabilities
- Codex Mini = 4x plus d'usage par sub

REX abstrait Codex derriere la meme interface `BackendRunner`.

### L5. `claude -p` / `codex -p` — fallback pipe mode

Pour les users qui preferent un mode simple sans SDK :

| Limite pipe mode | Comment REX compense |
|------------------|---------------------|
| Single-turn | REX gere la boucle multi-tour (re-appel avec contexte enrichi) |
| Pas de streaming | "Processing..." puis resultat complet |
| Context opaque | Preload budget strict (200-400 tokens) |
| Pas de params API | Accepter defaults, optimiser via le prompt |
| Concurrence ~2-3 | Queue + priorite |
| Token invisible | Budget tracker par estimation |

**Quand preferer pipe mode** :
- L'user ne veut pas configurer de SDK
- Taches simples et ponctuelles (pas besoin de multi-turn)
- `claude -p` avec `--output-format stream-json` offre du pseudo-streaming

**Pipe mode reste fonctionnel** — juste moins riche que l'Agent SDK.

### L6. Mode "Zero Paid" — REX sans aucun abonnement ni API key

REX DOIT fonctionner pour un user qui n'a NI Claude NI OpenAI :

```
Tache arrive
  → Semantic cache (OK)
  → Ollama local (OK)
  → Free providers (Cerebras, Groq, Mistral, etc.) (OK)
  → OpenCode + free providers (OK — CLI coding agent gratuit)
  → Aider + free providers (OK — edit + auto-commit gratuit)
  → Agent SDK / OpenAI SDK → SKIPPED (pas de credentials)
  → "Tache completee avec provider gratuit"
```

Features degradees en mode Zero Paid :
- Pas de `rex delegate` vers Claude/Codex (mais OpenCode/Aider marchent)
- Pas de hooks Claude (SessionStart/End) → REX daemon compense
- Pas de MCP via Claude → MCP direct via mcporter
- Architecture/decisions complexes → free providers (Gemini 2.5 Pro, Cerebras Qwen3 235B)

**Echelle de puissance REX** :
1. **Zero Paid** : Ollama + free providers → fonctionnel, utile, gratuit
2. **Subscription** : + Agent SDK OAuth (Pro $20/mois) → multi-turn, streaming, Claude quality
3. **API key** : + prompt caching + batch → performance maximale, cout optimise (~$2/mois)
4. **Full stack** : Claude + OpenAI + GPU node → Jarvis mode complet

---

## ORDRE D'IMPLEMENTATION + SUBAGENT ASSIGNMENTS

### Phase 1 — Le Cerveau (semaine 1-2)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Provider Mesh : interface unifiee + Vercel AI SDK | 1.1 | **Agent-Router** | worktree | — |
| Integrer 8 free providers (OpenAI-compat) | 1.2 | **Agent-Router** | worktree | 1.1 |
| Semantic Cache table + logique | 1.5 | **Agent-Cache** | worktree | — |
| Observational Memory Observer (SessionEnd) | 3.1 | **Agent-Memory** | worktree | — |
| Observational Memory Reflector (daemon cycle) | 3.1 | **Agent-Memory** | worktree | 3.1 Observer |
| Daemon event-driven (chokidar + event queue) | 7 | **Agent-Daemon** | worktree | — |
| Budget tracker table + `rex budget` | 1.6 | **Agent-Router** | worktree | 1.1 |
| Pre-shot compaction snapshots + preload restore | 19 | **Agent-Memory** | worktree | 3.1 Observer |

**Parallelisable** : Agent-Router + Agent-Cache + Agent-Memory + Agent-Daemon (4 en parallele)
**Skills** : `writing-plans` (avant chaque agent), `test-strategy` (definir tests), `db-design` (schema cache + memory), `api-design` (provider interface), `build-validate` (apres chaque merge)

### Phase 2 — La Defense (semaine 2-3)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Installer Biome + config REX | 5.1 | **Agent-Review** | worktree | — |
| Installer Semgrep + regles | 5.1 | **Agent-Security** | worktree | — |
| Installer Gitleaks + TruffleHog | 5.1 | **Agent-Security** | worktree | — |
| Installer OSV-Scanner | 5.1 | **Agent-Security** | worktree | — |
| `rex review` pipeline orchestrateur | 5.2 | **Agent-Review** | worktree | Phase 2 tools |
| 7 nouveaux guards (secret, any-type, etc.) | 6 | **Agent-Guards** | worktree | — |
| Git hooks integration (post-commit, pre-push) | 7.3 | **Agent-Guards** | worktree | Guards |

**Parallelisable** : Agent-Review + Agent-Security + Agent-Guards (3 en parallele)
**Skills** : `writing-plans`, `test-strategy` (review pipeline tests), `error-handling` (guard error flows), `semgrep` (regles custom), `build-validate`

### Phase 3 — Le Reseau + Sync (semaine 3-4)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Hardware auto-detection (`hardware.ts`) | 10 | **Agent-Hardware** | worktree | — |
| Hub API REST (Express/Fastify) | 9 | **Agent-Network** | worktree | — |
| Node registration + heartbeat | 9 | **Agent-Network** | worktree | Hub API |
| **WebSocket sync server (port 3118)** | SYNC | **Agent-Sync** | worktree | Hub API |
| **SQLite sync queue + catch-up** | SYNC | **Agent-Sync** | worktree | WS server |
| **Memory sync (semantic + observations + short-term)** | SYNC | **Agent-Sync** | worktree | Memory (Phase 1) |
| **Task queue (offline → relance au reconnect)** | SYNC | **Agent-Sync** | worktree | WS server |
| Dockerfile + docker-compose.yml | 9 | **Agent-Docker** | worktree | — |
| `rex init --docker` generateur | 9 | **Agent-Docker** | worktree | Dockerfile |
| Tailscale integration | 9 | **Agent-Network** | worktree | Hub API |
| WoL automation | 9 | **Agent-Network** | worktree | — |

**Parallelisable** : Agent-Hardware + Agent-Network + Agent-Sync + Agent-Docker (4 en parallele)
**Skills** : `writing-plans`, `api-design` (Hub REST API), `auth-patterns` (JWT, Tailscale auth), `error-handling` (network failures, reconnection), `db-design` (sync queue schema), `test-strategy`, `build-validate`

### Phase 4 — L'Orchestrateur + MCP Hub (semaine 4-5)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Backend detection + SDK setup (Agent SDK, OpenAI SDK, pipes, Ollama) | 2.1-2.2 | **Agent-Orchestrator** | worktree | — |
| `rex delegate` avec routing complexite | 2.3 | **Agent-Orchestrator** | worktree | 2.1-2.2 |
| Token optimization (prompt caching, batch, session reuse) | 2.4 | **Agent-Orchestrator** | worktree | 2.3 |
| Multi-account management (from Milo, + security fix) | 2.5 | **Agent-Accounts** | worktree | — |
| YOLO Sandbox integration (adapter + policy layer, pas moteur maison) | 4 | **Agent-Sandbox** | worktree | Docker (Phase 3) |
| Workflows (new-feature, bug-fix, pr, deploy) | 8 | **Agent-Workflow** | worktree | Review (Phase 2) |
| Project bootstrap (from Milo, + security fix) | 11 | **Agent-Bootstrap** | worktree | — |
| mcporter integration (proxy/hub, daemon mode) | 15 | **Agent-MCP** | worktree | — |
| FastMCP custom REX tools (memory, delegate, observe) | 15.4 | **Agent-MCP** | worktree | mcporter |
| MCP auto-recommandation par stack (MCP_MAP dans preload.ts) | 15.3 | **Agent-MCP** | worktree | mcporter |
| CLI menu interactif (`rex` sans argument) | 14 | **Agent-CLI** | worktree | — |
| CLI `--json` output sur toutes les commandes | 14.4 | **Agent-CLI** | worktree | 14 |
| **Gateway refonte Agent SDK** (fix path Claude casse) | 17.1-17.4 | **Agent-Gateway** | worktree | Backend detection (2.1) |
| Gateway adapter abstraction + Discord/Slack/Web | 17.5-17.8 | **Agent-Gateway** | worktree | Gateway Agent SDK |
| Knowledge Sources ingest (Obsidian + pluggable) | KS | **Agent-Memory** | worktree | Memory (Phase 1) |
| Device bridge (pairing, join, devices) | 18 | **Agent-Network** | worktree | Network (Phase 3) |

**Parallelisable** : 7 agents identifies mais **max 3-4 simultanes** (quota Claude Max + RAM).
Batch A (semaine 4) : Agent-Orchestrator + Agent-MCP + Agent-CLI
Batch B (semaine 5) : Agent-Accounts + Agent-Sandbox + Agent-Workflow + Agent-Bootstrap
**Skills** : `writing-plans`, `test-strategy`, `ux-flow` (CLI menu UX), `auth-patterns` (accounts security), `error-handling`, `build-validate`, `verification-before-completion`

### Phase 5 — L'Interface (semaine 5-6)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Flutter Network page + Sync status | 13.3 + SYNC | **Agent-Flutter** | worktree | Hub API + Sync (Phase 3) |
| Flutter Provider dashboard | 13.4 | **Agent-Flutter** | worktree | Budget tracker (Phase 1) |
| Flutter Review page | 13 | **Agent-Flutter** | worktree | Review pipeline (Phase 2) |
| Flutter Sandbox page | 13 | **Agent-Flutter** | worktree | Sandbox (Phase 4) |
| Flutter MCP management page (add/remove/toggle/scan) | 15.6 | **Agent-Flutter** | worktree | MCP Hub (Phase 4) |
| Honesty guard | 16.1 | **Agent-Guards** | worktree | — |
| Tech debt tracker | 16.2 | **Agent-Coaching** | worktree | — |
| Self-improve extension | 16.3 | **Agent-Coaching** | worktree | Memory (Phase 1) |
| Voice optimization (Groq Whisper) | 12 | **Agent-Voice** | worktree | Provider Mesh (Phase 1) |
| MCP security scan integration (mcp-scan) | 15 | **Agent-Security** | worktree | MCP Hub (Phase 4) |

**Parallelisable** : Agent-Flutter + Agent-Guards + Agent-Coaching + Agent-Voice + Agent-Security (max 3-4 simultanes)
**Skills** : `writing-plans`, `ui-craft` (toutes les pages Flutter), `ux-flow` (flows utilisateur), `figma-workflow` (si maquettes), `test-strategy` (widget tests + golden tests), `build-validate`, `verification-before-completion`

### Phase 6 — Deploy VPS + Polish (semaine 6-7)

| Task | Bloc | Subagent | Isolation | Dependances |
|------|------|----------|-----------|-------------|
| Deploy REX Hub sur VPS Hostinger | 9 | **Kevin (manual)** | — | Phase 3 Docker |
| Connecter Mac + PC RTX comme nodes | 9 | **Kevin (manual)** | — | Deploy VPS |
| Tests E2E du reseau | — | **Agent-Test** | — | Deploy complet |
| README + docs d'installation | — | **Agent-Docs** | — | Tout |
| npm publish rex-claude v7.0.0 | — | **Kevin (manual)** | — | Tests passes |

---

## SUBAGENT TEAM ROSTER

| Agent | Specialite | Fichiers principaux |
|-------|-----------|---------------------|
| **Agent-Router** | Provider mesh, routing, budget | `router.ts`, `providers.ts`, `budget.ts` |
| **Agent-Cache** | Semantic cache, LLM optimization | `cache.ts`, `llm.ts` |
| **Agent-Memory** | Observational memory, forgetting curve | `memory/`, `self-improve.ts` |
| **Agent-Daemon** | Event-driven daemon, chokidar | `daemon.ts` |
| **Agent-Review** | Code review pipeline, Biome, PR-Agent | `review.ts` |
| **Agent-Security** | Semgrep, Gitleaks, TruffleHog, OSV | `security.ts` |
| **Agent-Guards** | Guard framework, 7 nouveaux guards | `guards/` |
| **Agent-Network** | Hub API, node registration, Tailscale, WoL | `hub.ts`, `node.ts`, `network.ts` |
| **Agent-Docker** | Dockerfile, compose, init --docker | `docker/`, `init.ts` |
| **Agent-Hardware** | Auto-detection GPU/RAM/backends | `hardware.ts` |
| **Agent-Orchestrator** | Backend detection, delegate, token optim | `orchestrator.ts` |
| **Agent-Accounts** | Multi-account Claude/Codex | `accounts.ts` |
| **Agent-Sandbox** | Integration YOLO sandbox, selection runtime, risk policies, status | `sandbox.ts` |
| **Agent-Workflow** | Workflows (feature, bugfix, pr, deploy) | `workflow.ts` |
| **Agent-Bootstrap** | Project init, SKILL_MAP, GitHub setup | `project_init.ts`, `github_setup.ts` |
| **Agent-MCP** | MCP Hub (mcporter + FastMCP), recommandations par stack, registry | `mcp.ts`, `mcp_hub.ts`, `mcp_registry.ts` |
| **Agent-CLI** | CLI menu interactif, --json output, UX | `index.ts`, `menu.ts` |
| **Agent-Flutter** | App Flutter (Network, Providers, Review, MCP) | `flutter_app/lib/pages/` |
| **Agent-Coaching** | Honesty guard, tech debt, self-improve | `coaching.ts` |
| **Agent-Voice** | Voice optimization, Groq Whisper | `voice.ts` |
| **Agent-Sync** | WebSocket sync, queue offline, memory sync, catch-up | `sync.ts`, `sync-server.ts`, `sync-queue.ts` |
| **Agent-Gateway** | Gateway refonte Agent SDK + multi-platform adapters | `gateway.ts`, `gateway-backend.ts`, `adapters/` |
| **Agent-Test** | Tests E2E, integration | `tests/` |
| **Agent-Docs** | README, installation docs, migration guide | `docs/`, `README.md` |

---

## RISQUES ET MITIGATIONS

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Free providers changent leurs quotas | Perte de routing gratuit | Fallback chain + 8 providers = redundance |
| Rate limit sur tous les free en meme temps | Taches bloquees | Ollama local en dernier recours (toujours dispo) |
| VPS Hostinger down | Hub inaccessible | Mode offline sur Mac (queue + sync) |
| Complexity du reseau distribue | Bugs, latence | Keep it simple : WebSocket pour sync, HTTP/JSON pour API. Pas de gRPC/CRDT. LWW. |
| Docker overhead sur VPS 2 vCPU | Perf degradee | Image slim, pas de Docker-in-Docker sauf sandbox |
| Milo PRs security issues | Injection commands | Fixes obligatoires avant merge (regex + escape) |
| Semantic cache stale | Reponses obsoletes | TTL 7j + invalidation sur git push |
| Memory DB corruption | Perte memoire | Backup nightly + WAL mode SQLite |
| mcporter abandonne (2.5k stars) | MCP hub inutilisable | Abstraction layer : `McpProxy` interface, mcporter = impl par defaut, fallback MCP SDK direct |
| Mac M1 ne supporte pas WoL | Mac injoignable quand en sleep | Tailscale keepalive + `caffeinate` schedule + alternative SSH wake |
| Compaction perd du contexte | Sessions cassees, travail perdu | BLOC 19 — Pre-shot snapshots + preload restore |
| Anthropic change la politique OAuth | Agent SDK OAuth bloque | Fallback auto vers API key ou claude -p. REX detecte 401 OAuth → switch. Warning user. |
| Agent SDK breaking changes | Integration cassee | Version pinned dans package.json. Abstraction `BackendRunner` = 1 seul fichier a adapter. |
| OAuth device code non supporte | Setup VPS bloque pour OAuth | Fallback vers API key (toujours disponible). Instructions "copier token depuis browser local". |
| WebSocket sync deconnecte souvent | Messages perdus, sync cassee | Queue SQLite sur VPS (garantie zero perte). Reconnexion auto avec backoff. Catch-up sync au reconnect. |
| VPS reboot perd la queue sync | Messages en attente perdus | SQLite = persistant sur disque. WAL mode survit aux crashes. Backup nightly. |
| LWW conflit si 2 devices editent simultanement | Donnee ecrasee silencieusement | Conflit log visible dans Flutter UI. Alerte si conflit detecte. Kevin est seul user → rare. |
| Gateway Agent SDK session timeout | Session coupee pendant une conversation | Session auto-reconnect. Si impossible → fallback backend suivant. Notification user. |
| Gateway Telegram rate limit (30 msg/s) | Streaming bloque | Throttle editMessageText a 800ms min. Batch les edits. Si 429 → backoff. |
| Obsidian LiveSync down | Backup vault pas propage | Le repo git est la source de verite, pas le vault. Copie manuelle toujours possible. |
| Knowledge ingest surcharge la DB | DB trop grosse, search lent | Delta ingest (mtime tracking). Max chunks configurable. `rex memory prune` pour cleanup. |

---

## MONETISATION (notes)

REX est open source, mais certaines features pourraient etre premium :
- **REX Cloud** : Hub hosted (pas besoin de VPS perso)
- **REX Pro** : Providers pre-configures + support
- **REX Teams** : Multi-user, shared memory, team dashboard
- **Marketplace** : Skills premium, guard packs, templates

Le core CLI reste toujours gratuit et open source.

---

## AUDIT COMPLET — POINTS BLOQUANTS, PROBLEMES RECURRENTS, ERREURS POTENTIELLES

*Audit realise apres integration Agent SDK, Gateway refonte, Sync temps reel, Knowledge Sources.*

### A1. Points bloquants identifies

| # | Bloquant | Impact | Bloc(s) | Resolution |
|---|----------|--------|---------|------------|
| 1 | **Gateway Claude JAMAIS fonctionne** | Kevin ne peut pas parler a Claude via Telegram — feature flagship cassee depuis le debut | 17 | RESOLU dans plan v4 : refonte complete avec Agent SDK multi-turn + streaming + fallback chain |
| 2 | **Agent SDK OAuth pas encore GA** | Si Anthropic change d'avis sur OAuth personnel, Agent SDK OAuth casse | 2, 17 | Dual auth dans le plan. Fallback auto API key → pipe mode. REX detecte 401 OAuth → switch. |
| 3 | **Pas de WebSocket dans le plan avant v4** | La section reseau disait "HTTP/JSON simple, pas de WebSocket" — incompatible avec sync temps reel | SYNC, 9 | RESOLU dans plan v4 : WebSocket pour sync, HTTP REST pour API commandes |
| 4 | **Obsidian/Knowledge pas prevu** | Aucune source de connaissance externe n'etait prevue — REX ne connaissait que les sessions Claude | KS | RESOLU dans plan v4 : interface KnowledgeSource pluggable (Obsidian, Logseq, Outline, etc.) |
| 5 | **VPS single point of failure** | Si VPS crash → plus de Hub, plus de queue, plus de sync | 9, SYNC | SQLite WAL survit aux crashes. Backup nightly. Mode offline sur Mac complet. Restart auto systemd. |

### A2. Problemes recurrents (patterns a surveiller)

| # | Pattern | Ou il apparait | Risque | Prevention |
|---|---------|---------------|--------|------------|
| 1 | **Process orphelins** | Gateway (claude spawn), Agents (claude multi-instance), Ollama | Memory leak, ports bloques, sessions fantomes | Agent SDK = library (pas de process). Pour Ollama/pipes → PID tracking + cleanup dans daemon. `rex doctor --fix` nettoie. |
| 2 | **Nested session detection** | Gateway dans Claude Code, agents dans agents | Process refuse de se lancer, erreur cryptique | Agent SDK = pas de session nestee (c'est du code, pas un process Claude). Pour pipes → detecter et skip avec message clair. |
| 3 | **Rate limiting cascading** | Telegram (30 msg/s), Free providers (2 RPM Mistral), Claude OAuth (messages/5min) | Tout se bloque en chaine, messages perdus | Chaque couche a son propre throttle. Queue avec backoff. Jamais de fire-and-forget. Monitoring dans `rex status`. |
| 4 | **Config desynchronisee** | config.json lu par CLI + Flutter + daemon + gateway simultanement | Race condition, un composant voit une vieille config | Watcher chokidar sur config.json. Reload notifie tous les consumers. Pas de cache longue duree. |
| 5 | **SQLite concurrent access** | Memory DB (ingest + search + categorize + sync) | `SQLITE_BUSY`, writes qui echouent | WAL mode (deja actif). Lockfile pour les writes lourds. Connection pool avec retry (3x, 100ms backoff). |
| 6 | **Streaming interrompu** | Telegram editMessageText, Agent SDK stream, Qwen Ollama stream | Message tronque, UI inconsistante | Toujours envoyer un edit final avec le texte complet. Timeout + fallback "message complete" si stream coupe. |

### A3. Erreurs potentielles dans le plan

| # | Erreur potentielle | Ou | Pourquoi c'est un risque | Fix dans le plan |
|---|-------------------|-----|--------------------------|-----------------|
| 1 | **WebSocket sur Tailscale** | SYNC S2 | Tailscale = tunnel WireGuard. WebSocket devrait fonctionner mais latence peut varier. | Tester en Phase 3. Si instable → fallback HTTP long-polling (meme queue SQLite). |
| 2 | **Agent SDK session memory** | 17.2, L1 | Si 100 sessions Agent SDK ouvertes → RAM du VPS (8GB) peut saturer. | Limit 10 sessions simultanées. LRU eviction. `endSession()` auto apres 30min inactivite. |
| 3 | **Sync flood au reconnect** | SYNC S4 | Mac offline 24h → 500+ items a sync → le Mac est bloque pendant le processing. | Temp folder (S6) = instantane. Processing async en background. Mac utilisable immediatement. |
| 4 | **Embedding sans Ollama** | SYNC S5, KS | Un VPS sans GPU recoit des chunks a embedder mais Ollama est lent en CPU. | Pre-calculer les embeddings sur le node source. Transmettre les embeddings avec les chunks. VPS stocke sans re-embedder. |
| 5 | **Gateway backend chain lente** | 17.9 | Si Agent SDK timeout (30s) → OpenAI timeout (30s) → Ollama → total 60-90s avant reponse. | Parallele probe : tester tous les backends en parallele, utiliser le premier qui repond. Ou fast-fail : 5s timeout pour le backend principal, pas 30s. |
| 6 | **LWW timestamp drift** | SYNC S8 | Si les horloges Mac/VPS/PC ne sont pas synchronisees → LWW donne des resultats incoherents. | Utiliser le timestamp du Hub (VPS) comme reference. Chaque message sync inclut le delta horaire. NTP obligatoire sur tous les nodes. |
| 7 | **Knowledge ingest doublon** | KS3 | Si un fichier Obsidian est aussi ingere via session Claude → doublon en memoire. | Source tagging. Dedup par contenu hash. `rex memory dedup` commande. |
| 8 | **Config schema v4 enormement plus gros** | P2 | config.json grossit (sync, knowledge, gateway backends) → risque de regression a chaque ajout. | Schema validation avec zod. `rex doctor` verifie le schema. Migration auto des anciennes configs. |

### A4. Dependencies critiques entre blocs

```
Phase 1 (Memory + Router + Daemon + Cache)
  ↓
Phase 2 (Review + Security + Guards) ← pas de dependance Phase 1, parallelisable
  ↓
Phase 3 (Reseau + Sync) ← depend de Phase 1 (Memory pour sync)
  ↓
Phase 4 (Orchestrator + Gateway Agent SDK + MCP) ← depend de Phase 3 (Hub API + Sync)
  ↓
Phase 5 (Flutter UI + Voice + Coaching) ← depend de Phase 3-4 (pages sync, gateway, etc.)
  ↓
Phase 6 (Deploy VPS + Polish) ← depend de tout
```

**Chemin critique** : Phase 1 → Phase 3 (Sync) → Phase 4 (Gateway Agent SDK) → Phase 6 (Deploy)
Si le sync bloque → le gateway ne peut pas etre teste en reseau → le deploy est retarde.

### A5. Recommendations

1. **Gateway Agent SDK = priorite absolue Phase 4**. C'est la feature que Kevin attend depuis le debut. Ne pas la noyer dans les autres taches Phase 4.
2. **Tester la sync WebSocket sur Tailscale AVANT de coder le reste de Phase 3**. Un POC de 2h suffit. Si ca ne marche pas → pivoter vers HTTP long-polling.
3. **Pre-calculer les embeddings** pour la sync. Ne jamais forcer un node a re-embedder des chunks recus. Le node source (qui a Ollama GPU) embed → le recepteur stocke.
4. **Fast-fail sur le gateway backend chain**. 5s timeout max par backend, pas 30s. L'user sur Telegram veut une reponse en <10s, pas en 90s.
5. **Schema validation** avec zod des que le config.json depasse 10 sections. Chaque bloc qui ajoute une section config DOIT ajouter le schema zod correspondant.
6. **NTP obligatoire** sur tous les nodes. Ajouter le check dans `rex doctor`. Si drift > 1s → warning.

---

## OPEN SOURCE A ASPIRER — PATTERNS REUTILISABLES

Analyse approfondie de 6 projets open source leaders. Objectif : ne JAMAIS recoder ce qui existe deja.
Chaque pattern liste ci-dessous a ete verifie dans le code source du projet.

### OS1. OpenClaw (github.com/openclaw/openclaw) — 12K+ stars

Le plus proche de REX en philosophie. Agent personnel multi-plateforme avec Agent SDK.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **Channel Registry** — auto-enregistrement des channels au startup via `registerChannel(name, factory)` | `src/channels/registry.ts` | Gateway adapters (BLOC 17.5) — chaque adapter s'enregistre dans un registry au lieu d'etre hardcode | HAUTE |
| **Container Runner** — isole chaque session Agent SDK dans un container Linux (IPC via fichiers) | `src/container-runner.ts` | A etudier seulement si YOLO Sandbox / runtimes existants ne couvrent pas le besoin. Pas une cible de reimplementation par defaut. | MOYENNE |
| **Context Window Guard** — hard min 16K tokens, warn below 32K, source tracking (model/config/default) | `src/agents/context-window-guard.ts` | Compaction resilience (BLOC 19) — garde similaire pour detecter quand le contexte est critique | MOYENNE |
| **Multi-Agent Routing** — agents isoles (workspace + agentDir + sessions), routing via bindings | `docs/concepts/multi-agent.md` | Orchestrateur (BLOC 2) — routing tasks vers agents isoles avec contexte separe | HAUTE |
| **Model Failover** — 2 stages: auth profile rotation dans le provider, puis model fallback chain | `docs/concepts/model-failover.md` | Provider Mesh (BLOC 1) — exactement le meme pattern pour nos fallback chains | HAUTE |
| **Streaming + Chunking** — 2 layers: block streaming (channels) et channel preview streaming | `docs/concepts/streaming.md` | Gateway streaming (BLOC 17.3) — meme separation block/preview pour Telegram | MOYENNE |
| **Agent Loop Lifecycle** — intake → context assembly → inference → tool execution → streaming → persistence | `docs/concepts/agent-loop.md` | Orchestrateur (BLOC 2) — cycle de vie standard pour nos sessions Agent SDK | MOYENNE |
| **Cron vs Heartbeat** — guide decision pour scheduling (token-aware) | `docs/concepts/cron-vs-heartbeat.md` | Daemon (BLOC 7) — meme decision framework pour nos taches periodiques | BASSE |
| **ACP Spawn Parent Stream** — Agent Communication Protocol pour agents parents/enfants | `src/agents/acp-spawn-parent-stream.ts` | Agents autonomes — communication inter-agents structuree | BASSE |

**Code a forker/adapter** :
```typescript
// Pattern Channel Registry (adapter de OpenClaw src/channels/registry.ts)
export interface AdapterFactory {
  (opts: AdapterOpts): GatewayAdapter | null;
}
const registry = new Map<string, AdapterFactory>();
export function registerAdapter(name: string, factory: AdapterFactory): void {
  registry.set(name, factory);
}
export function getAdapterFactory(name: string): AdapterFactory | undefined {
  return registry.get(name);
}
export function getRegisteredAdapterNames(): string[] {
  return [...registry.keys()];
}
```

### OS2. NanoClaw (github.com/qwibitai/nanoclaw) — 2K+ stars

Reference Agent SDK + multi-platform gateway leger. Architecture mono-process avec channels-as-skills.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **Channels as Skills** — chaque channel (Telegram, WhatsApp, Slack, Discord, Gmail) est un skill qui s'auto-enregistre au startup | `src/channels/` + `.claude/skills/add-*/` | Gateway (BLOC 17) — ajout de nouveaux channels via skills sans modifier le core | HAUTE |
| **Group Queue** — queue avec max concurrent containers, retry avec backoff exponentiel | `src/group-queue.ts` | Task queue sync (section S7) — meme pattern pour limiter la concurrence des taches | HAUTE |
| **Groups = Isolated Contexts** — chaque group a son propre CLAUDE.md, filesystem, memoire | `groups/` | Multi-projet REX — isolation contexte par projet | MOYENNE |
| **Container IPC** — communication agent ↔ container via fichiers temporaires | `src/container-runner.ts` | Reference seulement si une couche d'adaptation REX devient necessaire au-dessus d'un runtime existant | BASSE |
| **Scheduler** — cron parser + task lifecycle (due → running → completed) | `src/scheduler.ts` | Daemon (BLOC 7) — scheduler unifie pour toutes les taches periodiques | BASSE |

### OS3. Goose (github.com/block/goose) — 32K+ stars

Agent extensible en **Rust** (crates workspace). Reference pour l'architecture Rust haute performance.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **Crates Workspace** — modules independants compilables separement (goose, goose-server, goose-acp) | `crates/` | Si on fait du Rust pour sync-server ou embeddings, meme organisation workspace | HAUTE |
| **Provider Abstraction** — interface `base.rs` unifiee pour 15+ providers (anthropic, azure, bedrock, openai, etc.) | `crates/goose/src/providers/` | Provider Mesh (BLOC 1) — notre `ProviderAdapter` suit le meme pattern | HAUTE |
| **Extension System** — plugins via MCP + extension manager + malware check | `crates/goose/src/agents/extension*.rs` | MCP Hub (BLOC 15) — verification securite des extensions MCP | MOYENNE |
| **Agent Containers** — isolation execution dans containers | `crates/goose/src/agents/container.rs` | Sandbox (BLOC 4) — reference Rust pour containerisation | MOYENNE |
| **Built-in Skills** — skills markdown integres dans le binaire | `crates/goose/src/agents/builtin_skills/` | Skills (existant) — meme approche, deja implementee | BASSE |

### OS4. Mem0 (github.com/mem0ai/mem0) — 41K+ stars

Memory layer universelle. Reference pour l'architecture memoire pluggable.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **Factory Pattern** — `EmbedderFactory`, `LLMFactory`, `VectorStoreFactory`, `HistoryManagerFactory` | `mem0-ts/src/oss/src/utils/factory.ts` | Memory (BLOC 3) — notre systeme d'embeddings devrait avoir une factory similaire (Ollama, OpenAI, local Rust) | HAUTE |
| **Pluggable Providers** — 9 embedders (openai, ollama, google, azure...), 10 LLMs, 8 vector stores | `mem0-ts/src/oss/src/embeddings/`, `llms/`, `vector_stores/` | Memory (BLOC 3) — extensibilite future au-dela de juste Ollama | HAUTE |
| **SQLite History Manager** — thread-safe avec lock, migration auto, history table | `mem0-ts/src/oss/src/storage/SQLiteManager.ts` | Memory — meme pattern pour notre SQLite, avec migration versions | MOYENNE |
| **Graph Memory** — knowledge graph au-dessus du vector store | `mem0-ts/src/oss/src/memory/graph_memory.ts` | Future — REX v8 knowledge graph (pas v7) | BASSE |
| **BM25 Hybrid Search** — combine BM25 keyword + cosine similarity | `mem0-ts/src/oss/src/utils/bm25.ts` | Memory search — ameliorer `rex search` avec hybrid retrieval | MOYENNE |
| **Config Schema Zod** — validation stricte config avec Zod | `mem0-ts/src/oss/src/types/` | Config (P2) — valider `config.json` avec Zod au lieu de just TypeScript | MOYENNE |

**Code a aspirer** :
```typescript
// Pattern Factory (adapter de Mem0 factory.ts)
export class EmbedderFactory {
  static create(provider: string, config: Record<string, unknown>): Embedder {
    switch (provider) {
      case 'ollama': return new OllamaEmbedder(config);
      case 'openai': return new OpenAIEmbedder(config);
      case 'local':  return new LocalRustEmbedder(config); // fastembed-rs via napi-rs
      default: throw new Error(`Unknown embedder: ${provider}`);
    }
  }
}
```

### OS5. OpenCode (github.com/opencode-ai/opencode) — 100K+ stars

CLI coding agent en **Go**. Reference pour l'architecture Go + SQLite.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **sqlc** — SQL → code Go type-safe genere automatiquement | `internal/db/sql/*.sql` → `internal/db/*.sql.go` | Equivalent TS : utiliser [sqlc-gen-typescript](https://github.com/sqlc-dev/sqlc-gen-typescript) pour generer nos requetes SQLite | HAUTE |
| **Provider Event Stream** — types d'events structures (content_start/delta/stop, tool_use_start/delta/stop) | `internal/llm/provider/provider.go` | Orchestrateur (BLOC 2) — meme enum EventType pour le streaming unifie tous backends | HAUTE |
| **Session Management** — create/list/get/delete avec SQLite, parent_session_id, token tracking | `internal/db/sql/sessions.sql` | Memory + Orchestrateur — tracking sessions avec compteurs tokens | MOYENNE |
| **goreleaser** — distribution binaire cross-platform automatisee | `.goreleaser.yml` | Si on compile en Rust/Go, meme pipeline release | BASSE |

### OS6. LiteLLM (github.com/BerriAI/litellm) — 20K+ stars

Proxy LLM universel (100+ providers). Reference pour le routing et le cost tracking.

| Pattern | Fichier source | A aspirer pour REX | Priorite |
|---------|---------------|-------------------|----------|
| **Router Strategies** — auto-router, budget-limiter, complexity-router | `litellm/router_strategy/` | Provider Mesh (BLOC 1) — notre routing par complexite s'inspire du complexity-router | HAUTE |
| **Cost Calculator** — prix par modele, tracking automatique | `litellm/cost_calculator.py` | Budget tracker (BLOC 1.6) — table de prix par provider/modele | HAUTE |
| **AI Gateway Pattern** — any SDK client → proxy → LLM API (OpenAI-compat) | `litellm/proxy/` | Hub API (BLOC 9) — le hub VPS peut servir de gateway LLM aussi | MOYENNE |
| **Streaming Handler** — chunk builder pour assembler les streams de differents providers | `litellm/litellm_core_utils/streaming_handler.py` | Gateway streaming (BLOC 17.3) — normalisation des chunks stream | MOYENNE |

### OS — SYNTHESE : que prendre, que ignorer

| Ce qu'on PREND | Source | Raison |
|---------------|--------|--------|
| Channel/Adapter Registry (self-registration) | OpenClaw, NanoClaw | Pattern propre, extensible, zero hardcode |
| Factory Pattern pour embeddings/LLM/vectorstore | Mem0 | Extensibilite providers future |
| Model Failover (auth rotation + model fallback) | OpenClaw | Exactement notre besoin R1 |
| Event Stream types pour streaming unifie | OpenCode | Structure propre pour multi-backend |
| Router Strategies (complexity, budget) | LiteLLM | Routing intelligent deja concu |
| Group Queue (max concurrent, retry backoff) | NanoClaw | Pattern necessaire pour sync + sandbox |
| sqlc type-safe queries | OpenCode | Securite SQL, generation auto |
| Cost Calculator | LiteLLM | Budget tracking precis |

| Ce qu'on IGNORE | Source | Raison |
|----------------|--------|--------|
| Container isolation (Docker pour chaque session) | OpenClaw, NanoClaw | Overkill pour mono-user, notre Sandbox suffit |
| Graph Memory (Neo4j/Kuzu) | Mem0 | Complexite enorme, pas necessaire v7 |
| AI Gateway Proxy complet | LiteLLM | On n'est pas un proxy multi-tenant |
| ACP Protocol | OpenClaw | Trop complexe, nos agents communiquent via fichiers |
| Extension malware check | Goose | Nos MCP sont trusts (locaux) |

---

## OPTIMISATION LANGAGES — STRATEGIE HYBRIDE (Rust/Go/Bun + TypeScript)

### OL1. Etat actuel mesure

| Metrique | Valeur |
|----------|--------|
| `rex --version` startup | **29ms** (Node.js 22 + dist 560KB) |
| node_modules total | **306MB** |
| dist/ CLI | **560KB** |
| gateway.ts | **2323 lignes** |
| daemon.ts + gateway.ts en RAM | **~16MB + ~28MB** (ps aux) |
| Embeddings | **Ollama API** (nomic-embed-text, ~200ms/chunk) |
| SQLite | **better-sqlite3** (sync, C binding via node-gyp) |
| File watcher | **chokidar** (daemon mode) |

### OL2. Analyse par composant — ou le changement de langage vaut le coup

| Composant | Langage actuel | Candidat | Gain attendu | Verdict |
|-----------|---------------|----------|--------------|---------|
| **CLI entrypoint** | TypeScript/Node | Rust, Bun compile | Startup 29ms → 5ms (Rust) ou 15ms (Bun). Gain negligeable en pratique. | **GARDER TS** — 29ms est deja excellent |
| **Orchestrateur/routing** | TypeScript | — | Logique metier complexe, bien adapte a TS | **GARDER TS** — pas de gain perf |
| **Gateway** | TypeScript | — | I/O bound (Telegram API, LLM streaming), TS parfait | **GARDER TS** |
| **Flutter bridge** | TypeScript | — | Process.run() depuis Dart, TS OK | **GARDER TS** |
| **MCP Hub** | TypeScript | — | Protocole MCP = TypeScript SDK officiel | **GARDER TS** |
| **Embeddings** | Ollama API (HTTP) | **Rust (fastembed-rs)** | Supprime dependance Ollama pour embeddings. 3-5x plus rapide. Native ONNX runtime. | **RUST via napi-rs** |
| **Sync server** | (nouveau) | **Rust (tokio + tungstenite)** | WebSocket haute perf: 10K+ connections, ~2MB RSS vs Node ws ~50-100MB. Process separe, toujours actif sur VPS. | **RUST standalone** |
| **Daemon file watcher** | chokidar (Node) | **Rust (notify-rs)** via napi-rs | chokidar: problemes memoire >1000 fichiers. notify-rs: natif OS events, ~1MB RSS. | **RUST via napi-rs** (Phase 2) |
| **SQLite hot paths** | better-sqlite3 | **turso/libsql** ou Rust napi-rs | better-sqlite3 deja tres rapide (sync C binding). Turso ajoute replication. Gain marginal. | **GARDER better-sqlite3** (eval turso plus tard) |
| **Distribution binaire** | npm install | **Bun compile** | Single binary ~60MB, zero deps. Alternative : `pkg` (Node SEA). | **BUN COMPILE** (Phase 6) |

### OL3. Architecture hybride recommandee

```
┌─────────────────────────────────────────────┐
│              REX CLI (TypeScript)            │
│  orchestrator, gateway, skills, MCP, guards │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │  @rex/embed-rs  │  │  @rex/watch-rs   │  │
│  │  (napi-rs)      │  │  (napi-rs)       │  │
│  │  fastembed-rs   │  │  notify-rs       │  │
│  │  ONNX Runtime   │  │  OS-native FSE   │  │
│  └─────────────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────────┘
                        │ IPC (Unix socket)
┌───────────────────────┴─────────────────────┐
│         rex-sync (Rust standalone)           │
│  tokio + tungstenite WebSocket server        │
│  SQLite WAL queue (rusqlite)                 │
│  Port 3118, toujours actif sur VPS           │
│  ~2MB RSS, 10K+ connections                  │
└──────────────────────────────────────────────┘
```

**Strategie** : TypeScript reste le langage principal (90% du code). Rust intervient chirurgicalement la ou le gain est reel et mesurable.

### OL4. Composants Rust a creer

#### 4a. `@rex/embed-rs` — Embeddings natifs (napi-rs)

```
packages/embed-rs/
├── Cargo.toml          # fastembed = "5.x", napi-rs
├── src/lib.rs          # expose embed(text) -> Float32Array
├── index.d.ts          # types TS generes
├── package.json        # @rex/embed-rs, postinstall = napi build
└── README.md
```

**Avantages** :
- Supprime la dependance Ollama pour les embeddings (nomic-embed-text ONNX tourne natif)
- 3-5x plus rapide qu'Ollama API (pas de HTTP overhead, pas de scheduling Ollama)
- Fonctionne offline sans aucun service externe
- ~100MB de modele ONNX en cache local vs Ollama qui garde le modele en VRAM

**Implementation** :
```rust
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn embed(text: String) -> Result<Vec<f64>> {
    let model = TextEmbedding::try_new(InitOptions {
        model_name: EmbeddingModel::NomicEmbedTextV15,
        show_download_progress: false,
        ..Default::default()
    })?;
    let embeddings = model.embed(vec![text], None)?;
    Ok(embeddings[0].iter().map(|&x| x as f64).collect())
}
```

**Fallback** : si le build napi echoue (Windows, CI), fallback transparent vers Ollama API (existant).

#### 4b. `rex-sync` — Sync server Rust standalone

```
crates/rex-sync/
├── Cargo.toml          # tokio, tungstenite, rusqlite
├── src/
│   ├── main.rs         # Entry point, port 3118
│   ├── ws.rs           # WebSocket handler
│   ├── queue.rs        # SQLite outbox pattern
│   ├── auth.rs         # Tailscale TSNET ou pre-shared key
│   └── sync.rs         # Sync protocol (LWW)
└── README.md
```

**Pourquoi standalone** : le sync server tourne 24/7 sur le VPS. Un process Rust a ~2MB RSS vs ~30MB pour un process Node. Sur un VPS 2 vCPU / 4GB, ca compte.

**Communication avec REX CLI** : Unix socket local (sur le meme VPS) ou WebSocket (entre machines).

#### 4c. `@rex/watch-rs` — File watcher natif (napi-rs, Phase 2)

Remplace chokidar dans le daemon pour le file watching. Priorite BASSE — a evaluer si chokidar pose des problemes reels de memoire.

### OL5. Distribution : Bun compile

**Phase 6** : au lieu de `npm install -g rex-claude`, proposer aussi :

```bash
# Option 1 : npm classique (dev)
npm install -g rex-claude

# Option 2 : binary standalone (production, VPS, CI)
curl -fsSL https://rex.dstudio.company/install.sh | bash
# -> telecharge rex-linux-x64 ou rex-darwin-arm64 (~60MB)
```

**Build** :
```bash
bun build packages/cli/src/index.ts --compile --target=bun-linux-x64 --outfile=rex-linux-x64
bun build packages/cli/src/index.ts --compile --target=bun-darwin-arm64 --outfile=rex-darwin-arm64
```

**Avantage** : zero dependance Node.js sur le VPS. Single binary.
**Prerequis** : verifier compatibilite better-sqlite3 + sqlite-vec avec Bun (natif C addons).

### OL6. Timeline hybride

| Phase | Composant | Semaine | Dependance |
|-------|-----------|---------|------------|
| Phase 1 | `@rex/embed-rs` (napi-rs + fastembed) | Semaine 3 | Aucune (remplace Ollama embed) |
| Phase 3 | `rex-sync` (Rust standalone) | Semaine 3-4 | Design sync (section SYNC) |
| Phase 6 | `@rex/watch-rs` (napi-rs + notify) | Semaine 6 | Daemon stable |
| Phase 6 | Bun compile distribution | Semaine 7 | CLI stable, tests passes |

---

## AGENT TEAM — PLAN D'EXECUTION PARALLELE

Ce plan est concu pour l'execution via **Claude Code Agent Team** (`rex agents team`).
Chaque agent travaille dans un **git worktree isole**, merge apres review.
**Max 3-4 agents simultanes** (contrainte RAM + quota Claude Max).

### AT1. Principes d'execution

```
┌──────────────────────────────────────────────────────┐
│                    KEVIN (Lead)                       │
│  Valide les PRs, merge, arbitre les conflits          │
│  Lance les batches, monitore via rex agents status     │
└───────────┬──────────────┬───────────────┬────────────┘
            │              │               │
   ┌────────▼────────┐  ┌─▼──────────┐  ┌─▼──────────────┐
   │  Agent Batch A   │  │ Agent B    │  │ Agent Batch C   │
   │  (worktree-1)    │  │ (worktree) │  │ (worktree-3)    │
   │  feat/bloc-X     │  │ feat/Y     │  │ feat/Z          │
   └─────────────────┘  └────────────┘  └─────────────────┘
```

**Regles** :
1. Chaque agent travaille sur un **seul bloc** dans un worktree isole
2. Les agents ne modifient JAMAIS les memes fichiers (decoupage par responsabilite)
3. Chaque agent ecrit des **tests** pour son bloc avant de marquer "done"
4. Le Lead lance `pnpm build && pnpm test` apres chaque merge
5. Un agent **bloque** si son dependance n'est pas encore merged → attend dans la queue

### AT2. Batches d'execution detailles

#### Batch 0 — Setup (Kevin manual, jour 1)

```bash
# Creer les branches et worktrees
git worktree add ../rex-router  feat/bloc-1-router
git worktree add ../rex-cache   feat/bloc-1-cache
git worktree add ../rex-memory  feat/bloc-3-memory
git worktree add ../rex-daemon  feat/bloc-7-daemon
```

- [ ] Creer `packages/embed-rs/` scaffold (Cargo.toml + napi-rs setup)
- [ ] Creer `crates/rex-sync/` scaffold (Cargo.toml + tokio + rusqlite)
- [ ] Definir les interfaces TypeScript pour chaque bloc (`.d.ts` stubs)
- [ ] Valider que tous les worktrees buildent (`pnpm build` dans chacun)

#### Batch 1 — Le Cerveau (4 agents paralleles, semaine 1-2)

| Agent | Worktree | Blocs | Fichiers crees/modifies | Definition of Done |
|-------|----------|-------|------------------------|-------------------|
| **Agent-Router** | `feat/bloc-1-router` | 1.1, 1.2, 1.6 | `providers.ts`, `budget.ts`, `router.ts` (refactor) | Interface ProviderAdapter, 8 free providers enregistres, budget table SQLite, `rex budget` CLI, tests unitaires provider routing |
| **Agent-Cache** | `feat/bloc-1-cache` | 1.5 | `cache.ts`, migration SQL | Semantic cache table, TTL 7j, invalidation hook, `rex cache stats` CLI, test cache hit/miss |
| **Agent-Memory** | `feat/bloc-3-memory` | 3.1, 19 | `observer.ts`, `reflector.ts`, `ingest.ts` (refactor) | Observer SessionEnd hook, Reflector daemon cycle, Factory Pattern embeddings (Ollama + futur Rust), pre-shot snapshots, tests |
| **Agent-Daemon** | `feat/bloc-7-daemon` | 7 | `daemon.ts` (refactor) | Event-driven avec event queue, scheduled tasks, health monitoring, tests lifecycle |

**Parallelisme** : 4/4 — aucune dependance croisee.
**Merge order** : Agent-Router first (autres en dependent indirectement), puis Cache, Memory, Daemon.
**Skills a invoquer** : `writing-plans` → `db-design` (cache + memory schemas) → `api-design` (provider interface) → `test-strategy` → `build-validate`

#### Batch 2 — La Defense (3 agents paralleles, semaine 2-3)

| Agent | Worktree | Blocs | Fichiers | DoD |
|-------|----------|-------|----------|-----|
| **Agent-Review** | `feat/bloc-5-review` | 5.1, 5.2 | `review.ts` | Pipeline : Biome lint → Semgrep scan → PR-Agent → rapport. `rex review` CLI. Tests. |
| **Agent-Security** | `feat/bloc-5-security` | 5.1 | `security.ts` | Gitleaks + TruffleHog + OSV-Scanner integres. `rex security scan`. Tests. |
| **Agent-Guards** | `feat/bloc-6-guards` | 6 | `guards/` | 7 nouveaux guards (secret-leak, any-type, force-push, large-file, env-commit, console-log, TODO-limit). Tests. |

**Parallelisme** : 3/3 — zero dependance croisee.
**Commence apres** : Batch 1 merged (les guards peuvent reference le nouveau router).
**Skills** : `writing-plans` → `semgrep-rule-creator` (regles custom) → `error-handling` (guard flows) → `test-strategy` → `build-validate`

#### Batch 3 — Le Reseau + Sync (4 agents paralleles, semaine 3-4)

| Agent | Worktree | Blocs | Fichiers | DoD |
|-------|----------|-------|----------|-----|
| **Agent-Network** | `feat/bloc-9-network` | 9 | `hub.ts`, `node.ts`, `network.ts` | Hub API REST, node registration, heartbeat, Tailscale auth. Tests API. |
| **Agent-Sync** | `feat/sync-server` | SYNC | `sync.ts`, `sync-server.ts`, `sync-queue.ts` | WebSocket server port 3118, SQLite outbox queue, catch-up protocol, LWW conflict resolution. Tests sync scenarios. |
| **Agent-Embed-RS** | `feat/embed-rs` | OL4a | `packages/embed-rs/` | napi-rs + fastembed-rs, `embed()` function, fallback Ollama, benchmarks. |
| **Agent-Docker** | `feat/bloc-9-docker` | 9 | `docker/`, `init.ts` | Dockerfile multi-stage, docker-compose.yml, `rex init --docker`. Tests build. |

**Parallelisme** : 4/4 — Agent-Sync depend de Agent-Network pour le Hub API REST, mais peut commencer par le WebSocket server standalone.
**Skills** : `writing-plans` → `api-design` (Hub REST) → `auth-patterns` (Tailscale) → `db-design` (sync queue) → `error-handling` (reconnection) → `test-strategy` → `build-validate`

#### Batch 4 — L'Orchestrateur + MCP + Gateway (3-4 agents, semaine 4-5)

| Agent | Worktree | Blocs | Fichiers | DoD |
|-------|----------|-------|----------|-----|
| **Agent-Orchestrator** | `feat/bloc-2-orchestrator` | 2.1-2.4 | `orchestrator.ts`, `backend-runner.ts` | BackendRunner interface, Agent SDK + OpenAI SDK + pipe + Ollama backends. `rex delegate`. Token optimization. Tests multi-backend. |
| **Agent-Gateway** | `feat/bloc-17-gateway` | 17 | `gateway.ts` (rewrite), `gateway-backend.ts`, `adapters/` | Gateway refonte complete Agent SDK. Adapter registry (Telegram, Discord, Slack, Web). Streaming unifie. Tests. |
| **Agent-MCP** | `feat/bloc-15-mcp` | 15 | `mcp_hub.ts`, `mcp_registry.ts` | mcporter integration, FastMCP custom tools, recommandations par stack, mcp-scan security. Tests. |
| **Agent-CLI** | `feat/bloc-14-cli` | 14, 8, 11 | `menu.ts`, `workflow.ts`, `project_init.ts` | Menu interactif `rex`, --json output, workflows, project bootstrap. Tests UX. |

**Prerequis** : Batch 1 merged (Provider Mesh pour l'orchestrateur), Batch 3 merged (Network pour gateway).
**Parallelisme** : 4/4 — chacun sur des fichiers differents.
**Skills** : `writing-plans` → `ux-flow` (CLI menu) → `api-design` → `error-handling` → `auth-patterns` (OAuth/API key) → `test-strategy` → `build-validate`

#### Batch 5 — L'Interface Flutter (2-3 agents, semaine 5-6)

| Agent | Worktree | Blocs | Fichiers | DoD |
|-------|----------|-------|----------|-----|
| **Agent-Flutter-Core** | `feat/flutter-core` | 13 | `network_page.dart`, `providers_page.dart`, `review_page.dart` | Pages Network (sync status), Providers (budget), Review (pipeline). UI de pilotage cross-platform, aucune dependance VPS a Flutter. Widget tests. |
| **Agent-Flutter-Extra** | `feat/flutter-extra` | 13 | `sandbox_page.dart`, MCP page refactor | Page Sandbox, MCP management ameliore, mobile futur via meme API. Widget tests. |
| **Agent-Coaching** | `feat/bloc-16-coaching` | 16 | `coaching.ts` | Honesty guard, tech debt tracker, self-improve extension. Tests. |

**Prerequis** : Batch 4 merged (UI a besoin des APIs backend).
**Skills** : `writing-plans` → `ui-craft` (design Flutter) → `ux-flow` → `figma-workflow` (si maquettes) → `test-strategy` → `build-validate`

#### Batch 6 — Deploy + Polish (Kevin + 2 agents, semaine 6-7)

| Agent/Personne | Tache | DoD |
|----------------|-------|-----|
| **Kevin (manual)** | Deploy rex-sync sur VPS, connecter Mac + PC comme nodes | VPS hub operationnel, nodes sync en temps reel |
| **Agent-Bun** | Bun compile (`bun build --compile`) cross-platform | Binaires rex-linux-x64, rex-darwin-arm64, tests installation |
| **Agent-Docs** | README v7, installation guide, migration guide | Docs completes, `rex install` fonctionne end-to-end |
| **Agent-Test** | Tests E2E du reseau complet | Tests Mac→VPS sync, offline queue, gateway multi-backend |

### AT3. Matrice de fichiers — anti-conflit

Chaque agent a un scope de fichiers **exclusif**. Si deux agents touchent le meme fichier, c'est un bug de planification.

| Fichier/Dossier | Agent exclusif | Autres agents : READ ONLY |
|-----------------|---------------|--------------------------|
| `providers.ts`, `budget.ts` | Agent-Router | Agent-Orchestrator (import) |
| `cache.ts` | Agent-Cache | Agent-Router (import) |
| `observer.ts`, `reflector.ts` | Agent-Memory | Agent-Daemon (appel) |
| `daemon.ts` | Agent-Daemon | — |
| `review.ts` | Agent-Review | Agent-Workflow (import) |
| `security.ts` | Agent-Security | Agent-Review (import) |
| `guards/` | Agent-Guards | — |
| `hub.ts`, `node.ts`, `network.ts` | Agent-Network | Agent-Sync (import) |
| `sync*.ts` | Agent-Sync | — |
| `packages/embed-rs/` | Agent-Embed-RS | Agent-Memory (import) |
| `docker/` | Agent-Docker | — |
| `orchestrator.ts`, `backend-runner.ts` | Agent-Orchestrator | Agent-Gateway (import) |
| `gateway.ts`, `gateway-backend.ts`, `adapters/` | Agent-Gateway | — |
| `mcp_hub.ts`, `mcp_registry.ts` | Agent-MCP | — |
| `menu.ts`, `workflow.ts`, `project_init.ts` | Agent-CLI | — |
| `flutter_app/lib/pages/network_*`, `providers_*`, `review_*` | Agent-Flutter-Core | — |
| `flutter_app/lib/pages/sandbox_*` | Agent-Flutter-Extra | — |
| `coaching.ts` | Agent-Coaching | — |
| `index.ts` (CLI entry) | **SHARED** — Lead merge les ajouts de commandes | Tous les agents CLI |

**Exception** : `index.ts` est le seul fichier partage. Chaque agent qui ajoute une commande CLI cree un fichier `.commands.ts` dans son scope, et le Lead integre les imports dans `index.ts` au moment du merge.

### AT4. Commandes Agent Team

```bash
# Lancer le batch 1 (4 agents paralleles)
rex agents team create "batch-1-cerveau" --agents=router,cache,memory,daemon

# Lancer un agent specifique
rex agents run router --worktree=feat/bloc-1-router --plan=docs/plans/2026-03-07-rex-v7-master-plan.md

# Monitoring
rex agents team status batch-1-cerveau
rex agents status router     # detail d'un agent
rex agents logs router       # tail logs

# Quand un agent finit
rex agents team merge router  # → PR auto + merge si tests passent

# Dashboard Flutter
# Page Agents > onglet Teams > batch-1-cerveau > status en temps reel
```

### AT5. Estimation globale

| Metrique | Valeur |
|----------|--------|
| **Batches** | 7 (0 setup + 6 execution) |
| **Agents uniques** | 18 |
| **Max agents simultanes** | 4 |
| **Duree estimee** | 6-7 semaines (1 batch/semaine, overlap possible) |
| **Fichiers crees** | ~25 nouveaux fichiers TS + 2 packages Rust |
| **Fichiers modifies** | ~15 fichiers existants |
| **Tests attendus** | ~200 tests unitaires + ~30 tests integration |
| **Prerequis** | Claude Max (Opus), VPS Hostinger, Ollama local, Rust toolchain |

### AT6. Checklist pre-lancement

Avant de lancer le premier batch :

- [ ] `pnpm build` passe sur main (zero erreur)
- [ ] `flutter build macos --debug` passe (zero erreur)
- [ ] Rust toolchain installe (`rustup`, `cargo`, `napi-rs`)
- [ ] VPS accessible via Tailscale (`ssh vps`)
- [ ] Ollama running avec `nomic-embed-text` et `qwen3.5:9b`
- [ ] Ce plan sauvegarde dans le vault Obsidian (backup)
- [ ] Chaque interface TypeScript (.d.ts) definie dans un fichier `interfaces/` partage
- [ ] Branch `main` propre, pas de travail en cours

---

## SOURCES COMPLETES

### Free LLM Providers
- [Cerebras](https://www.cerebras.ai/pricing) — 1M tok/jour
- [Groq](https://console.groq.com/docs/rate-limits) — 2600 tok/s
- [Mistral](https://help.mistral.ai/en/articles/455206) — tous modeles gratuits
- [OpenRouter](https://costgoat.com/pricing/openrouter-free-models) — 27 modeles
- [Google AI Studio](https://ai.google.dev/gemini-api/docs/pricing)
- [SambaNova](https://cloud.sambanova.ai/plans)
- [DeepSeek](https://costgoat.com/pricing/deepseek-api)
- [Every Free AI API 2026](https://awesomeagents.ai/tools/free-ai-inference-providers-2026/)

### Open Source Tools
- [PR-Agent](https://github.com/qodo-ai/pr-agent) — AI code review
- [Semgrep CE](https://semgrep.dev/products/community-edition/)
- [Gitleaks](https://github.com/gitleaks/gitleaks)
- [TruffleHog](https://github.com/trufflesecurity/trufflehog)
- [OSV-Scanner](https://github.com/google/osv-scanner)
- [Knip](https://knip.dev/)
- [Biome](https://biomejs.dev/)
- [Act](https://github.com/nektos/act)
- [OpenCode](https://github.com/opencode-ai/opencode) — 95K stars
- [Tabby](https://www.tabbyml.com/)
- [chokidar v5](https://github.com/paulmillr/chokidar)

### Sandbox
- [Yolobox](https://github.com/finbarr/yolobox) — Docker sandbox
- [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)
- [Daytona](https://github.com/daytonaio/daytona) — 21K stars, SDK TS
- [microsandbox](https://github.com/zerocore-ai/microsandbox) — microVMs
- [E2B](https://github.com/e2b-dev/E2B) — Firecracker

### Agent SDKs
- [Claude Agent SDK (TypeScript)](https://github.com/anthropics/claude-agent-sdk-typescript) — @anthropic-ai/claude-agent-sdk
- [Claude Agent SDK (Python)](https://github.com/anthropics/claude-agent-sdk-python)
- [Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview) — streaming, multi-turn, tools
- [Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos) — multi-agent examples
- [OpenAI Node SDK](https://github.com/openai/openai-node) — openai npm package
- [NanoClaw](https://github.com/qwibitai/nanoclaw) — reference Agent SDK + multi-platform gateway
- [Anthropic OAuth Clarification](https://thenewstack.io/anthropic-agent-sdk-confusion/) — personal use OK

### Architecture
- [Mastra Observational Memory](https://mastra.ai/docs/memory/observational-memory)
- [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
- [Self-Improving Agents](https://addyosmani.com/blog/self-improving-agents/)

### Hardware & Orchestrators
- [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) — $4,699
- [Codex CLI](https://developers.openai.com/codex/cli/) — GPT-5.4
- [GPT-5.4](https://openai.com/index/introducing-gpt-5-4/) — 1M context
- [Claude Opus 4.6](https://docs.anthropic.com/en/docs/about-claude/models)

### MCP Ecosystem
- [MCP Registry officiel](https://registry.modelcontextprotocol.io/) — 8,590+ servers
- [Google Workspace CLI](https://github.com/googleworkspace/cli) — Gmail, Drive, Calendar, Sheets, Docs
- [mcporter](https://github.com/steipete/mcporter) — MCP proxy/manager, daemon mode
- [FastMCP TypeScript](https://github.com/punkpeye/fastmcp) — MCP server framework, 3k stars
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — officiel, 11.4k stars
- [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — 79.6k stars
- [GitHub MCP Server](https://github.com/github/github-mcp-server) — officiel
- [Playwright MCP](https://github.com/microsoft/playwright-mcp) — officiel Microsoft
- [Cloudflare MCP](https://github.com/cloudflare/mcp) — 2500+ endpoints
- [AWS MCP](https://github.com/awslabs/mcp) — 13 servers, 8.4k stars
- [Slack MCP](https://github.com/korotovsky/slack-mcp-server) — le plus complet

### Security
- [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- [mcp-scan](https://github.com/invariantlabs-ai/mcp-scan) — tool pinning, rug-pull detection
- [Tailscale Aperture](https://tailscale.com/use-cases/securing-ai) — AI gateway
- [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime)
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices)

### Sync & Real-time
- [ws (WebSocket)](https://github.com/websockets/ws) — WebSocket lib Node.js, 22k stars
- [Socket.IO](https://socket.io/) — WebSocket + fallback polling (overkill pour REX, ws suffit)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite sync rapide pour la queue
- [chokidar](https://github.com/paulmillr/chokidar) — file watcher pour sync-incoming temp folder

### Knowledge Sources
- [Obsidian](https://obsidian.md/) — Markdown vault local, plugin livesync
- [Logseq](https://logseq.com/) — Markdown/org-mode local, open source
- [Joplin](https://joplinapp.org/) — Notes open source, SQLite local
- [Outline](https://www.getoutline.com/) — Wiki self-hostable, API REST
- [BookStack](https://www.bookstackapp.com/) — Wiki self-hostable, API REST
- [Silverbullet](https://silverbullet.md/) — Markdown wiki dans le browser

### Concurrence (aucun concurrent direct)
- [OpenCode](https://opencode.ai/) — 100k stars, CLI coding agent (pas de memoire/routing/distribue)
- [Goose](https://github.com/block/goose) — 32k stars, agent extensible (pas de routing/distribue)
- [Cline](https://github.com/cline/cline) — 59k stars, VS Code only
- [Mem0](https://github.com/mem0ai/mem0) — 41k stars, memory layer only
- [LiteLLM](https://github.com/BerriAI/litellm) — 20k stars, proxy LLM only
- [NadirClaw](https://github.com/doramirdor/NadirClaw) — 224 stars, routeur LLM simple

### Skills Ecosystem
- [obra/superpowers](https://github.com/obra/superpowers) — 42K+ stars, TDD + planning plugin
- [vercel-labs/skills](https://github.com/vercel-labs/skills) — find-skills (418K installs)
- [Anthropic skills](https://github.com/anthropics/skills/) — frontend-design (124K installs)
- [SkillsMP](https://skillsmp.com) — 400K+ skills indexes
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — 500+ cross-platform
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) — curated list
- [VibeSec](https://github.com/AkashicRecords/VibeSec) — OWASP security skill

### Milo PRs
- PR #4 : Split CLAUDE.md + rules + install.sh (12 fichiers)
- PR #5 : accounts.ts + project_init.ts + skills + preload rewrite (20 fichiers)
- Archive complete : `docs/plans/milo-prs-archive.md`
