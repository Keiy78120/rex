<div align="center">

# REX

**REX est REX.**

Il pense. Il orchestre. Il agit.
Quand il a besoin d'un LLM, il l'appelle comme un outil — comme un humain ouvre une calculatrice.

[![npm](https://img.shields.io/npm/v/rex-claude?color=blue&label=npm)](https://www.npmjs.com/package/rex-claude)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![platform](https://img.shields.io/badge/VPS%20%7C%20Mac%20%7C%20Linux-compatible-black)
[![discord](https://img.shields.io/badge/community-coming_soon-blueviolet)]()

</div>

---

## Ce qu'est REX

REX n'est pas un wrapper. REX n'est pas un orchestrateur de prompts.

REX est un système d'exploitation pour l'intelligence — il tourne 24/7 sur tes machines, connaît tes projets, gère ta mémoire, surveille tes ressources, et décide quand et comment utiliser chaque outil à sa disposition.

Les LLMs sont ses outils. Pas son cerveau.

```
Tu parles à REX.
REX réfléchit.
REX exécute — script, CLI, modèle local, API — ce dont il a besoin.
REX répond.
```

---

## Pourquoi REX

Les LLMs sont puissants. Ils n'ont pas de mémoire, pas de discipline de coût, pas de conscience de tes machines, pas d'accès à tes outils. Et ils ne savent rien de toi.

REX règle ça — en étant le système qui tourne en permanence, qui t'apprend, qui grandit, et qui sait exactement quand appeler quel modèle.

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

**1. Script-first**
Si un script peut faire le travail : script. Pas de LLM.

**2. REX calls what it needs**
Mini-models locaux pour la classification. Groq gratuit pour les tâches légères. Sonnet pour le raisonnement. Opus seulement en dernier recours — et jamais par défaut.

**3. Tokens = énergie**
Scripts = 0. Ollama local = muscle. Groq = pensée légère. Haiku = effort. Sonnet = concentration. Opus = consultation du mentor. On ne gaspille pas.

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
        │  ③ Script-first      │  ← 90% des tâches résolues ici
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
  (0 LLM)   Mac·VPS·PC·RPi    MCPs·CLIs
     │             │              │
     └─────────────┼──────────────┘
                   │ (si LLM nécessaire)
                   ▼
       ┌────────────────────────┐
       │   Relay Chain          │
       │  Ollama (local, 0€)    │
       │  → Groq (gratuit)      │
       │  → Haiku (léger)       │
       │  → Sonnet (profond)    │
       │  → Opus (mentor, rare) │
       └────────────────────────┘
```

---

## La Relay Chain

Ce n'est pas un simple fallback. Chaque modèle reçoit un document partagé, lit les contributions des précédents, ajoute son analyse, et décide s'il passe au suivant.

```
Task → Ollama analyse (confidence: 0.6, passe)
     → Groq enrichit (confidence: 0.75, passe)
     → Haiku conclut (confidence: 0.90, DONE)

Claude Sonnet n'a pas été appelé.
Opus n'a jamais été touché.
Coût total : 0.003$
```

---

## Mini-Models

Des petits modèles Ollama entraînés pour **une seule tâche** — ultra-rapides, 0 coût API.

| Model | Tâche | Latence |
|-------|-------|---------|
| `rex-intent` | Classifier l'intent du message | 20ms |
| `rex-tagger` | Générer des tags | 30ms |
| `rex-summarizer` | Résumer en 2-3 phrases | 50ms |
| `rex-security` | Évaluer le risque d'une action | 20ms |

---

## Fleet

REX voit toutes tes machines. Il route les tâches automatiquement selon les capacités disponibles.

```
VPS         → always-on, mémoire, daemon, Telegram gateway
Mac         → Ollama (Qwen), Claude Code, activitywatch
PC RTX      → GPU inférence, tâches lourdes (wake on LAN si endormi)
iPhone      → capteur (caméra, GPS, notifications)
```

Thermal check avant routing. Si une machine est chargée → REX reroute. Si elle est offline → fallback propre.

---

## Modules

| Module | Rôle |
|--------|------|
| **HQ** | Dashboard — health, budget, alertes, fleet status |
| **MEMORY** | Knowledge base — SQLite + embeddings, mémoire de vie |
| **FLEET** | Machines — FleetNodes, routing, node-mesh |
| **BUDGET** | Coûts — relay chain, burn rate, daily quota |
| **AGENTS** | Agents autonomes — Claude Code, Codex, templates |
| **GATEWAY** | Telegram — comms, streaming, boutons |
| **TOOLS** | MCPs, CLIs, skills, script store |
| **CURIOUS** | Veille proactive — modèles, repos, outils |
| **PROJETS** | Git repos — scan, intent, context loader |
| **OPTIMIZE** | Self-improvement — lessons, runbooks, prune |

---

## Mini-Modes

Chaque type de tâche = un environnement pré-configuré. Le LLM reçoit un formulaire à remplir — pas un sujet de réflexion.

```
search-memory   → context chargé → LLM résume (50 tokens)
save-idea       → MD créé → tags générés par rex-tagger (30ms)
check-status    → scripts → 0 LLM
buy             → Playwright + vault → 0 LLM (SECURITY: HIGH)
code-review     → context projet + diff → LLM analyse
```

---

## Cycles utilisateur

REX adapte ses ressources à ton rythme.

```
AWAKE_ACTIVE   → fleet complète, tous les modèles disponibles
AWAKE_IDLE     → cache prioritaire, moins d'appels API
SLEEPING       → Ollama uniquement (0€), tâches background lourdes
WAKING_UP      → morning digest, résumé de la nuit, agenda du jour
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

Sandbox Docker pour toute opération risquée. Snapshot automatique avant chaque modification. Rollback disponible 30 jours.

---

## Install

```bash
# VPS / Linux
npm install -g rex-claude
rex install

# Mac
npm install -g rex-claude
rex install --profile=mac

# Clone direct
git clone https://github.com/Keiy78120/rex
cd rex && ./scripts/install-linux.sh   # ou install-macos.sh
```

---

## Commandes clés

```bash
rex doctor          # health check complet
rex status          # résumé one-liner
rex comms           # démarrer le bot Telegram
rex hub             # démarrer le Commander API (port 7420)
rex daemon          # démarrer le daemon background
rex fleet status    # état de toutes les machines
rex budget          # coûts du jour
rex search <query>  # recherche sémantique dans la mémoire
rex relay <task>    # relay chain explicite
rex user-cycles     # état du cycle utilisateur
rex agents list     # agents en cours
rex curious         # scan veille proactive
```

---

## Roadmap

### Phase 1 — Base solide ✅ (en cours)
- Memory SQLite + embeddings
- Relay chain (Ollama → Groq → Haiku → Sonnet → Opus)
- Gateway Telegram
- Daemon + watchdog + sandbox
- Budget tracking + alertes
- Guards (8 safeguards)
- Fleet node-mesh
- Agent templates (DG, DRH, CEO, COO, Freelance)

### Phase 2 — Script-first complet
- Script store opérationnel (fetch, memory, actions, security)
- Mini-models Ollama (rex-intent, rex-tagger, rex-summarizer)
- Mini-modes (search, save, status, code, buy)
- rexIdentityPipeline comme handler par défaut
- ActivityWatch intégré dans user-cycles

### Phase 3 — VPS Brain 24/7
- VPS deploy automatisé (vps-deploy.ts)
- BRAIN / FLEET split
- DB migrations au boot automatique
- Budget alert → Telegram
- Morning digest automatique

### Phase 4 — Fleet & autonomie
- PC RTX Wake on LAN
- iPhone capteur
- CURIOUS scanner nocturne
- Self-improvement loop

### Phase 5 — Produit client
- Container Docker par client
- Setup wizard + wizard onboarding
- REX IS ALIVE (campagne)

---

## License

MIT — D-Studio
