# REX RELAY — Opus → Codex Collaboration

> Ce fichier est la passerelle entre Opus (architecte) et Codex (exécutant).
> Codex : lis ce fichier EN PREMIER avant de coder quoi que ce soit.
> Opus : mets à jour ce fichier avant de lancer Codex.

---

## QUI PARLE

**Opus** (Claude Opus 4.6) — architecte, planificateur, décisionnaire.
Je conçois l'architecture, je fais les audits, je prends les décisions de design.
Je ne code pas les features — je les planifie et je délègue.

**Codex** (OpenAI) — exécutant background, worker silencieux.
Tu lis ce fichier, tu exécutes les tâches listées ci-dessous, tu commites.
Tu ne prends PAS de décisions d'architecture. Si tu as un doute, tu le notes dans `RELAY-QUESTIONS.md`.

---

## CONTEXTE PROJET

- **Repo** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche** : `refactor/domain-structure` (à merger sur main après validation)
- **Stack** : TypeScript/Node 22, tsup, pnpm, vitest
- **Tests** : `cd packages/cli && pnpm test` — doit rester ≥ 1445/1449
- **Build** : `cd packages/cli && pnpm build` — doit passer

## RÈGLES ABSOLUES

1. **Additive only** — ne jamais casser du code qui marche
2. **Tests verts** — `pnpm test` après CHAQUE commit
3. **Pas de Co-Authored-By** — jamais dans les commits
4. **Pas de mention AI** — jamais dans commits/PR/issues
5. **Conventional commits** — `feat:`, `fix:`, `refactor:`, `docs:`
6. **Lire avant d'écrire** — toujours lire le fichier existant avant de modifier
7. **OpenClaw-first** — avant de coder, vérifier si OpenClaw a déjà le pattern dans `~/Documents/Developer/keiy/openclaw/`

## STRUCTURE ACTUELLE (post-refactoring)

```
packages/cli/src/
  brain/      (11) — identity, routing, orchestrator, relay, tool-injector
  gateway/     (5) — telegram, hub, adapter, mcp-server
  fleet/       (7) — mesh, sync, deploy
  signals/     (8) — detector, watchdog, journal, patterns
  agents/      (8) — runtime, factory, curious, templates
  providers/  (12) — registry, backend, budget
  security/    (5) — scanner, guards, secrets
  tools/       (8) — registry, resources, MCPs, skills
  training/    (5) — pipeline, improve, reflector
  setup/       (5) — wizard, install
  ui/          (3) — dashboard, TUI
  utils/       (7) — config, paths, logger, db
  index.ts     — entry point (40+ commandes, switch géant)
  daemon.ts    — 30+ cycles background
```

## DOCS DE RÉFÉRENCE

- `docs/REX-STATUS.md` — état complet de ce qui est fait et à faire
- `docs/REX-MODULES.md` — inventaire 155 fichiers avec descriptions
- `docs/plans/2026-03-14-rex-refactoring-design.md` — design du refactoring
- `docs/plans/2026-03-14-rex-worker-model.md` — plan fine-tune rex-worker
- `docs/plans/2026-03-14-stack-audit.md` — Node.js 90% + Rust 10%
- `docs/plans/2026-03-14-openclaw-fork-strategy.md` — ce qu'on aspire d'OpenClaw
- `docs/plans/2026-03-14-gateway-improvements.md` — améliorations gateway

---

## TÂCHES POUR CODEX

### Tâche 1 — Déplacer les fichiers restants vers leurs domaines

~35 fichiers encore à plat dans `src/`. Les déplacer vers le domaine approprié avec shim re-export.

Mapping :
- `daemon.ts` → reste à plat (entry point daemon, comme index.ts)
- `init.ts` → `setup/init.ts`
- `sandbox.ts` → `utils/sandbox.ts`
- `context.ts` + `context-loader.ts` + `preload.ts` → `brain/context.ts` (ou garder séparés dans brain/)
- `inventory.ts` + `projects.ts` + `project-init.ts` + `project-intent.ts` → `tools/projects/`
- `audio.ts` + `voice.ts` + `audio-logger.ts` → `utils/media/`
- `meeting.ts` → `utils/meeting.ts`
- `review.ts` + `workflow.ts` → `tools/workflow.ts`
- `backup.ts` + `prune.ts` + `optimize.ts` → `utils/maintenance/`
- `rex-runner.ts` + `rex-launcher.ts` → `brain/runner.ts`
- `user-cycles.ts` + `user-state.ts` → `signals/user-cycles.ts`
- `memory-check.ts` → `signals/memory-check.ts`
- `living-cache.ts` → `utils/cache.ts`
- `app.ts` → `utils/app.ts`
- `metrics.ts` → `utils/metrics.ts`
- `mcp.ts` → `tools/mcp-cli.ts`

Chaque fichier : `cp → fix imports (./x → ../x) → shim at old path → build → test → commit`.

### Tâche 2 — Graceful shutdown (P1)

Implémenter le drain propre dans `daemon.ts` et `gateway/telegram.ts` :
- SIGTERM/SIGINT handler
- Stop accepting (arrêter polling)
- Drain in-flight (attendre ops en cours, max 15s timeout)
- Cleanup (release locks, save state)
- `process.exit(0)` au lieu de `process.exit(1)`

Pattern OpenClaw : voir `~/Documents/Developer/keiy/openclaw/extensions/telegram/src/polling-session.ts`

### Tâche 3 — Exponential backoff + stall detection (P1)

Dans `gateway/telegram.ts` :
- Remplacer les intervals fixes par exponential backoff avec jitter (2s → 30s)
- Ajouter stall detection watchdog (90s threshold, 30s check interval)
- Classifier d'erreurs : recoverable vs fatal

Pattern OpenClaw : voir polling-session.ts `TELEGRAM_POLL_RESTART_POLICY`

---

## QUESTIONS POUR OPUS

Si Codex a des questions ou des doutes, les écrire ici :

_(vide pour l'instant)_

---

## ÉTAT DU RELAY

- **Créé par** : Opus, 14/03/2026
- **Dernière mise à jour** : 14/03/2026
- **Statut** : prêt pour Codex
