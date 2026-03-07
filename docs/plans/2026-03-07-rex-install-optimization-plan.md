# REX — Install & Optimization Side Plan

*Date : 2026-03-07*
*But : rendre REX installable en one-command sur macOS, Windows, Linux et VPS, sans casser le mono-repo*

---

## Objectif

Permettre a un user de faire :

- `rex install` sur macOS
- `rex install` sur Windows
- `rex install` sur Linux desktop
- `rex install --hub` sur VPS

... avec le moins de friction possible, des diagnostics clairs, et des fallbacks quand une dependance manque.

---

## Contraintes non negociables

- mono-repo conserve
- une seule source de verite config
- local-first / owned-first / free-first
- aucun wizard ne doit masquer les echecs
- toute auto-install doit etre idempotente

---

## Axes de travail

### A. Detecter avant d'installer

REX doit profiler l'environnement avant toute action :

- OS
- shell
- privileges
- Node
- Docker
- Ollama / alternative locale
- Tailscale
- Flutter GUI possible ou non
- GPU / RAM / disque
- outils deja presents

Sortie :

- ce qui est deja OK
- ce qui manque
- ce qui peut etre auto-installe
- ce qui doit etre confirme par l'user

### B. Installer par profils

Profils minimaux :

- `local-dev`
- `desktop-full`
- `headless-node`
- `hub-vps`
- `gpu-node`

Chaque profil decide :

- quels packages installer
- quels services activer
- quelles pages UI sont pertinentes
- quels warnings afficher

### C. Eviter les erreurs par design

Avant d'executer quoi que ce soit :

- verifier permissions
- verifier reseau
- verifier espace disque
- verifier ports occupes
- verifier que les binaries sont trouvables dans le PATH
- verifier qu'un service equivalent n'est pas deja lance

### D. Garder le mono-repo, separer les runtimes

Le mono-repo peut contenir plusieurs runtimes sans se casser si les frontieres sont nettes :

- TypeScript/Node pour orchestration et logique produit
- Rust seulement pour les hot paths prouves
- scripts shell/PowerShell pour bootstrap systeme
- Docker Compose pour hub VPS

Regle :

- on ne change de langage que si le profiling montre un gain net
- pas de re-ecriture de confort

### E. Unifier les installs cross-platform

Arborescence cible :

- `packages/cli/` : logique commune
- `packages/bootstrap/` ou `scripts/bootstrap/` : OS-specific installers
- `scripts/install-macos.sh`
- `scripts/install-linux.sh`
- `scripts/install-windows.ps1`

Le coeur appelle les bons scripts selon l'OS.

---

## Roadmap

### Phase 1 — Detection fiable

- `rex doctor --json` enrichi
- `rex resources --json`
- `rex install --dry-run`
- matrice de compatibilite par OS/profil

### Phase 2 — Bootstrap propre

- scripts bootstrap idempotents
- mode non interactif et interactif
- journaux d'installation
- resume final clair

### Phase 3 — Hub VPS

- `rex install --hub`
- Docker Compose ou binaire selon contexte
- Tailscale / reverse proxy / API exposee
- health checks post-install

### Phase 4 — Desktop cross-platform

- Flutter desktop cible macOS, Windows, Linux
- fallback headless si GUI indisponible
- packaging et mises a jour a definir par OS

### Phase 5 — Performance reelle

- profiler les hot paths
- migrer seulement ce qui bloque vraiment
- conserver TS partout ou c'est assez rapide

---

## Defaults d'implementation

- Windows : commencer par scheduled task/service simple avant plus lourd
- Linux desktop : preferer systemd user service
- VPS : Docker par defaut, binaire slim seulement si machine faible
- Reverse proxy distant : Tailscale-only d'abord, Traefik expose en option
- Flutter desktop : une seule app multiplateforme avec degrades propres selon OS

---

## Definition of Done

- one-command install fonctionne sur les 4 profils principaux
- le resume post-install dit exactement ce qui marche et ce qui ne marche pas
- aucun setup partiel silencieux
- rollback ou re-run possible sans casser l'existant
- docs de recovery incluses
