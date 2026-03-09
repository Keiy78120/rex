
---

## REX — ARCHITECTURE BRAIN / FLEET (09/03/2026)

### Clarté architecture actuelle

**État réel du code :**
- Monorepo TypeScript (pnpm)
- `packages/cli` — orchestre tout (monolithe bien structuré)
- `packages/memory` — couche mémoire
- `packages/core` — utilitaires partagés
- `daemon.ts` → PM2/systemd → tourne en fond sur VPS
- Pas de microservices — un process principal qui gère tout

**C'est correct pour maintenant.** Le split BRAIN/FLEET viendra naturellement.

---

### Architecture cible — BRAIN / FLEET

```
┌─────────────────────────────────────┐
│  REX BRAIN (VPS ou machine 24/7)    │
│                                     │
│  • Gateway (reçoit Telegram/Flutter)│
│  • Orchestration + relay chain      │
│  • Mémoire centrale (sqlite-vec)    │
│  • CURIOUS (scanner, signaux)       │
│  • Budget manager                   │
│  • Fleet coordinator                │
│  • Event journal                    │
│  • 24/7 — jamais éteint            │
└────────────────┬────────────────────┘
                 │ WebSocket / REST
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Mac    │ │  PC     │ │  VPS2   │
│  FLEET  │ │  FLEET  │ │  FLEET  │
│         │ │         │ │         │
│ • Ollama│ │ • RTX   │ │ • Worker│
│ • Tools │ │   3090  │ │   only  │
│ • Files │ │ • GPU   │ │         │
│ • Sensor│ │   tasks │ │         │
└─────────┘ └─────────┘ └─────────┘
     │
┌─────────┐
│ iPhone  │
│ SENSOR  │
│ (caméra │
│  GPS    │
│  notifs)│
└─────────┘
```

### Rôles distincts

**BRAIN** (toujours sur VPS ou Raspberry Pi / machine 24/7)
- Reçoit toutes les interactions utilisateur
- Prend les décisions de routing
- Détient la mémoire centrale
- Tourne même si tous les FLEET nodes sont éteints

**FLEET NODE** (Mac, PC, machines puissantes)
- S'enregistre auprès du BRAIN : `rex fleet:join --brain <url>`
- Déclare ses capacités : LLM local, GPU, tools disponibles
- Exécute les tâches déléguées par le BRAIN
- Se déconnecte proprement : `rex fleet:leave`
- BRAIN sait automatiquement qu'il n'est plus dispo

**SENSOR NODE** (iPhone, Android)
- Capteurs only : caméra, GPS, micro, notifications
- Pas de tâches CPU
- `rex fleet:join --mode sensor`

### Open source — chaque install = page blanche

```
Utilisateur nouveau installe REX
  → Wizard au premier lancement
  → "Quelle machine sera ton BRAIN ? [Cette machine / VPS distant]"
  → Configure BRAIN
  → "Ajouter des appareils à ta fleet ?" → pair des FLEET nodes
  → REX commence à apprendre l'utilisateur
  → Mémoire vide au départ — s'enrichit avec le temps
```

REX ne présuppose rien sur l'utilisateur.
Chaque config est unique. Ton REX n'est pas celui d'un autre.

### Packages à créer (split progressif)

```
packages/
  brain/     ← orchestration, gateway, memory, curious, budget
  fleet/     ← agent léger sur chaque device, se connecte au brain
  sensor/    ← ultra-léger, iPhone/Android, capteurs only
  cli/       ← interface commune (actuel, garde les commandes)
  memory/    ← déjà là ✅
  core/      ← déjà là ✅
```

**Ne pas faire ça maintenant.** D'abord faire tourner le monolithe correctement.
Le split quand le produit est stable = refacto propre, pas de régression.

---

## REX UX — Expérience utilisateur (nouveau fichier UX.md)

### Mental model à communiquer

> REX est un organisme qui vit sur ton VPS et connaît ta vie numérique.
> Tu lui parles comme à un assistant de confiance.
> Il fait. Il apprend. Il s'améliore. Tu ne gères rien.

### Premier lancement (onboarding)

```
1. npm install -g rex-ai  (ou npx rex-ai)
2. rex setup
   → Wizard : langue, timezone, machine BRAIN, premier compte Claude
   → Test connexion
   → "REX est prêt. Dis-lui bonjour."
3. rex fleet:add  (optionnel)
   → Pair Mac, PC ou autre device
4. C'est tout.
```

### Interactions quotidiennes

```
Telegram → envoyer un message à REX
Flutter  → app mobile avec dashboard
CLI      → `rex [commande]` pour les devs
```

### Ce que l'user voit (dashboard Flutter)

```
HQ       → statut général, OPEN_LOOP signals, digest
TOOLS    → tools actifs, MCPs connectés
CURIOUS  → découvertes, patterns détectés, propositions
AGENTS   → agents en cours d'exécution
BUDGET   → coût du jour/mois, free tiers restants
FLEET    → machines connectées, statut thermique
MEMORY   → recherche dans la mémoire
GATEWAY  → logs des interactions
PROJETS  → projets actifs, statut
OPTIMIZE → benchmarks, améliorations suggérées
```

### Ce que l'user ne voit jamais (géré par REX)

- Quel modèle LLM est utilisé
- Combien de comptes tournent
- La rotation des providers
- Les tâches nocturnes
- Les mises à jour de REX lui-même

### Principe UX fondamental

> Plus REX est puissant, moins l'user a à faire.
> L'interface idéale = ne pas avoir à ouvrir l'interface.
> REX vient à toi (Telegram, notifications) quand il a quelque chose à dire.

### Sizing REX

- **~40GB** à terme avec tous les modèles locaux, tools, skills
- C'est normal et souhaitable — plus il a, plus il sait
- Installation modulaire : core 2GB, ajouter les modules selon besoins
- `rex install --module ollama` / `rex install --module activitywatch`
