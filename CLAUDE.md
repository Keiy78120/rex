# REX — Contexte projet (agent entry point)

## Source Of Truth
- **Repo :** `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche :** `main`
- **NE JAMAIS** utiliser `/_config/rex` (vieux clone)
- Ce fichier = cap projet. `action.md` = comment exécuter (charger uniquement si tâche le demande)

## Projet en bref
REX = OS d'intelligence vivant. Architecture 3 couches :
1. **REX Core** — cerveau toujours allumé (70% scripts / 30% LLM, intent, mémoire, signaux)
2. **REX Code** — surcouche dev (REX Scan, contexte dynamique, améliore Claude Code + Codex)
3. **REX Relay** — orchestration multi-AI (RELAY.md partagé, /loop d'IAs, fleet)

Principes :
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
- `docs/REX-STATUS.md` — **ÉTAT COMPLET** : tout ce qui est fait + TODO P0-P3 (lire en premier)
- `docs/REX-BRAIN.md` — logique complète (795L) → lire avant toute implémentation
- `docs/VISION.md` — manifeste 3 couches
- `docs/RESEARCH.md` — stack tech et découvertes
- `docs/UX.md` — expérience utilisateur
- `docs/E2E-PLAN.md` — plan de tests
- `docs/REX-LOGIC.md` — cycles user, budget, pseudo-code
- `docs/plans/action.md` — plans détaillés session par session (2400L, charger section par section)

## Structure packages
```
packages/
  cli/src/
    index.ts              ← entry point (40+ commandes)
    rex-identity.ts       ← ✅ REX_SYSTEM_PROMPT, identity pipeline
    gateway.ts            ← ✅ Telegram bot + REX identity dans tous les LLM paths
    orchestrator.ts       ← relay chain LLM
    orchestration-policy.ts ← ✅ 6 tiers routing (0 LLM)
    relay-engine.ts       ← ✅ RxJS pipeline + persistence datée (RELAY-YYYY-MM-DD-HHhMM.md)
    tool-injector.ts      ← ✅ dynamic tool selection (intent/model/health)
    tool-adapter.ts       ← ✅ 9 tools format Ollama/OpenAI
    agent-runtime.ts      ← ✅ runAgent/streamAgent + tools dynamiques
    daemon.ts             ← ✅ 30+ cycles background
    user-cycles.ts        ← ✅ XState (AWAKE/IDLE/SLEEPING)
    watchdog.ts           ← ✅ health checks 60s
    signal-detector.ts    ← 20+ signaux détectés (⚠️ pas encore wired à memory)
    curious.ts            ← proactive discovery
    setup-wizard.ts       ← wizard onboarding (⚠️ manque brain device)
    node-mesh.ts          ← fleet capabilities (⚠️ manque Docker pairing)
    paths.ts              ← ✅ tous les chemins centralisés + RELAY_DIR
    resource-hub.ts       ← ✅ catalogue tools/mcps/skills
    agent-templates/      ← ✅ 5 personas (dg/drh/ceo/coo/freelance)
  memory/src/
    index.ts, bm25.ts, vector.ts, hybrid-search.ts
  flutter_app/            ← app macOS native (26 pages)
```

## État actuel (15/03/2026) — PHASES 1-4 COMPLÈTES ✅
- ✅ 117+ fichiers TypeScript, 1449+ tests vitest
- ✅ REX Identity Layer — system prompt injecté dans TOUS les LLM paths
- ✅ Relay persistence — fichiers datés + atomic writes + incremental save
- ✅ Dynamic tool injection — intent/model/health-aware tool selection
- ✅ Orchestration 6 tiers — routing 0 LLM
- ✅ User cycles XState + Watchdog + Resource Hub + Agent Templates
- ✅ CI GitHub Actions (manual dispatch)
- 🔧 P0 : signal→memory direct save, brain device au setup
- 🔧 P1 : fleet Docker pairing, data consent wizard, fleet sync
- 🔧 P2 : REX Scan, open source prep
- 📋 Détails complets : `docs/REX-STATUS.md`

## Commandes utiles
```bash
cd packages/cli && pnpm build   # build
pnpm test                       # tests
rex                             # lancer
pm2 start ecosystem.config.js  # daemon
```
