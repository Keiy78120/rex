# REX — Contexte projet (agent entry point)

## Source Of Truth
- **Repo :** `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche :** `main` et `feat/litellm-phase2`
- **NE JAMAIS** utiliser `/_config/rex` (vieux clone)
- Ce fichier = cap projet. `action.md` = comment exécuter (charger uniquement si tâche le demande)

## Projet en bref
REX = organisme IA vivant. Orchestrateur universel. OS pour l'intelligence.
- User parle à REX — pas à Claude/Qwen directement
- Script-first : regex → Ollama → Groq → Claude (dernier recours)
- Tokens = énergie, économiser comme des calories
- Fleet = Mac + VPS + PC + iPhone (routing Dijkstra)
- Never Die : 3 niveaux parallèles (Exécution + Surveillance + Amélioration)

## Stack
- **Monorepo pnpm** : `packages/cli` (TypeScript), `packages/memory`, `packages/flutter_app` (Dart)
- **Runtime :** Node v22, daemon.ts via PM2
- **DB :** SQLite + sqlite-vec (mémoire vectorielle)
- **LLM chain :** Ollama local → Groq free → Claude Haiku → Claude Sonnet → Opus (mentor)

## Règles opératoires
1. **Additive only** — ne jamais casser du code qui marche
2. **Sandbox avant prod** — toute modif de REX passe par sandbox d'abord
3. **Script-first** — si script peut répondre, 0 LLM
4. **Ne pas toucher OpenClaw** (config gateway)
5. **Ne pas merger sur main** sans validation Kevin
6. **Lire REX-BRAIN.md** avant d'implémenter de la logique

## Docs de référence (charger à la demande, PAS automatiquement)
- `docs/REX-BRAIN.md` — logique complète (795L) → lire avant toute implémentation
- `docs/VISION.md` — manifeste
- `docs/RESEARCH.md` — stack tech et découvertes
- `docs/UX.md` — expérience utilisateur
- `docs/E2E-PLAN.md` — plan de tests
- `docs/REX-LOGIC.md` — cycles user, budget, pseudo-code
- `docs/plans/action.md` — plans détaillés session par session (2400L, charger section par section)
- `CLAUDE_TASK.md` — TODO actuel pour Claude Code (12 tâches)

## Structure packages
```
packages/
  cli/src/
    index.ts          ← entry point commandes
    gateway.ts        ← REX Identity Layer (à implémenter)
    orchestrator.ts   ← relay chain LLM
    daemon.ts         ← process 24/7
    curious.ts        ← CURIOUS signals
    litellm.ts        ← wrapper LLM + routing
    free-tiers.ts     ← providers gratuits
    account-pool.ts   ← multi-comptes rotation
    event-journal.ts  ← journal des événements
    signal-detector.ts
    self-improve.ts
    security-scanner.ts
    sandbox.ts
    node-mesh.ts
    agent-runtime.ts
    resource-hub.ts
    setup-wizard.ts   ← wizard onboarding
    watchdog.ts       ← ✅ implémenté
    relay-engine.ts   ← ✅ implémenté (RxJS pipeline)
    user-cycles.ts    ← ✅ implémenté (XState)
    agent-templates/  ← ✅ implémenté (5 personas: dg/drh/ceo/coo/freelance)
  memory/src/
    index.ts, bm25.ts, vector.ts
  flutter_app/        ← app macOS/iOS
```

## État actuel (15/03/2026) — PHASES 1-4 COMPLÈTES ✅
- ✅ 117+ fichiers TypeScript implémentés
- ✅ CLAUDE_TASK.md — 12/12 tâches complètes
- ✅ gateway.ts REX Identity Layer + rex-identity.ts pipeline 5 étapes
- ✅ relay-engine.ts (Ollama→Groq→Haiku→Sonnet→Opus, RxJS)
- ✅ user-cycles.ts (XState AWAKE_ACTIVE/AWAKE_IDLE/SLEEPING/WAKING_UP)
- ✅ 250 tests vitest — unit + integration (14 fichiers) — `pnpm test` < 2s
- ✅ CI GitHub Actions (unit + build + security audit)
- 🔄 Prochaine étape : déploiement VPS (docs/vps-install.md)

## Commandes utiles
```bash
cd packages/cli && pnpm build   # build
pnpm test                       # tests
rex                             # lancer
pm2 start ecosystem.config.js  # daemon
```
