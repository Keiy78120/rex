<div align="center">

# REX

**REX est REX.**

Il pense. Il orchestre. Il agit.
Quand il a besoin d'un LLM, il l'appelle comme un outil — comme un humain ouvre une calculatrice.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/VPS%20%7C%20Mac%20%7C%20Linux-compatible-black)
[![CI](https://github.com/Keiy78120/rex/actions/workflows/ci.yml/badge.svg)](https://github.com/Keiy78120/rex/actions)

</div>

---

## Ce qu'est REX

REX n'est pas un wrapper. REX n'est pas un orchestrateur de prompts.

REX est un **système d'exploitation pour l'intelligence** — il tourne 24/7 sur tes machines, connaît tes projets, gère ta mémoire, surveille tes ressources, et décide quand et comment utiliser chaque outil à sa disposition.

Les LLMs sont ses outils. Pas son cerveau.

```
Tu parles à REX.
REX réfléchit.
REX exécute — script, CLI, modèle local, API — ce dont il a besoin.
REX répond.
```

| Sans REX | Avec REX |
|----------|----------|
| Tu parles au LLM directement | Le LLM ne te voit jamais — REX gère tout |
| Chaque session repart de zéro | REX injecte ta mémoire, tes projets, ton contexte |
| Toutes les tâches frappent l'API payante | Script d'abord → local → gratuit → payant |
| Pas de guardrails | Watchdog, sandbox, audit trail |
| Remote control inexistant | Telegram, CLI, Flutter — même cerveau |
| Une machine = un contexte | Fleet de machines, routing automatique |

---

## Principes

**1. Script-first (70/30)**
70% des tâches résolues par scripts, regex, CLIs. 30% max pour les LLMs. Si un script peut faire le travail : script. 0 token.

**2. REX calls what it needs**
Mini-models locaux pour la classification. Groq gratuit pour les tâches légères. Sonnet pour le raisonnement. Opus seulement en dernier recours — et jamais par défaut.

**3. Tokens = énergie**
Scripts = 0€. Ollama local = muscle. Groq = pensée légère. Haiku = effort. Sonnet = concentration. Opus = consultation du mentor. On ne gaspille pas.

**4. La mémoire est sacrée**
Tes sessions, tes décisions, tes patterns — tout est indexé, embeddings locaux, SQLite. REX se souvient.

**5. REX est toujours là**
Daemon 24/7. Sleeping mode quand tu dors (Ollama only, 0€). Waking mode le matin (digest automatique). Actif quand tu travailles.

---

## Architecture

```
                    Tu
          (Telegram · CLI · Flutter)
                    │
                    ▼
        ┌──────────────────────┐
        │         REX          │
        │                      │
        │  ① Mémoire           │  ← context de ta vie, projets, patterns
        │  ② Intent detect     │  ← regex 0ms → mini-model si ambigu
        │  ③ Script-first      │  ← 70% des tâches résolues ici
        │  ④ Relay si besoin   │  ← chain de modèles avec document partagé
        │  ⑤ Mentor si bloqué  │  ← Opus extended thinking, dernier recours
        │                      │
        │  Watchdog · Budget   │
        │  Sandbox · Journal   │
        └──────────┬───────────┘
                   │
     ┌─────────────┼──────────────┐
     ▼             ▼              ▼
  Scripts       Fleet          Tools
  (0 LLM)   Mac·VPS·PC·RPi    MCPs·CLIs·Skills
     │             │              │
     └─────────────┼──────────────┘
                   │ (si LLM nécessaire)
                   ▼
       ┌────────────────────────────┐
       │   Relay Chain (6 tiers)    │
       │  0 — Script/regex (0€)     │
       │  1 — Ollama local (0€)     │
       │  2 — Groq free tier (0€)   │
       │  3 — Haiku (micro)         │
       │  4 — Sonnet (profond)      │
       │  5 — Opus (mentor, rare)   │
       └────────────────────────────┘
```

---

## Routing — 6 Tiers, 0 LLM pour décider

REX route sans jamais appeler un LLM pour décider quoi appeler.

| Tier | Provider | Coût | Trigger |
|------|----------|------|---------|
| 0 — SCRIPT | regex / CLI / git | 0€ | health, status, fichiers |
| 1 — LOCAL | Ollama (qwen2.5:1.5b) | 0€ | tâches standard |
| 2 — FREE | Groq (llama-3.3-70b) | 0€ | Ollama offline |
| 3 — SONNET | Claude Sonnet | sub | raisonnement complexe |
| 4 — OPUS | Claude Opus | sub (max 3/jour) | architecture, design |
| 5 — CODEX | Codex OAuth | sub | background, context > 80% |

```bash
rex route "<message>"           # voir quel tier s'active
rex route "<message>" --explain # + raisonnement complet
```

---

## La Relay Chain

Ce n'est pas un simple fallback. Chaque modèle reçoit un document partagé, lit les contributions des précédents, ajoute son analyse, et décide s'il passe au suivant.

```
Task → Ollama analyse  (confidence: 0.6, passe)
     → Groq enrichit  (confidence: 0.75, passe)
     → Haiku conclut  (confidence: 0.90, DONE)

Claude Sonnet n'a pas été appelé.
Opus n'a jamais été touché.
Coût total : ~0€
```

---

## Modules

| Module | Fichier | Rôle |
|--------|---------|------|
| **REX Identity** | `rex-identity.ts` | Pipeline 5 étapes — context → script → brief → relay → format |
| **Relay Engine** | `relay-engine.ts` | Chain multi-modèles RxJS, document partagé |
| **Orchestrator** | `orchestrator.ts` | Fleet race (tier stagger 0/300/800ms) |
| **Orchestration Policy** | `orchestration-policy.ts` | Routing 6 tiers, 0 LLM |
| **Gateway** | `gateway.ts` | Bot Telegram — streaming, boutons, slash commands |
| **Daemon** | `daemon.ts` | 24/7 — ingest, summary, alerts, daily digest |
| **Watchdog** | `watchdog.ts` | Health check 60s, alerte Telegram si down |
| **Memory** | `packages/memory/` | SQLite + sqlite-vec, BM25 hybrid search, 768d |
| **User Cycles** | `user-cycles.ts` | XState AWAKE/SLEEPING/WAKING_UP |
| **CURIOUS** | `curious.ts` | Veille proactive — modèles, repos, outils |
| **Agent Runtime** | `agent-runtime.ts` | Ollama tool-calling loop, streamAgent() |
| **Agent Templates** | `agent-templates/` | DG, DRH, CEO, COO, Freelance via @openai/agents |
| **Guards** | `guards/` | 11 guards — force-push, env-commit, large-file… |
| **Sandbox** | `sandbox.ts` | Docker isolé pour actions risquées |
| **Node Mesh** | `node-mesh.ts` | Fleet multi-machines, routing Dijkstra |
| **Hub** | `hub.ts` + `resource-hub.ts` | REST API + catalog MCPs/skills/boilerplates |
| **Clients** | `client-factory.ts` | Agents B2B par client |
| **Budget** | `budget.ts` | Coûts relais, alertes daily |
| **Training** | `training.ts` | Fine-tune mlx-lm (Apple Silicon) ou OpenAI |
| **LangGraph** | `lang-graph.ts` | Graphes d'agents @langchain/langgraph |
| **Pane Relay** | `pane-relay.ts` | Sessions OpenClaw multi-LLM parallèles |
| **Anti-Vibe** | `anti-vibecoding.ts` | Vérification cohérence avant commit |
| **Flutter App** | `packages/flutter_app/` | macOS native — 26 pages, 6 sections |

---

## Fleet

REX voit toutes tes machines. Il route les tâches automatiquement.

```
VPS (BRAIN)  → always-on, mémoire, daemon, Telegram gateway
Mac          → Ollama (Qwen), Claude Code / Codex, ActivityWatch
PC RTX       → GPU inférence, tâches lourdes (wake on LAN)
iPhone       → capteur (caméra, GPS, notifications)
```

Thermal check avant routing. Machine chargée → REX reroute. Offline → fallback propre.

---

## Cycles utilisateur

```
AWAKE_ACTIVE   → fleet complète, tous les modèles disponibles
AWAKE_IDLE     → cache prioritaire, moins d'appels API
SLEEPING       → Ollama uniquement (0€), tâches background
WAKING_UP      → morning digest, résumé de la nuit, agenda du jour
```

---

## Flutter App

App macOS native avec top bar en pills et sidebar contextuelle collapsible.

```
Cockpit      → dashboard — daemon, fleet, budget, dev activity
REX Memory   → Search · Tokens · Observer · Curious · Optimize
Agents       → Agents · MCP · Providers · Hub · Clients
Dev          → Workflow · Projects · Review · Guards · Sandbox · Files · Training · Terminal
Comms        → Gateway · Voice · Audio
Settings     → Settings · Logs
```

```bash
cd packages/flutter_app
flutter build macos --debug
open build/macos/Build/Products/Debug/rex_app.app
```

---

## Sécurité

Toute action évaluée avant exécution.

```
SAFE      → read, search, créer un fichier → exécution immédiate
MEDIUM    → modifier, envoyer un message → log + confirmation légère
HIGH      → achat, publication, API write → snapshot + confirmation
CRITICAL  → supprimer, déployer prod → double confirmation + audit trail
```

11 guards actifs. Sandbox Docker pour toute opération risquée.

---

## Install

```bash
# npm global (Mac ou Linux)
npm install -g rex-claude
rex install

# Clone direct
git clone https://github.com/Keiy78120/rex
cd rex && ./install.sh

# VPS (Brain 24/7)
# Voir docs/vps-install.md
```

`rex install` configure en une commande :
- Symlinks `dotfiles/` → `~/.claude/` et `~/.codex/`
- MCP `rex-memory` dans Claude Code et Codex
- Skills, rules, guards (11 hooks)
- LaunchAgents macOS (ingest, gateway, daemon)

---

## Commandes clés

```bash
# Santé
rex doctor              # health check complet
rex status              # résumé one-liner
rex doctor --fix        # auto-fix

# Mémoire
rex ingest              # indexer les sessions Claude Code
rex categorize          # auto-tag les sessions
rex search "<query>"    # recherche hybride BM25 + vectorielle
rex prune               # nettoyer les entrées anciennes

# LLM & Routing
rex route "<message>"   # afficher le tier sélectionné
rex route --explain     # + raisonnement
rex relay "<task>"      # relay chain explicite
rex ask "<question>"    # REX Identity Pipeline complet
rex providers           # état des providers

# Agents
rex agents list         # agents actifs
rex agents run <id>     # lancer un agent template

# Démons & Infra
rex gateway             # bot Telegram
rex daemon              # daemon background 24/7
rex watchdog            # health check one-shot
rex watchdog start      # boucle continue 60s

# Optimisation
rex optimize            # suggestions d'amélioration
rex budget              # coûts du jour
rex hub list            # catalogue MCPs / skills
rex hub search <query>  # chercher dans le catalog
rex hub install <id>    # installer une ressource

# Dev
rex workflow feature    # nouvelle branche + template
rex review              # code review diff courant
rex anti-vibe "<task>"  # vérifier cohérence avant commit
rex user-cycles         # état du cycle utilisateur

# Clients B2B
rex client:create --template dg --name <id>
rex client:list
```

---

## Tests

```bash
pnpm test               # 713 tests vitest (< 2s)
pnpm test --coverage
pnpm build              # TypeScript strict, 0 erreur
```

---

## Roadmap

### Phases 1–4 ✅ Complètes (15/03/2026)

- ✅ Memory SQLite + BM25 hybrid search + 768d embeddings
- ✅ Relay chain 6 tiers (Ollama → Groq → Haiku → Sonnet → Opus → Codex)
- ✅ Gateway Telegram streaming + boutons interactifs
- ✅ Daemon 24/7 + watchdog 60s + sandbox Docker
- ✅ Budget tracking + alertes Telegram
- ✅ 11 guards (force-push, env-commit, large-file, todo-limit…)
- ✅ Fleet node-mesh + routing Dijkstra
- ✅ Agent templates × 5 (DG, DRH, CEO, COO, Freelance)
- ✅ REX Identity Layer + pipeline 5 étapes
- ✅ User Cycles XState (AWAKE/SLEEPING/WAKING_UP)
- ✅ Orchestration Policy 6 tiers, 0 LLM pour router
- ✅ Hub API + Resource Hub (20+ resources + catalog)
- ✅ Client factory (agents B2B par client)
- ✅ Training pipeline (mlx-lm + OpenAI fine-tune)
- ✅ LangGraph (3 templates)
- ✅ OpenClaw integration (pane-relay, anti-vibe, hooks)
- ✅ Flutter app macOS — 26 pages, pill top bar, sidebar contextuelle
- ✅ `rex install` englobe Claude Code + Codex
- ✅ 713 tests vitest — CI GitHub Actions

### Phase 5 — VPS Brain 24/7 (next)

- [ ] VPS deploy automatisé (vps-deploy.ts)
- [ ] DB migrations au boot automatique
- [ ] BRAIN / FLEET sync multi-node stable
- [ ] Morning digest automatique configurable

### Phase 6 — Produit client

- [ ] Container Docker par client
- [ ] Setup wizard onboarding
- [ ] REX IS ALIVE campaign

---

## Structure

```
packages/
├── cli/src/          CLI rex (TypeScript, tsup) — 117+ fichiers
├── core/             Checks partagés
├── memory/src/       Embed + hybrid search (SQLite + sqlite-vec)
└── flutter_app/lib/  App macOS native — 26 pages
dotfiles/             Config ~/.claude/* et ~/.codex/* (symlinks via install.sh)
docs/                 Documentation technique
  ├── REX-BRAIN.md    Logique complète (source of truth)
  ├── VISION.md       Manifeste
  ├── vps-install.md  Deploy VPS Brain
  └── plans/          Plans d'implémentation session par session
.github/              CI, templates issues/PR, SECURITY, CONTRIBUTING
```

---

## Contributing

Voir [CONTRIBUTING.md](.github/CONTRIBUTING.md) pour le setup complet.

```bash
git clone https://github.com/Keiy78120/rex && cd rex
pnpm install && pnpm build
cd packages/flutter_app && flutter pub get
```

Branche : `feat/<description>` — jamais sur `main` directement.

---

## License

MIT — D-Studio
