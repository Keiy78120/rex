# Audit Complet — OpenClaw vs REX + Auto-critique REX

> Date : 14/03/2026
> 3 audits parallèles : providers/auth, token waste/UX, features/skills

---

## 🔴 PROBLÈMES REX À CORRIGER EN PRIORITÉ

### P0 — Token Waste

| Problème | Impact | Fix |
|----------|--------|-----|
| `REX_SYSTEM_PROMPT` (1027 tokens) envoyé à CHAQUE appel LLM | ~200-600K tokens/mois gaspillés | Cacher au niveau provider, pas per-message |
| 33 `catch {}` silencieux dans gateway.ts | Bugs invisibles, debug impossible | Remplacer par `catch (e) { log.warn(...) }` |
| 13 `console.log` dans gateway.ts | Casse la sortie JSON | Remplacer par `logger` |
| 3 `execFileSync` séquentiels dans identity pipeline | 300-900ms latence avant chaque LLM call | Paralléliser ou cacher en mémoire |
| `buildContextMessage()` retourne `null` silencieusement | Context perdu sans warning | Logger + fallback explicite |

### P0 — UX

| Problème | Impact | Fix |
|----------|--------|-----|
| 187 commandes dans un switch, aucune discovery | Users perdus | `rex --help` structuré par domaine |
| Help = mur de 150+ lignes | Illisible | Paginer par catégorie : `rex memory --help` |
| Pas de `rex <cmd> --help` | Chaque commande opaque | Ajouter description + usage par commande |

### P0 — Error Handling

| Problème | Impact | Fix |
|----------|--------|-----|
| `process.exit(1)` brutal (pas de drain) | Perte données en cours | Graceful shutdown 15s (pattern OpenClaw) |
| Handoff notes du relay non exposées | User ne sait pas pourquoi ça a échoué | Inclure dans la réponse d'erreur |
| SPECIALIST_PROFILES avec metadata morte | Code bloat, confusion | Supprimer `avgLatencyMs` et `costPerToken` inutilisés |

---

## 🟢 CE QU'ON ABSORBE D'OPENCLAW

### P0 — Auth Profile Cooldown (aspirer immédiatement)

OpenClaw a un système de cooldown exponentiel sur les providers qui échouent.

```typescript
// Pattern OpenClaw (auth-profiles/usage.ts)
type ProfileUsageStats = {
  lastUsed: number
  lastGood: number
  cooldownMs: number       // exponentiel sur failures
  failureCount: number
  failureReason: string
}
```

**Pour REX** : intégrer dans `providers/providers.ts` — quand un provider rate-limit ou crash, le marquer "cold" avec backoff exponentiel. REX a déjà `signal-detector` qui peut détecter "provider down" mais ne fait rien avec.

**Fichier OpenClaw** : `src/agents/auth-profiles/usage.ts`

### P0 — Token Estimation + Safety Margin

OpenClaw pré-calcule la taille des messages AVANT l'envoi avec 20% de marge.

```typescript
// Pattern OpenClaw (compaction.ts)
SAFETY_MARGIN = 1.2  // 20% buffer
estimateMessagesTokens(messages) * SAFETY_MARGIN
```

**Pour REX** : vérifier la taille du contexte AVANT d'appeler le LLM. Si ça dépasse, compacter d'abord. Aujourd'hui REX envoie et espère que ça passe.

**Fichier OpenClaw** : `src/agents/compaction.ts`

### P1 — Graceful Shutdown (drain propre)

Polling stop → drain in-flight (15s max) → cleanup → exit(0).

**Fichier OpenClaw** : `extensions/telegram/src/polling-session.ts`

### P1 — Cron Isolation (runners isolés)

Au lieu de cycles daemon qui partagent l'état, spawner des **runners isolés** par tâche :
1. Hydrater le contexte depuis SQLite
2. Exécuter (ingest, categorize, health)
3. Capturer la sortie
4. Persister le run log
5. Cleanup

**Avantage** : crash isolation, historique queryable, tâches re-exécutables.

**Fichier OpenClaw** : `src/cron/isolated-agent/run.ts`

### P1 — Delivery Decoupling

Séparer "générer la réponse" de "l'envoyer" :
- Run = interne, retourne output
- Delivery = externe, route vers Telegram/webhook/email
- Retry indépendant de l'agent
- Outputs persistés pour re-delivery

**Fichier OpenClaw** : `src/cron/isolated-agent/delivery-dispatch.ts`

### P1 — Workspace Templates (SOUL/USER/MEMORY)

```
~/.claude/rex/SOUL.md    — personnalité REX (existe déjà implicitement)
~/.claude/rex/USER.md    — profil Kevin (timezone, préfs, contexte)
~/.claude/rex/MEMORY.md  — mémoire curatée long terme
```

**Règle clé** : MEMORY.md chargé UNIQUEMENT en session privée, PAS en groupe (sécurité).

**Fichier OpenClaw** : `docs/reference/templates/AGENTS.md`

### P2 — Skills Markdown (format unifié)

Convertir les agent templates TypeScript en Markdown + YAML frontmatter :
```yaml
---
name: dg-agent
description: "Agent directeur général"
---
# Instructions
...
```

**Avantage** : auditable, éditable sans rebuild, partageable.

### P2 — Cost Tracking par Provider

Ajouter metadata coût par modèle + tracking cumulatif jour/mois :
```typescript
{ model: 'claude-opus-4-6', cost: { input: 0.003, output: 0.015 } }
```

**Fichier OpenClaw** : `src/infra/provider-usage.ts`

### P2 — Exponential Backoff + Stall Detection

Remplacer intervals fixes par backoff avec jitter (2s→30s) + watchdog 90s.

**Fichier OpenClaw** : `extensions/telegram/src/polling-session.ts`

---

## 🔵 CE QUE REX FAIT MIEUX QU'OPENCLAW

| Domaine | REX | OpenClaw |
|---------|-----|----------|
| **Fleet distribuée** | Tailscale mesh, scoring, thermal, task routing | Local only, single instance |
| **6-tier routing** | SCRIPT→LOCAL→FREE→SONNET→OPUS→CODEX, 0 LLM | Coût/dispo seulement |
| **Intent detection** | Signal-based, 0 LLM, regex+rules | Pas d'intent routing |
| **Dynamic tool injection** | Par intent/model/health | Tools pré-enregistrés statiques |
| **rex-worker fine-tuné** | Modèle dédié pour tâches autonomes | Pas de modèle dédié |
| **CURIOUS** | Découverte proactive (modèles, MCPs, repos, patterns) | Pas de discovery |
| **Self-improvement** | Corrections → re-train → convergence | Pas de learning loop |
| **Memory distribuée** | Zero data loss, fleet sync, offline-first | Memory locale uniquement |
| **Signal detector** | 20+ signaux système, 0 LLM, cache 30s | Basique |
| **User cycles** | XState AWAKE/SLEEPING, gating par état | Pas de détection utilisateur |
| **Budget burn rate** | Analytics de consommation + alertes | Tracking basique |
| **Flutter app native** | 26 pages macOS | Web UI uniquement |

---

## 📊 CE QU'OPENCLAW A ET PAS REX

| Feature | Valeur pour REX | Coût adoption | Priorité |
|---------|----------------|---------------|----------|
| Auth profile cooldown | Haute | Bas | **P0** |
| Token pre-flight check | Haute | Bas | **P0** |
| Graceful shutdown | Haute | Moyen | **P1** |
| Cron isolation (runners) | Haute | Moyen | **P1** |
| Delivery decoupling | Haute | Moyen | **P1** |
| Workspace templates | Haute | Bas | **P1** |
| 40+ providers unifiés | Moyenne | Moyen | **P2** |
| Skills Markdown format | Moyenne | Bas | **P2** |
| Cost tracking/model | Moyenne | Bas | **P2** |
| Exponential backoff | Moyenne | Bas | **P2** |
| Plugin SDK | Moyenne | Haut | **P3** |
| Browser profiles | Basse | Moyen | **P3** |
| Canvas cross-platform | Basse | Haut | **P3** |
| Tool policy (owner-only) | Basse (single user) | Moyen | **P3** |

---

## 🎯 PLAN D'ACTION CONSOLIDÉ

### Sprint 1 — Token Economy + Error Handling
1. Cacher `REX_SYSTEM_PROMPT` au niveau provider (pas per-message)
2. Remplacer 33 `catch {}` par logging
3. Remplacer 13 `console.log` par logger
4. Ajouter token pre-flight check (estimation + 20% margin)
5. Intégrer auth profile cooldown dans providers

### Sprint 2 — Resilience
6. Graceful shutdown (drain 15s)
7. Exponential backoff + stall detection dans gateway
8. Delivery decoupling (run ≠ send)
9. Cron isolation (runners isolés pour daemon cycles)

### Sprint 3 — UX + Context
10. Help structuré par domaine (`rex memory --help`)
11. Workspace templates (SOUL/USER/MEMORY)
12. Session type detection (privé vs groupe)
13. Cost tracking par provider/modèle

### Sprint 4 — rex-worker + Training
14. Collecteurs de dataset spécialisés
15. Fine-tune Qwen 3.5 4B
16. Self-improvement loop (corrections → re-train)
17. Deploy fleet-wide

---

## FICHIERS OPENCLAW À ÉTUDIER

| Pattern | Fichier |
|---------|---------|
| Auth cooldown | `src/agents/auth-profiles/usage.ts` |
| Token estimation | `src/agents/compaction.ts` |
| Fallback chain | `src/agents/model-fallback.ts` |
| Polling resilience | `extensions/telegram/src/polling-session.ts` |
| Cron isolation | `src/cron/isolated-agent/run.ts` |
| Delivery dispatch | `src/cron/isolated-agent/delivery-dispatch.ts` |
| Workspace templates | `docs/reference/templates/AGENTS.md` |
| Skills format | `skills/healthcheck/SKILL.md` |
| Cost tracking | `src/infra/provider-usage.ts` |
| Tool policy | `src/agents/tool-policy.ts` |
| Plugin SDK | `docs/tools/plugin.md` |
