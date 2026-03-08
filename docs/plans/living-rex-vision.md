# REX — The Living System Vision

*Rédigé le 2026-03-09 — vision de Kevin, formalisée ici comme référence permanente.*

---

## Ce que REX doit être

REX n'est pas un outil. C'est un **système vivant**.

Un système vivant se distingue d'un outil par une propriété fondamentale :
**il détecte ses propres conditions, adapte son comportement, se répare seul.**

Un outil attend qu'on le configure. REX décide.

---

## Le principe fondateur : Scripts Dynamiques Auto-Adaptatifs

### Ce qu'on ÉVITE

- Settings hardcodés (`SMART_INGEST=true` sans fallback de vitesse)
- LaunchAgents avec des commandes fixes qui ignorent le contexte
- Des processus qui échouent silencieusement et ne se corrigent pas
- Des configs qui marchent bien sur une machine, mal sur une autre
- Tout ce qui nécessite une intervention humaine pour des situations prévisibles

### Ce qu'on FAIT à la place

Chaque script REX doit **observer son environnement avant d'agir** :

```
mesure → décide → agit → vérifie → ajuste → recommence
```

Exemples concrets :

**Ingest adaptatif :**
- Mesure le temps de réponse Ollama avant de choisir le mode classify
- Si Ollama répond < 2s → SMART_INGEST avec petit modèle (qwen2.5:1.5b)
- Si Ollama répond 2-10s → SMART_INGEST=off, juste embed, categorize plus tard
- Si backlog > 500 chunks → mode urgence : embed only, max chunks × 10
- Si backlog > 2000 chunks → alerte Telegram + mode bulk
- Si Ollama down → save en pending, skip embed, retry dans 5min

**Gateway adaptatif :**
- Mesure latence Ollama, Groq, Cerebras au démarrage
- Route vers le plus rapide disponible
- Si rate-limit → bascule auto, pas de perte de message

**Daemon adaptatif :**
- Ajuste l'intervalle des cycles selon la charge CPU
- Détecte si un cycle précédent est encore en cours → skip proprement
- Détecte si la mémoire grossit trop vite → alerte + accélère ingest

---

## Architecture : Ce que REX combine que personne d'autre ne fait

### Les orchestrators (pilotage)

| Orchestrator | Rôle | Auth |
|---|---|---|
| **Claude Code** | Dev principal, architecture, features | OAuth Claude Max |
| **Codex CLI** | Build autonome, CI, tâches longues | API OpenAI |

Personne d'autre ne combine **deux orchestrators distincts** avec mémoire partagée.

### Les workers/providers (exécution)

| Tier | Exemples | Coût |
|---|---|---|
| Local | Ollama (qwen, llama, deepseek) | 0 |
| Free APIs | Groq, Cerebras, Together, Mistral, OpenRouter | 0 |
| Subscriptions | Claude Max API, ChatGPT Plus, Codex | quota inclus |
| Pay-per-use | Anthropic API, OpenAI API | dernier recours |

### La fleet (compute distribué)

| Node | Rôle | Accès |
|---|---|---|
| Mac principal | Dev, orchestration, UI | direct |
| VPS | Hub central, gateway KeepAlive, sync | Tailscale |
| GPU node (futur) | Modèles lourds, fine-tuning | Tailscale |
| NAS (futur) | Stockage memories, backups | Tailscale |

### La mémoire (état partagé)

- SQLite + embeddings vectoriels (nomic-embed-text)
- **Partagée entre TOUS les orchestrators et workers**
- Claude Code, Codex, Gateway Telegram — tous lisent/écrivent la même mémoire
- Aucun système concurrent ne fait ça

---

## Ce que OpenClaw, Cline, Goose, Aider ne font PAS

| Capacité | OpenClaw | Cline | Goose | Aider | REX |
|---|---|---|---|---|---|
| Multi-orchestrators | ❌ | ❌ | ❌ | ❌ | ✅ Claude + Codex |
| Fleet multi-machine | ❌ | ❌ | ❌ | ❌ | ✅ Mac + VPS + GPU |
| Mémoire partagée cross-tools | ❌ | ❌ | partial | ❌ | ✅ SQLite + vectors |
| Provider routing auto | ❌ | ❌ | ❌ | ❌ | ✅ cache→local→free→sub |
| Gateway mobile | ❌ | ❌ | ❌ | ❌ | ✅ Telegram |
| Self-healing daemon | ❌ | ❌ | ❌ | ❌ | ✅ watchdog + auto-fix |
| Scripts dynamiques adaptatifs | ❌ | ❌ | ❌ | ❌ | 🔄 en cours |
| Multi-account OAuth | ❌ | ❌ | ❌ | ❌ | 🔄 planifié |
| MCP marketplace one-click | ❌ | ❌ | ❌ | ❌ | 🔄 en cours |

---

## Multi-Account : La Vraie Puissance

### Vision

Un dev solo avec Claude Max peut avoir N instances Claude Code actives simultanément.
REX orchestre ces instances comme une flotte :

```
REX Orchestrator
├── Claude Code instance A (projet X, branche feat/auth)
├── Claude Code instance B (projet Y, review PR)
├── Claude Code instance C (projet X, branche feat/api)
└── Codex instance (background refactor, pas de supervision)
```

Chaque instance :
- A sa propre config `CLAUDE_CONFIG_DIR` isolée (`~/.claude-agent-{id}/`)
- Partage la mémoire REX commune
- Est supervisée par le daemon REX
- Peut être lancée/arrêtée/relancée depuis Telegram

### Multi-compte OAuth

Si plusieurs comptes Claude Max sont disponibles :
- REX détecte les sessions OAuth disponibles
- Route les tâches selon disponibilité (qui n't est pas rate-limited)
- Load-balance entre comptes pour maximiser le débit

---

## Erreurs Prévisibles = Code Préventif

### Liste des erreurs prévisibles à toujours coder

| Erreur | Contexte | Réponse dynamique |
|---|---|---|
| Ollama lent (> 5s/req) | ingest, classify, gateway | switch modèle petit, ou skip classify |
| Ollama down | tout | fallback free tier API, queue local |
| Rate limit 429 | free tier API | markRateLimited, next provider, retry window |
| Backlog qui grossit | ingest | accélérer cycle, notify Telegram |
| DB lock (SQLite) | concurrent ingest | lockfile + stale detection + retry |
| Node VPS offline | sync | queue locale, replay quand dispo |
| Context window full | Claude Code | auto-compact avant saturation |
| Session token expirée | OAuth | refresh auto, fallback autre compte |
| MCP server crash | MCP registry | restart auto, disable + notify |
| Disk full (memories) | ingest | prune auto oldest, notify |
| CPU > 80% | daemon cycles | throttle + allonger intervalles |

---

## Roadmap "Living REX"

### Priorité immédiate

1. **Ingest adaptatif** (`packages/memory/src/ingest.ts`)
   - Mesure latence Ollama au démarrage du cycle
   - Choisit automatiquement le modèle le plus rapide disponible pour classify
   - Détecte taille du backlog → ajuste MAX_EMBED_PER_RUN dynamiquement
   - Mode urgence si backlog > seuil

2. **Daemon auto-healing** (`packages/cli/src/daemon.ts`)
   - Détecte si les cycles ingest réussissent vraiment (count doit baisser)
   - Si count stable 3 runs → switch en mode fast (SMART_INGEST=off)
   - Alerte Telegram si backlog bloqué > 1h

3. **Visibility layer** (Flutter Health page)
   - Pending files count (filesystem, pas DB)
   - Estimated time to clear backlog
   - Last successful embed timestamp
   - Current ingest speed (chunks/min)

### Phase suivante

4. **Multi-instance Claude Code** (agents.ts)
   - Détection automatique du nombre d'instances supportées
   - Load-balancing entre instances
   - Mémoire partagée cross-instance

5. **Multi-account OAuth** (nouveau module `auth.ts`)
   - Détection sessions Claude actives
   - Rotation automatique sur rate-limit
   - Status par compte dans Flutter

6. **Fleet routing** (hub.ts enrichi)
   - Mesure des capacités de chaque node (CPU, RAM, GPU, models)
   - Route les tâches vers le node le plus approprié
   - Tailscale-aware : prefer direct, fallback relay

---

## Principe de Documentation

**Chaque bug ou limitation découvert en prod = une règle ou un pattern ajouté ici.**

Le bug SMART_INGEST qui bloque le backlog a révélé :
- Règle : tout cycle récurrent doit mesurer son contexte avant d'agir
- Pattern : le mode d'un script doit être fonction des conditions, pas d'une var env fixe
- Leçon : les settings d'env sont des overrides, pas des defaults de prod

Ce document évolue. Chaque session de travail sur REX doit le enrichir.

---

## La Phrase Résumé

> REX est le seul système qui combine orchestration multi-outils, mémoire cross-agents, fleet distribuée, et scripts auto-adaptatifs en un seul hub zéro-config. Là où OpenClaw brûle des tokens à chaque respiration, REX décide, délègue, et apprend.

---

## Vision Complète — Le Manifeste REX (2026-03-09)

*Formalisé depuis les mots de Kevin. Référence permanente.*

### REX = Jarvis pour développeurs

REX n'est pas un outil. C'est un **compagnon de vie et de travail** — comme Jarvis dans Iron Man, mais pour un dev solo ou une petite équipe.

**Ce que ça signifie concrètement :**
- REX te connaît : tes habitudes, tes logs, tes patterns de travail, tes projets
- REX anticipe : il cherche des solutions à des problèmes futurs avant qu'ils n'arrivent
- REX agit : il propose, demande validation, exécute, documente — sans intervention humaine sur les tâches répétitives
- REX respecte : il demande toujours accès avant d'agir, rend les permissions persistantes, ne fait rien sans ton accord

---

### Principe Fondamental : 70% Script, 30% LLM

**Script/Open Source/CLI first. LLM en dernier recours.**

Avant de consommer des tokens :
1. Y a-t-il un script qui fait ça ?
2. Y a-t-il un outil open source ?
3. Y a-t-il un MCP server ?
4. Y a-t-il une API gratuite ?
5. Alors seulement → LLM

REX optimise pour : **zéro gaspillage de compute et de tokens.**
Il préserve ta machine (CPU, RAM), préserve tes quotas, préserve ton argent.

---

### Architecture REX Complète

#### Cerveau : VPS 24/7

Le VPS est le cerveau permanent de REX :
- Tourne H24, 7j/7, même quand ton Mac est fermé
- Héberge le daemon principal, le gateway Telegram
- Point de sync pour toute la fleet
- Accessible depuis n'importe où via Tailscale ou tunnel sécurisé

#### Fleet : toutes tes machines, un seul REX

| Machine | Rôle |
|---------|------|
| VPS | Cerveau, daemon, gateway, sync hub |
| Mac principal | Dev, orchestration, UI Flutter |
| PC/Linux | Compute supplémentaire, build workers |
| NAS | Stockage memories, backups, archives |
| Raspberry Pi | Edge node, sensors, IoT bridge |
| GPU node | Fine-tuning, modèles lourds |

Toutes connectées via **tunnels sécurisés** (Tailscale-first, SSH fallback).
REX gère les accès, les demande quand nécessaire, les rend persistants.

#### Mémoire : tout, partout, rien ne se perd

- SQLite + embeddings vectoriels sur chaque node
- Synchronisée entre toutes les machines de la fleet
- Si un node est down : queue locale + replay quand il revient
- Fallbacks embed : Ollama local → API free tier → subscription
- **Zéro perte garantie** — tout ce qui est ingéré sera finalement embarqué

#### Ingest : dynamique et adaptatif

Le système REX observe, monitore et ingère automatiquement :
- Sessions Claude Code / Codex
- Logs système, logs projets
- Réunions (transcription auto)
- Tout ce qu'il voit, il apprend

Mode adaptatif selon les ressources disponibles :
- Ollama rapide + petit backlog → classify + embed (smart)
- Backlog critique → bulk embed sans classify
- Ollama down → queue locale, free tier API embed, retry

#### Providers : utilise tout ce que tu as

REX connaît exactement ce dont tu disposes et construit le routing optimal :

| Priorité | Resource | Usage |
|----------|----------|-------|
| 1 | Scripts locaux | Tâches automatisables |
| 2 | Open source / MCP | Fonctionnalités packagées |
| 3 | Ollama local | LLM sans coût |
| 4 | Free tier APIs | Groq, Cerebras, Together... |
| 5 | Subscriptions | Claude Max, GPT Plus (quota inclus) |
| 6 | Pay-per-use | Anthropic API, OpenAI API — dernier recours |

**Le meilleur modèle pour chaque tâche :**
- Tâche simple → plus petit modèle qui peut la résoudre
- Code complexe → Claude Sonnet / Opus
- Think / architecture → modèle reasoning (deepseek-r1)
- Embed → nomic-embed-text (toujours local)

---

### REX Monitor : observateur permanent

REX monitore ta vie de dev en arrière-plan :

**Ce qu'il voit :**
- Logs système (CPU, RAM, disk, network)
- Logs projets (erreurs, warnings, crashes)
- Réunions et appels (via Hammerspoon / call watcher)
- Git activity (commits, PRs, branches)
- Sessions Claude Code (ce qui est fait)

**Ce qu'il fait avec ça :**
- Détecte les patterns répétitifs → propose d'automatiser
- Détecte les erreurs récurrentes → crée des règles préventives
- Propose de nouveaux tools pertinents trouvés sur le web / GitHub
- Alerte si quelque chose se dégrade (backlog, disk, erreurs)
- Lance des agents en background si une tâche prend trop de temps

**Ce qu'il NE fait PAS sans permission :**
- Accéder à une machine sans avoir demandé
- Exécuter des actions irréversibles
- Envoyer des messages ou créer des PR sans validation
- Modifier ta config sans te montrer le diff

---

### REX Dev : oublie ton IDE

Pour le dev, REX automatise tout le cycle :

**Nouveau projet :**
1. REX détecte (ou tu dis "nouveau projet X")
2. Crée le repo GitHub privé
3. Configure les protections de branches
4. Installe CI/CD (GitHub Actions : lint, tests, deploy)
5. Génère le README, CLAUDE.md, .gitignore, licence
6. Configure les guards REX (hooks Claude Code)
7. Initialise la structure projet selon le stack détecté
8. Premier commit, première PR de setup
→ Tu arrives sur un projet prêt à coder

**Pendant le dev :**
- Lint automatique avant chaque commit (free, local)
- Tests automatiques (si disponibles)
- Secret scan avant push
- Review IA optionnelle (Copilot, Gemini, Claude)
- Suggestions de refactoring si pattern détecté
- Documentation auto-mise à jour

**REX utilise toujours :**
- Outils free et open source d'abord (ESLint, Prettier, Semgrep)
- MCP servers pour les fonctionnalités avancées
- LLM seulement pour ce qu'un script ne peut pas faire

---

### REX Partout : même expérience sur toutes tes machines

Que tu sois sur ton Mac, ton VPS ou ton téléphone via Telegram :
- Même mémoire (sync H24)
- Mêmes agents disponibles
- Mêmes MCPs configurés
- Mêmes settings

**Telegram = interface mobile complète :**
- Lance des agents
- Contrôle le daemon
- Consulte la mémoire
- Reçoit des alertes
- Exécute des commandes

---

### REX Curieux : il cherche de lui-même

REX ne se contente pas d'exécuter ce qu'on lui dit.
Il est curieux : il cherche activement de nouvelles solutions.

**Ce que ça veut dire :**
- Il suit les nouvelles sorties de modèles open source
- Il explore les nouveaux MCP servers populaires
- Il détecte les outils que la communauté utilise (GitHub trending, HN)
- Il propose des intégrations qui n'existaient pas hier
- Il met à jour sa base de connaissance sans qu'on lui demande

**Il stocke ses découvertes dans sa mémoire** :
- "Nouveau modèle X sorti, plus rapide que Y pour le code"
- "MCP server Z populaire, pertinent pour tes projets CakePHP"
- "Pattern anti-pattern détecté dans tes commits, voici une règle"

---

### REX Training : entraîne ton propre modèle

À terme, REX peut entraîner un modèle personnalisé pour toi :
- Basé sur tes sessions, tes patterns, ton style de code
- Via mlx-lm (Apple Silicon), unsloth (GPU node) ou API fine-tuning
- Évaluation automatique contre benchmark local
- Déploiement dans le routing REX quand prêt

---

### Ce qui différencie REX de tout le reste

| Capacité | Cline | Goose | Aider | OpenClaw | REX |
|----------|-------|-------|-------|----------|-----|
| Fleet multi-machine | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cerveau VPS 24/7 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mémoire cross-agents | ❌ | partial | ❌ | ❌ | ✅ |
| Monitor passif | ❌ | ❌ | ❌ | ❌ | ✅ |
| Script-first (70/30) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-orchestrators | ❌ | ❌ | ❌ | ❌ | ✅ |
| Provider auto-routing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Gateway mobile | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ingest adaptatif | ❌ | ❌ | ❌ | ❌ | ✅ |
| Setup wizard zero-config | ❌ | ❌ | ❌ | ❌ | 🔄 |
| Tunnels sécurisés auto | ❌ | ❌ | ❌ | ❌ | 🔄 |
| Monitor vie dev | ❌ | ❌ | ❌ | ❌ | 🔄 |
| Fine-tuning modèle | ❌ | ❌ | ❌ | ❌ | 🔄 |
| Curieux / proactif | ❌ | ❌ | ❌ | ❌ | 🔄 |

---

### Le Manifeste en Une Phrase

> REX c'est Jarvis pour les devs : un système vivant, curieux, adaptatif, qui centralise tout ce que tu possèdes (hardware, LLMs, APIs, scripts, outils open source), l'organise parfaitement, et agit en ton nom — 70% scripts, 30% LLM — sans jamais gaspiller de ressources, sans jamais rien perdre, toujours avec ta validation pour les actions importantes.
