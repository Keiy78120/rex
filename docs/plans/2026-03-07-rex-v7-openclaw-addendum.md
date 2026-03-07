# REX v7 — OpenClaw Boost Addendum

*Date : 2026-03-07*
*But : clarifier la vision REX avant implementation du hub distribue*

---

## Pourquoi cet addendum existe

Le master plan v7 est riche, mais il melange parfois :

- le produit actuel
- la cible v7
- des inspirations open source
- des optimisations techniques encore non prouvees

Cet addendum fixe les decisions qui comptent vraiment pour REX.

---

## Decisions verrouillees

### 0. User-owned first

REX doit toujours raisonner dans cet ordre :

1. cache local
2. script local ou outil deterministe deja installe
3. service local ou CLI deja disponible
4. hardware possede par l'user (machine courante, GPU node, VPS, NAS)
5. provider gratuit
6. quota d'abonnement deja possede
7. API payante explicite

Le role de REX n'est pas juste de choisir un modele.
Le role de REX est de centraliser ce que l'user possede deja et de proposer la ressource suffisante la moins couteuse.

### 0bis. Ordre de resolution des outils

Quand REX cherche une capacite, il doit tester les integrations dans cet ordre :

1. CLI local ou script deja disponible
2. MCP si l'integration apporte une vraie valeur structuree
3. API directe
4. autre adaptation seulement en dernier recours

REX ne doit pas mettre MCP partout par reflexe.
Le but est de reutiliser d'abord ce que l'user a deja et de garder les chemins les plus simples.

### 0ter. Registry large, activation stricte

REX peut connaitre beaucoup de tools, y compris ceux inspires d'OpenClaw et d'autres hubs utiles :

- filesystem
- GitHub
- Context7
- Playwright
- Fetch / Brave / Firecrawl
- SQLite / PostgreSQL
- Google Workspace
- Cloudflare
- Slack / Linear / Notion
- Sentry / Grafana

Mais la regle doit rester :

- tools internes REX ou wrappers locaux safe : activables immediatement
- integrations externes : `disabled` par defaut
- activation par choix user, ou par recommandation explicite avec confirmation

L'auto-selection par stack doit proposer, jamais activer silencieusement.

### 0quater. Integrer avant de reimplementer

Si une brique open source gere deja correctement une capacite technique, REX ne doit pas la re-developper juste pour "tout faire maison".

Regle pratique :

1. integrer la brique existante
2. ajouter une couche REX mince pour config, policies, logs, healthchecks et UX
3. ne reimplementer que ce qui est specifique a REX ou manque reellement

Exemple direct :

- isolation/sandbox = YOLO Sandbox, Anthropic sandbox-runtime ou equivalent
- REX gere le choix du runtime, le profil de risque, les logs, l'etat, les toggles et les fallbacks
- REX ne doit pas reconstruire un moteur d'isolation complet si ces projets le font deja

### 1. Copier les capacites d'OpenClaw, pas son interface

REX s'inspire d'OpenClaw pour :

- la centralisation des agents et des routes
- le controle distant securise
- le hub permanent
- les fallbacks entre backends

REX ne copie PAS :

- une UI web surchargee
- des dashboards verbeux
- une sur-abstraction qui masque l'essentiel

La vue operateur doit rester minimale : sante, nodes, taches, queue, memory pending, incidents.

### 2. L'UI principale reste l'app Flutter existante

Le choix par defaut est verrouille :

- **UI operateur principale** : app Flutter desktop
- **Remote control** : API securisee + gateway Telegram + CLI
- **Dashboard distant futur** : Next.js/React seulement si une vue browser est utile, jamais comme nouvelle source de verite

Si Flutter est indisponible sur une machine, REX doit rester totalement operable en mode headless.

Cible produit :

- aujourd'hui : macOS-first
- ensuite : Windows + Linux desktop
- plus tard si utile : iPhone/Android comme surface de pilotage secondaire

Le mobile n'est pas requis pour l'architecture de base. Il doit rester un consommateur futur de la meme API REX.

### 3. Headless-first obligatoire

Aucune feature critique ne doit dependre uniquement de Flutter.

Parite minimale obligatoire entre :

- CLI
- daemon
- gateway
- API hub securisee

Flutter est une console de pilotage, pas le coeur du systeme.

### 4. Le cerveau prefere est sur VPS

Si un VPS est disponible, il devient le hub prefere :

- toujours allume
- point de sync central
- queue persistante
- gateway toujours active
- supervision des nodes

Le Mac reste le node premium pour dev local, pas le point unique de verite.

### 4bis. La gateway doit survivre par continuite distribuee

Le mot "gateway" ne doit pas etre compris comme un simple bot Telegram ou une facade fragile.

Dans la vision REX, la gateway est une **surface de continite** :

- si le VPS tient, il reste le point central
- si le VPS tombe mais que le Mac ou un PC tient, un mode degrade doit continuer a journaliser et a preparer la reprise
- il est peu probable que toutes les machines tombent exactement en meme temps

Conclusion pratique :

- chaque node important doit pouvoir spooler localement
- chaque node important doit pouvoir conserver les evenements, messages, observations et taches non confirmes
- des qu'un node sain revient, la reprise et la consolidation doivent recommencer

La gateway doit donc etre pensee avec :

1. journal local append-only
2. spool local par node
3. ack explicite
4. replay au reconnect
5. consolidation inter-node quand au moins un node reste vivant

### 5. Zero memory loss avant sync temps reel

Avant tout raffinement WebSocket, LangGraph ou Rust, REX doit garantir :

1. journal append-only local
2. spool local si hub indisponible
3. queue persistante cote hub
4. ack explicite par message
5. replay au reconnect

Si un service tombe, rien ne doit etre perdu. Au pire, c'est rejoue plus tard.

Ce principe couvre aussi :

- messages gateway
- notifications
- taches deleguees
- observations memoire
- runbooks/success captures
- evenements de background

Rien ne doit dependre d'un process unique ou d'un seul moment de disponibilite.

### 6. Tailscale est la couche reseau par defaut

Le pattern reseau par defaut est :

- Tailscale pour joindre les machines
- routes/API securisees pour le hub
- JWT ou token court pour l'autorisation applicative
- WoL / wake heuristics pour les nodes qui peuvent etre reveilles

REX doit mieux faire qu'OpenClaw sur ce point : auto-heal, auto-join, diagnostic clair.

Tailscale reste le choix par defaut tant que :

- les machines restent joignables
- la latence reste acceptable
- la connexion est `direct` ou au moins `peer-relay`

REX doit verifier et exposer :

- `tailscale status`
- `tailscale ping`
- `tailscale netcheck`
- type de connexion : `direct`, `peer-relay`, `relay`

Si Tailscale est insuffisant pour un usage donne :

- fallback commande/control : Tailscale SSH ou SSH classique par cles
- fallback remote desktop : RustDesk self-hosted
- fallback clavier/souris partage local : Input Leap

Ces outils ne remplacent pas le hub REX. Ils le completent.

### 7. Pixel agents sont un fallback, pas une dependance

Pixel agents peuvent etre exposes via une convention simple type :

`$machine@launch_pixel_agents`

Mais uniquement :

- sur machines compatibles
- comme fallback explicite
- jamais comme prerequis du hub VPS

Le plan doit rappeler que le VPS peut etre prive de certaines capacites locales.

### 8. Ollama reste le defaut, mais le backend local doit rester interchangeable

Pas besoin d'une nouvelle UI pour un "Ollama light".

Le besoin reel est un **backend local abstrait** :

- `ollama`
- `llama.cpp server`
- `llamafile`
- `LocalAI`

On choisit selon la machine. L'interface REX, elle, ne change pas.

### 8ter. Le background doit continuer a organiser meme en mode degrade

Quand une machine ou un lien reseau tombe, REX ne doit pas juste "attendre".

Le systeme doit continuer a faire ce qui est possible en arriere-plan avec, dans cet ordre :

1. scripts deterministes
2. outils locaux deja installes
3. LLM local
4. free tier disponible

Usages cibles :

- classer les pending events
- consolider les observations
- preparer les replays
- transformer des succes en runbooks
- nettoyer/compacter sans rien perdre

Le background n'est pas un luxe. C'est une couche de preservation et d'organisation.

### 8bis. REX doit rester utile quelle que soit la taille du parc

Le plan ne doit jamais supposer que l'user a "le bon setup ideal".

Cas minimaux a couvrir :

- **1 machine seulement** :
  - pas de hub obligatoire
  - pas de Tailscale obligatoire
  - tout doit fonctionner en local-first
  - si une feature distribuee n'a aucun sens, REX la masque ou la degrade proprement

- **2 a 5 machines** :
  - mode standard
  - un hub prefere si disponible, sinon election simple ou machine principale
  - Tailscale tres pertinent
  - inventaire et wake/fallbacks utiles

- **10 a 30+ machines** :
  - il faut penser inventaire, tags, groupes, quotas, rate limits, healthchecks et vue agregee
  - aucune hypothese de polling agressif par node
  - les commandes doivent pouvoir cibler un groupe, pas seulement une machine
  - les defaults doivent rester prudents pour ne pas saturer le reseau ou le hub

Exceptions et fallback attendus :

- si aucun VPS n'existe, la machine principale devient cerveau local
- si aucune machine GPU n'existe, REX downgrade vers petits modeles / providers gratuits / payants si necessaire
- si trop de machines existent, REX doit passer en mode inventaire + orchestration, pas en full sync bavarde sur tout
- si une machine est seule ou offline, aucune fonctionnalite critique ne doit etre bloquee

### 9. LangGraph est une option, pas le coeur initial

LangGraph n'entre que si l'orchestrateur maison montre une vraie limite sur :

- gestion d'etat
- reprises apres erreur
- branching complexe
- auditabilite des steps

Avant ca, une state machine explicite + queue + journal suffit.

### 10. Ce qui reussit une fois doit devenir reutilisable

REX ne doit pas seulement apprendre des echecs.

Si un workflow reussit de maniere reproductible, REX doit pouvoir l'enregistrer comme :

- succes de deploy
- runbook
- recette
- pattern de resolution
- procedure machine-specific

Puis le reinjecter au bon moment.

Exemple :

- "ce deploy Symfony sur VPS passe avec ces 6 etapes"
- "sur ce PC Windows il faut lancer tel script avant tel outil"
- "sur ce repo le build mobile doit toujours preceder la sync backend"

### 11. Cross-platform + dashboard distant

Le plan cible doit assumer :

- app Flutter desktop pour macOS, Windows et Linux
- API hub mono-repo
- dashboard distant optionnel Next.js/React consomme la meme API
- mobile futur optionnel consomme la meme API
- VPS operable sans UI Flutter : daemon + CLI + gateway + API uniquement

Exposition recommandee :

- d'abord tailnet-only via Tailscale
- ensuite VPS + reverse proxy stable
- Traefik/IP allowlist seulement pour les cas ou une exposition HTTP hors tailnet est necessaire

Le dashboard distant ne devient pas une nouvelle source de verite. Il reste une vue sur l'API REX.
Le VPS, lui, reste sans UI Flutter requise : daemon + CLI + gateway + API.

### 12. Meeting bots type Otter AI

REX doit traiter ce besoin comme un sous-systeme distinct :

- join bot
- capture/transcript
- summarize
- persistence dans la memoire REX
- setup automatise par scripts/agents autant que possible

Si un composant open source existe deja et couvre 80% du besoin, REX doit l'integrer avant de le reimplementer.

---

## Ce qui derange dans les plans actuels

### A. La vision produit et le backlog sont trop melanges

Le master plan contient a la fois :

- des principes de produit
- des schemas de config definitifs
- des details d'implementation
- des benchmarks et inspirations

Resultat : difficile de savoir ce qui est non-negociable et ce qui est juste une option.

### B. Le plan pousse certaines optimisations trop tot

Exemples :

- Rust tres tot
- sync temps reel detaillee avant journal durable
- schema config massif avant stabilisation des primitives

Ca risque de faire grossir l'architecture avant d'avoir verrouille la boucle centrale : observer, persister, router, reprendre.

### Bbis. Le routage etait encore trop "LLM-first"

Le plan parlait bien de local/free-first, mais pas assez explicitement de :

- scripts existants
- outils deja installes
- services deja actifs
- machines deja possedees

REX doit d'abord proposer ce qui existe deja chez l'user avant de sortir du compute possede.

### C. La surface d'operation etait encore floue

Sans clarification, on pouvait partir sur :

- Flutter
- dashboard web
- Telegram
- CLI

... sans savoir lequel est la vraie surface operateur.

La reponse doit etre : Flutter pour piloter, CLI/gateway/API pour operer partout.

### D. La securite du hub doit etre plus concrete

Le plan parle bien de JWT et Tailscale, mais il faut rendre explicites :

- quelles routes existent
- quel niveau d'auth est requis
- comment un node s'enregistre
- comment on revoke un node
- comment on evite les ordres perdus

---

## Surface minimale du hub a implementer

Premiere version : pas un mega dashboard. Seulement ces surfaces :

- `GET /api/v1/health`
- `GET /api/v1/nodes`
- `GET /api/v1/tasks`
- `GET /api/v1/events`
- `GET /api/v1/memory/pending`
- `POST /api/v1/tasks`
- `POST /api/v1/nodes/:id/wake`
- `POST /api/v1/nodes/:id/doctor`

La Flutter app consomme ces endpoints. Le gateway et le CLI aussi.

---

## Ordre recommande

### Phase A — Fiabilite d'abord

- Event journal append-only
- Spool local offline
- Queue hub persistante + ack
- `rex doctor` programmable
- endpoints health/nodes/events

### Phase B — Pilotage distant propre

- Tailscale join
- routes securisees
- Wake/doctor remote
- Flutter dashboard minimal (pas une refonte)
- Telegram en fallback operateur

### Phase C — Distribution intelligente

- inventaire des scripts/outils/hardware/quotas
- routing inter-node
- choix Mac/VPS/GPU node
- memory sync et replay
- backends locaux interchangeables

### Phase D — Raffinement agentique

- pixel agents fallback
- LangGraph spike borne
- optimisations Rust uniquement si le profilage le justifie

---

## Reponse aux points ouverts

### Flutter "pas accessible" ?

L'app existe deja et elle build. Donc la bonne question n'est pas "faut-il remplacer Flutter ?"

La bonne question est :

- quelles vues distantes doivent aussi exister via API/gateway
- quelles actions doivent rester operables sans GUI
- comment l'app expose clairement "ce que tu possedes deja" vs "ce que REX te propose d'utiliser"

### Faut-il une UI pour l'alternative a Ollama ?

Non. Il faut une abstraction de backend local dans le routeur et le config schema.
L'UI ne doit montrer que :

- backend actif
- URL/runner
- health
- modeles disponibles
- cout estime / quota / raison du choix

### Audio logger ?

Le pipeline audio doit rester un service REX natif :

- capture
- transcription
- post-process
- persistence

L'UI affiche l'etat. Elle ne doit pas devenir le point unique d'execution.
