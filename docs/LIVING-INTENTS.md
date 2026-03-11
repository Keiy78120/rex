# REX — Living Intents & Semantic Cache
## Design Document (2026-03-10)

---

## Vision

REX apprend en permanence. Chaque intent résolu devient un script. Plus REX en accumule, moins il appelle un LLM. Le cache devient un cerveau vivant.

```
Jour 1 : 100% LLM
Jour 30 : 60% scripts, 40% LLM
Jour 90 : 90% scripts, 10% LLM ← REX quasi-autonome
```

---

## Intent Types

**USER_INTENT** — message direct de Kevin
→ "cherche X", "lis ce fichier", "lance ce script"

**AI_INTENT** — pattern détecté dans l'output d'un LLM
→ "I need to find X", "let me check Y" (déjà dans LLM-RELAY.md)

---

## La boucle principale

```
rex ingest "<text>" [--source user|ai]
        │
        ▼
1. Classify → source + category + params
        │
        ▼
2. Cache sémantique lookup (nomic-embed-text local)
        │
   ┌────┴──────────────────┐
CACHE HIT                CACHE MISS
0 token                  LLM résout
execute script           génère script bash/TS
retourne résultat        stocke embedding
score++                  → prochaine fois = HIT
```

---

## Categories d'intents

| Category | Exemple déclencheur |
|----------|-------------------|
| WEB_SEARCH | "cherche / find / google X" |
| FETCH_DOCS | "docs pour X / documentation de Y" |
| READ_FILE | "lis / ouvre fichier.ts" |
| WRITE_FILE | "écris / crée fichier Y" |
| RUN_COMMAND | "run / lance / execute cmd" |
| QUERY_MEMORY | "mémorise / qu'est-ce que j'ai dit sur X" |
| SEND_MESSAGE | "envoie / message X" |
| CODE_TASK | "code / implémente / crée une fonction" |
| LLM_RELAY | "second opinion / autre modèle sur X" |

---

## Living Scripts

Chaque CACHE MISS → LLM résout → REX génère un script bash/TS correspondant.
Le script est scoré à chaque usage (succès / échec).

**Stockage** : `~/.rex/scripts/intents/script-{category}-{ts}.sh`
**Registry** : SQLite `~/.rex/intents.db`

```
Score 0-3   → en observation (LLM reste prioritaire)
Score 4-9   → fiable, utilisé en priorité
Score 10+   → LLM plus jamais appelé pour ce pattern
```

Si failCount > 3 → script mis en quarantaine, LLM reprend la main.

---

## Cache sémantique

**Embedding** : `nomic-embed-text` via Ollama local (VPS, 0€)
**Fallback** : BM25 keyword hash si Ollama down
**Storage** : SQLite `~/.rex/semantic-cache.db` (+ vecteurs en blob)
**Seuil similarity** : 0.82 (précis, évite faux positifs)
**TTL** : adaptatif selon source (MEMORY = permanent, LLM = 30j, SCRIPT = 90j)

---

## Intégration Memory REX

Au boot de REX, le cache ingère automatiquement :
- `MEMORY.md` → facts long-terme (permanent)
- `memory/observations/*.yaml` → 7 derniers jours
- `knowledge/` → WhatsApp, Obsidian, iMessage (si indexed)

→ Kevin pose une question sur quelque chose déjà en mémoire = 0 LLM token.

---

## Fichiers à créer (Claude Code)

```
packages/cli/src/
  ├── intent-classifier.ts   ← classify USER/AI + extract params
  ├── intent-registry.ts     ← living scripts store + scoring
  ├── living-cache.ts        ← semantic cache + memory ingest
  └── intent-engine.ts       ← orchestration + CLI rex ingest
```

**Source** : `/home/node/.openclaw/workspace/memory/rex_intents_impl/` (VPS)
À copier sur Mac quand Claude Code prêt.

---

## CLI commands à ajouter dans index.ts

```bash
rex ingest "<text>" [--source user|ai] [--verbose]
rex cache stats
rex cache flush [--category WEB_SEARCH]
rex scripts list [--top 10]
rex scripts score <id> [--success|--fail]
```

---

## Connexion avec l'existant REX

| Existant | Intégration |
|----------|------------|
| `pane-relay.ts` | AI_INTENTs interceptés dans output LLM → ingest() |
| `relay-engine.ts` | CACHE HIT avant d'appeler runRelay() |
| `burn-rate.ts` | tokensUsed=0 si cache hit → économies trackées |
| `daemon.ts` | bootIngestMemory() au démarrage |
| `gateway.ts` | USER_INTENTs depuis messages Telegram → ingest() avant LLM |

---

## Métriques attendues

```
rex cache stats
─────────────────────────────────────
Living scripts : 47
Intents logged : 1 203
Cache hit rate : 73.2%
Tokens saved   : ~18 400
Top: WEB_SEARCH (312), CODE_TASK (201), QUERY_MEMORY (189)
```
