# AGENTS.md

Instructions repo-specifiques pour Codex et les agents de code travaillant sur REX.

---

## Source de verite

- Repo officiel unique : `/Users/keiy/Documents/Developer/keiy/rex`
- Ne jamais travailler dans un clone miroir comme `/_config/rex`
- `CLAUDE.md` racine = source de verite projet, produit et architecture
- `docs/plans/action.md` = document d'execution one-shot pour une team d'agents

Ordre de priorite :

1. demande utilisateur
2. `CLAUDE.md`
3. `docs/plans/action.md`
4. ce `AGENTS.md`
5. autres docs `docs/plans/*.md`

---

## Ce qu'un agent doit retenir sur REX

- REX est une couche operateur locale-first pour Claude Code
- REX doit centraliser dynamiquement scripts, CLIs, services, hardware, quotas et providers
- REX doit rester utile en mode solo, small cluster ou fleet
- Flutter est la surface operateur principale
- toute feature critique doit aussi rester operable en headless via CLI, daemon, gateway ou API
- le hub VPS est prefere si disponible, jamais point unique de perte
- gateway, sync, memory et background doivent preserver, spooler, organiser puis rejouer
- l'ordre de choix des ressources est : cache -> script/CLI -> service local -> hardware possede -> free tier -> abonnement -> payant
- l'ordre d'integration est : CLI -> MCP -> API -> autre
- les tools externes peuvent etre connus, mais restent desactives par defaut jusqu'au choix explicite du user
- si un OSS solide gere deja la couche bas niveau, REX l'integre au lieu de la reimplementer

---

## Regles de travail pour Codex et autres agents

Avant un travail non trivial :

- verifier le chemin courant
- lire `CLAUDE.md`
- lire `docs/plans/action.md`
- confirmer rapidement l'etat executable si le sujet touche le runtime

Quand `README`, `plans` et `code` divergent :

- faire confiance au code executable
- corriger la doc
- signaler la contradiction

Si un changement touche reseau, hub, sync, gateway, memory ou agents :

- verifier que la feature reste operable sans Flutter
- proteger la durabilite avant la reactivite
- ajouter ou respecter spool, ack, replay, resume

Quand le user demande un audit ou une review :

- findings d'abord
- references fichiers/lignes
- regressions reelles
- risques de perte
- incoherences doc/code
- complexite prematuree

---

## Zones sensibles

- `CLAUDE.md` : ne pas laisser deriver la source de verite
- `README.md` : rester public, simple, non interne
- `docs/plans/action.md` : doit suffire pour lancer une team en one-shot
- `packages/cli/src/gateway.ts` : continuite et fallback
- `packages/cli/src/sync.ts` : zero-loss avant sync elegante
- `packages/memory/src/ingest.ts` : aucune perte de donnees
- `packages/flutter_app/lib/services/rex_service.dart` : gros point de couplage UI/process

---

## Verification

Apres modifs, l'agent doit dire explicitement :

- ce qui a ete verifie
- ce qui n'a pas ete verifie
- pourquoi

Commandes pertinentes selon le scope :

- `pnpm build`
- `pnpm test`
- `rex audit --strict`
- `cd packages/flutter_app && flutter build macos --debug`
