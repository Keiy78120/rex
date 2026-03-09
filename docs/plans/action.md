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

### Sources CURIOUS à monitorer (cron)

- `github.com/punkpeye/awesome-mcp-servers` — GitHub API
- `github.com/wong2/awesome-mcp-servers` — GitHub API
- `mcpservers.org` — fetch + parse
- Hugging Face blog RSS
- Simon Willison blog RSS
- r/LocalLLaMA Reddit API

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

