# CLAUDE TASK — OpenClaw Integration dans REX

> Lire dans l'ordre : CLAUDE.md → REX-BRAIN.md → ce fichier → git status
> Committer chaque tâche séparément avec message explicite.
> /loop jusqu'à tout complété.

---

## TASK 1 — Remplacer pane-relay TMUX par OpenClaw sessions ⭐ CRITIQUE

**Fichier fourni :** `/tmp/rex_openclaw_impl/1_pane-relay-sessions.ts`

Action :
1. Copier dans `packages/cli/src/pane-relay.ts`
2. Vérifier que `sessions_spawn` et `sessions_send` correspondent aux vraies signatures OpenClaw
   (voir `/usr/local/lib/node_modules/openclaw/docs/concepts/session-tool.md`)
3. Adapter si nécessaire
4. Créer `packages/cli/src/anti-vibecoding.ts` depuis `/tmp/rex_openclaw_impl/4_anti-vibecoding.ts`
5. Ajouter `rex anti-vibe <task>` dans `index.ts` (section switch)
6. Commit : `feat(relay): replace TMUX with OpenClaw sessions_spawn for multi-LLM relay`

---

## TASK 2 — Hooks OpenClaw REX ⭐ IMPORTANT

**Fichiers fournis :** `/tmp/rex_openclaw_impl/2_hooks/`

Action :
1. Créer répertoire `hooks/` dans le workspace OpenClaw : `~/.openclaw/workspace/hooks/`
2. Copier les 3 hooks :
   - `rex-budget-check/` → `~/.openclaw/workspace/hooks/rex-budget-check/`
   - `rex-snapshot/` → `~/.openclaw/workspace/hooks/rex-snapshot/`
   - `rex-morning-digest/` → `~/.openclaw/workspace/hooks/rex-morning-digest/`
3. Chaque hook a besoin d'un `hook.json` (créer pour snapshot et morning-digest sur le modèle de budget-check)
4. Tester : `openclaw hooks list` → doit afficher les 3 hooks REX
5. Activer : `openclaw hooks enable rex-budget-check`
6. Commit : `feat(hooks): add rex-budget-check, rex-snapshot, rex-morning-digest hooks`

---

## TASK 3 — Configurer compaction Qwen 1.5B dans openclaw.json ⭐ IMPORTANT

**Fichier fourni :** `/tmp/rex_openclaw_impl/3_openclaw_config_patch.json`

Action :
1. Lire `/home/node/.openclaw/openclaw.json` actuel
2. Ajouter (ne pas écraser) :
   - `agents.defaults.compaction.model = "ollama/qwen2.5:1.5b"`
   - `agents.defaults.contextPruning = { mode: "cache-ttl", ttl: "1h" }`
   - `agents.defaults.model.fallbacks = ["groq/llama-3.3-70b-versatile", "openrouter/z-ai/glm-4.5-air:free"]`
   - Ajouter agent `worker` dans `agents.list` (workspace séparé pour sessions_spawn)
   - `messages.queue.debounceMs = 800`
3. Valider la config : `openclaw gateway config.get`
4. Appliquer sans restart immédiat (Kevin validera)
5. Commit : `feat(config): add compaction/pruning/fallbacks/worker-agent to openclaw.json`

---

## TASK 4 — Câbler relay-engine.ts dans rexIdentityPipeline ⭐ CRITIQUE

(déjà dans LOGIC-AUDIT.md — rappel ici)

Action :
1. Dans `rex-identity.ts` step 5, remplacer `orchestrate()` par `runRelay()` de `relay-engine.ts`
2. Conserver `orchestrate()` en fallback si `runRelay` échoue
3. Supprimer la condition `state.mode === "qwen"` dans `gateway.ts`
   → `rexIdentityPipeline` doit être le handler par défaut de TOUS les messages free text
4. Commit : `fix(identity): wire relay-engine into rexIdentityPipeline, remove qwen mode gate`

---

## TASK 5 — Mettre à jour TODO.md avec état réel

Action :
1. Cocher tout ce qui est déjà implémenté (relay-engine ✅, user-cycles ✅, watchdog ✅, etc.)
2. Ajouter les nouvelles tâches (pane-relay, anti-vibe, hooks, config)
3. Commit : `docs(todo): sync TODO.md with actual implementation state`

---

## VÉRIFICATION FINALE

```bash
# Vérifier les hooks
openclaw hooks list | grep rex-

# Vérifier la config
openclaw gateway config.get | grep -A3 compaction

# Tester le relay
rex relay "test task simple"

# Tester anti-vibe (quand Mac online)
rex anti-vibe "créer une fonction TypeScript qui calcule fibonacci"
```
