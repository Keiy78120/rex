# REX — ACTION

Document unique d'execution pour une team d'agents.

Si un user dit seulement :

```text
Lis docs/plans/action.md
```

... l'agent doit pouvoir travailler correctement avec ce fichier seul.
Les autres docs ne servent qu'en profondeur optionnelle.

Regle de priorite documentaire :

- `CLAUDE.md` = source de verite projet et produit
- `docs/plans/action.md` = source de verite d'execution one-shot
- si une doc secondaire contredit ce fichier, suivre `CLAUDE.md` puis corriger la doc secondaire

---

## 1. Contexte repo

- **Repo officiel** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche** : `main`
- **Produit** : REX = couche operateur locale-first pour Claude Code
- **Stack principale** : TypeScript/Node, Flutter, SQLite
- **Etat produit** : CLI + memory + guards + gateway Telegram + app Flutter macOS existent deja

---

## 2. Vision REX a respecter

REX doit :

- centraliser scripts, CLIs, services locaux, machines, quotas et providers
- utiliser d'abord ce que l'user possede deja
- rester utile en mode solo, small cluster, ou fleet
- garder la gateway, la sync, la memory et le background en mode preservation puis replay
- eviter les doublons OSS inutiles
- garder une UI simple, lisible, non verbeuse

Formule courte :

1. owned-first
2. free-first
3. payant en dernier
4. zero-loss avant sophistication
5. Flutter pour piloter, headless pour operer

---

## 3. Repartition des modeles pour l'agent team

Utiliser cette logique par defaut :

- **Haiku** : search, scan, lecture rapide, tri, extraction, classement, petite synthese
- **Sonnet** : code, refactor, implementation, wiring, tests locaux, scripts
- **Opus** : orchestration, verification, review finale, architecture, arbitrage, coherence globale

Regle :

- ne pas gaspiller Opus pour du scan simple
- ne pas donner une orchestration complexe a un modele de lecture rapide
- le lead agent pense en Opus, les executants codent surtout en Sonnet, la collecte rapide peut etre faite en Haiku

Mode degrade si tous les modeles ne sont pas disponibles :

- **pas de Haiku** : Sonnet prend aussi le scan, la collecte et la recherche rapide
- **pas de Sonnet** : Opus peut executer des changements codes scopes et plus petits
- **pas d'Opus** : le lead passe en Sonnet avec verification finale plus stricte
- **un seul modele disponible** : garder la meme separation mentale en sous-taches, mais avec un seul executant

---

## 4. Invariants non negociables

1. **Ordre de ressource** : cache -> script/CLI -> service local -> hardware possede -> free tier -> quota abonnement -> payant explicite
2. **Ordre d'integration** : CLI -> MCP -> API -> autre
3. **Flutter** = UI operateur principale, jamais dependance unique
4. **VPS** = hub prefere si disponible, jamais point unique de perte
5. **Gateway = continuity layer** : si un node survit, il spool, preserve et rejoue
6. **No-loss** : append-only, spool local, queue persistante, ack, replay
7. **OSS avant reimplementation** : si une brique existe deja, REX l'integre
8. **Topologie adaptable** : solo, small cluster, fleet
9. **Une seule API REX** pour app, gateway, CLI et dashboard distant
10. **Scripts/runbooks avant repetition manuelle**
11. **Chaque sous-agent commence par un resume interne** : mission, fichiers, contraintes, verification, hypothese retenue

---

## 5. Ce que l'agent doit faire en premier

1. verifier le repo et le chemin
2. identifier si la tache est surtout backend, frontend, docs/sources, ou install/deploy
3. choisir la team minimale utile
4. decouper en sous-taches simples
5. attribuer les fichiers par sous-agent
6. demander a chaque sous-agent un resume interne court avant execution
7. implementer
8. verifier
9. resumer ce qui a ete change

Pas de derapage en exploration infinie.
Pas de "points a clarifier" si une hypothese raisonnable permet d'avancer.

---

## 6. Teams et roles

### Lead Agent

Responsable de :

- lire ce fichier
- choisir la strategie
- attribuer les sous-taches
- faire la coherence finale
- faire la verification finale

### Agent-Team-Backend

A utiliser pour :

- CLI
- daemon
- gateway
- memory
- sync
- hub API
- routing
- inventory
- MCP

Sous-agents possibles :

- Agent-Router
- Agent-Orchestrator
- Agent-Memory
- Agent-Daemon
- Agent-Gateway
- Agent-Network
- Agent-Sync
- Agent-MCP

### Agent-Team-Frontend

A utiliser pour :

- Flutter app
- UX operateur
- pages Network / Gateway / Memory / MCP / Review / Sandbox
- hierarchy visuelle
- composants UI

Sous-agents possibles :

- Agent-Flutter-Core
- Agent-Flutter-Extra
- Agent-UX
- Agent-Design-System

### Agent-Team-Docs

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

Toujours preferer :

1. cache
2. script / CLI local
3. service local
4. node possede
5. free provider
6. abonnement
7. payant

### B. Gateway

La gateway n'est pas un simple bot.
Elle doit :

- journaliser l'entree
- tenter le traitement
- spooler si besoin
- notifier le fallback si necessaire
- rejouer plus tard sans perte

### C. Memory

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

## 10. Topologies a couvrir

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

## 11. Fallbacks structurants

- **pas de VPS** : hub local sur machine principale
- **pas de GPU** : petits modeles locaux + free tiers + payant si necessaire
- **hub down** : spool local et reprise plus tard
- **node offline** : ne bloque pas le reste du systeme
- **fleet large** : inventaire compact, pas de sync bavarde partout
- **Telegram/backend indisponible** : fallback backend suivant ou queue locale
- **sandbox runtime indisponible** : fallback runtime valide, jamais reimplementation bas niveau en urgence

---

## 12. OSS a reutiliser

- **OpenClaw** : patterns agents, gateway, failover, hub ideas
- **NanoClaw** : channels-as-skills, queues, gateway leger
- **YOLO Sandbox / Anthropic sandbox-runtime** : isolation d'execution
- **LiteLLM** : inspiration proxy/cost tracking
- **Tailscale** : connectivite privee
- **RustDesk / Input Leap** : fallback remote control

A ne pas copier :

- interface surchargee
- web dashboard inutilement duplique
- moteur bas niveau deja gere par un OSS solide

---

## 13. Verification minimale

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

## 14. Sortie attendue

Le resultat doit laisser :

- des fichiers modifies clairement identifies
- une logique simple a relire
- une verification claire ou son absence explicite
- une doc coherente avec la vision REX
- moins de doublons et moins de complexite gratuite

---

## 15. Docs optionnelles si profondeur necessaire

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

## 16. Prompt minimal recommande

```text
Lis docs/plans/action.md et execute en respectant exactement ses roles, ses invariants, ses fallbacks et ses verifications.
```

---

## 17. Prompt Lead Agent

Prompt recommande pour lancer le lead :

```text
Tu es le lead agent sur REX.
Lis docs/plans/action.md et travaille a partir de ce fichier comme document unique d'execution.

Respecte exactement :
- la repartition des modeles
- les invariants non negociables
- les topologies solo / small cluster / fleet
- la logique de continuity / no-loss
- l'ordre owned-first, free-first, payant en dernier
- CLI avant MCP avant API

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

## 18. Prompt Sub Agent

Prompt recommande pour lancer un sous-agent :

```text
Tu es un sous-agent sur REX.
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
- owned-first, free-first, payant en dernier
- CLI avant MCP avant API
- ne rien perdre : preserve, spool, replay
- si un OSS gere deja la couche bas niveau, integre-le au lieu de le reimplementer

Si tu touches du runtime, produis une verification concrete.
Si tu touches seulement la doc, dis explicitement que build/tests n'ont pas ete relances.
```
