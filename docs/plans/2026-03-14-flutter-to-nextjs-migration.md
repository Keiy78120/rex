# REX UI Migration — Flutter → Next.js

> Date : 14/03/2026
> Décision : migrer l'app macOS Flutter vers une webapp Next.js
> Raison : même stack TS, accessible partout, Hub API déjà prêt, moins de maintenance

---

## POURQUOI

### Problèmes Flutter
- Dart = langage séparé du monorepo TypeScript
- macOS only — pas accessible depuis VPS, PC, iPhone
- Bugs natifs récurrents (sandbox, window_manager, notifyListeners)
- Build lent + process d'install complexe
- N'utilise même pas le Hub API — fait des `execSync('rex ...')`

### Avantages Next.js
- Même TypeScript que le CLI (1 stack)
- Accessible depuis n'importe quel device via browser + Tailscale
- Hub API port 7420 existe déjà (50+ endpoints)
- Hot reload (itération rapide)
- Kevin expert React/Next.js
- Shadcn UI + dstudio-ui design system
- PWA possible (installable sur iPhone sans App Store)

---

## CE QU'ON GARDE

Le travail Flutter n'est pas perdu — on transpose :

| Flutter | → Next.js |
|---------|-----------|
| 26 pages (Health, Memory, Gateway, etc.) | 26 routes/pages |
| RexService (logique métier) | API calls vers Hub :7420 |
| RexColors (thème) | Tailwind config + CSS variables |
| Provider pattern | React Context ou Zustand |
| Shared widgets (RexCard, RexChip, etc.) | Shadcn UI components |
| Sidebar navigation | Next.js layout + sidebar |

## ARCHITECTURE

```
packages/
├── cli/          ← TypeScript CLI (inchangé)
├── core/         ← Health checks (inchangé)
├── memory/       ← Mémoire sémantique (inchangé)
├── web/          ← 🆕 Next.js app
│   ├── app/
│   │   ├── layout.tsx       ← sidebar + theme
│   │   ├── page.tsx         ← dashboard (ex Health)
│   │   ├── memory/page.tsx
│   │   ├── gateway/page.tsx
│   │   ├── agents/page.tsx
│   │   ├── fleet/page.tsx
│   │   ├── training/page.tsx
│   │   ├── settings/page.tsx
│   │   └── ...
│   ├── components/
│   │   ├── rex-card.tsx
│   │   ├── rex-chip.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts           ← client Hub API
│   │   └── use-rex.ts       ← hooks React
│   ├── tailwind.config.ts
│   └── package.json
└── flutter_app/  ← 🗄️ Archive (garder pour référence, ne plus maintenir)
```

## HUB API — DÉJÀ PRÊT

Le Hub (`gateway/hub.ts`) expose déjà tout ce qu'il faut :

```
GET  /api/health              → status système
GET  /api/v1/version          → version REX
GET  /api/v1/nodes/health     → fleet status
GET  /api/v1/events/log       → journal events
GET  /api/v1/inventory        → ressources
GET  /api/v1/queue/stats      → queue sync
POST /api/chat                → streaming LLM
GET  /api/v1/discover         → discovery
GET  /api/metrics             → Prometheus metrics
GET  /api/v1/workflows/*      → workflows CRUD
GET  /api/v1/agents/*         → agents list
GET  /api/v1/mcp-registry     → MCPs
POST /api/nodes/register      → fleet registration
```

**Manquant** (à ajouter au Hub) :
- `GET /api/v1/memory/search?q=...` → recherche mémoire
- `GET /api/v1/memory/stats` → stats mémoire
- `POST /api/v1/memory/ingest` → trigger ingest
- `GET /api/v1/training/status` → état training
- `GET /api/v1/signals/current` → signaux actuels
- `GET /api/v1/budget/usage` → consommation tokens
- `GET /api/v1/config` → config REX (lecture)
- `PUT /api/v1/config` → config REX (écriture)

## ACCÈS FLEET

```
Mac (local)     → http://localhost:7420
iPhone (wifi)   → http://rex-mac.local:7420
VPS (Tailscale) → http://100.x.x.x:7420
PC (Tailscale)  → http://100.x.x.x:7420
```

Avec Tailscale, l'UI est accessible depuis TOUS les devices fleet sans config.

## PLAN D'EXÉCUTION

### Phase 1 — Scaffold (1h)
- `pnpm create next-app packages/web --typescript --tailwind --app --src-dir`
- Ajouter au workspace pnpm
- Config Tailwind avec RexColors
- Layout avec sidebar (même navigation que Flutter)

### Phase 2 — API Client (1h)
- `packages/web/lib/api.ts` — client fetch pour Hub API
- Hooks React : `useRexHealth()`, `useRexMemory()`, `useRexFleet()`, etc.
- Polling ou WebSocket pour données live

### Phase 3 — Pages core (2-3h)
- Dashboard (Health) — status système, signaux, fleet
- Memory — recherche, catégories, stats
- Gateway — status bot, derniers messages
- Fleet — nodes, scores, thermal

### Phase 4 — Pages secondaires (2-3h)
- Agents — liste, templates, client factory
- Training — jobs, dataset, deploy
- Settings — config, providers, budget
- Tools — MCPs, skills, guards

### Phase 5 — Polish (1-2h)
- Dark/light theme
- PWA manifest (installable sur iPhone)
- Responsive (mobile-first)
- HTTPS via Tailscale certs

### Phase 6 — Retirement Flutter
- Marquer `packages/flutter_app/` comme archive
- Supprimer de la CI
- Mettre à jour CLAUDE.md

**Total estimé : ~1 jour de dev**

---

## DÉCISION FLUTTER

`packages/flutter_app/` passe en **archive** :
- Ne plus maintenir
- Garder pour référence design/UX
- Ne plus inclure dans la CI
- Ne plus documenter comme "l'app REX"

L'app REX = `packages/web/` (Next.js)
