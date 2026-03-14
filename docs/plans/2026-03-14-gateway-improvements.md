# REX Gateway — Améliorations inspirées d'OpenClaw

> Date : 14/03/2026
> Source : audit REX gateway vs OpenClaw (`~/Documents/Developer/keiy/openclaw/`)

---

## CE QUE REX FAIT MIEUX

1. **LLM streaming intégré** — Qwen/Claude streamé directement dans le gateway, thinking blocks filtrés
2. **Fleet-aware** — gateway route vers node-mesh pour exécution distribuée
3. **CLI callbacks** — gateway invoque directement les commandes REX (status, doctor, ingest)
4. **Telegram UX avancé** — menus, inline keyboards, actions contextuelles
5. **Footprint minimal** — pas de browser/CDP overhead

## CE QU'OPENCLAW FAIT MIEUX (à adopter)

### P1 — Polling resilience
- [ ] **Exponential backoff** avec jitter (2s → 30s) au lieu d'intervals fixes
- [ ] **Stall detection** watchdog (90s threshold, 30s check interval)
- [ ] **Recoverable vs fatal errors** — classifier d'erreurs réseau
- Fichier OpenClaw : `extensions/telegram/src/polling-session.ts`

### P1 — Graceful shutdown
- [ ] Drain propre avec timeout 15s au lieu de `process.exit(1)`
- [ ] Cleanup resources (locks, connections, pending sends)
- Fichier OpenClaw : gateway startup/shutdown lifecycle

### P2 — Webhook support Telegram
- [ ] Toggle polling ↔ webhook (config)
- [ ] Webhook = moins de CPU, meilleur throughput
- [ ] Cleanup webhook avant switch polling (idempotent)
- Fichier OpenClaw : `extensions/telegram/src/webhook.ts`

### P2 — Async delivery queue
- [ ] Découpler send du handler (ne pas bloquer le handler)
- [ ] Idempotency keys pour éviter doubles envois
- [ ] Retry queue pour les sends échoués

### P2 — Channel plugin SDK
- [ ] Interface plugin : `startup()`, `shutdown()`, `send()`, `normalize()`, `healthCheck()`
- [ ] Ajouter un channel = ~200 LOC (pas réécrire gateway)
- [ ] Priorité : WhatsApp adapter, Slack adapter, Discord adapter
- Fichier OpenClaw : `src/infra/outbound/channel-adapters.ts`

### P3 — Session sandboxing
- [ ] Session keys : `agent:<id>:<channel>:<group>:<thread>`
- [ ] Workspace isolé par session
- [ ] DM scope configurable (single session ou per-sender)

### P3 — Multi-account
- [ ] Support 10+ bots Telegram par gateway
- [ ] Per-account config
- [ ] Account rotation (REX a déjà `account-pool.ts`)

### P3 — Health policy
- [ ] SLA déclaratif par channel
- [ ] Uptime tracking
- [ ] Stale-socket detection

## FICHIERS OPENCLAW À ÉTUDIER

| Pattern | Fichier OpenClaw |
|---------|-----------------|
| Polling loop | `extensions/telegram/src/polling-session.ts:73` |
| Webhook | `extensions/telegram/src/webhook.ts:100` |
| Channel adapters | `src/infra/outbound/channel-adapters.ts` |
| Session routing | `src/gateway/session-utils.ts` |
| Multi-instance | `docs/gateway/multiple-gateways.md` |
| Channel routing doc | `docs/channels/channel-routing.md` |
