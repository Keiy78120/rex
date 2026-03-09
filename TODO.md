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
