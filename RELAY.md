# REX RELAY — Opus → Codex

> **Codex : lis ce fichier EN ENTIER avant de coder.**
> Chaque tâche a le fichier exact, le code exact, le test exact, le commit exact.
> Pas de décision d'archi à prendre — tout est décidé. Exécute.

---

## SETUP

```bash
cd ~/Documents/Developer/keiy/rex
git checkout -b fix/sprint1-token-economy
```

Lis aussi `~/.codex/agents.md` — il contient tes règles, patterns, et checklist.

---

## SPRINT 1 — Token Economy + Error Handling

Objectif : économiser ~200-600K tokens/mois + rendre les erreurs visibles.

---

### TÂCHE 1.1 — Dédupliquer REX_SYSTEM_PROMPT

**Problème** : `REX_SYSTEM_PROMPT` (1027 chars) est injecté dans CHAQUE appel LLM via `runAgent()` ET `streamAgent()`. Si le gateway l'a déjà injecté (askQwenStream, askClaudeApiStream), c'est envoyé 2x = gaspillage.

**Fichier** : `packages/cli/src/agents/runtime.ts`

**Étapes** :

1. Lire le fichier entier
2. Trouver `runAgent()` (~ligne 540-570) et `streamAgent()` (~ligne 620-640)
3. Dans les deux fonctions, le system prompt est ajouté inconditionnellement :
   ```typescript
   messages.push({ role: 'system', content: `${REX_SYSTEM_PROMPT}${toolsSummary}` })
   ```
4. Ajouter un paramètre optionnel `skipSystemPrompt?: boolean` à `AgentConfig` :
   ```typescript
   // Dans l'interface AgentConfig (chercher dans le fichier)
   skipSystemPrompt?: boolean
   ```
5. Conditionner l'injection :
   ```typescript
   if (!config.skipSystemPrompt) {
     messages.push({ role: 'system', content: `${REX_SYSTEM_PROMPT}${toolsSummary}` })
   } else if (toolsSummary) {
     messages.push({ role: 'system', content: toolsSummary })
   }
   ```
6. Dans `gateway/telegram.ts`, quand `runAgent()` est appelé après `askQwenStream` ou `askClaudeApiStream` (qui injectent déjà le prompt), passer `skipSystemPrompt: true`

**Test** :
```bash
pnpm build && pnpm test -- tests/unit/agent-runtime.test.ts
```

**Commit** :
```bash
git add packages/cli/src/agents/runtime.ts
git commit -m "fix(agents): deduplicate REX_SYSTEM_PROMPT — skip if already injected"
```

---

### TÂCHE 1.2 — Remplacer les catch {} silencieux dans gateway

**Problème** : 33 `catch {}` ou `catch { }` dans `gateway/telegram.ts` — erreurs invisibles.

**Fichier** : `packages/cli/src/gateway/telegram.ts`

**Étapes** :

1. Lire le fichier entier
2. Trouver tous les `catch {}` et `catch { }` :
   ```bash
   grep -n "catch {" packages/cli/src/gateway/telegram.ts
   ```
3. Pour CHAQUE occurrence, remplacer par un log contextuel. Exemples :

   ```typescript
   // AVANT
   } catch {}

   // APRÈS — adapter le message au contexte de chaque catch
   } catch (e) {
     log.warn('failed to [description of what was attempted]', e instanceof Error ? e.message : String(e))
   }
   ```

4. Le `log` doit être importé en haut du fichier. Vérifier que `createLogger` est importé :
   ```typescript
   import { createLogger } from '../utils/logger.js'
   const log = createLogger('gateway')
   ```
   Si `log` existe déjà, ne pas le recréer.

5. NE PAS changer la logique — juste ajouter le log dans le catch. Le comportement doit rester identique (continuer après l'erreur).

**Test** :
```bash
pnpm build
```
Pas de test unitaire pour ça — juste vérifier que le build passe.

**Commit** :
```bash
git add packages/cli/src/gateway/telegram.ts
git commit -m "fix(gateway): replace 33 silent catch blocks with proper logging"
```

---

### TÂCHE 1.3 — Remplacer console.log par logger dans gateway

**Problème** : 13 `console.log()` dans gateway polluent stdout et cassent la sortie JSON.

**Fichier** : `packages/cli/src/gateway/telegram.ts`

**Étapes** :

1. Trouver tous les console.log :
   ```bash
   grep -n "console.log" packages/cli/src/gateway/telegram.ts
   ```
2. Remplacer chaque `console.log(...)` par `log.info(...)` ou `log.debug(...)`
   - Messages de démarrage (ports, URLs) → `log.info`
   - Messages de debug → `log.debug`
3. Aussi remplacer `console.error(...)` par `log.error(...)`
4. Vérifier que `log` est défini (tâche 1.2 l'a ajouté si nécessaire)

**Test** :
```bash
pnpm build
```

**Commit** :
```bash
git add packages/cli/src/gateway/telegram.ts
git commit -m "fix(gateway): replace console.log with logger — fix JSON output pollution"
```

---

### TÂCHE 1.4 — Token pre-flight check

**Problème** : REX envoie au LLM sans vérifier si le contexte dépasse la fenêtre. Résultat : erreurs d'overflow inattendues.

**Fichier** : `packages/cli/src/agents/runtime.ts`

**Étapes** :

1. Ajouter une constante en haut du fichier :
   ```typescript
   const TOKEN_SAFETY_MARGIN = 1.2  // 20% buffer pour sous-estimation
   ```

2. Ajouter une fonction helper :
   ```typescript
   function estimateTokens(messages: Array<{ role: string; content: string }>): number {
     return messages.reduce((sum, m) => sum + (m.content?.length ?? 0) / 4, 0) * TOKEN_SAFETY_MARGIN
   }
   ```

3. Dans `runAgent()`, AVANT l'appel LLM, ajouter la vérification :
   ```typescript
   const estimated = estimateTokens(messages)
   const maxContext = toolSelection?.budget?.maxContextTokens ?? 200_000
   if (estimated > maxContext) {
     log.warn(`Context too large: ~${Math.round(estimated)} tokens > ${maxContext} max. Truncating oldest messages.`)
     // Retirer les messages les plus anciens (garder system + dernier user)
     while (estimateTokens(messages) > maxContext && messages.length > 2) {
       messages.splice(1, 1)  // Retirer le 2e message (garder le system en [0])
     }
   }
   ```

4. Faire pareil dans `streamAgent()`

**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/src/agents/compaction.ts` — `SAFETY_MARGIN = 1.2`

**Test** :
```bash
pnpm build && pnpm test -- tests/unit/agent-runtime.test.ts
```

**Commit** :
```bash
git add packages/cli/src/agents/runtime.ts
git commit -m "feat(agents): add token pre-flight check — prevent context overflow"
```

---

### TÂCHE 1.5 — Provider cooldown exponentiel

**Problème** : Quand un provider crash ou rate-limit, REX réessaie immédiatement → boucle d'échecs.

**Fichier** : `packages/cli/src/providers/providers.ts`

**Étapes** :

1. Lire le fichier entier
2. Ajouter en haut du fichier :
   ```typescript
   // Provider cooldown — exponential backoff on failures
   const providerCooldowns = new Map<string, { until: number; failures: number }>()

   export function isProviderAvailable(provider: string): boolean {
     const cd = providerCooldowns.get(provider)
     if (!cd) return true
     if (Date.now() >= cd.until) {
       providerCooldowns.delete(provider)  // expired, reset
       return true
     }
     return false
   }

   export function markProviderFailed(provider: string): void {
     const cd = providerCooldowns.get(provider) ?? { until: 0, failures: 0 }
     cd.failures++
     cd.until = Date.now() + Math.min(30_000, 2000 * Math.pow(2, cd.failures))
     providerCooldowns.set(provider, cd)
     log.warn(`Provider ${provider} marked failed (attempt ${cd.failures}, cooldown ${Math.round((cd.until - Date.now()) / 1000)}s)`)
   }

   export function markProviderSuccess(provider: string): void {
     if (providerCooldowns.has(provider)) {
       log.info(`Provider ${provider} recovered — cooldown cleared`)
       providerCooldowns.delete(provider)
     }
   }
   ```

3. Vérifier que `log` est importé (`createLogger`)
4. Ajouter les exports au shim `src/providers.ts` si nécessaire

**Pattern OpenClaw** : `~/Documents/Developer/keiy/openclaw/src/agents/auth-profiles/usage.ts`

**Test** : ajouter dans `tests/unit/providers.test.ts` :
```typescript
describe('provider cooldown', () => {
  it('marks provider unavailable after failure', () => {
    markProviderFailed('test-provider')
    expect(isProviderAvailable('test-provider')).toBe(false)
  })
  it('makes provider available after cooldown expires', () => {
    // Would need to mock Date.now or wait
    markProviderSuccess('test-provider')
    expect(isProviderAvailable('test-provider')).toBe(true)
  })
})
```

```bash
pnpm build && pnpm test
```

**Commit** :
```bash
git add packages/cli/src/providers/providers.ts tests/unit/providers.test.ts
git commit -m "feat(providers): add exponential cooldown on failures — prevent retry storms"
```

---

## APRÈS SPRINT 1

Quand les 5 tâches sont terminées :

1. Vérifie une dernière fois :
   ```bash
   pnpm build && pnpm test
   ```
2. Push la branche :
   ```bash
   git push origin fix/sprint1-token-economy
   ```
3. Écris dans ce fichier (RELAY.md) sous "QUESTIONS POUR OPUS" :
   ```
   Sprint 1 terminé. 5/5 tâches complétées. Tests: XXXX/1449. Prêt pour review.
   ```
4. Commit + push le RELAY.md mis à jour

Kevin ou Opus fera la review et préparera Sprint 2.

---

## QUESTIONS POUR OPUS

_(Codex écrit ici si doute — commit + push)_

Sprint 1 terminé. 5/5 tâches complétées. Tests: 1451/1455.
Échecs restants préexistants dans `tests/integration/config.test.ts` :
- `default routing is ollama-first` (reçu `claude-only`)
- `default embedModel is nomic-embed-text` (reçu `custom-model`)
- `default daemon.healthCheckInterval is 300` (reçu `120`)
- `default notifications.daily is true` (reçu `false`)

---

## ÉTAT

- **Sprint 1** : 5/5 tâches complétées, prêt pour review
- **Sprint 2** : resilience (graceful shutdown, backoff, delivery) — après validation Sprint 1
- **Sprint 3** : UX (help, workspace templates, cost tracking)
- **Sprint 4** : rex-worker (dataset, training, deploy)
