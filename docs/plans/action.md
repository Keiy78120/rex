# REX — ACTION

Document unique d'execution pour une team d'agents externe chargee de construire REX.

Si un user dit seulement :

```text
Lis docs/plans/action.md
```

... l'agent doit pouvoir travailler correctement avec ce fichier seul.
Les autres docs ne servent qu'en profondeur optionnelle.

Distinction critique :

- ce document guide l'agent externe qui construit, corrige et fait evoluer REX
- il ne decrit pas les agents internes du runtime REX comme role d'execution pour cette session
- le lead et les sous-agents mentionnes ici sont des agents de build, pas des features produit

Regle de priorite documentaire :

- `CLAUDE.md` = source de verite projet et produit
- `docs/plans/action.md` = source de verite d'execution one-shot
- si une doc secondaire contredit ce fichier, suivre `CLAUDE.md` puis corriger la doc secondaire

---

## 1. Contexte repo

- **Repo officiel** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche** : `main`
- **Produit** : REX = hub centralise de TOUTES les ressources d'un dev solo
- **Stack principale** : TypeScript/Node, Flutter, SQLite
- **Orchestrateurs principaux** : Claude Code + Codex UNIQUEMENT — tous les autres sont providers/workers
- **Etat produit** : CLI + memory + guards + gateway Telegram + app Flutter macOS + daemon + agents + MCP registry + providers + budget + event journal + semantic cache existent deja (Phase 1 terminee)

---

## 2. Vision REX a respecter

REX = hub centralise de TOUTES les ressources pour un dev solo :

- **Hardware** : machines locales, VPS, GPU, Wake-on-LAN, mesh Tailscale
- **Free tiers** : Groq, Together AI, Cerebras, HuggingFace, Mistral free, Cloudflare AI Workers, Cohere free
- **Abonnements** : Claude Max, ChatGPT Plus, Codex, MiniMax, etc.
- **Modeles locaux** : Ollama (Qwen, DeepSeek, Llama, etc.)
- **Outils/MCP** : marketplace dynamique, awesome-mcp-server, install one-click
- **Memoire semantique partagee** : SQLite + embeddings, accessible par TOUS les orchestrateurs

Principes :

1. **owned-first** : utiliser d'abord ce que l'user possede
2. **free-first** : free tiers avant abonnements
3. **payant en dernier** : pay-per-use uniquement si tout le reste est epuise
4. **zero-loss** : append-only, spool, queue, ack, replay — avant sophistication
5. **zero-config** : tout automatique, aucun setup complique pour l'user
6. **Flutter pour piloter, headless pour operer**

Routing obligatoire (dans cet ordre) :

1. cache (semantic cache local)
2. script/CLI local
3. Ollama local
4. free tier (rotation auto sur rate limit)
5. abonnement (quota gere)
6. pay-per-use (budget controle)

---

## 3. Repartition des modeles pour l'agent team

Utiliser cette logique par defaut :

- **Haiku** : search, scan, lecture rapide, tri, extraction, classement, petite synthese
- **Sonnet** : code, refactor, implementation, wiring, tests locaux, scripts
- **Opus** : orchestration, verification, review finale, architecture, arbitrage, coherence globale

Regle :

- ne pas gaspiller Opus pour du scan simple
- ne pas donner une orchestration complexe a un modele de lecture rapide
- le lead build agent pense en Opus, les executants codent surtout en Sonnet, la collecte rapide peut etre faite en Haiku
- Opus = lead seulement par defaut
- Sonnet = implementation par defaut
- Haiku = scouting par defaut

Mode degrade si tous les modeles ne sont pas disponibles :

- **pas de Haiku** : Sonnet prend aussi le scan, la collecte et la recherche rapide
- **pas de Sonnet** : Opus peut executer des changements codes scopes et plus petits
- **pas d'Opus** : le lead passe en Sonnet avec verification finale plus stricte
- **un seul modele disponible** : garder la meme separation mentale en sous-taches, mais avec un seul executant

Discipline tokens :

- une seule passe de scouting rapide au debut
- pas de relecture complete du repo par chaque sous-agent
- un sous-agent ne lit que `docs/plans/action.md` et les fichiers de son scope
- seul le lead ouvre les docs optionnelles si necessaire
- pas plus d'un sous-agent de search/scan en parallele sans justification
- preferer 2 sous-agents bien scopes plutot que 5 agents redondants

---

## 4. Invariants non negociables

1. **Ordre de ressource** : cache -> script/CLI -> Ollama local -> free tier -> abonnement -> pay-per-use
2. **Ordre d'integration** : CLI -> MCP -> API -> autre
3. **Orchestrateurs** : Claude Code + Codex UNIQUEMENT — tout le reste = provider/worker
4. **Flutter** = UI operateur principale, jamais dependance unique
5. **VPS** = hub prefere si disponible, jamais point unique de perte
6. **Gateway = continuity layer** : si un node survit, il spool, preserve et rejoue
7. **No-loss** : append-only, spool local, queue persistante, ack, replay
8. **OSS avant reimplementation** : si une brique existe deja, REX l'integre
9. **Topologie adaptable** : solo, small cluster, fleet
10. **Une seule API REX** pour app, gateway, CLI et dashboard distant
11. **Scripts/runbooks avant repetition manuelle**
12. **Chaque sous-agent commence par un resume interne** : mission, fichiers, contraintes, verification, hypothese retenue
13. **L'agent externe ne joue jamais le role d'un agent interne de REX** : il construit le produit, il ne simule pas son runtime
14. **Zero-config** : tout doit marcher out-of-the-box, auto-detection, auto-rotation, auto-fallback

---

## 5. Ce que l'agent doit faire en premier

1. verifier le repo et le chemin
2. se rappeler qu'il agit comme agent externe de build, pas comme agent runtime de REX
3. identifier si la tache est surtout backend, frontend, docs/sources, ou install/deploy
4. choisir la team minimale utile
5. faire une seule passe courte de scouting si necessaire
6. decouper en sous-taches simples
7. attribuer les fichiers par sous-agent
8. demander a chaque sous-agent un resume interne court avant execution
9. implementer
10. verifier
11. resumer ce qui a ete change

Pas de derapage en exploration infinie.
Pas de "points a clarifier" si une hypothese raisonnable permet d'avancer.

---

## 6. Teams et roles de build

### Lead Build Agent

Responsable de :

- lire ce fichier
- choisir la strategie
- attribuer les sous-taches
- faire la coherence finale
- faire la verification finale
- rester a l'exterieur du runtime produit

### Build-Team-Backend

A utiliser pour :

- CLI
- daemon
- gateway
- memory
- sync
- hub API
- routing
- inventory
- MCP marketplace
- providers / free tiers
- LiteLLM integration
- budget / cost tracking

Sous-agents possibles :

- Agent-Router
- Agent-Orchestrator
- Agent-Memory
- Agent-Daemon
- Agent-Gateway
- Agent-Network
- Agent-Sync
- Agent-MCP
- Agent-Providers
- Agent-Budget

### Build-Team-Frontend

A utiliser pour :

- Flutter app
- UX operateur
- pages Network / Gateway / Memory / MCP / Providers / Review / Sandbox
- hierarchy visuelle
- composants UI
- provider config UI

Sous-agents possibles :

- Agent-Flutter-Core
- Agent-Flutter-Extra
- Agent-UX
- Agent-Design-System

### Build-Team-Docs

A utiliser pour :

- README
- docs internes
- mapping des sources
- integration OSS / anti-doublons

Sous-agents possibles :

- Agent-Docs
- Agent-OSS-Review
- Agent-Integration-Map

---

## 7. Zones de travail par type de tache

### Backend

Fichiers cibles principaux :

- `packages/cli/src/index.ts`
- `packages/cli/src/router.ts`
- `packages/cli/src/providers.ts`
- `packages/cli/src/resource_inventory.ts`
- `packages/cli/src/budget.ts`
- `packages/cli/src/orchestrator.ts`
- `packages/cli/src/backend-runner.ts`
- `packages/cli/src/gateway.ts`
- `packages/cli/src/adapters/`
- `packages/cli/src/daemon.ts`
- `packages/cli/src/hub.ts`
- `packages/cli/src/node.ts`
- `packages/cli/src/sync.ts`
- `packages/cli/src/sync-queue.ts`
- `packages/cli/src/mcp.ts`
- `packages/cli/src/mcp_registry.ts`
- `packages/cli/src/skills.ts`
- `packages/memory/src/ingest.ts`
- `packages/cli/src/preload.ts`
- `packages/cli/src/self-improve.ts`

### Frontend

Fichiers cibles principaux :

- `packages/flutter_app/lib/services/rex_service.dart`
- `packages/flutter_app/lib/pages/agents_page.dart`
- `packages/flutter_app/lib/pages/audio_page.dart`
- `packages/flutter_app/lib/pages/gateway_page.dart`
- `packages/flutter_app/lib/pages/health_page.dart`
- `packages/flutter_app/lib/pages/logs_page.dart`
- `packages/flutter_app/lib/pages/mcp_page.dart`
- `packages/flutter_app/lib/pages/memory_page.dart`
- `packages/flutter_app/lib/pages/optimize_page.dart`
- `packages/flutter_app/lib/pages/settings_page.dart`
- `packages/flutter_app/lib/pages/voice_page.dart`

Nouveaux fichiers autorises si la tache exige une nouvelle surface :

- `packages/flutter_app/lib/pages/network_page.dart`
- `packages/flutter_app/lib/pages/providers_page.dart`
- `packages/flutter_app/lib/pages/review_page.dart`
- `packages/flutter_app/lib/pages/sandbox_page.dart`

### Docs / sources

Fichiers cibles principaux :

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `docs/plans/*.md`

---

## 8. Regles backend essentielles

### A. Routing

Toujours preferer (dans cet ordre strict) :

1. semantic cache local
2. script / CLI local
3. Ollama local (Qwen, DeepSeek, Llama, etc.)
4. free tier (Groq, Together AI, Cerebras, HuggingFace, Mistral, Cloudflare AI, Cohere)
5. abonnement (Claude Max, ChatGPT Plus, Codex, MiniMax)
6. pay-per-use (avec budget controle)

Auto-rotation sur rate limit : si un provider free renvoie 429, passer au suivant automatiquement.

### B. Gateway

La gateway n'est pas un simple bot.
Elle doit :

- journaliser l'entree
- tenter le traitement
- spooler si besoin
- notifier le fallback si necessaire
- rejouer plus tard sans perte

### C. Memory

Memoire semantique partagee (SQLite + embeddings) accessible par TOUS les orchestrateurs.
La memory doit distinguer :

- observations
- lessons
- runbooks
- successes
- pending items

### D. Background

Le background doit continuer a organiser meme en mode degrade avec :

1. scripts
2. outils locaux
3. LLM local
4. free tier

Usages :

- classer
- consolider
- preparer replays
- transformer des succes en runbooks
- nettoyer sans rien perdre

### E. Providers & Free Tiers

REX doit connaitre tous les providers disponibles et leurs limites :

- API keys configurables via Settings UI ou `~/.claude/settings.json`
- Catalogue de modeles free avec limites connues (RPM, TPM, quotas daily)
- Auto-detection des providers disponibles (key presente = actif)
- Rotation automatique sur rate limit (429 → next provider)

---

## 9. Regles frontend essentielles

Le frontend REX doit :

- montrer l'essentiel d'abord
- rester lisible instantanement
- afficher l'etat reel du systeme
- privilegier dropdowns, toggles, listes claires, cards simples
- eviter le dashboard bruyant

Pages prioritaires :

- Network
- Gateway
- Memory
- Providers
- MCP
- Review
- Sandbox

UI future :

- Flutter desktop = surface principale
- mobile = telecommande / observateur
- dashboard distant = surface secondaire Next.js/React sur la meme API
- acces distant = Tailscale d'abord, Traefik seulement si une exposition HTTP hors tailnet est necessaire

---

## 10. Phases du projet

### Phase 1 — DONE

CLI, Gateway Telegram, Memory semantique, Flutter app macOS, Doctor, Daemon unifie, Agents autonomes, MCP registry, Providers, Budget, Event journal, Semantic cache, Skills system, Task-aware router, Self-improve, Preload, Logging centralise, Two-phase ingest, Consolidation hybride.

### Phase 2 — CURRENT

| Tache | Detail |
|-------|--------|
| MCP Marketplace hub | awesome-mcp-server + registries externes, search/install one-click, cache local |
| LiteLLM integration | Proxy modeles free, auto-rotation providers, unified API |
| Provider API key config UI | Settings Flutter pour configurer les cles API de chaque provider |
| Free model catalog | Catalogue de modeles free avec limites connues (RPM, TPM, quotas) |
| Auto-provider rotation | Sur rate limit 429, rotation automatique vers le provider suivant |
| Shared memory access | Memoire semantique accessible par Claude Code + Codex + gateway |

### Phase 3 — FUTURE

| Tache | Detail |
|-------|--------|
| Hub API | API REST centralise pour app, gateway, CLI, dashboard distant |
| VPS brain | VPS = hub prefere, event journal append-only + queue + ack |
| Tailscale mesh | Join nodes, auto-heal, WOL, `rex doctor` automatique |
| Cross-platform desktop | Flutter desktop macOS/Windows/Linux |
| Dashboard distant | Surface secondaire Next.js/React sur API REX via Tailscale |

### Phase 4 — LATER

| Tache | Detail |
|-------|--------|
| LangGraph spike | Evaluer apres stabilisation orchestrator + queue + state machine |
| Training pipeline | Benchmarks mlx-lm vs unsloth + eval dataset interne |
| Meeting bots | Integration OSS type Otter AI, transcription + memoire |
| Alternative Ollama | Evaluer llamafile, llama.cpp, LocalAI derriere `llm.backend` |

---

## 11. Topologies a couvrir

### Solo

- une seule machine
- pas de hub obligatoire
- pas de Tailscale obligatoire
- tout doit rester utile

### Small Cluster

- 2 a 5 machines
- hub prefere si present
- sinon machine principale temporairement leader

### Fleet

- 10 a 30+ machines
- tags
- groupes
- inventory agrege
- heartbeats compacts
- scheduling par groupe/tag

Une feature qui ne marche qu'en mode "Mac + VPS + GPU" est incomplete.

---

## 12. Fallbacks structurants

- **pas de VPS** : hub local sur machine principale
- **pas de GPU** : petits modeles locaux + free tiers + payant si necessaire
- **hub down** : spool local et reprise plus tard
- **node offline** : ne bloque pas le reste du systeme
- **fleet large** : inventaire compact, pas de sync bavarde partout
- **Telegram/backend indisponible** : fallback backend suivant ou queue locale
- **sandbox runtime indisponible** : fallback runtime valide, jamais reimplementation bas niveau en urgence
- **provider rate limited** : rotation automatique vers le provider suivant
- **tous free tiers epuises** : fallback vers abonnement, puis pay-per-use avec alerte budget

---

## 13. OSS a reutiliser

- **awesome-mcp-server** : catalogue MCP servers pour marketplace REX
- **LiteLLM** : proxy multi-provider, cost tracking, auto-rotation
- **OpenClaw** : patterns agents, gateway, failover, hub ideas
- **NanoClaw** : channels-as-skills, queues, gateway leger
- **YOLO Sandbox / Anthropic sandbox-runtime** : isolation d'execution
- **Tailscale** : connectivite privee
- **RustDesk / Input Leap** : fallback remote control

A ne pas copier :

- interface surchargee
- web dashboard inutilement duplique
- moteur bas niveau deja gere par un OSS solide

---

## 14. Verification minimale

Avant de conclure un travail runtime :

```bash
cd ~/Documents/Developer/keiy/rex
pnpm build
pnpm test
```

Si Flutter est touche :

```bash
cd ~/Documents/Developer/keiy/rex/packages/flutter_app
flutter build macos --debug
```

Si la tache est doc-only, il faut le dire explicitement.

---

## 15. Sortie attendue

Le resultat doit laisser :

- des fichiers modifies clairement identifies
- une logique simple a relire
- une verification claire ou son absence explicite
- une doc coherente avec la vision REX
- moins de doublons et moins de complexite gratuite

---

## 16. Docs optionnelles si profondeur necessaire

A ouvrir seulement si besoin de detail supplementaire :

- `CLAUDE.md`
- `AGENTS.md`
- `README.md`
- `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`
- `docs/plans/2026-03-07-rex-install-optimization-plan.md`
- `docs/plans/2026-03-07-rex-v7-master-plan.md`
- `docs/plans/action-detailed-archive.md`

Ne pas ouvrir ces docs si ce fichier suffit a executer proprement la tache.

---

## 17. REX Agent Factory — Ligne produit B2B (CONNAITRE)

**Fichier de reference** : `docs/plans/rex-agent-factory.md`

REX n'est pas seulement un companion dev pour Kevin. Il est aussi la **fabrique d'agents metier B2B** :

- Kevin cree, deploie et monitore des agents pour des clients artisans/PME via REX
- Chaque client = 1 agent isole, entraine sur son metier (plombier, electricien, peintre…)
- REX reste le createur, l'installateur, l'orchestrateur et le moniteur — les agents clients sont des produits REX

**Stack utilisee** (distincte de REX core) :

| Composant | Role |
|-----------|------|
| Dify (Apache 2.0) | Agent conversationnel + RAG metier |
| n8n (Fair-code) | Workflows, relances, rappels, alertes |
| Pipecat + Twilio | Voice : appels manques, astreintes |
| Docling (IBM/MIT) | Traitement PDF, devis, factures |
| Twenty CRM (AGPL) | CRM leger, contacts, suivi chantier |
| LiteLLM Proxy | Routing multi-client, budget enforce par client_id |
| Langfuse self-hosted | Monitoring tokens/cout/latence par client |
| MLX-LM + Qwen 3 8B | Fine-tuning metier local (Mac M-series, gratuit) |

**Commande cle** : `rex create-client --name "Jean Martin" --trade "plombier" --plan pro`

**Pricing** : 49/79/149 EUR/mois, setup fee 199-499 EUR, marge brute cible 50-60%.

**A NE PAS CONFONDRE** avec REX core : les agents artisans sont des produits deployes par REX, pas des instances REX.

---

## 18. Prompt minimal recommande

```text
Tu es l'agent externe charge de construire REX. Tu ne fais pas partie du runtime du produit. Lis docs/plans/action.md et execute en respectant exactement ses roles, ses invariants, ses fallbacks et ses verifications.
```

---

## 18. Prompt Lead Build Agent

Prompt recommande pour lancer le lead :

```text
Tu es le lead build agent charge de construire et faire evoluer le projet REX.
Tu ne fais pas partie du runtime de REX.
Lis docs/plans/action.md et travaille a partir de ce fichier comme document unique d'execution.

Respecte exactement :
- la repartition des modeles
- les invariants non negociables
- les topologies solo / small cluster / fleet
- la logique de continuity / no-loss
- l'ordre cache -> Ollama local -> free tier -> abonnement -> pay-per-use
- CLI avant MCP avant API
- orchestrateurs = Claude Code + Codex uniquement
- Opus = orchestration et verification, pas scan massif
- Sonnet = implementation
- Haiku = scouting rapide
- team minimale utile seulement
- pas de relecture complete du repo par chaque sous-agent

Ta mission :
1. identifier le bon type de team
2. decouper la tache en sous-taches minimales
3. attribuer les sous-taches aux bons sous-agents
4. limiter chaque sous-agent a son scope
5. verifier la coherence finale
6. donner la preuve de verification ou dire explicitement ce qui n'a pas ete verifie

N'ouvre des docs supplementaires que si action.md te l'indique comme option utile.
Pas de plan abstrait inutile. Pas de points a clarifier si une hypothese raisonnable permet d'avancer.
```

---

## 19. Prompt Sub Build Agent

Prompt recommande pour lancer un sous-agent :

```text
Tu es un sous-agent externe charge de construire une partie de REX.
Tu ne fais pas partie du runtime de REX.
Lis docs/plans/action.md et suis uniquement les instructions et references utiles a ton scope.

Commence par te faire un resume court pour toi-meme :
- mission
- fichiers autorises
- contraintes a respecter
- verifications a produire
- hypotheses retenues

Ensuite execute directement.

Regles :
- ne sors pas de ton scope
- respecte les invariants de action.md
- cache -> Ollama local -> free tier -> abonnement -> pay-per-use
- CLI avant MCP avant API
- orchestrateurs = Claude Code + Codex uniquement, tout le reste = provider/worker
- ne rien perdre : preserve, spool, replay
- si un OSS gere deja la couche bas niveau, integre-le au lieu de le reimplementer
- ne relis pas tout le repo
- ne lis que `action.md` et les fichiers de ton scope
- si ton scope est purement code, ne pars pas en audit global

Si tu touches du runtime, produis une verification concrete.
Si tu touches seulement la doc, dis explicitement que build/tests n'ont pas ete relances.
```

---

## Section 20 — Real-Time Adaptive Loading (context-loader.ts)

**Principe fondateur** : rien n'est chargé statiquement sauf `dangerous-cmd-guard` + `event-journal`.
Tout le reste (guards, MCPs, skills) est déterminé à partir de l'intent détecté au démarrage de session.

### Fichiers

| Fichier | Rôle |
|---------|------|
| `packages/cli/src/context-loader.ts` | Mappe `IntentContext` → `ContextProfile` |
| `packages/cli/src/project-intent.ts` | Détecte l'intent (0 LLM, signaux git) |
| `packages/cli/src/preload.ts` | SessionStart : appelle context-loader, injecte le profil |

### Types

```typescript
export interface ContextProfile {
  intent: ProjectIntent       // 'new-project' | 'feature' | 'bug-fix' | 'refactor' | 'infra' | 'docs' | 'explore'
  confidence: string          // 'high' | 'medium' | 'low'
  guards: string[]            // toujours ['dangerous-cmd-guard']
  mcps: string[]              // filtrés sur les MCPs installés (fallback = tous suggérés)
  skills: string[]            // skills pertinents à l'intent
  note: string                // ligne human-readable pour le contexte preload
}
```

### Table profils par intent

| Intent | Guards | MCPs | Skills | Note |
|--------|--------|------|--------|------|
| `new-project` | dangerous-cmd-guard | filesystem | project-init, ux-flow, api-design | New project — scaffold with /project-init |
| `feature` | dangerous-cmd-guard | github, context7 | ux-flow, api-design, test-strategy | Feature — map flows first, design contracts |
| `bug-fix` | dangerous-cmd-guard | github | debug-assist, test-strategy | /debug-assist + rex search |
| `refactor` | dangerous-cmd-guard | github | code-review, test-strategy | rex review avant de merger |
| `infra` | dangerous-cmd-guard | github | error-handling, build-validate | Guards critiques en mode infra |
| `docs` | dangerous-cmd-guard | context7 | doc | context7 pour refs up-to-date |
| `explore` | dangerous-cmd-guard | context7 | — | rex context + rex search |

### Exports publics

```typescript
buildContextProfile(ctx: IntentContext): ContextProfile
profileToPreloadLine(profile: ContextProfile): string   // ≤200 chars
printContextProfile(profile: ContextProfile): void      // pour rex context --profile
```

### Intégration preload.ts

Au lieu de `intentToPreloadLine(intent)` (simple texte), preload appelle maintenant :
1. `detectIntent(cwd)` → `IntentContext`
2. `buildContextProfile(intent)` → `ContextProfile`
3. `profileToPreloadLine(profile)` → injecté dans le contexte SessionStart

Sortie exemple :
```
Profile: bug-fix (high) | MCPs: github | Skills: /debug-assist, /test-strategy
  Bug-fix — use /debug-assist, search past solutions with rex search "<error>"
```

### Règles de routage MCPs

- Si des MCPs du profil sont dans `~/.claude/settings.json mcpServers` → n'activer que ceux-là
- Si aucun n'est installé → suggérer tous (l'user voit ce qu'il peut installer)
- Fallback silencieux si settings.json inaccessible (Set vide → tous suggérés)

---

## Section 21 — REX Launcher + Node Mesh Fabric

### rex-launcher.ts — Single Entry Point

**Principe** : l'user tape `rex` (sans sous-commande) au lieu de `claude`. REX devient le point d'entrée unique.

**Flux complet** :
```
rex → detectIntent() → buildContextProfile() → patchSettingsForProfile()
    → spawn('claude') → writePid() → monitor PID
    → on exit: saveRecovery() + check intent drift
```

**Fichiers** :

| Fichier | Rôle |
|---------|------|
| `packages/cli/src/rex-launcher.ts` | Launcher principal |
| `~/.claude/rex/launcher.pid` | PID du subprocess claude actif |
| `~/.claude/rex/recovery-state.json` | Intent + profil de la dernière session |

**Exports** : `launchRex(cwd?)`, `killRex()`, `relaunchRex(cwd?)`

**Commandes CLI** :
```
rex            → launchRex()   (défaut, no subcommand)
rex kill       → killRex()     (SIGTERM)
rex relaunch   → relaunchRex() (kill + relaunch avec nouveau profil)
```

**Settings patching (additif, jamais destructif)** :
- Vérifie que `dangerous-cmd-guard` est dans `PreToolUse` hooks
- Log les MCPs actifs vs suggérés mais ne les installe pas
- Ne supprime jamais les hooks existants

**Recovery + intent drift** :
- À chaque exit, `recovery-state.json` sauvegarde intent + profil + CWD + exit code
- Re-détecte l'intent → si drift high-confidence → affiche suggestion `rex relaunch`
- Session suivante affiche "Previous session: bug-fix (12m ago)"

### node-mesh.ts — REX Fabric Layer

**Principe** : chaque nœud (Mac/VPS/RPi/GPU) détecte et publie ses capacités. Le hub route les tâches vers le meilleur nœud disponible.

**Détection locale (zero LLM — pure script)** :

| Capacité | Méthode |
|----------|---------|
| `claude` | `which claude` |
| `codex` | `which codex` |
| `ollama` | `curl localhost:11434/api/tags` |
| `embed` | tag nomic-embed/mxbai dans la réponse Ollama |
| `docker` | `which docker` |
| `ffmpeg` | `which ffmpeg` |
| `tailscale` | `tailscale status --json` → BackendState: Running |
| `gpu` | macOS: Metal via system_profiler / Linux: nvidia-smi |
| `ssh` | `pgrep sshd` |

**Exports** :
```typescript
detectLocalCapabilities(): NodeCapabilities
buildLocalNodeInfo(): MeshNode
registerWithHub(nodeInfo?): Promise<boolean>     // POST /api/nodes/register
routeTask(type: TaskType): Promise<MeshNode|null> // best node for task type
printMeshStatus(): Promise<void>                  // rex mesh / rex nodes
upsertNode(map, info): MeshNode                   // hub-side helper
getMeshStatus(map): { nodes, healthy, stale, offline }  // hub-side helper
```

**Routing des tâches** :

| TaskType | Capacités requises |
|----------|--------------------|
| `llm` | ollama |
| `gpu` | gpu |
| `embed` | embed |
| `docker` | docker |
| `transcribe` | ffmpeg + ollama |
| `claude` | claude |
| `codex` | codex |

**Intégrations** :
- `daemon.ts` : `buildLocalNodeInfo()` + `registerWithHub()` toutes les 60s
- `hub.ts` : `GET /api/nodes/status` via `getMeshStatus()`; `POST /api/nodes/register` via `upsertNode()`
- `gateway.ts` : `routeTask('llm')` avant chaque traitement local (hook point, forwarding Phase 3)
- `index.ts` : `rex mesh` / `rex nodes` → `printMeshStatus()`

**Cache offline** : `~/.claude/rex/mesh-cache.json` — snapshot des nœuds hub pour usage hors-ligne

---

## Section 22 — Token Economy (règles obligatoires)

**Règle absolue** : script avant LLM. Jamais de LLM quand un script suffit.

| Contexte | Modèle |
|----------|--------|
| Scan / lecture / classif | Haiku (rapide, cheap) |
| Code standard | Sonnet |
| Review finale | Opus uniquement |

**Patterns obligatoires** :

1. **Batch reads** : `Promise.all([...])` jamais séquentiel
2. **Semantic cache** : `semantic-cache.ts` avant tout appel LLM — si hit, skip
3. **Preload budget** : max 5 faits injectés, jamais la mémoire complète
4. **Lazy-load MCPs** : activés au lancement de session seulement (`context-loader.ts`)
5. **Early exit** : si l'intent est clair (confidence=high), ne pas relire tout le repo
6. **Scope narrow** : pour un fix simple, lire seulement les 2-3 fichiers concernés

---

## Section 23 — REX uses REX (règle de routing interne)

**Principe** : chaque appel LLM interne DOIT passer par la chaîne officielle.

```
semantic-cache.ts → router.ts → free-tiers.ts → Ollama local → free tier → subscription
```

**Jamais** : importer directement `anthropic`, `openai` ou tout SDK dans le code interne REX.

**Chaîne de routing** :
```typescript
// ✅ Correct
import { orchestrate } from './orchestrator.js'
const result = await orchestrate(prompt, { task: 'classify' })

// ❌ Interdit
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic()
```

**Affectation par tâche** :
- `self-improve`, `categorize`, réponses gateway simples → Ollama/Haiku via router
- Code generation → Sonnet via router
- Review finale → Opus via router (dernier recours)

**node-mesh.ts dans le routing** : le router interroge node-mesh pour savoir quel nœud a Ollama actif en ce moment. Si le nœud local n'a pas Ollama, router fallback vers nœud distant ou free tier.

**Audit** : `gateway.ts` est le premier candidat à auditer — certains appels LLM peuvent encore bypasser le router.


---

## Section 24 — Setup Wizard (onboarding = première démo)

**Principe** : le setup IS la démo. L'user voit la puissance de REX avant même d'avoir tapé une commande.

### Flow

```
rex setup
  ↓
Phase 1 — Discovery parallèle (~30s, scripts purs, 0 LLM)
  · Comptes Claude (~/.claude-account-*)
  · API keys (env, .env, ~/.zshrc, Bitwarden)
  · Ollama + modèles disponibles
  · Dev folders + repos Git
  · GitHub auth (gh CLI)
  · Tailscale nodes
  · Hardware (CPU, RAM, GPU)
  · MCPs déjà installés
  · Sessions Claude existantes à ingérer
  · Guards déjà présents
  ↓
Phase 2 — Organisation (APIs dispo, même payantes, une seule fois)
  · Ingest sessions Claude existantes → mémoire sémantique
  · Catégorisation des repos (intent detection)
  · Setup mesh → rôle Commander/Specialist recommandé
  · Write config.json optimal
  · Install guards + hooks
  · Configure MCPs selon clés disponibles
  ↓
Phase 3 — Le "wow moment"
  ✓ 2 comptes Claude (pool actif)
  ✓ 3 modèles Ollama (qwen, deepseek, nomic-embed)
  ✓ 12 repos indexés en mémoire
  ✓ 8 guards installés
  ✓ 4 MCPs configurés
  ✓ Commander : ce Mac / VPS
  ✓ Fleet : 3 Specialists en ligne (Tailscale)
  ✓ 15 sessions Claude ingérées
  → rex est prêt. Lance : rex
```

### Fichier : `setup-wizard.ts`

Discovery en `Promise.all()`. Organisation via `orchestrate()`. Résultat CLI ou Flutter UI.

### Règle

APIs payantes utilisées UNE SEULE FOIS au setup pour l'ingestion initiale.

---

## Section 25 — Fleet Architecture (terminologie militaire)

**Renommer partout dans le code et l'UI** :

| Ancien | Nouveau |
|--------|---------|
| Hub | Commander |
| Node | Specialist |
| Hub node | Fleet Commander |
| Worker Claude Code | Code Specialist |
| Worker Ollama | Inference Specialist |
| Telegram gateway | Comms |
| Task routing | Mission assignment |

### Hiérarchie

```
Fleet Commander (VPS always-on)
├── Comms (Telegram gateway)
├── Code Specialist (Mac — Claude Code)
├── Inference Specialist (Mac/GPU — Ollama)
└── Background Specialist (RPi — tâches légères)
```

---

## Section 26 — Orchestrateur Async (relay pattern)

**Pas une cascade linéaire, pas un Promise.race naïf. Un relay race avec documentation.**

### Chain staggerée

```
Script (0ms)        → tâche scriptable → fait, 0 token
Ollama local (0ms)  → dispo + forces → fait, gratuit
Free tier (+300ms)  → si Ollama absent/lent
Subscription (+800ms) → si free tier épuisé
Pay → jamais par défaut, alerte si atteint
```

### Self-aware specialists

Chaque spécialiste connaît ses limites AVANT d'essayer :
- Context window max
- Forces / faiblesses par type de tâche
- Latence moyenne, coût/token

Si limits dépassées → `handoffNote` documentée + relais immédiat. Le Commander reçoit toujours un contexte propre.

### Fichier : `orchestrator.ts` (poussé sur feat/litellm-phase2)

Inclut `SPECIALIST_PROFILES`, `checkSpecialistLimits()`, `orchestrate()` avec stagger.

---

## Section 27 — Sécurité Fleet (MCPs, skills, repos)

**Contexte** : CVE-2025-6514 mcp-remote RCE, supply chain npm documentés en 2025.

### Règle : scan avant tout install

```typescript
// Dans mcp-discover.ts AVANT npx install :
const result = await scan(mcpId, 'mcp')
if (result.recommendation === 'block') throw new Error('SECURITY_BLOCK')
if (result.recommendation === 'warn') await confirmWithUser()
```

### Scanners OSS à intégrer

| Scanner | Source | Cible |
|---------|--------|-------|
| mcp-scan | invariantlabs-ai/mcp-scan | descriptions MCP |
| skill-scanner | cisco-ai-defense/skill-scanner | skills agents |
| VirusTotal API | virustotal.com | npm packages, URLs |
| Injection regex | custom 30 patterns | scripts, prompts |
| npm audit | npm CLI | dépendances |

### Patterns bloqués

- `curl ... | bash` (install non-contrôlé)
- Exfiltration env vars (`$ANTHROPIC_API_KEY`, `process.env.*`)
- Zero-width chars (instructions cachées)
- `ignore previous instructions`, DAN mode
- Accès `/etc/passwd`, `~/.ssh`

### Cache : résultats 24h par hash. Fichier : `security-scanner.ts` (poussé sur feat/litellm-phase2)

---

## Section 28 — Lint Loop (script-first feedback)

**Pattern validé en prod** (Factory.ai, DoorDash ZenML 2025).

### Boucle

```
1. Script analyse (ESLint/TSC/Semgrep/custom)
2. LLM reçoit rapport → correction minimale ciblée
3. Script re-analyse
4. Si diff → retour 2
5. Si no diff → done (0 LLM si script suffit dès étape 1)
```

### Convergence

Arrêt si : aucun diff | max 5 iterations | LLM dit "rien à corriger"

### Fichier à créer : `lint-loop.ts`

```typescript
export async function lintLoop(opts: {
  targetPath: string
  analyzer: () => Promise<string>  // script qui retourne rapport
  maxIterations?: number           // default: 5
}): Promise<{ converged: boolean; iterations: number; finalReport: string }>
```

Utilise `orchestrate()` en interne pour les corrections LLM.
