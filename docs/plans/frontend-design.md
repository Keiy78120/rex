# REX — FRONTEND DESIGN

Plan simple pour la surface operateur REX.

---

## 1. Mission

Construire une interface REX claire, rapide a lire, minimaliste et utile.
REX = hub centralise de toutes les ressources. L'UI montre l'etat reel et permet le pilotage.

Orchestrateurs : **Claude Code + Codex ONLY**. Tout automatique, zero setup.

Le frontend REX ne doit pas devenir :

- un dashboard verbeux
- une copie d'OpenClaw
- une dependance systeme

Le frontend doit montrer l'essentiel et piloter une API unique.

Phases frontend :

- **Phase 1** : ✅ DONE (pages: Health, Voice, Audio, Memory, Gateway, Agents, MCP, Optimize, Settings)
- **Phase 2** : ✅ DONE (MCP Marketplace, Providers API keys, free model catalog, 26 pages total)
- **Phase 3** : ✅ DONE (Hub page, Network/Fleet page, Clients page — session 2026-03-15)
- **Phase 4** : LATER (fleet dashboard, cross-platform Flutter Windows/Linux)

---

## 2. Regles de design

1. montrer l'essentiel d'abord
2. garder une lecture instantanee
3. privilegier listes, statuts, dropdowns, toggles, cards simples
4. eviter les vues surchargees
5. toujours montrer l'etat reel : online, pending, degraded, replaying, healthy
6. aucune logique critique uniquement dans l'UI

---

## 3. Surface principale

### Flutter desktop

Reste la surface operateur principale.

Cible :

- macOS aujourd'hui
- Windows et Linux ensuite

### Mobile futur

Role :

- telecommande
- observateur
- notifications

Pas de cerveau mobile.
Pas de logique metier exclusive mobile.

### Dashboard distant

Autorise seulement comme vue secondaire sur la meme API.
Pas une deuxieme verite.
Pas une reimplementation parallele de l'app.

---

## 4. Pages prioritaires

### Network

Doit montrer :

- nodes
- roles
- status
- latence
- queue size
- pending replay
- mode solo / cluster / fleet

### Gateway

Doit montrer :

- adapters actifs
- backend actif
- etat degrade ou non
- pending messages
- retry/replay state

### Memory

Doit montrer :

- recherche
- observations
- lessons
- runbooks
- successes
- pending ingest
- snapshots

### Providers

Doit montrer :

- ordre de routing
- ressources possedees
- CLIs detectes
- services locaux
- quotas / budget
- fallback utilise

### MCP + Marketplace (Phase 2)

Doit montrer :

- registry local (installed, enabled / disabled)
- recommended for current project
- security scan

Marketplace (Phase 2) :

- browse : liste paginee des serveurs MCP populaires (source: awesome-mcp-servers, mcp.run, Smithery)
- search : filtre par nom, categorie, tag
- detail card : nom, description, install command, stars, verified badge
- one-click install : bouton "Install" → `rex mcp install <name>` → refresh registry
- one-click activate/deactivate : toggle enabled/disabled
- cache local du catalogue (refresh 1x/jour, pas de fetch bloquant)

### Providers (Phase 2)

Doit montrer :

- ordre de routing (owned-first → free → paid)
- ressources possedees (CLIs, services locaux, hardware)
- quotas / budget

Section API Keys config (Phase 2) :

- liste des providers supportes (Groq, Together, Cerebras, HF, Mistral, OpenAI, Anthropic)
- champ API key par provider (masque, copy, test connection)
- status : connected / not configured / rate limited / quota exhausted
- free model catalog : tableau des modeles gratuits avec RPM/TPM/quotas connus
- auto-rotation status : quel provider est actif, lequel est en cooldown

### Hub (Phase 3 — ✅ DONE session 2026-03-15)

Implémenté dans `hub_page.dart` (Commander view) + `network_page.dart` (Fleet view) :

- nodes connectés (Fleet Peers section)
- tâches en cours (Event Queue section)
- santé globale (TopologyBanner + NodeIdentityCard)
- queue size / pending replay (QueueCard)

### Review / Sandbox

Doivent montrer :

- etat reel du pipeline review
- provenance du runtime sandbox
- logs utiles
- incidents et actions possibles

---

## 5. Direction UI

L'UI REX doit ressembler a un cockpit sobre, pas a une usine.

Bon signal visuel :

- statuts clairs
- densite controlee
- groupes logiques
- actions peu nombreuses mais bien placees
- dropdowns pour les choix de backend, node, tag, groupe, mode

Mauvais signal visuel :

- 15 widgets qui racontent la meme chose
- trop de texte marketing dans l'app
- pages qui cachent les incidents reels
- web dashboard "AI slop"

---

## 6. Sous-agents frontend

### Agent-Flutter-Core

Mission :

- Network
- Providers
- Memory
- Gateway

### Agent-Flutter-Extra

Mission :

- MCP
- Review
- Sandbox
- polish de pages secondaires

### Agent-UX

Mission :

- hierarchie d'information
- labels
- navigation
- empty/loading/error states

### Agent-Design-System

Mission :

- tokens
- composants de base
- cards, rows, badges, dropdowns, status chips

---

## 7. Defaults d'implementation

Si le user ne demande pas autre chose :

- sidebar simple
- toolbar compacte
- cards lisibles
- tables courtes ou listes structurees
- dropdowns pour les selections frequentes
- details/expandables pour le secondaire
- feedback explicite en cas de mode degrade

---

## 8. Verification

A minima :

```bash
cd ~/Documents/Developer/keiy/rex/packages/flutter_app
flutter build macos --debug
```

Le frontend est bon si :

- il charge vite
- il montre la realite du systeme
- il reste utile sans noyer l'user
- il ne cree pas de dependance a l'UI pour les actions critiques
