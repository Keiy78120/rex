# REX — FRONTEND DESIGN

Plan simple pour la surface operateur REX.

---

## 1. Mission

Construire une interface REX claire, rapide a lire, minimaliste et utile.

Le frontend REX ne doit pas devenir :

- un dashboard verbeux
- une copie d'OpenClaw
- une dependance systeme

Le frontend doit montrer l'essentiel et piloter une API unique.

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

### MCP

Doit montrer :

- registry
- enabled / disabled
- recommended for current project
- security scan

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
