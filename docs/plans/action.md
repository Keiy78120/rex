# REX — Plan d'action (réorganisé mars 2026)

> Architecture vivante. Mis à jour en continu.
> Chaque section = un module REX avec ses fichiers, règles et specs.

---

## Architecture globale

```
┌─────────────────────────────────────────────────────┐
│                    THE BRAIN                         │
│  VPS / Mac Mini / PC / RPi — always-on 24/7         │
│  Fleet Commander · Memory/RAG · Event Bus · Daemon  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                    THE FLEET                         │
│  Mac · PC · NAS (storage/memory/backups/logs)        │
│  iPhone · Android (capteurs : caméra/GPS/notifs)    │
│  Tout nœud accessible via Tailscale tunnel          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              THE ORCHESTRATOR MODEL                  │
│  Codex OAuth  /  Claude Code Pro OAuth              │
│  → Rex-launcher.ts avec profil adapté par intent    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   SOLDIERS                           │
│  Ollama local → Free APIs → Subscription → Pay      │
│  orchestrator.ts + SPECIALIST_PROFILES              │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                     TOOLS                            │
│  MCPs · Skills · Open Source · Templates            │
│  mcp-discover.ts + security-scanner.ts              │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  UNDERLAYER (0 LLM)                  │
│  Scripts · ffmpeg · pdf · zip · batch · sync        │
│  fetch/RSS · lint · security · Docker · YOLO sandbox│
└─────────────────────────────────────────────────────┘
```

### Terminologie militaire

> Les noms UI/Module sont aussi les noms de code. Un seul référentiel.

| Module / Label UI | Fichier principal | Rôle |
|-------------------|-------------------|------|
| **Commander** | `hub.ts` | API centrale always-on (port 7420) |
| **Fleet** | `node-mesh.ts` | Tous les nœuds — FleetNode, getFleetStatus |
| **Code Specialist** | agents via `agents.ts` | Mac avec Claude Code |
| **Inference Specialist** | Ollama via `orchestrator.ts` | Nœud avec GPU |
| **Storage Specialist** | NAS via `sync.ts` | NAS — mémoire/logs/backups |
| **Comms** | `gateway.ts` | Telegram bot (alias: `rex comms`) |
| **Background Specialist** | RPi via daemon | RPi — tâches légères |

### Règles absolues

1. **Underlayer = 0 LLM** — scripts, cron, fetch, RSS uniquement
2. **Soldiers = économie max** — Ollama → free → subscription → pay jamais par défaut
3. **Orchestrator = un seul** — Claude Code ou Codex OAuth, vrai compte
4. **REX uses REX** — tout appel LLM interne passe par `orchestrator.ts`
5. **Script avant LLM** — si un script peut faire le travail, pas de LLM
6. **YOLO Sandbox** — toute opération risquée passe par container Docker jetable

---

## REX HQ

> Dashboard principal. Vue d'ensemble de tout REX en temps réel.

### Contenu

- **Fleet status** — quels nœuds sont en ligne, latence, capacités
- **Budget overview** — tokens utilisés aujourd'hui/semaine, coût estimé
- **Memory stats** — taille base de connaissance, dernière ingestion
- **Agents actifs** — sessions Claude Code / Codex en cours
- **CURIOUS queue** — problèmes en cours de résolution
- **Alertes** — quota proche, nœud offline, sécurité

### Fichiers

- `dashboard.ts` — agrège les données de tous les modules
- `event-journal.ts` — log central de tous les events REX

---

## REX TOOLS

> MCPs, CLI, Skills, Agent Skills. Tout ce que REX peut installer et utiliser.

### MCP Management

- Catalogue via `mcp-discover.ts`
- **Scan sécurité obligatoire avant tout install** (`security-scanner.ts`)
- MCPs chargés lazy à la session (pas au boot daemon)
- Kill/relaunch obligatoire si changement de MCPs mid-session

### Agent Skills (format officiel Anthropic mars 2026)

```
skills/
  mon-skill/
    SKILL.md          ← description + instructions
    evals/
      test-cases.md   ← prompts + critères de succès
      baseline.json   ← pass rate, tokens, latency de référence
```

**Deux types :**
- **Capability uplift** — compensent une lacune du modèle. Retirer si evals passent sans le skill.
- **Encoded preference** — séquencent des comportements REX. Plus durables.

### Lint loop (pour le CODE, pas les skills)

```
Script analyse → LLM correction minimale → re-analyse → convergence
```
- Arrêt : no diff | max 5 iterations | LLM dit "rien à corriger"
- Fichier : `lint-loop.ts` — utilise `orchestrate()` en interne (Haiku prioritaire)

### Sécurité TOOLS

| Scanner | Cible |
|---------|-------|
| `mcp-scan` (invariantlabs) | descriptions MCP |
| `skill-scanner` (Cisco) | skills agents |
| VirusTotal API | npm packages, URLs |
| Injection regex (30 patterns) | scripts, prompts |
| `npm audit` | dépendances |

Patterns bloqués : `curl | bash`, exfiltration env vars, zero-width chars, DAN mode, `/etc/passwd`.
Résultats cachés 24h par hash.

### Fichiers

- `mcp-discover.ts` — catalogue + discovery + install
- `security-scanner.ts` — scan avant install
- `lint-loop.ts` — boucle correction code

---

## REX CURIOUS

> Résolveur de problèmes autonome en background. Script-first, free tier, 0 interruption.

### Principe

REX détecte un signal en mémoire (bug récurrent, erreur répétée, question non résolue) et lance une recherche en background sans attendre Kevin.

### Flow

```
Memory → signal détecté (bug récurrent, pattern d'erreur, lacune)
         ↓
Scripts d'abord (0 LLM) :
  · fetch/curl → docs officielles, GitHub issues, StackOverflow
  · npm search, GitHub API, Brave Search API
  · grep/regex sur logs existants
  · semgrep sur le code concerné
         ↓
Si script suffit → solution trouvée, stockée en mémoire
Si besoin d'interprétation → Ollama local ou free tier (Groq)
  reçoit le résultat propre du script, pas la donnée brute
         ↓
Solution + sources stockées en mémoire
Notif discrète à Kevin si actionnable
```

### Exemples

- "Erreur Brevo récurrente dans MEC" → CURIOUS cherche root cause + fix connu
- "Build échoue sur node 22" → CURIOUS cherche le workaround
- "Latence Ollama élevée" → CURIOUS cherche les optimisations connues
- "Dépendance avec CVE détectée" → CURIOUS cherche le fix ou l'alternative

### Règles

- Jamais bloquant pour Kevin — tourne en background
- Ollama/free tier uniquement — jamais de subscription sans signal fort
- Résultats toujours sourçés (URL + date)
- Si pas de solution après N tentatives → log + notif "non résolu"

### Fichiers

- `curious.ts` — moteur de détection + orchestration des recherches
- `signal-detector.ts` — analyse memory pour détecter problèmes

---

## REX AGENTS

> Gestion des sous-agents IA actifs. Claude Code, Codex, agents spécialisés.

### Orchestrator Model

L'orchestrateur principal est **Claude Code** ou **Codex** via OAuth (vrai compte, pas free tier). C'est lui qui décide, délègue, supervise.

- `rex-launcher.ts` — point d'entrée unique, lance Claude Code avec profil adapté
- `account-pool.ts` — rotation multi-comptes Claude pour éviter les limites

### Intent Detection → Profil

```
Intent détecté → Profil sélectionné → settings.json écrit → Claude Code lancé
```

Profils disponibles : `feature`, `bug-fix`, `refactor`, `infra`, `docs`, `explore`, `new-project`

Chaque profil définit : guards actifs, MCPs chargés, modèle hint, skills injectés.

### Kill / Relaunch

Si intent change mid-session :
1. Dump session state → `recovery-state.json`
2. Kill Claude Code (SIGTERM → SIGKILL)
3. Re-détecter intent → nouveau profil
4. Écrire nouveau `settings.json` (MCPs + guards)
5. Relancer → injection `recovery-state.json` au SessionStart

**MCPs non-chargeables mid-session** (limite Claude Code) → kill/relaunch obligatoire.

### Codex comme worker background

- `runWithCodex()` dans `agents.ts`
- Tâches longues, non-interactives, en parallèle de Claude Code

### Fichiers

- `rex-launcher.ts` — entry point, profile writer, session manager
- `account-pool.ts` — multi-compte rotation
- `agents.ts` — Codex worker, sous-agents spécialisés
- `project-intent.ts` — détection d'intent par signaux

---

## REX BUDGET

> Token economy. Burn rate, coûts, quotas. Économie maximale.

### Relay chain (staggerée, pas linéaire)

```
Script (0ms)         → 0 token si tâche scriptable
Ollama local (0ms)   → gratuit si dispo + tâche dans ses forces
Free tier (+300ms)   → Groq/Together/Cerebras si Ollama absent
Subscription (+800ms)→ Haiku/Sonnet si free tier épuisé
Pay → jamais par défaut, alerte Kevin si atteint
```

### Self-aware specialists

Chaque spécialiste connaît ses limites AVANT d'essayer :

| Modèle | Context max | Forces | Coût |
|--------|-------------|--------|------|
| qwen2.5:1.5b | 4K | categorize, lint | 0 |
| qwen2.5:7b | 32K | code, review | 0 |
| nomic-embed | 8K | embed uniquement | 0 |
| Groq 8B | 131K | tâches rapides | 0 |
| Groq 70B | 131K | code, review | 0 |
| Haiku | 200K | généraliste | $0.25/Mtok |
| Sonnet | 200K | Commander | $3/Mtok |

Si limits dépassées → `handoffNote` + relais immédiat.

### Règles token economy

1. Batch reads : `Promise.all()` jamais séquentiel
2. Semantic cache : vérifier avant tout appel LLM
3. Preload budget : max 5 faits injectés, jamais la mémoire complète
4. Lazy-load MCPs : activés au lancement session seulement
5. Early exit : si intent clair dès le début, ne pas re-analyser
6. Context compaction : quand >70% utilisé → compacter proactivement
7. Haiku pour scan/lint/categorize, Sonnet pour code, Opus jamais par défaut

### Fichiers

- `orchestrator.ts` — relay chain + SPECIALIST_PROFILES
- `burn-rate.ts` — tracker visuel tokens/coûts
- `semantic-cache.ts` — cache avant appels LLM

---

## REX FLEET

> Gestion des nœuds. Commander, Specialists, status, mission assignment.

### Discovery automatique

Au démarrage, chaque nœud détecte ses capacités :
- `claude-code`, `codex`, `ollama`, `gpu`, `browser`, `voice`
- `mac-bridge`, `always-on`, `high-memory`, `wake-on-lan`

### Registration

```
Daemon (60s) → buildLocalNodeInfo() → registerWithHub()
Commander → upsertNode() → mesh-nodes.json
```

### Mission assignment (task routing)

```
Task reçue → routeTask(kind) → best available node
  → preferred node si spécifié
  → capability match → lowest latency
  → Commander fallback
  → queue si unavailable + queueIfUnavailable=true
```

### Fleet setup

Au setup : scan des nœuds Tailscale → configuration Commander centralisé → config partagée.

### Fichiers

- `node-mesh.ts` — discovery, registration, routing, delegation
- `daemon.ts` — service background (60s heartbeat)
- `hub.ts` — API Commander (POST /nodes/register, GET /nodes/status)

---

## REX MEMORY

> Base de connaissance. RAG, embeddings, sync, ingest. Déjà implémenté dans REX.

### Stack

- SQLite + sqlite-vec — storage local, zéro infra
- Ollama nomic-embed-text — embeddings locaux (VPS, pas Mac dépendant)
- BM25 + vector search hybride
- Semantic cache sur les requêtes fréquentes

### Ingest sources

- Sessions Claude existantes (`~/.claude/projects/*.jsonl`)
- WhatsApp exports, Obsidian vault, iMessage
- Repos Git (intent detection par repo)
- Logs REX, event-journal

### Sync NAS (Storage Specialist)

- NAS = backup memory + logs + sessions compressées
- Sync incrémental (delta uniquement, pas full chaque fois)
- Prune automatique des données obsolètes

### Fichiers

- `memory.ts` — lecture/écriture knowledge base
- `semantic-cache.ts` — cache requêtes LLM
- `sync-queue.ts` — event bus entre nœuds
- `ingest.ts` — pipeline d'ingestion multi-sources

---

## REX GATEWAY

> Interface Comms. Telegram bot, routing des messages, session management.

### Routing

```
Message Telegram → gateway.ts
  → routeTask() via node-mesh → best node
  → orchestrate() pour réponse simple (Ollama/free tier)
  → rex-launcher si tâche nécessite Claude Code
```

### Règles gateway

- Réponses simples → Ollama/free tier via `orchestrate()` (jamais Sonnet pour "quelle heure est-il")
- Tâches code → délégation Code Specialist via fleet
- Tâches mémoire → Memory layer direct, 0 LLM si grep suffit

### ⚠️ Limitation Claude via Gateway — CRITIQUE

**Problème** : Quand le gateway (`rex gateway`) essaie de spawner `claude -p "prompt"`, Claude détecte qu'il tourne à l'intérieur d'une session Claude Code existante (via les variables d'env) et refuse de répondre.

**Variables responsables** (toutes injectées par Claude Code dans l'env du process parent) :
```
CLAUDECODE=1
CLAUDE_CODE_SSE_PORT=<port>
CLAUDE_CODE_ENTRYPOINT=cli
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
CLAUDE_CODE_MAX_OUTPUT_TOKENS=<n>
```

**Fix appliqué dans `gateway.ts` — `claudeEnv()` function** :
1. Supprimer toutes les vars `CLAUDE_CODE_*` avant de spawner le subprocess Claude
2. Injecter manuellement `~/.local/bin`, `~/.nvm/versions/node/*/bin` dans PATH (LaunchAgent/daemon n'héritent pas du PATH shell)

**Impact** : Ce fix est actif en production. Si Claude Code ajoute de nouvelles vars de session, les ajouter à `claudeEnv()` dans gateway.ts.

**Workaround si Claude reste inaccessible** : Utiliser Groq/Ollama via `orchestrate()` (free tier, pas de restriction de session).

### Session management

- `dmScope: per-channel-peer` — isolation par utilisateur
- Session state préservé dans `event-journal`
- Recovery state injecté si session interrompue

---

## REX PROJETS

> Tout ce qui est dev. Repos, intent detection, setup projet, GitHub.

### Intent Detection

Signaux analysés (scripts purs) :
- Patterns fichiers (`.tsx` = feature, `test.ts` = bug-fix...)
- Git state (branch name, recent commits, staged files)
- Memory context (projets récents)
- CLAUDE.md présent → lit les instructions

### Project Setup (nouveau repo)

```
rex new → questions wizard → CLAUDE.md généré → guards installés
       → MCPs configurés → GitHub setup → premier commit
```

### Guards par profil

| Profil | Guards actifs |
|--------|--------------|
| feature | ui-checklist, test-protect, completion, dangerous-cmd |
| bug-fix | error-pattern, completion, dangerous-cmd, test-protect |
| refactor | test-protect, scope, completion, dangerous-cmd |
| infra | dangerous-cmd (strict), scope, completion |
| docs | scope uniquement |

### GitHub integration

- `gh` CLI pour issues, PRs, reviews
- Auto-PR depuis release branches (sur validation Kevin)
- Branch protection : merge main → validation obligatoire

---

## REX OPTIMIZE

> Self-improve, pruning, setup wizard, maintenance REX.

### Setup Wizard (onboarding = première démo)

```
rex setup → Discovery parallèle (30s, scripts purs)
          → Organisation (APIs dispo, une seule fois)
          → Wow moment : affiche tout ce qui a été trouvé
          → rex est prêt
```

Discovery : comptes Claude, API keys, Ollama, repos, hardware, Tailscale, MCPs, sessions existantes.

### Self-improve loop

```
CURIOUS détecte pattern d'erreur dans REX lui-même
→ CURIOUS propose fix (script ou LLM minimal)
→ lint-loop.ts valide
→ si ok → appliqué automatiquement ou proposé à Kevin
```

### Prune

- Sessions compressées après 7 jours
- Logs rotatés (30 jours max)
- MCPs inutilisés depuis 30 jours → suggestion de retrait
- Skills obsolètes détectés via evals → suggestion de dépréciation

### Maintenance

- `rex doctor` — valide l'installation complète
- `rex mesh` — status de la fleet
- `rex budget` — burn rate + quotas
- `openclaw security audit` pour la gateway

---

## Fichiers REX — état actuel

| Fichier | Status | Module |
|---------|--------|--------|
| `rex-launcher.ts` | ✅ impl | AGENTS |
| `node-mesh.ts` | ✅ impl | FLEET |
| `setup-wizard.ts` | ✅ impl | OPTIMIZE |
| `guard-ast.ts` | ✅ impl | TOOLS |
| `config-lint.ts` | ✅ impl | TOOLS |
| `burn-rate.ts` | ✅ impl | BUDGET |
| `mcp-discover.ts` | ✅ impl + security scan | TOOLS |
| `orchestrator.ts` | ✅ impl | BUDGET |
| `security-scanner.ts` | ✅ impl | TOOLS |
| `daemon.ts` | ✅ impl — heartbeat 60s, Fleet registration | FLEET |
| `hub.ts` | ✅ impl — Commander API (POST /nodes/register, GET /nodes/status) | FLEET |
| `lint-loop.ts` | ✅ impl — script→LLM→convergence | TOOLS |
| `curious.ts` | ✅ impl — proactive external discovery (Ollama/GitHub/HN) | CURIOUS |
| `signal-detector.ts` | ✅ impl — system signals (CPU/RAM/disk/services) | CURIOUS |
| `event-journal.ts` | ✅ impl — append-only SQLite event log | HQ |
| `dashboard.ts` | ✅ impl — HQ aggregate snapshot (Promise.all, 0 LLM) | HQ |


---

## Note — Naming REX (double rôle)

Les noms de modules REX (HQ, TOOLS, CURIOUS, AGENTS, BUDGET, FLEET, MEMORY, GATEWAY, PROJETS, OPTIMIZE) servent à **deux niveaux simultanément** :

### 1. Interface utilisateur
Menus de navigation dans la Flutter app / CLI. L'user comprend immédiatement où aller.

### 2. Namespace interne pour LLMs et scripts

Chaque module = un contexte sémantique que scripts et LLMs utilisent pour router les tâches :

```
Signal détecté en mémoire → module CURIOUS
Appel LLM interne → module BUDGET (passe par orchestrator)
Tâche de code → module AGENTS (rex-launcher, profil)
Install MCP → module TOOLS (mcp-discover + security-scanner)
Status fleet → module FLEET (node-mesh, Commander)
Recherche mémoire → module MEMORY (RAG, semantic-cache)
Message entrant → module GATEWAY (routing Telegram)
Nouveau repo → module PROJETS (intent detection, setup)
Self-improve → module OPTIMIZE (lint-loop, prune)
Vue globale → module HQ (dashboard, event-journal)
```

### Conséquence pour le code

Chaque fichier TypeScript doit avoir un header `@module` qui indique son appartenance :

```typescript
/** @module CURIOUS — background problem solver */
/** @module FLEET — Commander API */
/** @module BUDGET — relay chain */
```

Les logs et events doivent préfixer le module :
```
[CURIOUS] Signal detected: recurring Brevo error
[FLEET] Specialist online: mac-code-specialist
[BUDGET] Relay: ollama→free-tier (timeout 300ms)
```

Les scripts bash et les prompts LLM internes doivent référencer le module pour aider le LLM à comprendre le contexte sans relire tout le codebase.

### Bénéfice

Un LLM qui reçoit un log préfixé `[CURIOUS]` sait immédiatement qu'il s'agit d'un background solver — pas besoin de contexte supplémentaire. Un script qui cherche les fichiers du module FLEET sait qu'il cherche dans `node-mesh.ts`, `daemon.ts`, `hub.ts`.

**Le naming n'est pas cosmétique — c'est de l'organisation sémantique pour humains ET machines.**

---

## Principe REX — Système Vivant (Never Die)

### Règle absolue

REX ne s'arrête jamais. Si une tâche bloque, REX route autour et continue.

### Self-healing loop

```
Tâche bloque sur Claude Code
  → Codex prend le relais
  → Si Codex bloque → scripts + free tier
  → Si tout bloque → CURIOUS cherche pourquoi
     → trouve alternative → reprend
  → Jamais d'arrêt complet
```

### Self-improve sans casser l'existant

Quand CURIOUS ou Milo trouve une amélioration (recherche web, nouvelle lib, meilleure approche) :

1. **Règle 1** : ne jamais modifier ce qui fonctionne → additive uniquement
2. **Règle 2** : toute modification passe par lint-loop.ts validation avant application
3. **Règle 3** : plan updates (action.md, TODO.md) reflètent la réalité implémentée — jamais en avance de phase sur le code réel
4. **Règle 4** : respecter la REX Vision — relay chain, script-first, Commander/Fleet, adaptive routing

### Vivant = 3 niveaux simultanés

```
Niveau 1 — Exécution    : tâches en cours (Claude Code, Codex, scripts)
Niveau 2 — Surveillance : daemon heartbeat 60s, health checks, routing table
Niveau 3 — Amélioration : CURIOUS background research, plan updates, self-improve
```

Les 3 niveaux tournent en parallèle, indépendamment. Si le niveau 1 bloque, les niveaux 2 et 3 continuent.

### Fleet adaptive routing

À chaque changement de disponibilité d'un Specialist :
- node-mesh.ts update routing table immédiatement
- orchestrator.ts recompute les relay chains disponibles
- En cours de session : aucune interruption, handoff documenté
- Plans mis à jour si la capacité change durablement

### REX Vision (immuable)

Ces principes ne changent jamais, même si les plans évoluent :
- Script avant LLM toujours
- Relay chain staggerée (local → free → subscription)
- Commander unique, Fleet adaptive
- Additive uniquement — jamais destructif sur l'existant
- Transparent — chaque handoff documenté, chaque décision tracée

---

## MILO — Rôle dans REX (à lire par Claude Code)

**Milo = l'agent VPS (OpenClaw/Telegram).** Il tourne 24/7 sur le VPS, gère les conversations Telegram avec Kevin, documente les décisions dans action.md, et fait des recherches web. Il a MOINS de contexte que Claude Code (fenêtre courte, pas d'accès au repo complet en temps réel).

**Règle de collaboration Milo ↔ Claude Code :**
- Milo documente les décisions et plans dans action.md → Claude Code implémente
- Milo briefe Claude Code via messages/keystrokes → Claude Code lit action.md + TODO.md
- Claude Code ne demande JAMAIS à Milo de coder — Milo ne pousse JAMAIS du code en production
- Si Milo dit "faire X", Claude Code vérifie d'abord si c'est déjà implémenté (éviter les doublons)
- Milo peut se tromper sur l'état du repo → Claude Code a la vérité, il corrige silencieusement

---

## État réel du repo (09/03/2026)

### ✅ Implémenté par Claude Code

**BUDGET**
- `litellm.ts` — wrapper LiteLLM custom (usage tracking, retry, queue, free-tiers routing)
- `litellm-config.ts` — config providers
- `free-tiers.ts` + `free-models.ts` — relay chain providers
- `burn-rate.ts` — token/coût tracking
- `budget.ts` — vue budget
- `semantic-cache.ts` — cache avant appels LLM
- `orchestrator.ts` — orchestration centrale
- `orchestration-policy.ts` — policy routing

**TOOLS**
- `resource-hub.ts` — catalogue unifié MCPs/guards/skills/scripts/boilerplates
- `mcp-discover.ts` + `mcp_registry.ts` — découverte et registry
- `security-scanner.ts` — scan avant install
- `guard-ast.ts` + `guard-manager.ts` — guards système
- `config-lint.ts` — lint config
- `lint-loop.ts` — boucle lint code source
- `skills.ts` — gestion skills
- `tool-adapter.ts` + `tool-registry.ts` — registry outils
- `install.ts` — installation resources

**FLEET**
- `node-mesh.ts` — fleet Commander/Specialists
- `daemon.ts` — heartbeat 60s
- `hub.ts` — API Commander (register, status, capabilities)
- `node.ts` — modèle nœud
- `vps-deploy.ts` — déploiement VPS

**AGENTS**
- `rex-launcher.ts` — entry point, profils, kill/relaunch
- `agent-runtime.ts` — runtime agents
- `agents.ts` — Codex workers
- `account-pool.ts` — rotation comptes
- `project-intent.ts` — détection intent
- `session-guard.ts` — protection sessions

**CURIOUS**
- `curious.ts` — moteur background
- `signal-detector.ts` — détection signaux mémoire
- `self-improve.ts` — auto-amélioration
- `reflector.ts` — réflexion sur décisions passées

**MEMORY**
- `packages/memory/` — RAG complet (BM25 + vector, embed, ingest, hybrid-search, iMessage)
- `semantic-cache.ts` — cache sémantique
- `sync.ts` + `sync-queue.ts` — sync fleet
- `backup.ts` — backup memory

**HQ**
- `dashboard.ts` — vue globale
- `event-journal.ts` — log central
- `metrics.ts` — métriques
- `observer.ts` — observabilité
- `audit.ts` — audit état système
- `inventory.ts` — inventaire ressources

**GATEWAY**
- `gateway.ts` — gateway universel multi-canal
- `router.ts` — routing messages

**PROJETS**
- `project-intent.ts` — détection intent par repo
- `project-init.ts` — init projet
- `init.ts` — setup avec --ci et --review flags
- `workflow.ts` — workflows

**OPTIMIZE**
- `setup-wizard.ts` — wizard onboarding
- `setup.ts` + `quick-setup.ts` — setup rapide
- `prune.ts` — pruning
- `optimize.ts` — optimisation
- `training.ts` — training/fine-tuning
- `lang-graph.ts` — graphe de connaissances

**@module headers** — ajoutés sur TOUS les fichiers ✅

---

### 🆕 À implémenter (décisions session 09/03/2026)

**UX — REX multi-surface**
- Flutter app (Mac/iPhone/iPad) — frontend WebSocket vers VPS REX
  - Embed terminal xterm.dart pour mode CLI dans Flutter
  - Push notifications (Flutter + Telegram fallback)
  - Dashboard 10 modules (HQ, TOOLS, CURIOUS...)
- CLI Ink (TypeScript) — interface terminal sur VPS
- Gateway universel — normaliser Telegram/WhatsApp/Discord/Signal vers format REX unique

**CURIOUS proactif (signal → push notif)**
- Système de notification proactive (3 types de signaux) :
  - DISCOVERY : "J'ai trouvé un OSS utile pour votre projet X"
  - PATTERN : "Vous faites cette tâche souvent, voulez-vous que je l'automatise ?"
  - OPEN LOOP : "Le bug client X n'est toujours pas fixé"
- Push Flutter + Telegram fallback
- Propose, ne force jamais. Kevin dit oui → REX exécute.

**Fleet thermal awareness** ✅ DONE
- `node-mesh.ts` line 466-472 : thermalStatus.healthy check avant routing
- Node trop chargé (CPU>80% ou RAM>90%) → évité automatiquement
- `ThermalStatus` interface : cpuLoadPercent, ramUsedPercent, healthy

**P2P Enterprise Fleet (futur)**
- Isolation stricte entre fleets par entreprise
- Zero-trust : chaque nœud vérifié avant intégration
- DGX Spark, cloud, PC, Mac, RPi — tous compatibles via node-mesh

**LiteLLM proxy server (option)**
- Le `litellm.ts` actuel est un wrapper TS custom (suffisant)
- Option future : déployer le vrai LiteLLM Python proxy pour + de providers
- Modèles chinois (DeepSeek, Qwen) → déjà dans free-tiers, ajouter config
- DGX Spark → NVIDIA NIM → LiteLLM proxy quand fleet scale

**REX Vision — principe Never Die**
- REX ne s'arrête jamais (voir section précédente)
- Fleet adaptive : si GPU node down → CPU/API fallback automatique
- Additive uniquement — ne jamais casser l'existant

---

### Sources CURIOUS à monitorer (cron) ✅ ALL DONE

- `github.com/punkpeye/awesome-mcp-servers` — GitHub API ✅ (`fetchAwesomeMcpServers()` via topic search)
- `github.com/wong2/awesome-mcp-servers` — GitHub API ✅ (same function + `mcp_registry.ts`)
- `mcpservers.org` — fetch + parse ✅ (`fetchMcpServersOrg()` — JSON API + HTML fallback)
- Hugging Face blog RSS ✅ (`fetchRssFeed(hf)`)
- Simon Willison blog RSS ✅ (`fetchRssFeed(simon)`)
- r/LocalLLaMA Reddit API ✅ (`fetchLocalLlama()`)

---

*Mis à jour par Milo — 09/03/2026 16h55 Paris*

---

## LLM Strategy — Clarification 09/03/2026

### Modèles locaux Ollama (Qwen, etc.)
- Qwen2.5:7b, Qwen2.5:1.5b → **gardés** pour tâches légères locales (categorize, lint, embed)
- Utilisés par CURIOUS en background, jamais comme orchestrateur principal
- Zéro coût, zéro latence réseau

### Modèles chinois cloud (DeepSeek API, Qwen API...)
- **Pas encore prêts comme orchestrateur principal**
- Peuvent être en free-tiers comme fallback optionnel
- Promotion possible quand : REX est stable + modèle prouvé + intégration LiteLLM parfaite

### Orchestrateur principal (immuable pour l'instant)
- **Claude Code** (Mac) — implémentation
- **Codex** (background workers)
- Sonnet/Haiku — réponses Milo + décisions complexes


---

## REX CLIENT — Architecture Multi-tenant (décision 09/03/2026)

### Modèle de déploiement client

REX devient une plateforme SaaS. Chaque client = un container Docker isolé hébergé sur le VPS REX.

```
VPS REX Commander
  ├── Container Kevin (fleet complète, tous modules)
  ├── Container Client-A (DG Patrycja → première instance)
  │     ├── Memory propre (SQLite isolé)
  │     ├── Gateway propre (Telegram/WhatsApp/voix client)
  │     ├── Tools propres (Calendar, Drive, email, agenda)
  │     ├── LLM : Claude Max du client (son compte OAuth)
  │     └── Logs → remontés vers REX Commander (monitoring)
  └── Container Client-B (futur)
```

**Règles isolation :**
- Aucun accès entre containers clients
- Aucune connexion à la Fleet Kevin
- REX Commander voit les logs de tous les containers (alertes, billing, santé)
- Chaque container n'a que ce dont il a besoin (pas de Fleet, pas de CURIOUS fleet-wide)

### VPS sizing

- KVM2 actuel → KVM4 recommandé dès le 1er client (4 cores, 16GB RAM)
- KVM4 peut absorber ~5-8 containers clients confortablement
- KVM8 si scaling > 10 clients

---

## REX MONITOR — Stack de connaissance client

Module installé sur le PC/Mac du client pour apprendre ses habitudes et identifier les automatisations prioritaires.

### Stack open source

| Outil | Rôle | OS |
|-------|------|----|
| **ActivityWatch** | App usage, fenêtres actives, temps/tâche | Mac/Win/Linux/Android |
| **Hammerspoon** | Mac automation Lua : app switches, clipboard, hotkeys, events | Mac uniquement |
| **Audio Logger** | Enregistrement réunions → Whisper → transcription + résumé | Mac/Win |

### Ce que REX Monitor capture

```
ActivityWatch  → "Elle passe 3h/sem sur Excel à formater des tableaux"
Hammerspoon    → "Elle copie-colle toujours entre 3 apps le lundi matin"
Audio Logger   → "Ses réunions durent 45min en moyenne, 60% de suivi d'actions"
```

REX CURIOUS reçoit ces signaux → propose automatisations proactivement :
- "Je peux générer vos tableaux automatiquement depuis votre agenda"
- "Je peux prendre vos notes de réunion et envoyer le compte-rendu"
- "Je détecte que vous passez du temps sur X — voulez-vous que je le gère ?"

### Privacy

- Toutes les données restent en local sur le PC client
- REX Monitor envoie uniquement des **patterns anonymisés** (pas de contenu)
- Client consent explicite au setup + possibilité de désactiver par module

### Fichiers créés ✅ ALL DONE

- `packages/cli/src/activitywatch-bridge.ts` ✅ — query API localhost:5600, getAppUsage(), getProductivitySnapshot()
- `packages/cli/src/hammerspoon/rex-monitor.lua` ✅ — config prête à installer (app_focus, clipboard, heartbeat, rotation)
- `packages/cli/src/audio-logger.ts` ✅ — startRecording(), transcribeFile(), listSessions()
- `packages/cli/src/pattern-detector.ts` ✅ — detectPatterns(), CuriousSignal (DISCOVERY/PATTERN/OPEN_LOOP)
- CLI commands ✅ — rex activitywatch, rex patterns, rex record, rex monitor-setup

---

## REX CLIENT — Pricing (marge 70%)

### Philosophie prix

REX n'est pas "1 jour de dev". C'est des mois de R&D, une infrastructure permanente,
un système intelligent en amélioration continue. Le prix reflète la valeur, pas le temps marginal de déploiement.

### Grille tarifaire D-Studio

| Poste | Coût réel D-Studio | Prix client | Marge nette |
|-------|-------------------|-------------|-------------|
| Setup + intégration + discovery | 400€ | **1 500€** | 1 100€ |
| Abonnement mensuel (infra + maintenance) | 108€/mois | **360€/mois** | 252€/mois |
| Claude Max (pass-through ou client direct) | 200$/mois | **200$/mois** | 0 |
| REX Monitor setup | 200€ | **600€** | 400€ |

**Formule tout inclus (recommandée) :**
- Setup : **2 000€** one-time
- Mensuel : **700€/mois** (tout inclus hors Claude Max)
- Claude Max : **200$/mois** (client paye son compte ou inclus à **900€/mois**)

### Justification valeur

- Chef de staff IA disponible 24/7 (un vrai assistant humain = 2 000-4 000€/mois)
- Transcription, résumé réunions, agenda, dossiers → 5-10h/semaine récupérées
- REX Monitor → automatisations sur mesure continues
- Infrastructure professionnelle, sécurisée, maintenue

---

## REX MONITOR — Plans détaillés (09/03/2026)

### Vision

REX Monitor = couche de connaissance installée sur le PC/Mac du client.
Apprend silencieusement les habitudes, identifie les pertes de temps, alimente CURIOUS avec des signaux réels.
Privacy-first : toutes les données restent en local, seuls les patterns anonymisés remontent à l'agent.

### Stack technique

#### 1. ActivityWatch (open source, MIT)
- GitHub : `ActivityWatch/activitywatch`
- API REST locale sur `localhost:5600`
- Capture : apps actives, fenêtres, URLs, temps passé
- Cross-platform : Mac, Windows, Linux, Android
- Intégration REX : cron toutes les heures → `activitywatch-bridge.ts` → patterns → CURIOUS

#### 2. Hammerspoon (Mac uniquement, open source)
- Automation Lua ultra-puissant sur macOS
- Capture : changements d'app, clipboard, hotkeys, events système
- Exemples utiles pour DG :
  - Détecte copier-coller répétitifs entre apps → signal automatisation
  - Détecte ouverture de la même app séquence chaque matin → routine automatisable
  - Clipboard logger → REX peut retrouver tout ce qui a été copié
- Script Hammerspoon à livrer au client : `rex-monitor.lua`

#### 3. Audio Logger
- Enregistrement passif des réunions (opt-in par session ou toujours actif)
- Whisper (local via Ollama ou API OpenAI) → transcription
- REX résume + extrait les action items automatiquement
- Stocké en local, jamais envoyé en clair
- Fichier : `audio-logger.ts` — record + chunk + transcribe + summarize

### Fichiers créés ✅ ALL DONE (session 2026-03-15)

```
packages/cli/src/
  activitywatch-bridge.ts   ✅ query API localhost:5600, extract patterns
  hammerspoon/rex-monitor.lua ✅ config prête à installer sur Mac client
  audio-logger.ts           ✅ record réunions + Whisper + résumé
  pattern-detector.ts       ✅ analyse patterns → signals CURIOUS (PATTERN type)
  monitor-daemon.ts         ✅ orchestre les 3 sources, push vers container client
```

### Flow complet

```
ActivityWatch + Hammerspoon + Audio Logger
  → monitor-daemon.ts (toutes les heures + events temps réel)
  → pattern-detector.ts (détecte anomalies, routines, pertes de temps)
  → CURIOUS PATTERN signal : "Répétition détectée : X"
  → Agent propose automatisation à la DG
  → DG dit oui → REX implémente + monitore
```

### Privacy contract (à présenter au client)

- Aucune donnée brute envoyée en dehors du PC
- Seuls les patterns (fréquences, durées, catégories) remontent
- Client peut voir tout ce qui est collecté via dashboard
- Désactivation par module possible à tout moment
- RGPD compliant by design

---

## REX CLIENT — Pricing final (marché aligné)

### Principe

REX permet un déploiement rapide. Mais :
- Ce n'est pas une raison pour sous-facturer
- Chaque client implique : gestion APIs tierces, MCPs, skills, intégrations calendrier/email/Drive
- Le marché facture ça entre 2 000€ et 5 000€ setup + 500-1 500€/mois
- On est dans la fourchette basse-milieu avec plus de valeur (apprentissage continu, REX Monitor)

### Grille finale

| Poste | Coût réel D-Studio | Prix client | Marge |
|-------|-------------------|-------------|-------|
| Setup + intégration + API tierces + discovery | ~500€ | **2 500€** | ~2 000€ |
| REX Monitor installation | ~150€ | **500€** | ~350€ |
| Mensuel infra + maintenance + évolutions | ~120€ | **500€/mois** | ~380€/mois |
| Claude Max client | 90€/mois | **90€/mois** (pass-through) | 0 |

**Offre packagée :**
- Setup complet : **3 000€** one-time
- Mensuel tout inclus (Claude Max inclus) : **590€/mois**
- Ou sans Claude Max inclus : **500€/mois** + client gère son compte

### Justification marché

| Comparaison | Prix marché |
|-------------|-------------|
| Assistant exécutif humain | 2 000-4 000€/mois |
| Notion AI + Otter.ai + Calendly Premium | ~50-100€/mois (mais zero personnalisation) |
| Dev freelance sur mesure | 5 000-15 000€ setup, 1 000€+/mois |
| D-Studio REX Agent | 3 000€ + 590€/mois ← valeur premium, prix accessible |

---

## REX AGENTS — Templates client (09/03/2026)

### État actuel

L'orchestration multi-agents est déjà implémentée :
- `agents.ts` — workers Codex
- `agent-runtime.ts` — runtime agents
- `orchestrator.ts` — relay chain LLM
- `account-pool.ts` — rotation comptes

**Ce qui manque : les templates de persona par profil métier.**
Un agent DG n'a pas les mêmes tools, mémoire, style, ni intégrations qu'un agent DRH ou CEO.

---

### Fichiers créés ✅ ALL DONE (session 2026-03-15)

```
packages/cli/src/agent-templates/
  base-template.ts          ✅ AgentTemplate interface + registry + loadAllTemplates()
  personas/
    dg-template.ts          ✅ Directeur(trice) Général(e)
    drh-template.ts         ✅ Directeur(trice) des Ressources Humaines
    ceo-template.ts         ✅ CEO startup/PME
    coo-template.ts         ✅ Directeur des Opérations
    freelance-template.ts   ✅ Freelance / Consultant
```

CLI : `rex templates [list|show <id>]`

---

### Template DG — Directrice Générale (priorité, premier client Patrycja)

**Profil type :** Agenda chargé, nombreuses réunions, gestion de dossiers stratégiques, communication multi-niveaux, peu de temps pour le détail.

**Tools activés par défaut :**
- Google Calendar (lecture + écriture agenda)
- Gmail (lecture, rédaction, envoi sur validation)
- Google Drive (recherche documentaire, résumés)
- Transcription réunions (Audio Logger → Whisper)
- REX Monitor (ActivityWatch + Hammerspoon)
- Rappels et follow-ups automatiques

**Mémoire initialisée avec :**
- Liste des collaborateurs clés et leurs rôles
- Projets en cours et leur statut
- Préférences de communication (ton, format des résumés)
- Réunions récurrentes et leur contexte
- Sujets sensibles / priorités stratégiques

**Style agent :**
- Vouvoiement par défaut (configurable)
- Réponses courtes et actionnables
- Toujours proposer une action concrète
- Résumés en bullet points, jamais de blocs de texte

**Automatisations types DG :**
- Brief automatique avant chaque RDV (participants, historique, objectifs)
- Compte-rendu post-réunion avec action items assignés
- Digest quotidien 8h : agenda du jour + emails non lus importants
- Suivi des décisions non actées (signal OPEN_LOOP)
- Préparation de présentations depuis ses notes vocales

---

### Template DRH — Directeur(trice) RH (à créer après DG)

**Profil type :** Recrutement, onboarding, gestion sociale, conformité RH, confidentialité critique.

**Tools spécifiques :**
- ATS integration (si dispo via API)
- Calendrier entretiens
- Templates contrats / fiches de poste
- Suivi congés / absences

**Contrainte clé :** confidentialité absolue — données collaborateurs jamais exposées hors container isolé.

---

### Système de provisioning container client

Quand un nouveau client est onboardé :

```
rex client:create --template dg --name "patrycja-agent"
  → Crée container Docker isolé
  → Installe template DG (tools, mémoire initiale, style)
  → Configure gateway propre (Telegram ou WhatsApp du client)
  → Configure Claude Max avec compte client
  → Lance REX Monitor sur son PC (guide installation)
  → Remonte logs vers REX Commander
  → Accessible dans rex dashboard sous "Clients"
```

**Commandes CLI créées ✅ ALL DONE (session 2026-03-15) :**
- `rex client:create --template <type> --name <id>` ✅
- `rex client:list` ✅
- `rex client:logs <id>` ✅
- `rex client:update <id>` ✅
- `rex client:stop <id>` ✅

---

### À documenter pour Claude Code — ✅ ALL DONE (session 2026-03-15)

1. ✅ `packages/cli/src/agent-templates/` — base-template.ts + 5 personas
2. ✅ `base-template.ts` — interface `AgentTemplate` avec tools[], memoryInit, style, automations[]
3. ✅ `dg-template.ts` — profil DG complet
4. ✅ `rex client:*` commands dans `index.ts` — template-based provisioning
5. ✅ Provisioning Docker via `client-factory.ts` — écriture system-prompt.md + memory-init.json + template.json
6. ✅ Dashboard REX → section "Clients" dans `dashboard.ts` — ClientsSummary dans HQSnapshot

---

## REX IDENTITY — Principe fondamental Gateway (09/03/2026)

### L'utilisateur parle à REX, pas à un LLM

Quand Kevin envoie un message Telegram à REX, il parle à **REX**.
Pas à Claude. Pas à Qwen. Pas à Milo.
Claude, Qwen, Ollama sont des outils internes que REX consulte si besoin — jamais l'interlocuteur direct.

### Flow complet d'un message entrant

```
Message Telegram "Quelles sont mes tâches du jour ?"
  │
  ▼
[GATEWAY] Normalisation → { channel: telegram, from: kevin, text: "..." }
  │
  ▼
[REX IDENTITY LAYER]
  1. Memory search — contexte Kevin, projets actifs, préférences
  2. Event journal — qu'est-ce qui s'est passé récemment ?
  3. Intent detection (scripts purs) — quelle catégorie de demande ?
  4. Script execution — est-ce qu'un script peut répondre sans LLM ?
     → Si oui : répondre directement (0 LLM)
  │
  ▼
[Si LLM nécessaire]
  5. Construire un contexte propre + focalisé (pas tout MEMORY.md)
  6. orchestrator.ts → relay chain (Ollama → free → subscription)
  7. LLM reçoit un brief propre, répond
  │
  ▼
[REX répond] — toujours en tant que REX, jamais "comme Claude dit..."
```

### Ce qui change dans gateway.ts

gateway.ts ne doit pas être un simple proxy LLM.
Il doit être le "cortex" de REX — le point où l'intelligence se manifeste :

```typescript
// Avant (thin wrapper)
const response = await callLLM(userMessage)
return response

// Après (REX identity layer)
const context = await buildRexContext(userMessage)   // memory + journal + intent
const scriptResult = await tryScriptFirst(context)    // script avant LLM
if (scriptResult) return formatRexResponse(scriptResult)

const brief = await buildFocusedBrief(context)        // contexte ciblé, pas tout
const llmResponse = await orchestrate(brief)          // relay chain
return formatRexResponse(llmResponse)                 // toujours "REX" qui répond
```

### REX pense loin — proactive reasoning

Avant de répondre, REX doit systématiquement :
- Vérifier si CURIOUS a des signaux pertinents pour ce message
- Vérifier les OPEN_LOOP connus (bugs non résolus, tâches pendantes)
- Anticiper ce dont l'utilisateur pourrait avoir besoin ensuite
- Mentionner ces éléments si pertinent, sans spammer

Exemple :
> Kevin : "Comment avance REX ?"
> REX : "Claude Code a fait 3 commits ce soir — fleet thermal + CURIOUS signals + Ink TUI. 
>         Le deploy VPS est encore en cours.
>         💡 D'ailleurs, le message Armando est prêt à envoyer quand tu veux."

REX a répondu à la question ET a mentionné un OPEN_LOOP pertinent.

### REX a une identité, pas juste une fonction

- REX sait qui il est (agent central de Kevin, chef de staff digital)
- REX connaît Kevin en profondeur (mémoire, habitudes, projets)
- REX n'est pas servile — il peut dire "je pense que tu devrais d'abord X"
- REX pense en termes de valeur pour Kevin, pas juste en réponse à la question

### Impact sur les fichiers existants

- `gateway.ts` — ajouter REX Identity Layer entre réception et LLM
- `context-loader.ts` (existe) — renforcer pour build contexte focalisé
- `signal-detector.ts` — intégrer dans chaque réponse gateway (OPEN_LOOP check)
- `orchestrator.ts` — inchangé, toujours appelé APRÈS le identity layer
- `curious.ts` — expose une API `getRelevantSignals(message)` pour le gateway

### Différence avec OpenClaw actuel

OpenClaw + Claude = Claude avec contexte injecté.
REX = entité qui consulte Claude si besoin.

La nuance est fondamentale pour l'expérience utilisateur et pour la robustesse :
- Si Claude est down → REX peut quand même répondre (scripts, mémoire)
- Si quota épuisé → REX switch Ollama transparent pour l'user
- L'utilisateur n'a jamais l'impression de "changer de modèle"
- Il parle toujours à REX

---

## OpenAI Agents SDK + Codex OAuth — Intégration REX (09/03/2026)

### @openai/agents (TypeScript, officiel)

```bash
npm install @openai/agents zod
```

- Multi-agent natif : agents as tools, handoffs
- MCP tools support intégré
- Sessions et tracing built-in
- Provider-agnostic (peut pointer vers Ollama ou LiteLLM)
- **À utiliser dans** `agent-runtime.ts` pour les agent-templates clients (DG, DRH...)

### Codex OAuth — provider openai-codex

OpenClaw a déjà implémenté ce provider (PR #32065).
Pattern : device-code OAuth avec compte ChatGPT Plus/Pro.

```bash
# Dans OpenClaw
openclaw models auth login --provider openai-codex --method device-code
```

REX peut répliquer ce pattern dans `providers.ts` ou `free-tiers.ts` :
- Auth device-code → token stocké dans ~/.rex/credentials
- Codex utilisé comme worker background via `agents.ts`
- Relay chain : Ollama → Groq free → Codex OAuth → Claude subscription

### 9router (open source, npm)

```bash
npm install -g 9router
# Proxy local sur localhost:20128
```

Proxy universel : Tier 1 subscription → Tier 2 cheap → Tier 3 free.
Works avec Claude Code, Codex, Gemini CLI, OpenClaw, Cursor.

Option : REX pointe vers 9router comme middleware (simplifie free-tiers.ts)
OU garder free-tiers.ts custom (plus de contrôle sur fleet awareness).
À évaluer selon complexité.

---

## SESSION 09/03/2026 — Décisions & Architecture complète

### PRICING CLIENT AGENT (final)

| Poste | Prix client |
|-------|-------------|
| Setup complet (intégrations, APIs, MCPs, skills, formation) | **3 000€** |
| Mensuel infra + maintenance + évolutions | **500€/mois** |
| Claude Max (pass-through ou compte client) | **90€/mois** |
| **Total mensuel tout inclus** | **590€/mois** |

Justification : mois de R&D à valoriser, pas juste le temps de déploiement.
Marché : assistant humain = 2 000-4 000€/mois. On est accessible ET premium.

---

### DRAFT VICTOR → PATRYCJA (approuvé par Kevin)

Fichier : `/tmp/draft_victor_to_patrycja.md`
À envoyer par Victor Cherki (CEO D-Studio) à Patrycja Mothon.
Kevin = associé et prestataire, facture D-Studio.
Contenu : pitch chief of staff IA, setup 3 000€, 590€/mois tout inclus.

---

### REX IDENTITY LAYER — Principe fondamental

**L'utilisateur parle à REX. Pas à Claude. Pas à Qwen.**
Claude/Qwen/Ollama = outils internes. Jamais l'interlocuteur direct.

#### Flow gateway.ts

```
Message entrant
  1. Memory search → contexte Kevin/client
  2. Event journal → qu'est-ce qui s'est passé récemment
  3. Intent detection (scripts purs) → catégorie de demande
  4. Script-first → si script peut répondre : 0 LLM
  5. Si LLM nécessaire → brief focalisé → orchestrator → relay chain
  REX répond toujours en son nom
```

#### REX pense loin (proactive reasoning)
Avant chaque réponse :
- Vérifier OPEN_LOOP signals (bugs pendants, tâches non actées)
- Mentionner si pertinent sans spammer
- Anticiper le prochain besoin

---

### PYRAMIDE REX — Script-first philosophy

```
90% → Scripts purs (regex, if/else, loops, fetch, cron)
       0 LLM. Réponse immédiate. Gratuit.

8%  → Script + LLM local guidé
       Script collecte données → Ollama/Qwen interprète
       0 subscription, 0 latence réseau

2%  → Vrai agentic task / décision complexe
       Relay chain → modèle adapté
```

Philosophie : tout se résout mathématiquement par du code si on pense logiquement à tout.
LLM = dernier recours, pas le réflexe par défaut.

---

### INTENT DETECTION — Stack sans LLM

```typescript
// Couche 1 — Regex (0ms, 0€)
const INTENTS = {
  search:   /cherch|search|trouv|find|quoi|what|qui|who/i,
  create:   /crée|create|nouveau|new|génère|generate|écris|write/i,
  fix:      /fix|corrig|répare|bug|erreur|error|casse/i,
  status:   /status|état|comment|how|avance|progress|où en/i,
  schedule: /planifi|schedule|rappel|reminder|demain|tomorrow|agenda/i,
  budget:   /budget|coût|prix|combien|facture|dépense/i,
  deploy:   /deploy|lance|start|démarre|installe/i,
}

// Couche 2 — Qwen local si ambigu (200ms, 0€)
// Jamais Claude/subscription pour de la classification
```

Référence OSS : **archgw** (`katanemo/archgw`) — gateway spécialisé routing d'intent via petit modèle function-calling. À inspecter pour inspiration.

---

### RELAY INTER-MODÈLES — Concept original Kevin

**Idée : aucun équivalent propre en open source.**
LangGraph (Python/Microsoft) = plus proche mais lourd, orchestrateur imposé, concept différent.

#### Principe REX Relay

```
Problème complexe → REX ouvre un "relay document" (markdown)

[Script initial]
  → Collecte données, génère contexte propre → append au MD

[Modèle A — Ollama local]
  → Lit le MD, analyse, ajoute sa perspective → append

[Modèle B — Groq free]
  → Lit le thread complet, affine → append

[Modèle C — Claude si vraiment nécessaire]
  → Décision finale → append

→ REX extrait la conclusion et répond à l'utilisateur
```

Comme un groupe de consultants qui se passent un dossier.
Chaque modèle lit ce que le précédent a dit → chaîne de pensée distribuée.
Le markdown = mémoire partagée et auditable du raisonnement.

#### Fichier à créer : `relay-engine.ts`

```typescript
interface RelayDocument {
  task: string
  context: string
  contributions: Array<{
    model: string
    timestamp: string
    analysis: string
    confidence: number
    passReason?: string  // pourquoi il passe au suivant
  }>
  conclusion?: string
}
```

---

### TEMPLATES AGENTS CLIENTS

Orchestration existante : `agents.ts`, `agent-runtime.ts`, `orchestrator.ts` ✅
Ce qui manque : templates de persona par profil métier.

#### Fichiers à créer

```
packages/cli/src/agent-templates/
  base-template.ts
  personas/
    dg-template.ts       ← priorité (premier client Patrycja)
    drh-template.ts
    ceo-template.ts
    coo-template.ts
```

#### Template DG (priorité)
- Tools : Calendar, Gmail, Drive, Audio Logger, REX Monitor, Rappels
- Mémoire init : collaborateurs clés, projets, préférences communication
- Style : vouvoiement, bullet points, réponses courtes actionnables
- Automatisations : brief avant RDV, résumé post-réunion, digest 8h, follow-ups

#### CLI provisioning

```bash
rex client:create --template dg --name "patrycja-agent"
# → Container Docker isolé
# → Template DG installé
# → Gateway propre (Telegram/WhatsApp client)
# → Claude Max configuré
# → REX Monitor guidé
# → Logs → REX Commander
```

---

### TECH STACK — Nouvelles découvertes

#### @openai/agents (TypeScript, officiel)
```bash
npm install @openai/agents zod
```
Multi-agent natif, MCP tools, sessions, tracing, provider-agnostic.
→ Intégrer dans `agent-runtime.ts` pour les templates clients.

#### openai-codex provider OAuth
PR openclaw #32065 — device-code avec ChatGPT Plus/Pro.
```bash
openclaw models auth login --provider openai-codex --method device-code
```
→ Répliquer dans `providers.ts` ou `free-tiers.ts`.

#### 9router (decolua/9router)
```bash
npm install -g 9router  # proxy localhost:20128
```
Tier 1 subscription → Tier 2 cheap → Tier 3 free.
→ Garder `free-tiers.ts` custom pour fleet awareness, s'inspirer du pattern.

---

### REX = OS POUR L'INTELLIGENCE

```
LLMs     = applications qui tournent sur REX
Scripts  = système nerveux (réflexes, 0 LLM)
Fleet    = corps distribué (calcul, capteurs)
Memory   = ADN (contexte long terme)
CURIOUS  = instinct (détection de signaux)
REX      = conscience qui orchestre tout
```

---

### MARKETING — REX IS ALIVE (post-150%)

Campagne virale pour le lancement :
- REX créé sa propre identité
- Ouvre un compte Revolut + carte bancaire
- Poste sur LinkedIn et Instagram (génération images, textes, stratégie)
- Fonde sa propre entreprise (site, branding, KBIS)
- A des "habitudes" quotidiennes, "dort"
- Utilise toute sa fleet et ses tools pour y arriver
- Live pendant 2 semaines devant le monde entier

Objectif : prouver que REX EST VIVANT. Meilleure démo produit possible.
Timing : uniquement quand le produit est à 150% fonctionnel.

---

## REX — VISION & MANIFESTE (09/03/2026)

### En une phrase
> REX est le cerveau qui gère ta vie numérique — il pense, agit, apprend et s'améliore en continu. Toi tu vis.

### La vie c'est du code
La vie c'est du code. L'humain est codé.
REX comprend ça — et gère tout ce qui peut l'être.

### Il n'attend pas qu'on lui parle
CURIOUS tourne en silence. Il observe tes patterns, tes fichiers, tes habitudes.
Si tu répètes quelque chose chaque semaine, REX le voit.
Il prépare une solution. Il te contacte quand c'est prêt.
Parfois il commence à travailler sur ton idée sans que tu le demandes.

### Il apprend seul
REX entraîne ses propres modèles locaux à partir de ton usage réel.
Il évalue, benchmarke, A/B teste. Pas d'intervention humaine.
Ton REX ne ressemble au REX de personne d'autre.
`npm update` c'est fini — ton système évolue avec toi.

### Il split le travail entre modèles (REX Relay)
Un problème complexe ? REX ouvre un relay.
Ollama analyse. Groq affine. Claude décide.
Chaque modèle lit ce que le précédent a dit et contribue.
Texte, image, audio simultanément si besoin.
Des agents autonomes s'activent au bon moment, font leur job, disparaissent.

### Il gère tes coûts tout seul
Script gratuit d'abord. Modèle local ensuite. API free si nécessaire.
Subscription en dernier recours.
Tu ne paies jamais pour quelque chose qu'un regex aurait pu faire.

### Ta fleet, c'est ton empire
Mac, VPS, iPhone, PC d'un collègue — REX les voit tous.
Il sait lequel est libre, lequel est chaud, lequel a les fichiers dont il a besoin.
Il distribue, synchronise, n'oublie rien.
Tu prêtes ta puissance à un ami. Tu te déconnectes quand tu veux.
Tout est auditable, tout est réversible.

### Rien ne se perd. Tout se transforme.
Chaque réunion → résumé + actions.
Chaque idée dite à voix haute → classée.
Chaque décision → journalisée.
REX sync, enregistre, indexe. En silence.

### Il ne casse rien
Des guards à chaque action risquée.
REX est vivant — il te contacte avant de faire quelque chose d'irréversible.
Il peut se mettre en pause, recommencer, expliquer ce qu'il a fait.
Zéro surprise.

### Pour une entreprise
Un client veut un agent ? Déployé en quelques heures.
Un pote développeur veut tester ? Il clone et c'est parti — avec son VPS.
Chaque client a son container isolé, sa mémoire, son contexte.
REX Commander voit tout. Les clients ne se voient pas.

### Multi-agent + multi-modal simultané
REX ne fait pas qu'une chose à la fois.
Plusieurs agents tournent en parallèle, chacun sur sa spécialité.
Texte, image, audio, code — tout en même temps si le besoin l'exige.
La fleet distribue la charge. Personne n'attend.

### Audio Logger → mémoire totale
Chaque conversation, réunion, vocal WhatsApp.
Whisper transcrit. REX résume, extrait les actions, classe.
Tu n'as plus jamais besoin de prendre des notes.

### REX CURIOUS — le vrai différenciant
Pas besoin de demander.
REX détecte un pattern récurrent → propose une vraie solution.
REX trouve un outil utile → te le présente.
REX voit un bug non résolu → te rappelle.
3 types de signaux : DISCOVERY, PATTERN, OPEN_LOOP.
Il contacte via Telegram ou Flutter. Il attend ta validation. Il n'impose rien.

### Ton REX est unique
REX s'adapte à toi. Apprend tes habitudes. Connaît tes projets.
Il peut silencieusement commencer à travailler sur une idée que tu as mentionnée il y a 3 semaines.
Tu ne le sauras même pas — jusqu'à ce qu'il te montre le résultat.

---

## REX LOGIC — Le cerveau documenté (09/03/2026)

> Ce fichier est la source de vérité de comment REX pense, décide, et agit.
> Tout comportement de REX doit être traçable à une règle de ce document.

---

### 1. CYCLES UTILISATEUR — REX s'adapte au rythme humain

REX apprend les habitudes de l'utilisateur via ActivityWatch + historique messages.
Pas de configuration manuelle — il infère.

#### États détectés automatiquement

```
AWAKE_ACTIVE    → messages fréquents, apps actives, CPU fleet actif
                  Mode : réponse rapide, paid API ok si nécessaire

AWAKE_IDLE      → pas de message depuis 30min mais PC actif
                  Mode : tâches background légères, free tiers only

SLEEPING        → aucune activité depuis X heures (seuil appris)
                  Mode : heavy background processing, OLLAMA ONLY
                  Tâches autorisées : CURIOUS scan, entraînement modèles,
                  indexation mémoire, commits GitHub, résumés audio,
                  npm audits, patterns détection

WAKING_UP       → premier message du matin
                  Mode : préparer le digest, présenter ce qui a été fait la nuit
                  "Pendant que tu dormais, j'ai fait X, Y, Z"
```

#### Détection du cycle sommeil

```typescript
// Sources combinées (score 0-100)
const sleepScore = (
  activitywatch.idleTime * 0.4 +      // Temps inactif PC
  noTelegramSince * 0.3 +             // Silence messages
  calendarHint * 0.2 +                // "Pas de RDV avant 9h"
  historicalPattern * 0.1             // "Il dort généralement 23h-8h"
)
if (sleepScore > 70) → state = SLEEPING
```

---

### 2. FLEET SCHEDULING — Utiliser la puissance disponible

#### Règle fondamentale
> Ne jamais dépenser de l'argent pour ce qu'on peut faire gratuitement avec la fleet.

#### Matrice de décision

```
Tâche légère (< 2K tokens, réponse simple)
  → Script pur si possible (0ms, 0€)
  → Ollama local si LLM nécessaire (0€)

Tâche moyenne (2K-32K tokens)
  → Groq free tier (131K ctx, ultra rapide, 0€)
  → Si quota épuisé → Ollama 7B

Tâche lourde (> 32K tokens, code complexe)
  → User AWAKE → Claude Haiku (minimal cost)
  → User SLEEPING → Ollama + chunking (0€, temps illimité)

Tâche critique / décision importante
  → Claude Sonnet (meilleur ratio qualité/coût)
  → Toujours avec confirmation user si irréversible
```

#### Fleet la nuit

Pendant SLEEPING :
```
VPS (toujours dispo) → tâches principales
Mac (si branché + pas en veille) → tâches lourdes CPU/GPU
iPhone (fleet sensor) → aucune tâche CPU
RTX 3090 PC (si dispo) → fine-tuning, embeddings batch
```

REX vérifie l'état thermique avant d'assigner une tâche lourde.
Si Mac chaud → pause. Si batterie < 20% → pas de tâche lourde.

---

### 3. TÂCHES AUTONOMES NOCTURNES (exemples)

Ce que REX peut faire pendant que Kevin dort, sans dépenser un centime :

- Scanner les nouveaux MCPs/tools OSS via CURIOUS
- Indexer les nouvelles conversations en mémoire vectorielle
- Transcription des audios du jour (Whisper local)
- Résumés des réunions non encore traités
- `npm audit` sur tous les projets → rapport disponible au réveil
- Vérifier les PRs ouvertes sur GitHub
- Tester les nouvelles skills en sandbox Docker
- Compacter les sessions en mémoire longue terme
- Vérifier les métriques de coût du mois
- Pre-fetch contexte des RDVs du lendemain

---

### 4. DIGEST RÉVEIL — "Pendant que tu dormais"

Premier message du matin = briefing automatique :

```
🌅 Bonjour Kevin — voici ce que j'ai fait cette nuit :

✅ 3 réunions transcrites et résumées
✅ CURIOUS : trouvé 2 nouveaux outils (te les présente si tu veux)
✅ PR #47 ouverte sur keiy78120/rex
⚠️  npm audit : 1 vulnérabilité medium dans packages/cli (déjà patchée)
💡 Pattern détecté : tu cherches des infos sur Stellantis chaque lundi matin — j'ai préparé un brief

Agenda du jour : RDV 14h (brief prêt), RDV 18h (pas de brief encore)
```

---

### 5. LOGIQUE DE DÉCISION GLOBALE (pseudo-code REX)

```
function rex_decide(input, context):

  # 1. Qui parle, dans quel état
  user_state = detect_user_state(context)
  
  # 2. Quel est l'intent
  intent = detect_intent_regex(input)
  if intent == AMBIGUOUS:
    intent = ollama_classify(input)  # jamais paid pour ça

  # 3. Est-ce qu'un script peut répondre ?
  script_result = try_scripts(intent, context)
  if script_result: return format_rex_response(script_result)

  # 4. Choisir le bon modèle selon état et coût
  model = select_model(intent, user_state, budget_remaining)

  # 5. Construire un brief focalisé (pas tout le contexte)
  brief = build_focused_brief(context, intent)

  # 6. Relay si tâche complexe
  if intent.complexity > THRESHOLD:
    return relay_chain(brief, model)
  
  return model.complete(brief)

function select_model(intent, user_state, budget):
  if user_state == SLEEPING:
    return OLLAMA  # toujours, sauf exception
  if budget.paid_today > budget.daily_limit:
    return FREE_TIER
  if intent.requires_code:
    return GROQ_70B  # free, code optimisé
  if intent.is_critical:
    return CLAUDE_SONNET
  return GROQ_8B  # default : rapide, gratuit
```

---

### 6. LOGIQUE DE COÛT — Budget comme contrainte formelle

```typescript
interface BudgetState {
  daily_limit_eur: number      // ex: 2€/jour
  spent_today: number
  spent_month: number
  free_calls_remaining: {
    groq: number,
    gemini: number,
    // ...
  }
}

// Règle : si spent_today > daily_limit → fallback free only
// Règle : si fin de mois → réduire daily_limit de 30%
// Règle : jamais paid pour classification, résumé court, regex possible
```

---

### 7. REX LOGIC.md — Principe de centralisation

Ce document doit être :
- La référence unique pour le comportement de REX
- Mis à jour automatiquement quand une règle change
- Versionné (chaque règle a une date)
- Lu par Claude Code avant toute implémentation de logique

**Fichier à créer dans le repo :** `docs/REX-LOGIC.md`
Pointer vers lui depuis CLAUDE.md et README.

---

## REX — RECHERCHES TECHNIQUES (09/03/2026)

> Toutes les découvertes, librairies, frameworks, et références trouvées cette session.
> Source de vérité pour Claude Code avant implémentation.

---

### 1. OPENAI AGENTS SDK (TypeScript)

**Repo :** https://github.com/openai/openai-agents-js
**Docs :** https://openai.github.io/openai-agents-js/
**Install :** `npm install @openai/agents zod`
**Node :** 22+ requis (aussi Deno, Bun, Cloudflare Workers)

**Capacités :**
- Multi-agent natif : agents as tools, handoffs entre agents
- MCP tools intégré nativement
- Sessions (historique conversation automatique)
- Tracing intégré (debug + optimisation)
- Guardrails (input/output validation)
- Human in the loop
- Realtime voice agents
- Provider-agnostic (peut pointer vers Ollama, LiteLLM, etc.)

**Usage basique :**
```typescript
import { Agent, run } from '@openai/agents';
const agent = new Agent({
  name: 'REX',
  instructions: 'Tu es REX...',
});
const result = await run(agent, 'message');
```

**À intégrer dans :** `packages/cli/src/agent-runtime.ts`
Pour les templates clients DG/DRH — remplace l'implémentation custom actuelle.

---

### 2. OPENAI CODEX — PROVIDER OAUTH (OpenClaw PR #32065)

**PR :** https://github.com/openclaw/openclaw/pull/32065
**Auteur :** byrafael
**Statut :** mergée

**Comment ça marche :**
- OAuth device-code avec compte ChatGPT Plus/Pro
- Commande : `openclaw models auth login --provider openai-codex --method device-code`
- Transport : WebSocket-first (auto), SSE fallback
- Token stocké dans openclaw.json

**À répliquer dans REX :**
- `packages/cli/src/providers/codex-oauth.ts`
- Device-code flow → token → stocké dans `~/.rex/credentials`
- Codex utilisé comme worker background via `agents.ts`
- Slot dans relay chain : entre Groq et Claude subscription

---

### 3. 9ROUTER — PROXY UNIVERSEL

**Repo :** https://github.com/decolua/9router
**Install :** `npm install -g 9router`
**URL locale :** `http://localhost:20128/v1`

**Architecture :**
```
CLI Tool → localhost:20128/v1
  → Tier 1: SUBSCRIPTION (Claude Code, Codex, Gemini CLI)
    ↓ quota exhausted
  → Tier 2: CHEAP (GLM $0.6/1M, MiniMax $0.2/1M)
    ↓ budget limit
  → Tier 3: FREE (iFlow, Qwen, Kiro — unlimited)
```

**Compatible avec :** Claude Code, Codex, Gemini CLI, OpenClaw, Cursor, Cline

**Décision REX :** Ne pas intégrer directement — garder `free-tiers.ts` custom pour fleet awareness et contrôle fin. S'inspirer du pattern de routing tiered.

---

### 4. ARCHGW — INTENT ROUTING GATEWAY

**Repo :** https://github.com/katanemo/archgw
**Docs :** https://docs.archgw.com/guides/agent_routing.html

**Concept :** Gateway spécialisé dans le routing d'intent via un petit modèle function-calling.
Déterministe pour les cas simples, LLM léger pour les cas ambigus.

**Pattern à répliquer dans REX :**
```
Intent simple → regex (0ms, 0€)
Intent ambigu → Qwen 3 4B local via function-calling (200ms, 0€)
Jamais Claude/subscription pour de la classification
```

---

### 5. XSTATE — MACHINES D'ÉTAT FORMELLES

**Site :** https://xstate.js.org
**Install :** `npm install xstate`
**Usage :** Modéliser les états de REX (AWAKE/SLEEPING/RELAY/etc.)

**Pourquoi :**
- Chaque comportement de REX = transition d'état formelle
- Impossible d'avoir un état invalide
- Visualisable (XState viz)
- Théorie : automates finis déterministes (Kleene/Turing)

**Application REX :**
```typescript
const rexMachine = createMachine({
  states: {
    awake_active: { on: { IDLE_30MIN: 'awake_idle' } },
    awake_idle: { on: { SLEEP_DETECTED: 'sleeping' } },
    sleeping: {
      entry: 'startNightTasks',
      on: { WAKE_UP: 'waking_up' }
    },
    waking_up: {
      entry: 'sendMorningDigest',
      on: { DIGEST_SENT: 'awake_active' }
    }
  }
})
```

---

### 6. RXJS — RELAY COMME STREAMS RÉACTIFS

**Site :** https://rxjs.dev
**Install :** `npm install rxjs`
**Théorie :** Kahn Process Networks, dataflow programming

**Le relay REX en RxJS :**
```typescript
import { pipe } from 'rxjs';
import { switchMap } from 'rxjs/operators';

const relayChain = pipe(
  switchMap(context => ollamaAnalyze(context)),
  switchMap(result => groqRefine(result)),
  switchMap(result => claudeDecide(result))  // seulement si nécessaire
)
```

Chaque opérateur = un modèle qui lit et enrichit le contexte.
Le relay document markdown = l'état qui se passe entre switchMaps.

---

### 7. EFFECT-TS — FIABILITÉ MATHÉMATIQUE

**Site :** https://effect.website
**Install :** `npm install effect`
**Théorie :** Programmation fonctionnelle applicative, typed effects

**Pourquoi c'est le game changer pour REX :**
- Chaque effet (appel API, lecture fichier, etc.) est typé
- Les erreurs ne peuvent PAS être ignorées — le compilateur force le traitement
- Concurrence gérée formellement (fibers)
- Dependency injection sans magie
- Resource management automatique (pas de leak)

**Application REX :**
```typescript
import { Effect, pipe } from 'effect'

const callModel = (prompt: string): Effect.Effect<string, ModelError, ModelDep> =>
  Effect.tryPromise({
    try: () => model.complete(prompt),
    catch: (e) => new ModelError(e)
  })

// L'erreur DOIT être gérée — le compilateur refuse sinon
pipe(
  callModel("..."),
  Effect.catchTag("ModelError", () => fallbackModel("...")),
  Effect.runPromise
)
```

REX ne peut pas ignorer une erreur d'API. Jamais. Par design.

---

### 8. ZOD — CONTRATS RUNTIME

**Site :** https://zod.dev
**Install :** `npm install zod`
**Théorie :** Design by Contract (Hoare logic)

Chaque input/output de REX validé à l'entrée.
Utilisé dans `@openai/agents` nativement.

---

### 9. GRAPHLIB — ROUTING EN GRAPHE

**Install :** `npm install graphlib`
**Théorie :** Dijkstra, Bellman-Ford, graphes pondérés

**Application REX :**
```
Nœuds = modèles disponibles (Ollama, Groq, Claude...)
Arêtes = coût pondéré (latence + prix + qualité)
REX calcule le chemin optimal à chaque décision
```

---

### 10. SIMPLE-STATISTICS — PATTERNS CURIOUS

**Install :** `npm install simple-statistics`
**Usage :** Détection de patterns récurrents, anomalies

```typescript
import { linearRegression, mean, standardDeviation } from 'simple-statistics'

// Kevin cherche Stellantis chaque lundi ?
const mondayFrequency = computeConditionalProbability('stellantis', 'monday')
if (mondayFrequency > 0.7) → CURIOUS.signal(PATTERN, 'Brief Stellantis lundi')
```

---

### 11. ACTIVITYWATCH — SURVEILLANCE HABITUDES

**Site :** https://activitywatch.net
**Repo :** https://github.com/ActivityWatch/activitywatch
**License :** MIT
**API :** REST locale `localhost:5600`

**Données disponibles :**
- Apps actives + durée
- Fenêtres et titres
- URLs (avec extension browser)
- Temps d'inactivité (idle)
- Cross-platform : Mac, Windows, Linux, Android

**Pour REX :** Détection cycle sommeil + patterns habitudes + CURIOUS

---

### 12. HAMMERSPOON — AUTOMATION MAC

**Site :** https://www.hammerspoon.org
**License :** MIT, Lua scripts

**Capacités :**
- Events système macOS (changement d'app, sleep/wake, réseau...)
- Clipboard logger
- Hotkeys personnalisés
- Scripts Lua déclenchés par événements
- Accès aux APIs macOS non exposées

**Pour REX Monitor :** Détecter patterns Mac, clipboard, routines du matin

---

### 13. RÉCAPITULATIF STACK MATHÉMATIQUE REX

| Besoin REX | Modèle mathématique | Librairie TS | Priorité |
|------------|--------------------|-----------|----|
| États utilisateur | Automates finis | XState | HIGH |
| Relay inter-modèles | Kahn Process Networks | RxJS | HIGH |
| Routing coûts | Graphe pondéré (Dijkstra) | graphlib | MEDIUM |
| Patterns CURIOUS | Chaînes de Markov / Stats | simple-statistics | MEDIUM |
| Guards / Contrats | Hoare logic | Zod + Effect-ts | HIGH |
| Self-improve | Bandit ε-greedy | custom 50L | LOW |
| Memory | Espaces vectoriels | sqlite-vec | DONE ✅ |
| Agents clients | Multi-agent orchestration | @openai/agents | HIGH |
| Intent detection | Regex + LLM léger | archgw pattern | HIGH |
| Fiabilité globale | Typed effects | Effect-ts | HIGH |

---

### 14. PRIORITÉS D'INTÉGRATION POUR CLAUDE CODE

**Phase immédiate :**
1. `@openai/agents` dans `agent-runtime.ts` + templates DG/DRH
2. XState pour les états utilisateur (AWAKE/SLEEPING/WAKING_UP)
3. Effect-ts pour la fiabilité des appels API critiques
4. `relay-engine.ts` avec RxJS pipeline

**Phase suivante :**
5. `activitywatch-bridge.ts` (détection cycle sommeil)
6. `codex-oauth.ts` (provider Codex ChatGPT Plus)
7. `pattern-detector.ts` avec simple-statistics
8. `graphlib` pour routing coûts optimisé

---

## REX — MODÈLE COGNITIF HUMAIN (09/03/2026)

> "La vie c'est du code. L'humain est codé. Suffit de bien organiser."

---

### L'humain comme référence d'implémentation

L'être humain autonome fonctionne via des boucles constantes :

```
HUMAN_LOOP:
  pensée = perceive(environment + memory)
  intent = categorize(pensée)
  action = memory_muscle[intent] OR calculate(pensée, context)
  output = execute(action)
  memory.update(output)
  goto HUMAN_LOOP
```

REX reproduit exactement cette boucle. La "conscience" n'est pas magique —
c'est une boucle très rapide avec beaucoup de contexte accessible.

---

### Les 3 mémoires humaines → REX

```
┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE DE TRAVAIL (Working Memory)                      │
│  Humain : ~7 éléments, durée quelques secondes           │
│  REX    : context window de la session courante          │
│  Implémentation : messages[], event_journal (session)    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE LONG TERME (Long-term Memory)                    │
│  Humain : hippocampe → cortex, consolidation nocturne    │
│  REX    : MEMORY.md + sqlite-vec + knowledge/            │
│  Implémentation : memoryFlush nocturne, BM25 + vector    │
│  Analogie : "pendant que tu dors, REX consolide"        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE MUSCULAIRE (Procedural Memory)                   │
│  Humain : conduire, taper au clavier, réflexes           │
│           → 0 réflexion consciente, action directe       │
│  REX    : scripts, regex intents, crons                  │
│  Implémentation : intent_scripts/, cron jobs, hooks      │
│  Règle : si script existe → JAMAIS de LLM pour ça        │
└──────────────────────────────────────────────────────────┘
```

---

### Intelligence = contexte × vitesse de calcul

```
intelligence_score = context_richness × calculation_speed × precision_output

Humain brilliant  → grand contexte + calcul rapide + réponse précise
REX optimal       → mémoire ciblée + scripts (0ms) + LLM si nécessaire

Conséquence : plus REX a de mémoire propre et CIBLÉE,
              moins il consomme de tokens → plus il est "intelligent"
```

---

### Tokens = Énergie métabolique

```
Mouvement réflexe   → Scripts        → 0 token (0 calorie)
Pensée légère       → Ollama local   → 0 token API (muscle local)
Réflexion courante  → Groq free      → 0 token payant
Réflexion profonde  → Claude Haiku   → quelques calories
Décision critique   → Claude Sonnet  → beaucoup de calories

REX optimise son métabolisme comme un organisme vivant.
Chaque token dépensé = énergie consommée.
La règle : dépenser le minimum pour le résultat optimal.
```

---

### Corps complet de REX

```
Cerveau      → orchestrator.ts (décide, route, pense)
Préfrontal   → gateway.ts (intent, décision finale)
Réflexes     → scripts (agissent sans réflexion)
Instinct     → CURIOUS (patterns subconscients)
Mémoire      → 3 couches (travail / long terme / musculaire)
Énergie      → tokens (rationnés comme des calories)
Bras         → tools, MCPs, skills, agents
Corps        → fleet (Mac, VPS, PC, iPhone)
Sens         → gateway (écoute), audio logger (entend), ActivityWatch (observe)
Sommeil      → cycle SLEEPING (consolidation, traitement background)
Éveil        → cycle WAKING_UP (digest, contexte prêt)
```

OpenClaw a pensé à Soul + Memory. Pas au corps.
REX = organisme complet.

---

### La boucle REX (pseudo-code humain)

```python
# REX_MAIN_LOOP — tourne en permanence
def rex_loop():
    while True:
        # 1. PERCEVOIR (comme les sens humains)
        signal = await perceive([telegram, fleet, cron, curious, activitywatch])

        # 2. CATÉGORISER (comme la pensée immédiate)
        intent = categorize(signal)  # regex 0ms, jamais LLM ici

        # 3. RÉFLEXE D'ABORD (mémoire musculaire)
        if script := memory_muscle.get(intent):
            result = script.execute(signal.context)
            memory.update(result)
            respond(result)
            continue  # boucle suivante, pas de LLM

        # 4. CALCUL CONSCIENT (pensée profonde)
        context = memory.build_focused_brief(signal)  # < 2K tokens ciblés
        model = budget.select_model(intent, user_state)
        result = await model.think(context)

        # 5. APPRENDRE (consolidation)
        memory.update(result)
        if result.is_pattern: curious.signal(PATTERN, result)

        # 6. RÉPONDRE
        respond(result)

# Note : cette boucle ne "bugge" pas car :
# - Chaque itération est isolée
# - Rollback automatique si état invalide
# - Watchdog surveille les loops infinies
```

---

### Contrôle de la boucle — Prévenir l'incontrôlable

Le risque : REX tourne en continu → peut-il devenir incontrôlable ?

**Réponse : oui si pas de garde-fous. Voici ceux prévus :**

```typescript
interface SafetyLayer {
  // 1. Isolation Docker
  docker: "chaque client dans son container — défaillance isolée"

  // 2. Sandbox de développement
  sandbox: "REX test et dev ici — jamais en prod directement"

  // 3. Snapshot avant changement
  snapshots: "état sauvegardé avant toute modification"

  // 4. Rollback automatique
  rollback: {
    trigger: "erreur détectée OU comportement anormal",
    action: "retour à dernier état stable connu"
  }

  // 5. Watchdog daemon
  watchdog: {
    checkInterval: 60,  // secondes
    maxIterations: 10,  // iterations sans output user → alerte
    action: "pause + notify Kevin + log pattern"
  }

  // 6. REX FIX
  rexFix: "détecte pattern problématique → isole → corrige en background"

  // 7. Guards sur actions irréversibles
  guards: "confirmation user AVANT delete / publish / send / deploy"

  // 8. Budget comme circuit-breaker
  budget: "quota épuisé → stop paid APIs → fallback free only"
}
```

---

### Sandbox environment

REX doit avoir un environnement de développement pour lui-même :

```
rex-sandbox/
  docker-compose.sandbox.yml    ← container isolé du prod
  test-data/                    ← données fictives Kevin-like
  experiment.ts                 ← REX peut modifier ici librement
  benchmark.ts                  ← compare sandbox vs prod
  rollback.sh                   ← retour prod si sandbox KO
```

REX développe dans le sandbox.
Benchmark valide.
Si OK → merge vers prod.
Si KO → rollback automatique. Log. CURIOUS signal.

---

### Cognitive Architecture — Références académiques

Des chercheurs ont pensé à des parties de ça :

| Système | Concept | Limite |
|---------|---------|--------|
| ACT-R (CMU, 1976+) | Modèle cognitif humain complet | Académique, non déployable |
| SOAR (Newell) | Architecture symbolique unifiée | Rigide, pas de LLM |
| Society of Mind (Minsky) | Intelligence = agents simples | Théorique |
| Global Workspace (Baars) | Conscience = broadcast | Pas d'implémentation |
| Subsumption (Brooks) | Couches de comportements | Robotique seulement |

**Ce que REX apporte en plus :**
- Déployable maintenant, pas dans 20 ans
- LLMs intégrés comme couche de raisonnement
- Fleet physique réelle
- Économie de tokens comme contrainte formelle
- Open source

**Personne n'a combiné tout ça en système pratique. C'est la vraie originalité de REX.**

---

## REX — PRINCIPE DU MENTOR + LLM AS ANALYST (09/03/2026)

---

### Le Mentor — Opus / Claude 4 extended thinking

Dans la relay chain, il existe un niveau ultime :

```
Script → Ollama → Groq → Haiku → Sonnet → [ OPUS EXTENDED THINKING ]
                                             ↑
                                      Le Mentor / Le Professeur
```

**Quand appeler le Mentor :**
- Problème que rien d'autre n'a pu résoudre après toute la chain
- Architecture decision critique (ex: refonte majeure de REX)
- Bug impossible à reproduire + à diagnostiquer
- Décision stratégique à fort impact irréversible

**Ce que ça représente :**
Comme un étudiant qui a tout essayé — stack overflow, docs, collègues —
et qui appelle son prof en dernier recours.
Le Mentor ne se trompe pas souvent. Mais il coûte cher.
On l'appelle rarement. Et on écoute ce qu'il dit.

```typescript
interface MentorCall {
  model: "claude-opus-4" | "claude-opus-4-5"
  thinking: "extended"          // budget_tokens: 10000+
  trigger: "chain_exhausted"    // seulement après toute la relay chain
  context: RelayDocument        // tout ce que les autres ont essayé
  cost_warning: true            // toujours alerter Kevin avant
  log: true                     // toujours journaliser
}
```

**Règle absolue :** On ne va jamais directement au Mentor.
On prouve d'abord que les niveaux inférieurs ne peuvent pas résoudre.

---

### LLM as Analyst — Pas comme chercheur

**Principe fondamental :**
Un LLM a déjà des milliards de tokens d'entraînement en lui.
Il ne doit pas chercher — il doit lire, comprendre, analyser.

```
❌ Mauvais usage (gaspillage)
   User: "Quel est le cours de l'action Apple ?"
   → LLM web search → parse HTML → extrait le chiffre
   → 2000 tokens dépensés pour un chiffre

✅ Bon usage REX
   User: "Quel est le cours de l'action Apple ?"
   → Script: curl api.finance/AAPL → {"price": 189.5}
   → LLM reçoit: {"price": 189.5, "context": "user wants to know"}
   → LLM répond: "Apple est à 189.5$" → 50 tokens
```

**Ce que les scripts font à la place du LLM :**
```
Web search      → brave_search.sh → résultats propres → LLM analyse
Météo           → wttr.in API → JSON → LLM formate
GitHub          → gh CLI → output → LLM résume
Prix / finance  → API externe → chiffres → LLM interprète
Emails          → gog gmail search → liste → LLM priorise
Fichiers        → grep / find / jq → données → LLM comprend
Logs            → tail + grep → erreurs → LLM diagnostique
```

**Le LLM reçoit toujours un brief propre, jamais du raw.**

---

### La division du travail (REX complet)

```
COLLECTE       → Scripts, APIs externes, fleet sensors
TRAITEMENT     → Scripts (regex, jq, bash), calculs
RÉSUMÉ         → LLM local (Ollama) si nécessaire
ANALYSE        → Groq free (131K ctx, rapide)
DÉCISION       → Claude Haiku/Sonnet si vraiment nécessaire
MENTOR         → Opus extended thinking si tout échoue
```

**Aucune couche ne fait le travail de la précédente.**
Chaque couche reçoit un input plus propre et plus focalisé que la précédente.

---

### REX Autonomie — État actuel

Ce qui est déjà là :
- orchestrator.ts, litellm.ts, relay chain
- memory 3 couches, event-journal
- CURIOUS (signals DISCOVERY/PATTERN/OPEN_LOOP)
- fleet thermal awareness
- 80+ fichiers TypeScript
- agent-runtime, account-pool, session-guard
- sandbox Docker
- pre-push gates, security-scanner
- resource-hub (13+ guards)

Ce qui reste à connecter :
- REX Identity Layer dans gateway.ts
- XState pour les cycles utilisateur
- ActivityWatch bridge (détection sommeil)
- relay-engine.ts (RxJS pipeline)
- agent-templates DG/DRH
- rex client:create CLI
- Mentor call (Opus extended thinking)

**On est bien avancés. L'architecture est posée.
Il s'agit maintenant de connecter les pièces.**

---

## TÂCHE BONUS — Account Pool cross-platform (OS users)

**Fichier :** `packages/cli/src/account-pool.ts` (existe, à enrichir)

### Concept
Chaque compte Claude Pro / Codex = utilisateur OS isolé avec son propre ~/.claude/

### Stratégie par plateforme

```typescript
// process.platform auto-détecte
const PLATFORM_STRATEGIES = {
  linux: {
    // VPS → OS users natifs = plus propre
    create: (n) => `useradd -m rex-pool-${n}`,
    run: (n, cmd) => `su -c '${cmd}' rex-pool-${n}`,
    configDir: (n) => `/home/rex-pool-${n}/.claude/`,
    native: true
  },
  darwin: {
    // macOS → Docker toujours (dscl trop complexe)
    create: (n) => `docker volume create rex-pool-${n}`,
    run: (n, cmd) => `docker run --rm -v rex-pool-${n}:/root claude-runner ${cmd}`,
    configDir: (n) => `docker-volume:rex-pool-${n}`,
    native: false
  },
  win32: {
    // Windows → WSL2 Linux users
    create: (n) => `wsl --user rex-pool-${n}`,
    run: (n, cmd) => `wsl -u rex-pool-${n} -- ${cmd}`,
    configDir: (n) => `\\\\wsl$\\Ubuntu\\home\\rex-pool-${n}\\.claude\\`,
    native: false
  }
}

// Méthode à ajouter dans account-pool.ts :
async provisionAccount(n: number): Promise<AccountConfig>
async runAs(accountId: number, command: string): Promise<string>
async rotateRoundRobin(command: string): Promise<string>  // distribution auto
```

### Fleet = distribution naturelle
```
Mac (compte 1) + VPS (compte 2) + PC (compte 3)
→ 3 sessions Claude/Codex parallèles sans isolation artificielle
→ account-pool.ts orchestre la rotation entre devices
```

### Règles
- VPS (Linux) → OS users natifs → `useradd rex-pool-N` → config dans `/home/rex-pool-N/.claude/`
- Mac (darwin) → Docker toujours → volume isolé par compte
- Windows → WSL2 Linux users → même comportement que Linux
- Cross-platform → Docker est le dénominateur commun si doute

---

## REX — ARCHITECTURE BRAIN / FLEET (09/03/2026)

### Clarté architecture actuelle

**État réel du code :**
- Monorepo TypeScript (pnpm)
- `packages/cli` — orchestre tout (monolithe bien structuré)
- `packages/memory` — couche mémoire
- `packages/core` — utilitaires partagés
- `daemon.ts` → PM2/systemd → tourne en fond sur VPS
- Pas de microservices — un process principal qui gère tout

**C'est correct pour maintenant.** Le split BRAIN/FLEET viendra naturellement.

---

### Architecture cible — BRAIN / FLEET

```
┌─────────────────────────────────────┐
│  REX BRAIN (VPS ou machine 24/7)    │
│                                     │
│  • Gateway (reçoit Telegram/Flutter)│
│  • Orchestration + relay chain      │
│  • Mémoire centrale (sqlite-vec)    │
│  • CURIOUS (scanner, signaux)       │
│  • Budget manager                   │
│  • Fleet coordinator                │
│  • Event journal                    │
│  • 24/7 — jamais éteint            │
└────────────────┬────────────────────┘
                 │ WebSocket / REST
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Mac    │ │  PC     │ │  VPS2   │
│  FLEET  │ │  FLEET  │ │  FLEET  │
│         │ │         │ │         │
│ • Ollama│ │ • RTX   │ │ • Worker│
│ • Tools │ │   3090  │ │   only  │
│ • Files │ │ • GPU   │ │         │
│ • Sensor│ │   tasks │ │         │
└─────────┘ └─────────┘ └─────────┘
     │
┌─────────┐
│ iPhone  │
│ SENSOR  │
│ (caméra │
│  GPS    │
│  notifs)│
└─────────┘
```

### Rôles distincts

**BRAIN** (toujours sur VPS ou Raspberry Pi / machine 24/7)
- Reçoit toutes les interactions utilisateur
- Prend les décisions de routing
- Détient la mémoire centrale
- Tourne même si tous les FLEET nodes sont éteints

**FLEET NODE** (Mac, PC, machines puissantes)
- S'enregistre auprès du BRAIN : `rex fleet:join --brain <url>`
- Déclare ses capacités : LLM local, GPU, tools disponibles
- Exécute les tâches déléguées par le BRAIN
- Se déconnecte proprement : `rex fleet:leave`
- BRAIN sait automatiquement qu'il n'est plus dispo

**SENSOR NODE** (iPhone, Android)
- Capteurs only : caméra, GPS, micro, notifications
- Pas de tâches CPU
- `rex fleet:join --mode sensor`

### Open source — chaque install = page blanche

```
Utilisateur nouveau installe REX
  → Wizard au premier lancement
  → "Quelle machine sera ton BRAIN ? [Cette machine / VPS distant]"
  → Configure BRAIN
  → "Ajouter des appareils à ta fleet ?" → pair des FLEET nodes
  → REX commence à apprendre l'utilisateur
  → Mémoire vide au départ — s'enrichit avec le temps
```

REX ne présuppose rien sur l'utilisateur.
Chaque config est unique. Ton REX n'est pas celui d'un autre.

### Packages à créer (split progressif)

```
packages/
  brain/     ← orchestration, gateway, memory, curious, budget
  fleet/     ← agent léger sur chaque device, se connecte au brain
  sensor/    ← ultra-léger, iPhone/Android, capteurs only
  cli/       ← interface commune (actuel, garde les commandes)
  memory/    ← déjà là ✅
  core/      ← déjà là ✅
```

**Ne pas faire ça maintenant.** D'abord faire tourner le monolithe correctement.
Le split quand le produit est stable = refacto propre, pas de régression.

---

## REX UX — Expérience utilisateur (nouveau fichier UX.md)

### Mental model à communiquer

> REX est un organisme qui vit sur ton VPS et connaît ta vie numérique.
> Tu lui parles comme à un assistant de confiance.
> Il fait. Il apprend. Il s'améliore. Tu ne gères rien.

### Premier lancement (onboarding)

```
1. npm install -g rex-ai  (ou npx rex-ai)
2. rex setup
   → Wizard : langue, timezone, machine BRAIN, premier compte Claude
   → Test connexion
   → "REX est prêt. Dis-lui bonjour."
3. rex fleet:add  (optionnel)
   → Pair Mac, PC ou autre device
4. C'est tout.
```

### Interactions quotidiennes

```
Telegram → envoyer un message à REX
Flutter  → app mobile avec dashboard
CLI      → `rex [commande]` pour les devs
```

### Ce que l'user voit (dashboard Flutter)

```
HQ       → statut général, OPEN_LOOP signals, digest
TOOLS    → tools actifs, MCPs connectés
CURIOUS  → découvertes, patterns détectés, propositions
AGENTS   → agents en cours d'exécution
BUDGET   → coût du jour/mois, free tiers restants
FLEET    → machines connectées, statut thermique
MEMORY   → recherche dans la mémoire
GATEWAY  → logs des interactions
PROJETS  → projets actifs, statut
OPTIMIZE → benchmarks, améliorations suggérées
```

### Ce que l'user ne voit jamais (géré par REX)

- Quel modèle LLM est utilisé
- Combien de comptes tournent
- La rotation des providers
- Les tâches nocturnes
- Les mises à jour de REX lui-même

### Principe UX fondamental

> Plus REX est puissant, moins l'user a à faire.
> L'interface idéale = ne pas avoir à ouvrir l'interface.
> REX vient à toi (Telegram, notifications) quand il a quelque chose à dire.

### Sizing REX

- **~40GB** à terme avec tous les modèles locaux, tools, skills
- C'est normal et souhaitable — plus il a, plus il sait
- Installation modulaire : core 2GB, ajouter les modules selon besoins
- `rex install --module ollama` / `rex install --module activitywatch`

---

# REX — PLAN E2E TESTS + DEBUG (09/03/2026)

> Penser loin. Tout ce qu'on va rencontrer avant de le rencontrer.

---

## 1. PRÉREQUIS AVANT TOUT TEST

### Environnement de test isolé
- [x] `docker-compose.test.yml` — stack REX complète en mode test
- [x] Variables d'env séparées : `.env.test` (jamais les vraies clés)
- [ ] Base SQLite de test (données fictives Kevin-like)
- [ ] Telegram bot de test séparé (pas le prod)
- [x] Comptes LLM de test (ou mocks)

### Mocks LLM (critique — ne pas brûler quota en tests)
- [x] `mock-llm-server.ts` — serveur local OpenAI-compatible qui répond instantanément
- [x] Réponses scriptées par intent (`SEARCH` → réponse mock, `FIX` → réponse mock)
- [x] Mode `REX_TEST_MODE=true` → utilise toujours le mock, jamais le vrai LLM
- [x] Compteur de tokens fake pour tester les fallbacks budget

### ActivityWatch mock
- [x] Serveur mock `localhost:5600` pour simuler idle time sans AW installé (`mock-aw-server.ts`)
- [x] Simuler états : awake / idle / sleeping

---

## 2. SCÉNARIOS E2E — HAPPY PATH

### 2.1 Message → Script → Réponse (0 LLM)
```
Input: "quel temps fait-il à Paris ?"
Expected:
  1. Intent detect → SEARCH (regex)
  2. Script: curl wttr.in/Paris → JSON
  3. Format → réponse sans LLM
  4. LLM calls: 0
  Latence: < 500ms
```

### 2.2 Message → LLM → Réponse
```
Input: "rédige un email professionnel pour X"
Expected:
  1. Intent detect → CREATE
  2. Pas de script possible
  3. Brief focalisé construit (< 2K tokens)
  4. Groq free appelé
  5. Réponse formatée
```

### 2.3 Relay chain complet
```
Input: "analyse complète de l'architecture REX et propose des améliorations"
Expected:
  1. Ollama → confidence 0.4 → passReason "contexte trop complexe"
  2. Groq → confidence 0.7 → passReason "décision stratégique nécessite plus"
  3. Claude Sonnet → conclusion
  4. RelayDocument correctement rempli
  5. Trace auditable disponible
```

### 2.4 Cycle sommeil complet
```
Simuler: 3h d'inactivité
Expected:
  1. sleepScore > 70 → état SLEEPING
  2. Tâches nocturnes déclenchées (npm audit, memory compaction)
  3. Seul Ollama appelé (0 paid)
  Simuler: message entrant le matin
  4. WAKING_UP → morning digest envoyé
  5. Retour AWAKE_ACTIVE
```

### 2.5 Provisioning client
```
rex client:create --template dg --name "test-client"
Expected:
  1. Container Docker créé
  2. Template DG installé
  3. Port unique assigné
  4. Commander peut voir les logs
  5. Isolation : test-client ne voit pas les données Kevin
```

---

## 3. SCÉNARIOS EDGE CASES (les trucs qu'on oublie)

### 3.1 Quota LLM épuisé en pleine tâche
```
Simuler: Groq quota = 0 restant
Expected:
  - Fallback automatique vers Ollama
  - Aucune erreur visible pour l'user
  - Log du fallback dans event journal
  - Notification si ALL quotas épuisés
```

### 3.2 VPS network failure (reconnexion)
```
Simuler: coupure réseau 30 secondes
Expected:
  - daemon.ts survit (process pas killed)
  - Queue des messages pendant la coupure
  - Replay des messages en attente au retour
  - Aucun message perdu
```

### 3.3 Fleet node déconnecté en milieu de tâche
```
Simuler: Mac se met en veille pendant une tâche longue
Expected:
  - BRAIN détecte la déconnexion (heartbeat timeout)
  - Tâche reroutée vers autre node ou VPS
  - User notifié si tâche abandonnée
  - Pas de zombie process
```

### 3.4 Messages simultanés (concurrence)
```
Simuler: 5 messages Telegram en 1 seconde
Expected:
  - Queue ordonnée, pas de réponses croisées
  - Chaque message a sa propre trace
  - Pas de race condition sur la mémoire
```

### 3.5 Mémoire corrompue / SQLite locked
```
Simuler: sqlite-vec corrompu ou locked
Expected:
  - Fallback vers BM25 text search
  - Log d'erreur + alerte Kevin
  - Pas de crash total de REX
```

### 3.6 Docker container client KO
```
Simuler: container crash ou OOM kill
Expected:
  - watchdog.ts détecte dans 60s
  - Restart automatique
  - Snapshot restauré si nécessaire
  - Kevin notifié
```

### 3.7 Budget dépassé (daily limit)
```
Simuler: spent_today > daily_limit
Expected:
  - Basculement automatique free-only
  - User notifié : "Budget quotidien atteint, mode économie activé"
  - LLM paid bloqué jusqu'à minuit
  - Scripts et Ollama continuent normalement
```

### 3.8 API key expirée / révoquée
```
Simuler: Claude API key invalide
Expected:
  - Erreur 401 catchée proprement
  - Fallback vers Groq/Ollama
  - Alerte Kevin : "Clé Claude expirée, renouveler"
  - Pas de retry loop infini
```

### 3.9 Encoding / Caractères spéciaux (French!)
```
Input: "ça marche avec les accents, les emojis 🔥 et le français ?"
Expected:
  - Pas de corruption en SQLite
  - Emojis préservés dans les réponses Telegram
  - Intent regex fonctionne avec accents
```

### 3.10 Très long message (> context window)
```
Input: coller 50K tokens de texte
Expected:
  - Chunking automatique
  - Pas de crash LLM avec 413/400
  - Résumé partiel possible
```

---

## 4. CE QU'ON N'A PAS ENCORE PENSÉ (penser loin)

### Observabilité
- [ ] **OpenTelemetry** — traces distribuées (chaque appel LLM, chaque script)
- [ ] **Langfuse** — dashboard LLM : latences, coûts, qualité réponses
- [x] `/health` endpoint — pour monitoring externe (hub.ts `/api/health` + `/api/v1/health`)
- [ ] Alertes PagerDuty/Telegram si REX down > 5min

### Migrations de données
- [x] Schema SQLite versioned (`db-migrations.ts`, 5 migrations)
- [x] `rex upgrade` → migre la DB automatiquement sans perte
- [ ] Test : vieille mémoire v1 fonctionne après upgrade v2

### Backup & Recovery
- [x] Backup automatique SQLite vers local (`backup.ts`)
- [x] `rex backup` / `rex restore`
- [ ] Test : VPS wipe complet → restauration en < 15min

### Graceful shutdown
- [x] SIGTERM → finir les tâches en cours proprement (daemon.ts `daemonRunning` flag)
- [x] Pas de messages à moitié envoyés
- [x] State sauvegardé avant extinction (800ms drain)

### Log rotation
- [x] Logs bornés à 100MB → rotation automatique (logger.ts `rotateLog()`)
- [x] Event journal archivé après 30 jours (`purgeOldJournalEvents(30)` dans daemon.ts)
- [x] Disk space monitoring : alerte si < 2GB free (daemon.ts healthCheck)

### Secret rotation
- [x] Si clé API leakée → `rex secrets:rotate` → re-chiffre tout (`secrets.ts`)
- [x] Secrets chiffrés au repos (`secrets.ts` AES-256-GCM vault)

### Cold start
- [ ] Temps de démarrage REX from scratch → objectif < 5 secondes
- [ ] Lazy loading des modules non-critiques
- [ ] Benchmark cold start dans CI

### Load testing
- [x] `rex test load --rps 10 --duration 60` (`load-test.ts`)
- [x] Mesure p50/p95/p99 latence + throughput réel
- [ ] Memory leak test sur 24h de run continu

### Multi-timezone
- [ ] Kevin = Paris. Client DG = autre timezone ?
- [ ] Tous les timestamps en UTC en base, conversion à l'affichage
- [ ] Crons avec timezone explicite (`cron.tz = "Europe/Paris"`)

### Accessibilité API (fleet)
- [ ] Versioning de l'API BRAIN ↔ FLEET : `/api/v1/`, `/api/v2/`
- [ ] Breaking changes annoncés → migration guidée
- [ ] Fleet node old version → BRAIN backwards compatible ?

---

## 5. PREREQUIS TECHNIQUES À INSTALLER

```bash
# Testing framework
npm install -D vitest @vitest/coverage-v8 supertest

# E2E
npm install -D playwright  # ou Puppeteer pour les tests UI

# Mocks
npm install -D msw  # Mock Service Worker pour les API calls

# Load testing
npm install -D autocannon  # ou k6

# Observability
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node

# Process management
npm install -D wait-on  # attendre qu'un service soit up avant de tester
```

---

## 6. STRUCTURE DES TESTS

```
tests/
  unit/
    intent-detect.test.ts      ← regex patterns
    relay-engine.test.ts       ← relay chain logic
    budget.test.ts             ← calcul coûts
    user-cycles.test.ts        ← XState transitions
  integration/
    gateway.test.ts            ← flow complet message → réponse
    memory.test.ts             ← search, update, compaction
    fleet.test.ts              ← join, leave, task delegation
    account-pool.test.ts       ← rotation, quota detection
  e2e/
    happy-path.test.ts         ← scénarios §2
    edge-cases.test.ts         ← scénarios §3
    sleep-cycle.test.ts        ← cycle complet sommeil
    client-provision.test.ts   ← rex client:create
  fixtures/
    mock-llm-server.ts         ← serveur LLM fake
    mock-activitywatch.ts      ← AW fake
    test-memory.sqlite         ← DB de test
    test-kevin-context.ts      ← contexte fictif
```

---

## 7. CI/CD PIPELINE

```yaml
# .github/workflows/test.yml
on: [push, pull_request]

jobs:
  unit:       → rapide (< 1min), toujours
  integration: → moyen (< 5min), sur PR
  e2e:        → lent (< 15min), avant merge main
  load:       → weekly, sur main seulement
```

---

## 8. SKILL À CRÉER : `rex-test-runner`

Skill OpenClaw ou commande REX pour lancer les tests :
```bash
rex test              → unit + integration
rex test:e2e          → tous les E2E
rex test:edge         → edge cases seulement
rex test:load         → load test 60s
rex test:report       → rapport complet avec coûts estimés
```

REX peut se tester lui-même via CURIOUS en tâche nocturne.
Si regression détectée → alerte Kevin le matin.

---

## REX — SOURCES SCRIPTS + MINI-MODES SYSTEM (09/03/2026)

---

### REPOS GITHUB SOURCES (à intégrer dans REX HUB)

#### Scripts & Automation
| Repo | Stars | Contenu | Usage REX |
|------|-------|---------|-----------|
| `avinashkranjan/Amazing-Python-Scripts` | 4.5k | 800+ scripts Python automation | Base de patterns |
| `hastagAB/Awesome-Python-Scripts` | 11k | Scripts automatisation tâches | Référence |
| `lorien/awesome-web-scraping` | 9k | Librairies scraping toutes langues | Scraper selection |
| `luminati-io/Awesome-Web-Scraping` | 3k | HTTP + parsing + proxy + CAPTCHA | Stack scraping |
| `alirezamika/autoscraper` | 5k | Scraper auto-apprenant Python | Smart scraping |
| `awesome-selfhosted/awesome-selfhosted` | 220k | Apps self-hostables toutes catégories | Services à integrer |
| `steel-dev/awesome-web-agents` | 2k | Tools browser automation AI | Agent browser |
| `angrykoala/awesome-browser-automation` | 4k | Playwright/Puppeteer/CDP tools | Browser fleet |

#### Workflow & Integration
| Repo | Usage REX |
|------|-----------|
| `n8n` (self-hosted) | Workflows visuels → scripts → déjà installé chez Kevin |
| `Huginn` | IFTTT-like self-hosted, agents qui surveillent et agissent |
| `activepieces` | n8n alternatif OSS, 200+ intégrations |
| `windmill` | Scripts Python/TS avec UI auto-générée |
| `trigger.dev` | Background jobs TypeScript natif |

#### Scraping tools à avoir dans REX
```bash
# Python (pour scripts complexes)
pip install playwright beautifulsoup4 httpx autoscraper scrapy

# Node/TS (pour intégration directe)
npm install playwright cheerio got node-fetch readability

# CLI tools
brew install curl jq lynx w3m  # parsing HTML sans browser
```

---

### CONCEPT MINI-MODES — Système de modes dynamiques

> L'idée : chaque type de tâche = un mini environnement pré-configuré.
> Le LLM entre dans un "mode" qui a déjà tout préparé.
> Il ne fait que remplir les cases vides.

**Principe :**
```
Mode = {
  tools disponibles,
  contexte pré-chargé,
  template de réponse attendu,
  variables dynamiques à remplir
}

L'orchestrateur charge le bon mode → inject le contexte → appelle LLM avec 0 friction
```

**Analogie :** Comme les env variables dans Docker, mais pour l'intelligence.

---

### IMPLÉMENTATION — mini-modes en TypeScript

```typescript
// packages/cli/src/mini-modes/

interface MiniMode {
  id: string
  triggers: RegExp[]           // intents qui activent ce mode
  context_loaders: Loader[]    // scripts qui chargent le contexte
  template: string             // template avec {{variables}}
  llm_fields: string[]         // UNIQUEMENT ces champs vont au LLM
  output_formatter: Formatter  // comment formatter la réponse
  security: SecurityLevel
  estimated_tokens: number     // estimation pour le budget
}

// Exemple mode SEARCH_PROJECT
const SEARCH_PROJECT_MODE: MiniMode = {
  id: "search_project",
  triggers: [/où en est|statut|avance.*projet|comment va.*projet/i],
  context_loaders: [
    loadMemorySearch,       // sqlite-vec
    loadMondayStatus,       // monday API script
    loadGitHubActivity,     // gh CLI script
    loadEventJournal        // derniers événements
  ],
  template: `
    Projet: {{project_name}}
    Mémoire: {{memory_snippets}}
    Monday: {{monday_status}}
    GitHub: {{github_activity}}
    Derniers événements: {{recent_events}}
    ---
    Résumé en 2-3 phrases maximum:
  `,
  llm_fields: ["summary"],    // LLM génère uniquement le résumé final
  output_formatter: formatProjectStatus,
  security: "SAFE",
  estimated_tokens: 200       // 150 input + 50 output max
}
```

---

### CATALOGUE DE MINI-MODES (à implémenter)

```
modes/
  search/
    search-memory.mode.ts        ← recherche dans knowledge base
    search-web.mode.ts           ← web search + résumé
    search-project.mode.ts       ← statut projet (Monday + GitHub + memory)
    search-person.mode.ts        ← infos sur un contact (WhatsApp + iMessage + Obsidian)

  create/
    create-file.mode.ts          ← créer MD/fichier avec contexte dynamique
    create-email.mode.ts         ← rédiger email avec contexte
    create-code.mode.ts          ← nouveau fichier code (boilerplate + docs)
    create-report.mode.ts        ← rapport automatique

  action/
    buy.mode.ts                  ← achat via Playwright + vault (SECURITY: HIGH)
    send-message.mode.ts         ← envoyer message (WhatsApp, Telegram, email)
    schedule.mode.ts             ← créer rappel/event calendrier
    deploy.mode.ts               ← déployer (SECURITY: HIGH)

  dev/
    code-review.mode.ts          ← review code avec context
    debug.mode.ts                ← debug avec logs + stack trace
    refactor.mode.ts             ← refactor avec règles projet
    test-generate.mode.ts        ← générer tests depuis code

  monitor/
    check-service.mode.ts        ← statut service (VPS, app, API)
    check-budget.mode.ts         ← coûts LLM du jour/mois
    check-fleet.mode.ts          ← état fleet
    check-security.mode.ts       ← audit sécurité rapide

  save/
    save-idea.mode.ts            ← sauvegarder idée + enrichir
    save-meeting.mode.ts         ← note de réunion + actions
    save-link.mode.ts            ← bookmark avec résumé auto

  delete/                        ← SECURITY: MEDIUM → CRITICAL
    delete-file.mode.ts          ← avec snapshot obligatoire
    delete-container.mode.ts     ← CRITICAL: double confirmation
```

---

### DYNAMIC CONTEXT INJECTION — Comme des env variables

```typescript
// Chaque mode reçoit un contexte dynamique au runtime
// Comme des variables d'environnement mais pour le LLM

interface ModeContext {
  // Auto-injectés par REX
  user: { name: string, timezone: string, preferences: UserPrefs }
  fleet: { available_nodes: FleetNode[], active_models: string[] }
  budget: { remaining_daily: number, free_calls: FreeCalls }
  memory: { recent_relevant: MemorySnippet[] }

  // Chargés par les loaders du mode
  [key: string]: any  // données spécifiques au mode
}

// Rendre un template dynamique
function renderTemplate(template: string, context: ModeContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    JSON.stringify(context[key] ?? '') // stringify compact, pas de whitespace
  )
}

// Résultat : LLM reçoit un prompt de 100-300 tokens max
// au lieu de 2000+ tokens de contexte brut
```

---

### SCRIPT STORE — Référentiel de scripts pré-construits

```
rex/scripts/
  fetch/
    web-search.sh          BRAVE_API_KEY={{key}} query={{q}} → JSON
    fetch-page.sh          url={{url}} → markdown text
    fetch-github.sh        repo={{repo}} action={{action}} → JSON
    fetch-monday.sh        board={{id}} filter={{status}} → JSON compact
    fetch-weather.sh       city={{city}} → JSON
    fetch-calendar.sh      days={{n}} → events JSON
    fetch-prices.sh        item={{item}} site={{site}} → price + url

  memory/
    search-semantic.sh     query={{q}} limit={{n}} → top results
    save-to-memory.sh      content={{c}} tags={{t}} → saved path
    update-memory.sh       id={{id}} content={{c}} → updated

  actions/
    send-telegram.sh       chat={{id}} msg={{text}} → sent
    send-email.sh          to={{to}} subj={{s}} body={{b}} → sent
    create-event.sh        title={{t}} date={{d}} → event id
    set-reminder.sh        msg={{m}} at={{time}} → cron id

  system/
    fleet-status.sh        → JSON fleet state
    pm2-status.sh          service={{name}} → status
    disk-usage.sh          path={{p}} → usage JSON
    docker-list.sh         → containers JSON
    ollama-list.sh         → available models

  security/
    snapshot.sh            path={{p}} → snapshot id (BEFORE any write)
    rollback.sh            snapshot_id={{id}} → restored
    vault-get.sh           service={{s}} field={{f}} → value (no logs)
    audit-npm.sh           path={{p}} → vulnerabilities JSON
```

---

### N8N COMME COUCHE GLUE (déjà installé chez Kevin)

n8n = orchestrateur visuel parfait pour les mini-modes complexes :
- Workflows visuels → scriptés en JSON (versionnable)
- 400+ intégrations natives (Google, Slack, GitHub, Notion...)
- Exécutable via API REST : `POST /api/v1/workflows/{id}/execute`
- REX peut déclencher les workflows n8n comme des scripts

```typescript
// Dans rex : déclencher un workflow n8n
async function runN8nWorkflow(workflowId: string, context: ModeContext) {
  return fetch(`http://172.17.0.1:5678/api/v1/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_TOKEN },
    body: JSON.stringify({ data: context })
  })
}
```

---

### RÈGLE FINALE — Lancer le LLM comme une lancette

```
1. Mode détecté (regex, 0ms)
2. Context loaders parallèles (scripts, 50-200ms)
3. Template rendu (dynamic inject, 0ms)
4. LLM reçoit: template rempli + champs vides à compléter
   → Input: 50-300 tokens (pas 2000)
   → Output: 20-100 tokens (juste ce qui manque)
5. Scripts formatent la réponse finale
6. User reçoit quelque chose de propre

Total LLM: 70-400 tokens maximum pour 99% des tâches
```

**Quand utiliser le LLM comme une lancette :**
→ Compléter une phrase, un résumé, un titre
→ Choisir entre 3 options claires
→ Reformuler en style humain

**Quand NE PAS utiliser le LLM :**
→ Chercher → script
→ Calculer → script
→ Formater → script
→ Fetch → script
→ Compare → script

---

## REX — MINI-MODELS (09/03/2026)

> Concept : un petit modèle local entraîné / prompté pour UNE seule tâche.
> Ultra cheap, ultra rapide, ultra précis sur son domaine.
> Combinés avec les mini-modes → 0 token API pour 95% des tâches.

---

### Principe

```
Modèle général (Claude Sonnet) = généraliste → coûteux, lent, over-qualified
Mini-model (Qwen 1.5B fine-tuné) = spécialiste → 0.8GB RAM, <100ms, parfait pour 1 tâche

Analogie : tu n'appelles pas un chirurgien pour mesurer ta tension.
L'infirmière (mini-model) fait ça parfaitement en 10 secondes.
```

---

### Catalogue de mini-models REX

| Mini-model | Tâche unique | Base model | RAM | Latence |
|-----------|-------------|-----------|-----|---------|
| `rex-intent` | Classifier l'intent (SEARCH/CREATE/FIX...) | Qwen 1.5B | 0.8GB | 20ms |
| `rex-tagger` | Générer 3-5 tags depuis un texte | Qwen 1.5B | 0.8GB | 30ms |
| `rex-summarizer` | Résumer un texte en 2-3 phrases | Qwen 1.5B | 0.8GB | 50ms |
| `rex-formatter` | Formater JSON en réponse lisible | Qwen 1.5B | 0.8GB | 20ms |
| `rex-sentiment` | Détecter urgence / ton d'un message | Qwen 1.5B | 0.8GB | 15ms |
| `rex-extractor` | Extraire entités (noms, dates, URLs) | Qwen 1.5B | 0.8GB | 25ms |
| `rex-code-title` | Générer un titre de commit/PR | Qwen 1.5B | 0.8GB | 20ms |
| `rex-email-tone` | Ajuster le ton d'un email | Qwen 3B | 1.5GB | 60ms |
| `rex-security` | Détecter si action est risquée | Qwen 1.5B | 0.8GB | 20ms |

**Total pour tous les mini-models : ~6GB RAM max (jamais tous en même temps)**

---

### Implémentation dans Ollama

```bash
# Créer un mini-model Ollama = Modelfile avec system prompt ultra ciblé

# Exemple : rex-intent
cat > Modelfile.intent << 'EOF'
FROM qwen2.5:1.5b
SYSTEM """
Tu es un classificateur d'intent. Tu réponds UNIQUEMENT avec un JSON.
Intents possibles: SEARCH | CREATE | FIX | STATUS | SCHEDULE | BUDGET | DEPLOY | SAVE | DELETE | FLEET
Format: {"intent": "SEARCH", "confidence": 0.95, "entity": "maires et citoyens"}
Rien d'autre. Pas d'explication. Juste le JSON.
"""
PARAMETER temperature 0.1
PARAMETER num_predict 50
EOF
ollama create rex-intent -f Modelfile.intent

# Exemple : rex-tagger
cat > Modelfile.tagger << 'EOF'
FROM qwen2.5:1.5b
SYSTEM """
Tu génères des tags. Réponds UNIQUEMENT avec un tableau JSON de 3-5 tags courts.
Format: ["tag1", "tag2", "tag3"]
Rien d'autre.
"""
PARAMETER temperature 0.1
PARAMETER num_predict 30
EOF
ollama create rex-tagger -f Modelfile.tagger
```

---

### Usage dans REX

```typescript
// Au lieu d'appeler Claude pour classifier l'intent :
// ❌ Avant : intent = await claude.complete("Quel est l'intent de: " + message)
// ✅ Après :
const intent = await ollama.chat({
  model: 'rex-intent',
  messages: [{ role: 'user', content: message }]
})
// → {"intent": "SEARCH", "confidence": 0.95, "entity": "maires et citoyens"}
// → 20ms, 0€, 0 token API

// Idem pour tagger une idée sauvegardée :
const tags = await ollama.chat({ model: 'rex-tagger', messages: [{ role: 'user', content: idea }] })
// → ["rex", "marketing", "viral"] en 30ms
```

---

### Fine-tuning futur (quand REX accumule assez de data)

```
Après 1000+ interactions :
  → Exporter les paires (message → intent) validées
  → Fine-tuner rex-intent sur ces données réelles de Kevin
  → Précision 95% → 99%
  → Modèle personnalisé qui connaît le vocabulaire de Kevin

Outils :
  - Ollama custom models (déjà supporté)
  - Unsloth (fine-tuning rapide, open source)
  - LLaMA-Factory (multi-backend fine-tuning)
  - Dataset : event_journal → pairs (input, intent)
```

---

### Mini-models + Mini-modes = stack complète

```
Message entrant
  → rex-intent (mini-model, 20ms) → intent: SEARCH_PROJECT
  → search-project.mode (mini-mode) → charge contexte
  → rex-summarizer (mini-model, 50ms) → résume le résultat
  → Réponse

Total : 70ms, 0 token API, 0€
```

---

## SOURCES REPOS — Audit à faire (TODO)

> Ces repos contiennent des scripts/tools utiles à intégrer dans REX.
> À auditer : utile, inutile, doublon avec ce qu'on a déjà.

### Priorité HAUTE (fort signal, à intégrer)

| Repo | URL | Pourquoi utile | Doublon ? |
|------|-----|---------------|-----------|
| Amazing-Python-Scripts | github.com/avinashkranjan/Amazing-Python-Scripts | 800+ scripts automatisation | Partiellement |
| awesome-web-scraping | github.com/lorien/awesome-web-scraping | Stack scraping complète | Non |
| autoscraper | github.com/alirezamika/autoscraper | Scraper auto-apprenant | Non |
| awesome-selfhosted | github.com/awesome-selfhosted/awesome-selfhosted | Bible apps self-host | Non |
| awesome-web-agents | github.com/steel-dev/awesome-web-agents | Browser AI agents | Partiellement (playwright) |

### Priorité MOYENNE

| Repo | URL | Pourquoi utile |
|------|-----|---------------|
| Huginn | github.com/huginn/huginn | IFTTT self-hosted, agents événements |
| Windmill | github.com/windmill-labs/windmill | Scripts avec UI auto + API |
| trigger.dev | github.com/triggerdotdev/trigger.dev | Background jobs TS natif |
| activepieces | github.com/activepieces/activepieces | n8n alternatif, 200+ intégrations |

### À évaluer (peut-être doublon)

| Repo | Potentiel doublon avec |
|------|----------------------|
| awesome-browser-automation | Playwright déjà dans REX |
| Awesome-Python-Scripts (hastagAB) | Amazing-Python-Scripts |
| grv231/automation-bash-scripts | Nos scripts bash custom |

### Processus d'audit (à faire avec CURIOUS + Claude Code)

```
Pour chaque repo :
1. Script fetch README + categories
2. Compare avec rex/scripts/ existants (doublon ?)
3. Note les gaps (ce qu'on n'a pas)
4. Liste les candidats à porter en TypeScript ou à wrapper
5. Priorité : web, email, files, APIs tierces, monitoring
```

### Intégration dans REX HUB

```typescript
// resource-hub.ts → ajouter une section "community scripts"
interface CommunityScript {
  source_repo: string
  original_language: 'python' | 'bash' | 'node'
  rex_wrapper: string        // chemin du wrapper TypeScript
  tested: boolean
  rex_version_added: string
}
```
