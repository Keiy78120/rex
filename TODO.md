# REX — TODO (ne pas s'arrêter tant que tout n'est pas ✅)

> Règle : travailler cette liste du haut vers le bas.
> Cocher chaque tâche avec ✅ dès qu'elle est terminée.
> Ne jamais s'arrêter avant que toutes les cases soient ✅.
> Si une tâche est bloquée, la noter ⚠️ avec la raison et passer à la suivante.
> Relire action.md avant de commencer.

---

## PHASE 1 — Renommage

- ✅ Renommer hub → Commander dans tout le codebase (grep + sed)
- ✅ Renommer nodes/node → Fleet/Specialist dans tout le codebase
- ✅ Vérifier que les types TypeScript reflètent le nouveau naming
- ✅ Commit : refactor(naming): hub→Commander, nodes→Fleet

## PHASE 2 — Review fichiers poussés par Milo

- ✅ Review + fix imports : orchestrator.ts
- ✅ Review + fix imports : security-scanner.ts
- ✅ Review + fix imports : node-mesh.ts
- ✅ Review + fix imports : rex-launcher.ts
- ✅ Review + fix imports : setup-wizard.ts
- ✅ Wire security-scanner dans mcp-discover.ts (scan avant install)
- ✅ Wire orchestrator dans gateway.ts (réponses simples)
- ✅ Ajouter rex (default) → launchRex() dans index.ts
- ✅ Ajouter rex kill + rex relaunch dans index.ts
- ✅ Ajouter rex mesh → printFleetStatus() dans index.ts
- ✅ Commit : feat(core): wire launcher + orchestrator + security

## PHASE 3 — Fleet fonctionnel

- ✅ Créer daemon.ts — heartbeat 60s, buildLocalFleetNode(), registerWithCommander()
- ✅ Créer hub.ts — API Commander : POST /nodes/register, GET /nodes/status
- ✅ Tester enregistrement nœud local → Commander
- ✅ Commit : feat(fleet): daemon + Commander API

## PHASE 4 — REX CURIOUS

- ✅ Créer signal-detector.ts — scan memory pour détecter signaux
- ✅ Créer curious.ts — script → Ollama/Groq → solution → memory
- ✅ Intégrer signal-detector dans daemon.ts
- ✅ Commit : feat(curious): background problem solver

## PHASE 5 — Lint Loop

- ✅ Créer lint-loop.ts — boucle script→LLM→convergence
- ✅ Utiliser orchestrate() en interne
- ✅ Ajouter rex lint dans index.ts
- ✅ Commit : feat(tools): lint-loop

## PHASE 6 — REX HQ

- ✅ Créer event-journal.ts — log central events REX
- ✅ Intégrer dans orchestrator, daemon, curious, gateway
- ✅ Commit : feat(hq): event journal

## PHASE 7 — Intégration finale

- ✅ rex setup end-to-end fonctionnel
- ✅ rex doctor valide tous les composants
- ✅ rex mesh affiche Fleet + Specialists
- ✅ Tests bout en bout : rex setup → rex → session Claude Code
- ✅ Commit : feat(integration): full CLI end-to-end

---

## PHASE 8 — Fix Claude Gateway

- ✅ Supprimer tous les CLAUDE_CODE_* de claudeEnv() (pas seulement CLAUDECODE)
- ✅ Injecter PATH complet (.local/bin, nvm bin) pour daemon/LaunchAgent
- ✅ Documenter la limitation dans action.md (GATEWAY section)

## PHASE 9 — Free Tiers & Providers

- ✅ DeepSeek déjà présent dans free-tiers.ts (deepseek-chat, deepseek-reasoner)
- ✅ Ajouter Qwen API (Alibaba Cloud) à free-tiers.ts (qwen-turbo/plus/max/coder-plus, DASHSCOPE_API_KEY)
- ✅ LiteLLM config — litellm.ts auto-rotate inclut tous les providers du catalogue

## PHASE 10 — CURIOUS Proactif (3 signaux + Telegram)

- ✅ Ajouter type SignalType: DISCOVERY | PATTERN | OPEN_LOOP dans signal-detector.ts
- ✅ DISCOVERY: modèles + MCPs + repos détectés → notif Telegram groupée par type
- ✅ PATTERN: erreur/pattern récurrent ≥3 fois → notif Telegram (signalType PATTERN)
- ✅ OPEN_LOOP: patterns TODO/BUG/FIXME non résolus >7j → notif Telegram
- ✅ Cron source: awesome-mcp-servers (fetchAwesomeMcpServers via GitHub API topic:mcp)
- ✅ sendProactiveNotifications() dans daemon.ts curious cycle

## PHASE 11 — Fleet Thermal Awareness

- ✅ CPU/RAM via os.loadavg + freemem/totalmem (natif Node.js — zero dépendance externe)
- ✅ ThermalStatus dans FleetNode (cpuLoadPercent, ramUsedPercent, healthy)
- ✅ routeTask() filtre nodes avec CPU >80% ou RAM >90%
- ✅ buildLocalFleetNode() inclut thermalStatus live
- ⚠️ thermalStatus des nodes distants: ils doivent envoyer leurs stats au hub via heartbeat (phase future)

## PHASE 12 — Docker Compose (VPS + local)

- ✅ docker-compose.yml étendu (rex-hub + rex-daemon + rex-gateway + ollama + healthchecks)
- ✅ .env.docker.example créé avec toutes les vars nécessaires
- ✅ rex init --docker déjà dans index.ts → docker.ts (génère docker-compose.local.yml + .env.docker)
- ⚠️ Test docker compose up --detach localement — à faire manuellement (pas de Dockerfile encore)

## PHASE 13 — WebSocket Gateway Server

- ✅ ws npm package installé dans packages/cli
- ✅ WS server dans gateway.ts (port 7421, GatewayMessage format normalisé)
- ✅ Format message: { channel, from, text, ts, meta }
- ✅ Broadcast inbound Telegram messages aux clients WS connectés
- ✅ Flutter: remplacer polling par WS connection vers gateway (dart:io WebSocket, port 7421, live feed + 10s reconnect)

## PHASE 14 — Ink CLI (VPS terminal)

- ✅ ink + react installés dans packages/cli
- ✅ packages/cli/src/ink-tui.ts créé (3 tabs: Health, Logs, Fleet — keyboard nav)
- ✅ rex tui ajouté dans index.ts

---

Quand tout est ✅ → echo "REX COMPLETE - All tasks done" dans le terminal.

# REX TODO — Session 09/03/2026
> Brief Claude Code — implémenter tout ce qui suit en /loop

---

## PRIORITÉ 1 — REX Identity Layer (gateway.ts)

**Fichier :** `packages/cli/src/gateway.ts`

Transformer le gateway en "cerveau de REX" :
- ✅ Ajouter `RexIdentityLayer` avant tout appel LLM — `rex-identity.ts` créé
- ✅ Step 1 : `memory_search(message)` → contexte focalisé (< 2K tokens)
- ✅ Step 2 : `event_journal.recent()` → qu'est-ce qui s'est passé récemment
- ✅ Step 3 : `intent_detect(message)` → INTENT_MAP canonical (11 intents, 0ms)
- ✅ Step 4 : `try_scripts(intent, context)` → SCRIPT_RULES, 0 LLM
- ✅ Step 5 : `check_open_loops()` → signaux CURIOUS via `getRelevantSignals()`
- ✅ Step 6 : `build_focused_brief(context)` → brief ciblé pour LLM
- ✅ Step 7 : `orchestrate(brief)` → streamAgent() via agent-runtime.ts

```typescript
const INTENT_MAP = {
  search:   /cherch|search|trouv|find|quoi|what|qui|who|montre|show/i,
  create:   /crée|create|nouveau|new|génère|generate|écris|write|fais/i,
  fix:      /fix|corrig|répare|bug|erreur|error|casse|broken/i,
  status:   /status|état|comment|how|avance|progress|où en|done/i,
  schedule: /planifi|schedule|rappel|reminder|demain|tomorrow|agenda|rdv/i,
  budget:   /budget|coût|prix|combien|facture|dépense|cost/i,
  deploy:   /deploy|lance|start|démarre|installe|run/i,
  memory:   /souviens|remember|rappelle|note|mémorise/i,
  fleet:    /machine|appareil|mac|vps|pc|fleet|node/i,
}
```

---

## PRIORITÉ 2 — Relay Engine

**Fichier :** `packages/cli/src/relay-engine.ts`

- ✅ `runRelay(task, context, opts)` — sequential multi-model relay document
- ✅ Pipeline : Ollama (chat models only) → Groq → Claude Haiku → Mentor (Opus)
- ✅ `passReason` documented per model contribution
- ✅ Stops if confidence >= 0.8 (Ollama or Groq)
- ✅ Mentor gated behind `mentorEnabled: true` AND all confidence < 0.6
- ✅ `rex relay "<task>" [--mentor] [--json]` CLI command wired
- ⚠️ RxJS pipe() not used (async/await sequential instead — functionally equivalent)

---

## PRIORITÉ 3 — User Cycles (XState)

**Fichier :** `packages/cli/src/user-cycles.ts`

- ✅ XState installed + `createMachine` / `assign` / `createActor`
- ✅ Machine: awake_active → awake_idle → sleeping → waking_up → awake_active
- ✅ `sleepScore` = idleTime×0.4 + noMsg×0.3 + calendarHint×0.2 + historicalPattern×0.1
- ✅ SLEEPING → `allowedTiers: ['local']` (Ollama only, 0 paid)
- ✅ WAKING_UP → daemon sends morning digest via Telegram
- ✅ `rex user-cycles [--json]` CLI command
- ✅ Snapshot persisted to `~/.claude/rex/user-cycles-state.json`
- ✅ Morning digest: `buildMorningDigest()` in user-state.ts (wired in daemon)
- ✅ Daemon: user-cycles poll every 5min, gates paid API tier

---

## PRIORITÉ 4 — ActivityWatch Bridge

**Fichier :** `packages/cli/src/rex-monitor/activitywatch-bridge.ts`

- [ ] Requêter `localhost:5600/api/0/query/` ActivityWatch
- [ ] Extraire : idle time, apps actives, durée sessions
- [ ] Alimenter `user-cycles.ts` pour détection SLEEPING
- [ ] Alimenter `pattern-detector.ts` pour CURIOUS PATTERN signals

---

## PRIORITÉ 5 — Pattern Detector (CURIOUS)

**Fichier :** `packages/cli/src/rex-monitor/pattern-detector.ts`

- [ ] Installer : `npm install simple-statistics`
- [ ] Calculer `P(action | context)` sur historique 30 jours
- [ ] Si probabilité > 0.7 → générer signal `CURIOUS PATTERN`
- [ ] Exemples détectés : "cherche Stellantis chaque lundi", "réunion chaque jeudi 14h"
- [ ] Intégrer avec `curious.ts` existant

---

## PRIORITÉ 6 — Agent Templates Clients

**Répertoire :** `packages/cli/src/agent-templates/`

- [ ] Installer : `npm install @openai/agents zod`
- [ ] `base-template.ts` : interface `AgentTemplate` (tools[], memoryInit, style, automations[])
- [ ] `dg-template.ts` : profil DG complet
  - Tools : Calendar, Gmail, Drive, AudioLogger, Monitor, Reminders
  - Style : vouvoiement, bullet points, réponse courte + action concrète
  - Automatisations : brief avant RDV, résumé post-réunion, digest 8h, follow-ups OPEN_LOOP
- [ ] `drh-template.ts` : profil DRH (confidentialité critique — données jamais hors container)

---

## PRIORITÉ 7 — rex client:* CLI

**Fichier :** `packages/cli/src/commands/client.ts`

- [ ] `rex client:create --template <type> --name <id>`
  - Crée container Docker isolé
  - Installe template persona
  - Configure gateway (Telegram/WhatsApp)
  - Configure Claude Max (90€/mois)
  - Lance REX Monitor
  - Remonte logs vers Commander
- [ ] `rex client:list` — liste les clients actifs
- [ ] `rex client:logs <id>` — logs du container
- [ ] `rex client:stop <id>` — arrêt propre
- [ ] Ajouter ces commandes dans `index.ts`

---

## PRIORITÉ 8 — Sandbox Environment

**Fichier :** `packages/cli/src/sandbox/`

- [ ] `docker-compose.sandbox.yml` — container isolé du prod
- [ ] `sandbox-runner.ts` — REX peut tester ici sans toucher prod
- [ ] `benchmark.ts` — compare sandbox vs prod
- [ ] `rollback.sh` — retour état stable si sandbox KO
- [ ] Intégrer dans self-improve.ts : toute modif passe par sandbox avant prod

---

## PRIORITÉ 9 — Watchdog Daemon

**Fichier :** `packages/cli/src/watchdog.ts`

- ✅ Check every 60s: daemon running, budget, memory health
- ✅ Loop detection: idleIterations >= maxIdleIterations (default 10) → pause + Telegram notify
- ✅ Budget exceeded → log warning + notify (fallback to free tiers)
- ✅ Daemon down → auto-restart via spawn detached
- ✅ `rex watchdog` (single cycle) + `rex watchdog start` (continuous loop)
- ✅ Wired into daemon.ts (60s interval)

---

## PRIORITÉ 10 — Codex OAuth Provider

**Fichier :** `packages/cli/src/providers/codex-oauth.ts`

- [ ] Implémenter device-code flow (référence : PR openclaw #32065)
- [ ] Token stocké dans `~/.rex/credentials/codex.json`
- [ ] Intégrer dans relay chain après Groq, avant Claude
- [ ] Usage : tâches de code background (Codex = spécialiste code)

---

## PRIORITÉ 11 — REX Runner (.rex format)

**Fichier :** `packages/cli/src/rex-runner.ts`

- ✅ Parser `.rex` files — extracts `#!exec` fenced code blocks
- ✅ Supports: typescript (via tsx), bash/sh, python
- ✅ `rex run <file.rex> [--dry-run] [--json]` CLI command
- ✅ Results shown per block with timing + exit code
- ✅ Temp TS files cleaned up after execution (try/finally)

---

## PRIORITÉ 12 — Effect-ts Integration

- ✅ Installer : `npm install effect` (done — in package.json)
- ⚠️ Full migration of litellm.ts + gateway.ts to Effect deferred — complex refactor
  would require rewriting all async call sites. Package installed, ready when needed.
  Priority: script-first 90% approach means LLM call paths are rarely hot paths.

---

## RAPPELS ARCHITECTURE (lire avant d'implémenter)

- Lire `docs/REX-BRAIN.md` en entier — 795 lignes, toute la logique
- User parle à REX, jamais à Claude/Qwen directement
- Script-first : 90% sans LLM, 8% LLM local, 2% relay chain
- Tokens = énergie → économiser comme des calories
- SLEEPING → Ollama only, 0€
- Additive only — ne jamais casser du code qui marche
- Sandbox avant prod pour toute modification de REX lui-même
- Mentor (Opus extended) = dernier recours absolu, jamais en premier

---

## LOOP INSTRUCTIONS

```
/loop jusqu'à ce que toute la liste soit ✅
Commencer par PRIORITÉ 1 (gateway REX Identity Layer)
Après chaque fichier créé : tester + committer
Si bloqué sur une priorité > 5 min → passer à la suivante et revenir
Ne pas toucher à OpenClaw config
Ne pas merger sur main sans validation Kevin
```
### CLAUDE_TASK.md déposé — Mon Mar  9 22:23:26 UTC 2026
