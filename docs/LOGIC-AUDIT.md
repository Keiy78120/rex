
---

# REX — AUDIT GLOBAL DE LOGIQUE (09/03/2026)
> Basé sur lecture directe des fichiers TypeScript du repo.
> Vérité : ce qui est réellement câblé, pas ce qui est documenté.

---

## FLOW RÉEL D'UN MESSAGE (état actuel)

```
Telegram message
       │
       ▼
gateway.ts — webhook handler
       │
       ├─ /commande → handler direct (0 LLM)
       │
       ├─ free text + state.mode === "qwen"
       │       │
       │       ▼
       │   rexIdentityPipeline (rex-identity.ts)
       │   ① memory search (semantic)
       │   ② event journal (last 5 events)
       │   ③ intent scripts (SCRIPT_RULES regex → CLI direct)
       │   ④ script-first answer si possible (0 LLM)
       │   ⑤ orchestrator si LLM nécessaire
       │       │
       │       ▼
       │   orchestrator.ts → relayRace()
       │   [Ollama → free-tiers → Claude API]
       │
       └─ free text + autre mode (défaut)
               │
               ▼
           /chat → rex agents run orchestrator
               │
               └─ fallback: claudeSession() ou askClaude()
```

---

## PROBLÈME #1 — DEUX RELAY IMPLEMENTATIONS EN PARALLÈLE ⚠️

**État :** Deux "relay" coexistent, logiques différentes, non intégrées.

| | `orchestrator.ts relayRace()` | `relay-engine.ts runRelay()` |
|-|------------------------------|------------------------------|
| **Appelé par** | rex-identity.ts → orchestrator | index.ts CLI `rex relay <task>` UNIQUEMENT |
| **Pattern** | Fallback séquentiel : si A échoue → B | Vrai relay document : chaque modèle lit les contributions précédentes |
| **Doc partagée** | Non | Oui (RelayDocument avec contributions[]) |
| **Confidence** | Non | Oui (auto-reported 0-1) |
| **Mentor** | Non | Oui (Opus si confidence < 0.6) |

**Problème :** Le vrai relay (relay-engine.ts) n'est JAMAIS utilisé dans le pipeline principal.
`relayRace()` dans orchestrator.ts est un simple fallback déguisé en relay.

**Fix :**
```typescript
// Dans rex-identity.ts step 5, remplacer :
const result = await orchestrate(prompt)

// Par :
const { runRelay } = await import('./relay-engine.js')
const doc = await runRelay(prompt, context, { mentorEnabled: false })
```

---

## PROBLÈME #2 — MODE "QWEN" EST LE SEUL À UTILISER REX IDENTITY LAYER ⚠️

**État :** `rexIdentityPipeline` n'est appelée que si `state.mode === "qwen"`.
Le mode par défaut passe par `/chat → agents run orchestrator → claudeSession()`.
→ **90% du trafic ne passe pas par le pipeline REX.**

**Fix :** Faire de `rexIdentityPipeline` le handler par défaut pour TOUS les messages.
Le mode "qwen" ne devrait pas être un flag — c'est la logique principale de REX.

```typescript
// gateway.ts — remplacer le bloc free text par :
if (text.length > 2) {
  const { rexIdentityPipeline } = await import('./rex-identity.js')
  const result = await rexIdentityPipeline(text, { onChunk })
  response = result.response
}
// Supprimer la distinction mode === "qwen"
```

---

## PROBLÈME #3 — DB-MIGRATIONS NON APPELÉ AU BOOT ⚠️

**État :** `applyMigrations()` est appelé UNIQUEMENT depuis `index.ts` via commande CLI `rex migrate`.
→ Si l'user ne fait pas `rex migrate` manuellement → schema potentiellement désynchronisé.

**Fix :** Appeler `applyMigrations()` dans `daemon.ts` au démarrage :
```typescript
// daemon.ts — dans la fonction boot principale
const { applyMigrations } = await import('./db-migrations.js')
const migrations = await applyMigrations()
if (migrations.applied.length > 0) {
  log.info(`Applied ${migrations.applied.length} DB migrations: v${migrations.applied.join(', v')}`)
}
```

---

## PROBLÈME #4 — BUDGET ALERT N'ENVOIE PAS TELEGRAM ⚠️

**État :** `checkBudgetAlert()` (budget.ts ligne 235) détecte bien les 80%+ mais `console.log` seulement.
→ En production (daemon headless), personne ne voit le warning.

**Fix :** Dans `daemon.ts`, connecter l'alerte à la notification Telegram :
```typescript
// Dans daemon.ts, tick check toutes les heures :
const alert = checkBudgetAlert()
if (alert.level !== 'ok') {
  await notifyTelegram(`⚠️ Budget REX : ${alert.message}`)
}
```

---

## CE QUI EST OK (pas de problème)

| Composant | État réel |
|-----------|-----------|
| `user-state.ts` vs `user-cycles.ts` | Complémentaires : user-state = primitives AW + calcul score ; user-cycles = XState machine qui consomme user-state. Pas de doublon. |
| `activitywatch-bridge.ts` | Correctement appelé depuis user-state, user-cycles, pattern-detector, monitor-daemon. OK. |
| `budget.ts` alerte 80% | Logique de détection OK. Problème = seulement console.log (voir #4). |
| `gateway.ts` PID lock | Single instance guard OK. |
| `daemon.ts` AW check | `detectUserCycle()` branché dans daemon.ts ligne 848. OK. |
| `relay-engine.ts` logic | Logique propre, bien documentée. Juste pas câblée au pipeline. |
| `agent-templates/` + `client-factory.ts` | Séparation claire : templates = personas, factory = containers Docker. OK. |
| `secrets.ts` AES-256-GCM | Implémenté. Question master key reste ouverte (voir GAPS.md). |

---

## AUDIT DES MINI-MODELS (état actuel)

**État :** Aucun mini-model Ollama spécialisé n'existe encore.
Le pipeline utilise Qwen 2.5 généraliste pour tout.

**Gap :** `rex-intent`, `rex-tagger`, `rex-summarizer` ne sont pas créés.
Script de création : `scripts/mini-models/create-all.sh` (créé dans cette session).

**Fix :** Claude Code doit exécuter `scripts/mini-models/create-all.sh` après avoir vérifié qu'Ollama tourne.

---

## AUDIT DU SCRIPT STORE (état actuel)

**État :** 
- `scripts/build-binary.sh`, `install-linux.sh`, `install-macos.sh` existaient
- `scripts/fetch/`, `scripts/memory/`, `scripts/system/`, `scripts/security/` → créés cette session (15 scripts)
- Syntaxe error dans create-all.sh (EOF heredoc) → à corriger

---

## ACTIONS CLAUDE CODE — PRIORISÉES

### 🔴 CRITIQUE (logique cassée)

1. **Câbler relay-engine.ts dans rexIdentityPipeline** (step 5)
   - Remplacer `orchestrate()` par `runRelay()` avec `mentorEnabled: false`
   - Conserver orchestrate() comme fallback si relay-engine échoue

2. **Supprimer la dépendance mode === "qwen"**
   - `rexIdentityPipeline` doit être le handler par défaut de TOUS les messages free text
   - Tester : envoyer un message sans activer le mode qwen → doit passer par le pipeline

### 🟠 IMPORTANT (fiabilité prod)

3. **Appeler applyMigrations() dans daemon.ts au boot**
   - Avant toute opération SQLite
   - Logger les migrations appliquées

4. **Brancher budget alert → notification Telegram**
   - Dans daemon.ts, tick horaire → checkBudgetAlert() → notifyTelegram si level != ok

### 🟡 AMÉLIORATION (qualité)

5. **Corriger syntax error dans scripts/mini-models/create-all.sh**
   - EOF heredoc mal fermé (ligne 252)
   
6. **Créer les 4 mini-models Ollama** (si Ollama disponible sur Mac)
   - `rex-intent`, `rex-tagger`, `rex-summarizer`, `rex-security-check`
   
7. **Créer packages/cli/src/mini-modes/** avec 3 modes initiaux
   - `search-memory.mode.ts`
   - `save-idea.mode.ts`
   - `status.mode.ts`

8. **Mettre à jour TODO.md** — cocher : relay-engine ✅, user-cycles ✅, activitywatch ✅, watchdog ✅, sandbox ✅, secrets ✅

---

## SCHÉMA CIBLE (après fix)

```
Telegram message
       │
       ▼
gateway.ts — webhook handler (TOUS les messages free text)
       │
       ▼
rexIdentityPipeline (rex-identity.ts) — TOUJOURS
① memory search → snippets de contexte
② event journal → 5 derniers events
③ SCRIPT_RULES regex → réponse directe si match (0 LLM)
④ mini-model rex-intent (Ollama, 20ms) → intent + confidence
⑤ mini-mode chargé → contexte enrichi via scripts
⑥ LLM si nécessaire :
   └─ runRelay (relay-engine.ts) — vrai relay document
       [Ollama → Groq → Haiku → Sonnet → Opus mentor]
       Chaque modèle lit les contributions précédentes
       S'arrête quand confidence >= 0.8
       │
       ▼
      Réponse Telegram (splittée si > 4000 chars)
```
