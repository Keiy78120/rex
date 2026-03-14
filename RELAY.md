# REX RELAY — Opus → Codex Collaboration

> Ce fichier est la passerelle entre Opus (architecte) et Codex (exécutant).
> **Codex : lis ce fichier EN PREMIER avant de coder quoi que ce soit.**
> Opus : mets à jour ce fichier avant de lancer Codex.

---

## QUI PARLE

**Opus** (Claude Opus 4.6) — architecte, planificateur, décisionnaire.
Je conçois, j'audite, je décide. Je ne code pas les features — je les planifie.

**Codex** (OpenAI gpt-5.4) — exécutant, worker précis.
Tu lis ce fichier, tu exécutes les tâches, tu commites. Pas de décisions d'archi.

---

## CONTEXTE PROJET

- **Repo** : `/Users/keiy/Documents/Developer/keiy/rex`
- **Branche** : `main`
- **Build** : `cd packages/cli && pnpm build`
- **Tests** : `cd packages/cli && pnpm test` → doit rester ≥ 1445/1449
- **OpenClaw local** : `~/Documents/Developer/keiy/openclaw/` (patterns à consulter)

## RÈGLES ABSOLUES

1. **Additive only** — ne jamais casser du code qui marche
2. **Tests verts** après CHAQUE commit
3. **Pas de Co-Authored-By** dans les commits
4. **Pas de mention AI** dans commits/PR
5. **Conventional commits** : `feat:`, `fix:`, `refactor:`
6. **Lire avant d'écrire** — toujours
7. **OpenClaw-first** — vérifier `~/Documents/Developer/keiy/openclaw/` avant de coder

## DOCS DE RÉFÉRENCE

- `docs/REX-STATUS.md` — état complet
- `docs/plans/2026-03-14-audit-complet-openclaw-vs-rex.md` — audit à suivre
- `docs/plans/2026-03-14-gateway-improvements.md` — améliorations gateway
- `docs/plans/2026-03-14-rex-worker-model.md` — plan fine-tune

---

## SPRINT 1 — Token Economy + Error Handling

### Tâche 1.1 — Cacher REX_SYSTEM_PROMPT au niveau provider
**Fichier** : `src/agents/runtime.ts` (lignes 555, 628)
**Problème** : REX_SYSTEM_PROMPT (1027 tokens) envoyé à CHAQUE appel LLM.
**Fix** :
- Dans `runAgent()` et `streamAgent()`, ne PAS injecter REX_SYSTEM_PROMPT si le provider l'a déjà (gateway paths).
- Créer un flag `systemPromptInjected: boolean` dans le context pour éviter les doubles.
- Le system prompt doit être envoyé UNE SEULE FOIS par conversation, pas par message.
**Test** : `pnpm test -- tests/unit/agent-runtime.test.ts`
**Commit** : `fix(agents): deduplicate REX_SYSTEM_PROMPT injection — save ~1K tokens/call`

### Tâche 1.2 — Remplacer 33 catch {} silencieux dans gateway
**Fichier** : `src/gateway/telegram.ts`
**Problème** : 33 `catch {}` qui swallow les erreurs sans logging.
**Fix** :
- `grep -n "catch {}" src/gateway/telegram.ts` pour les trouver tous
- Remplacer chaque `catch {}` par `catch (e) { log.warn('...context...', e instanceof Error ? e.message : e) }`
- Ne PAS changer la logique — juste ajouter le log
**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/extensions/telegram/src/polling-session.ts` — voir comment ils loggent les erreurs
**Test** : `pnpm build` (pas de test unitaire pour ça, juste vérifier build)
**Commit** : `fix(gateway): replace 33 silent catch blocks with proper logging`

### Tâche 1.3 — Remplacer console.log par logger dans gateway
**Fichier** : `src/gateway/telegram.ts`
**Problème** : 13 `console.log()` qui polluent stdout et cassent JSON.
**Fix** :
- `grep -n "console.log" src/gateway/telegram.ts`
- Remplacer par `log.info(...)` ou `log.debug(...)`
- Import `createLogger` si pas déjà fait
**Test** : `pnpm build`
**Commit** : `fix(gateway): replace console.log with logger — fix JSON output pollution`

### Tâche 1.4 — Token pre-flight check
**Fichier** : `src/agents/runtime.ts`
**Problème** : REX envoie au LLM sans vérifier si le contexte dépasse la fenêtre.
**Fix** :
- Avant l'appel LLM dans `runAgent()`, estimer la taille : `chars / 4 * 1.2` (safety margin 20%)
- Si > contextWindow du modèle → compacter (couper les messages anciens) ou warn
- Ajouter dans `MODEL_BUDGETS` (tool-injector.ts) la `maxContextTokens` par modèle
**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/src/agents/compaction.ts` — `SAFETY_MARGIN = 1.2`
**Test** : ajouter un test unitaire `token-preflight.test.ts`
**Commit** : `feat(agents): add token pre-flight check — prevent context overflow`

### Tâche 1.5 — Auth profile cooldown
**Fichier** : `src/providers/providers.ts`
**Problème** : Quand un provider crash/rate-limit, REX réessaie immédiatement.
**Fix** :
- Ajouter un `cooldownMap: Map<string, { until: number, failures: number }>`
- Après failure : `cooldownMs = Math.min(30000, 2000 * 2^failures)`
- Skip provider si `Date.now() < cooldownMap.get(provider).until`
- Reset cooldown sur succès
**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/src/agents/auth-profiles/usage.ts`
**Test** : ajouter un test unitaire
**Commit** : `feat(providers): add exponential cooldown on provider failures`

---

## SPRINT 2 — Resilience

### Tâche 2.1 — Graceful shutdown
**Fichiers** : `src/daemon.ts`, `src/gateway/telegram.ts`
**Fix** :
1. Flag `let shuttingDown = false`
2. `process.on('SIGTERM', async () => { ... })` et `SIGINT`
3. Stop polling / stop accepting
4. `await Promise.allSettled([...inFlight])` avec timeout 15s
5. Release locks, save state, log "shutdown complete"
6. `process.exit(0)`
**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/extensions/telegram/src/polling-session.ts`
**Commit** : `feat(daemon): add graceful shutdown with 15s drain timeout`

### Tâche 2.2 — Exponential backoff + stall detection
**Fichier** : `src/gateway/telegram.ts`
**Fix** :
- Remplacer `setTimeout(3000)` hardcodé par : `delay = Math.min(30000, 2000 * 2^retryCount) + jitter`
- Ajouter watchdog : si aucun message reçu depuis 90s et polling actif → force restart cycle
- Classifier d'erreurs : `isRecoverableError(e)` → retry, sinon log + stop
**Pattern OpenClaw** : polling-session.ts `TELEGRAM_POLL_RESTART_POLICY`
**Commit** : `feat(gateway): add exponential backoff with jitter + stall detection watchdog`

### Tâche 2.3 — Delivery decoupling
**Fichier** : nouveau `src/gateway/delivery.ts`
**Fix** :
- Interface `DeliveryTarget = { type: 'telegram' | 'webhook' | 'log', config: ... }`
- `dispatchDelivery(output, target)` — envoie le résultat
- Retry queue avec 3 tentatives + backoff
- Outputs persistés dans event-journal pour re-delivery
**Pattern OpenClaw** : `src/cron/isolated-agent/delivery-dispatch.ts`
**Commit** : `feat(gateway): decouple delivery from execution — retry + persistence`

---

## SPRINT 3 — UX + Context

### Tâche 3.1 — Help structuré par domaine
**Fichier** : `src/index.ts`
**Fix** :
- `rex --help` → affiche UNIQUEMENT les catégories (Core, Memory, Fleet, Dev, etc.)
- `rex memory --help` → affiche les commandes memory (ingest, search, categorize, etc.)
- `rex <cmd> --help` → affiche usage + description de la commande
- Garder le switch tel quel, juste ajouter un `case '--help':` et `case 'memory':` avec sous-help
**Commit** : `feat(cli): add structured help by domain — rex memory --help`

### Tâche 3.2 — Workspace templates
**Fichiers** : nouveaux dans `~/.claude/rex/`
**Fix** :
- Créer `SOUL.md` (personnalité REX, extrait de `brain/identity.ts`)
- Créer `USER.md` (profil Kevin — timezone, stack, préférences)
- Modifier `brain/identity.ts` pour lire SOUL.md au lieu d'avoir le prompt hardcodé
- Session type detection : si Telegram group → NE PAS charger MEMORY.md
**Pattern OpenClaw** : `docs/reference/templates/AGENTS.md`
**Commit** : `feat(brain): load identity from SOUL.md — editable without rebuild`

### Tâche 3.3 — Cost tracking par provider
**Fichier** : `src/providers/budget.ts`
**Fix** :
- Ajouter metadata coût par modèle : `{ model, cost: { input, output } }`
- Tracker cumul jour/mois dans SQLite
- Alerte Telegram si > 80% budget mensuel (`REX_MONTHLY_BUDGET` dans config)
**Pattern OpenClaw** : `src/infra/provider-usage.ts`
**Commit** : `feat(providers): add per-model cost tracking + monthly budget alert`

---

## SPRINT 4 — rex-worker + Training

### Tâche 4.1 — Collecteurs de dataset
**Fichier** : `src/training/pipeline.ts`
**Fix** : Ajouter les collecteurs spécialisés :
- `collectRoutingExamples()` → depuis orchestration-policy.ts
- `collectToolSelectionExamples()` → depuis tool-injector.ts
- `collectSignalExamples()` → depuis signal-detector.ts
- `collectCategorizeExamples()` → depuis memory DB
- `collectGuardExamples()` → depuis security-scanner.ts
**Format** : JSONL chat-ml compatible
**Commit** : `feat(training): add specialized dataset collectors for rex-worker`

### Tâche 4.2 — Deploy pipeline
**Fichier** : `src/training/pipeline.ts`
**Fix** :
- `rex train deploy` → merge adapter + base → GGUF → Modelfile Ollama → `ollama create rex-worker`
- Support multi-size : 0.8B (VPS) + 4B (Mac/PC)
**Commit** : `feat(training): add deploy pipeline — adapter → GGUF → Ollama rex-worker`

---

## QUESTIONS POUR OPUS

_(Codex écrit ses questions ici si doute sur un choix d'implémentation)_

---

## ÉTAT DU RELAY

- **Créé par** : Opus, 14/03/2026
- **Dernière mise à jour** : 14/03/2026 18:30
- **Statut** : Sprint 1 prêt pour Codex
- **Priorité** : Sprint 1 d'abord (token economy), puis Sprint 2 (resilience)
