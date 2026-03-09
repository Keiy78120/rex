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

Quand tout est ✅ → echo "REX COMPLETE - All tasks done" dans le terminal.
