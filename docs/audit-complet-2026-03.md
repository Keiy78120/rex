# REX — Audit complet système (mars 2026)

> État réel de TOUS les modules REX après vérification code + plans.
> Chaque élément vérifié dans le code source, pas dans les docs.

---

## LÉGENDE

| Symbole | Signification |
|---------|---------------|
| ✅ | Implémenté et fonctionnel |
| 🔶 | Implémenté mais incomplet / à améliorer |
| ❌ | Non implémenté ou cassé |
| ⏭️ | Déferré intentionnellement (Phase 4 later) |

---

## 1. FLEET / GATEWAY / INTERCONNECTIVITÉ

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| Hub API (port 7420) | `hub.ts` | ✅ | 7 endpoints, auth token auto-persisté |
| Hub auth middleware | `hub.ts:24-69` | ✅ | REX_HUB_TOKEN généré + persisté |
| Gateway Telegram | `gateway.ts` | ✅ | Long polling, menus, streaming Qwen |
| Node mesh / Fleet | `node-mesh.ts` | ✅ | Capability detection, heartbeat 60s |
| Tailscale peer discovery | `node-mesh.ts` | ✅ | Probing port 7420 sur peers online |
| Sync engine | `sync.ts` + `sync-queue.ts` | ✅ | Bidirectionnel, self-sync guard |
| Gateway spooled replay | `gateway.ts` + `event-journal.ts` | ✅ | Replay sur reconnexion hub |
| Comms routing via mesh | `gateway.ts` | ✅ | `routeTask('llm')` avant réponse |
| Hub server timeout | `hub.ts` | 🔶 | Pas de `server.setTimeout()` explicite |
| **ESM require() fixes** | 4 fichiers | **✅ FIXÉ** | `spawn`, `hostname`, `execSync`, `readline` |

---

## 2. SYNC / PENDING / TIMING

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| Two-phase ingest | `ingest.ts` | ✅ | pending/ instant + embed lazy |
| Lockfile mutex | `ingest.ts:418-449` | ✅ | Atomic `flag:'wx'`, stale 10min |
| Daemon 8 cycles | `daemon.ts` | ✅ | ingest(3m), categorize(6m), curious(24h), reflect(6h), backup(24h), monitor(24h), health(5m), sync(60s) |
| Adaptive ingest modes | `ingest.ts:49-124` | ✅ | offline/fast/bulk/smart selon latence Ollama |
| **Stuck ingest detection** | `daemon.ts:234-246` | ✅ | STUCK_WINDOW=3 cycles, Telegram alert |
| Daily summary Telegram | `daemon.ts` | ✅ | 22h, guard lastDailySummaryDate |
| Smart disk alerts | `daemon.ts` | ✅ | disk<5GB OR pending>100 → notify |
| Hub crash auto-restart | `daemon.ts` | ✅ | 3 failures → Telegram + restart |

---

## 3. MÉMOIRE

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| SQLite + sqlite-vec | `ingest.ts:169-223` | ✅ | 3 tables: memories, memory_vec (768dim), memory_fts |
| FTS5 hybrid search | `hybrid-search.ts` | ✅ | BM25 + cosine RRF (0.7 vec + 0.3 bm25) |
| FTS5 backfill | `hybrid-search.ts` | ✅ | `rebuildFtsIndex()` via `rex search --rebuild-fts` |
| iMessage ingest | `ingest.ts` | ✅ | macOS only, Apple epoch offset |
| Delta ingest | `ingest.ts` | ✅ | file_size + lines_ingested tracking |
| Embedding retry | `ingest.ts` | ✅ | 3 retries, 2s backoff, fastEmbed fallback |
| Memory check | `memory-check.ts` | ✅ | sqlite-vec extension chargée, 100% count |
| FTS auto-rebuild on doctor | — | 🔶 | `rebuildFtsIndex()` non appelé au démarrage si drift |

---

## 4. TRAINING PIPELINE

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| `rex train` CLI | `index.ts:1946` | ✅ | Wired |
| Dataset collector | `training.ts` | ✅ | Lit DB, format ShareGPT JSONL |
| MLX-LM backend | `training.ts` | ✅ | LoRA sur Mac M-series |
| OpenAI fine-tune | `training.ts` | ✅ | Fallback si pas de Mac |
| Auto-detect backend | `training.ts` | ✅ | mlx-lm present? → MLX, sinon OpenAI |
| W&B monitoring | `training.ts` | 🔶 | Hook documenté, config manuelle |

---

## 5. MCP SERVER (REX as MCP)

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| JSON-RPC 2.0 over stdio | `rex-mcp-server.ts` | ✅ | Newline-delimited |
| 7 tools exposés | `rex-mcp-server.ts` | ✅ | memory_search, observe, delegate, sandbox_run, budget, nodes, review |
| Tool timeouts (execSync) | `rex-mcp-server.ts` | ✅ | 30-60s par tool |
| `rex mcp serve` | `mcp_registry.ts` | ✅ | Démarre le serveur |
| `rex mcp register` | `mcp_registry.ts` | ✅ | Écrit mcpServers dans settings.json |
| **ESM execSync fix** | `rex-mcp-server.ts` | **✅ FIXÉ** | Import top-level au lieu de require() |
| Input sanitization | `rex-mcp-server.ts` | 🔶 | Longueur non limitée sur queries |

---

## 6. SECURITY SCANNER

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| 16+ patterns injection | `security-scanner.ts` | ✅ | curl\|bash, env exfil, zero-width, DAN, etc. |
| SHA256 cache 24h | `security-scanner.ts` | ✅ | Cache par hash |
| Pre-install MCP scan | `mcp-discover.ts:306` | ✅ | BLOQUE si recommendation==='block' |
| VirusTotal API | `security-scanner.ts` | 🔶 | Documenté, API key optionnelle |
| mcp-scan OSS | `security-scanner.ts` | 🔶 | Mentionné, nécessite install séparée |

---

## 7. GUARDS V3

| Guard | Fichier | Status | Installé auto |
|-------|---------|--------|---------------|
| completion-guard | `guards/completion-guard.sh` | ✅ | ✅ via init |
| dangerous-cmd-guard | `guards/dangerous-cmd-guard.sh` | ✅ | ✅ via init |
| secret-guard | `guards/secret-guard.sh` | ✅ | ✅ via init |
| session-summary | `guards/session-summary.sh` | ✅ | ✅ via init |
| post-edit-guard | `guards/post-edit-guard.sh` | ✅ | ✅ via init |
| error-pattern-guard | `guards/error-pattern-guard.sh` | ✅ | ✅ via init |
| notify-telegram | `guards/notify-telegram.sh` | ✅ | ✅ via init |
| **force-push-guard** | `guards/force-push-guard.sh` | ✅ | **✅ FIXÉ** via init |
| **large-file-guard** | `guards/large-file-guard.sh` | ✅ | **✅ FIXÉ** via init |
| **env-commit-guard** | `guards/env-commit-guard.sh` | ✅ | **✅ FIXÉ** via init |
| **todo-limit-guard** | `guards/todo-limit-guard.sh` | ✅ | **✅ FIXÉ** via init |
| a11y-guard | `guards/a11y-guard.sh` | ✅ | 🔶 non auto-installé |
| any-type-guard | `guards/any-type-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| console-log-guard | `guards/console-log-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| honesty-guard | `guards/honesty-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| import-guard | `guards/import-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| perf-guard | `guards/perf-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| scope-guard | `guards/scope-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| test-protect-guard | `guards/test-protect-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |
| ui-checklist-guard | `guards/ui-checklist-guard.sh` | ✅ | 🔶 dispo via `rex guard add` |

---

## 8. REX COMME SUPERLAYER

| Composant | Fichier | Status | Notes |
|-----------|---------|--------|-------|
| Orchestrator 6-tier | `orchestrator.ts` | ✅ | script→Ollama→free→subscription→pay |
| 12 specialist profiles | `orchestrator.ts:65-149` | ✅ | code, summarize, classify, embed, etc. |
| Task-aware router | `router.ts` | ✅ | 7 types, cache 60s |
| LiteLLM proxy | `litellm.ts` | ✅ | Cooldown retry-after, usage tracking |
| Free model catalog | `free-models.ts` | ✅ | 8 providers, RPM/TPM/quotas |
| 6-tier routing policy | `orchestration-policy.ts` | ✅ | Zero LLM, script-first |
| Semantic cache | `semantic-cache.ts` | ✅ | SHA256 hash, TTL |
| Account pool | `account-pool.ts` | 🔶 | Implémenté, pas encore wired dans orchestrator |
| Ollama direct bypass | `gateway.ts`, `ingest.ts` | 🔶 | 6 sites appellent Ollama direct (acceptable pour perf) |
| **ESM gateway fix** | `gateway.ts` | **✅ FIXÉ** | `spawn` import top-level |

---

## 9. UX / EXPERIENCE UTILISATEUR

| Point | Status | Notes |
|-------|--------|-------|
| `rex install` profiles | ✅ | 5 profils détectés par hardware |
| `rex setup --quick` | ✅ | Detection auto Ollama/APIs/Claude |
| `rex doctor --fix` | ✅ | Auto-repair |
| Flutter ↔ CLI alignment | ✅ | 50+ commandes vérifiées, toutes existantes |
| Health page burn rate | ✅ | Token %, daily %, burn/h |
| Health page stuck ingest | 🔶 | Memory health section existe, pas de "stuck" visuel |
| `rex debt` | ✅ | Agrège TODO/FIXME/HACK avec âge |
| `rex models setup` | 🔶 | `rex models` existe, `--setup` auto-pull non implémenté |

---

## 10. ITEMS DES PLANS NON ENCORE IMPLÉMENTÉS

### Depuis `milo-rex-todo-opus.md`

| Item | Status | Priorité |
|------|--------|----------|
| Bloc 6.1 CodeRabbit/DeepSource/SonarCloud auto-config | ❌ | Moyenne |
| Bloc 6.4 GitHub Actions CI template (`rex init --review`) | ❌ | Moyenne |
| Bloc 6.7 Husky + lint-staged pre-commit (`rex init`) | ❌ | Faible |
| Bloc 2.2 Clipboard logger | ❌ | Faible |
| Bloc 3.2 `rex models setup` (auto-pull selon RAM) | ❌ | Faible |
| Bloc 7.1 `rex workflow new-feature` full | 🔶 | Faible |

### Depuis `rex-agent-factory.md`

| Item | Status | Priorité |
|------|--------|----------|
| `rex create-client` (B2B agent factory) | ❌ | Plus tard (produit séparé) |
| Dashboard client multi-tenant | ❌ | Plus tard |
| Fine-tuning pipeline automatisé par client | ❌ | Plus tard |

### Depuis `sources.md`

| Item | Status | Notes |
|------|--------|-------|
| YOLO Sandbox integration | 🔶 | `sandbox.ts` existe, Docker optionnel |
| NanoClaw channels-as-skills | ✅ | Implémenté via `skills.ts` |
| OpenClaw agent patterns | ✅ | Implémenté via `agents.ts` |

---

## 11. POINTS BLOQUANTS RÉSIDUELS (après session)

| Point | Impact | Fix requis |
|-------|--------|-----------|
| HTTP server timeout hub | Faible | `server.setTimeout(30000)` |
| FTS auto-rebuild si drift | Faible | Appeler rebuildFtsIndex dans doctor si memories > fts_count |
| Account pool non wired | Moyen | Appeler selectAccount() dans orchestrator |
| `rex models setup` absent | Faible | Ajouter subcommand |

---

## 12. RÉSUMÉ GÉNÉRAL

```
Phase 1 (Core)         : ✅ COMPLET
Phase 2 (Integration)  : ✅ COMPLET
Phase 3 (Hub/Fleet)    : ✅ COMPLET (95%)
Phase 4 (Advanced)     : ✅ COMPLET (agent-runtime, training, routing-policy, lang-graph)
                       : ⏭️ DÉFERRÉ (cross-platform Flutter, B2B factory, meeting bots)

Corrections session :   4 ESM require() → imports, 4 nouveaux guards auto-installés
Nouveaux docs :         docs/vps-install.md, docs/garry-migration.md, docs/audit-complet-2026-03.md
```

---

*Audit généré 2026-03-* — Source : inspection code source directe, 82 fichiers TypeScript.*
