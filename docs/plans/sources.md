# REX — SOURCES

Plan simple pour savoir quoi lire, quoi reutiliser et quoi ne pas recoder.

---

## 1. Hierarchie des sources internes

Ordre de priorite :

1. demande user
2. `CLAUDE.md`
3. `AGENTS.md`
4. `docs/plans/action.md`
5. plan de travail choisi
6. addendum architecture
7. master plan long uniquement si besoin

Docs de travail simples :

- `docs/plans/backend-functions.md`
- `docs/plans/frontend-design.md`
- `docs/plans/sources.md`
- `docs/plans/2026-03-07-rex-install-optimization-plan.md`

Docs longues de reference :

- `docs/plans/2026-03-07-rex-v7-openclaw-addendum.md`
- `docs/plans/2026-03-07-rex-v7-master-plan.md`
- `docs/plans/action-detailed-archive.md`

---

## 2. Vision

REX = hub centralise de TOUTES les ressources : hardware, free tiers, abonnements, modeles locaux, outils MCP, memoire partagee.

Orchestrateurs principaux : **Claude Code + Codex ONLY**.
Tout automatique, zero setup pour l'utilisateur.

Phases :

- **Phase 1** : DONE (CLI, daemon, memory, gateway, app Flutter)
- **Phase 2** : CURRENT (MCP marketplace, LiteLLM proxy, API keys config, free model catalog)
- **Phase 3** : FUTURE (hub centralise, VPS brain, mesh multi-nodes)
- **Phase 4** : LATER (fleet, training pipeline, meeting bots)

## 3. Regle generale

REX ne doit pas recoder ce que des briques open source solides gerent deja bien.

Regle :

1. identifier si la couche existe deja
2. integrer la brique existante
3. ajouter la couche REX minimale utile
4. ne coder en propre que ce qui est specifique a REX

Ce qui est specifique a REX :

- owned-first routing
- continuity / no-loss
- runbooks / success memory
- topologies solo / cluster / fleet
- UX operateur sobre
- orchestration d'ensemble
- resource centralization (hardware + free tiers + subscriptions + local models)

---

## 4. Sources OSS prioritaires

### OpenClaw

A reutiliser pour :

- patterns d'agents
- channel registry
- architecture hub/gateway
- failover patterns

A ne pas copier :

- interface lourde
- surcharge visuelle
- couches inutiles pour REX

### NanoClaw

A reutiliser pour :

- channels-as-skills
- queues et patterns gateway legers
- multi-platform thinking

### YOLO Sandbox / Anthropic sandbox-runtime

A reutiliser pour :

- isolation d'execution
- runtime sandbox
- policies d'isolation deja gerees par l'OSS

REX garde seulement :

- choix runtime
- logs
- status
- mapping risque -> mode
- fallback

### LiteLLM

A reutiliser pour :

- proxy unifie vers tous les providers LLM (gratuits et payants)
- auto-rotation sur rate limit (fallback chain entre providers)
- cost tracking et usage monitoring
- provider abstraction : une seule interface, N backends

Integration REX Phase 2 :

- `litellm` en proxy local, configure par REX
- rotation automatique Groq -> Together -> Cerebras -> HF -> Mistral
- config API keys via UI Providers page
- catalog de modeles gratuits avec limites connues (RPM, TPM, quotas)

### Free Tier Providers

Sources de modeles gratuits a integrer via LiteLLM :

| Provider | Endpoint | Limites connues |
|----------|----------|-----------------|
| Groq API | `api.groq.com` | 30 RPM, 14.4k TPM (Llama 3), gratuit |
| Together API | `api.together.xyz` | Free tier, rate limited |
| Cerebras | `api.cerebras.ai` | Fast inference, free tier |
| HF Inference | `api-inference.huggingface.co` | Gratuit, rate limited, queue |
| Mistral (La Plateforme) | `api.mistral.ai` | Free tier pour petits modeles |

Regle : toujours verifier les limites actuelles avant integration (elles changent souvent).

### MCP Hub Sources

Sources pour le marketplace MCP :

| Source | URL / Methode | Usage |
|--------|---------------|-------|
| awesome-mcp-servers | GitHub API `petercat-ai/awesome-mcp-servers` | Catalogue principal, README parse |
| mcp.run registry | `mcp.run` | Serveurs verifies, one-click install |
| Smithery registry | `smithery.ai` | Discovery + install metadata |
| npm/PyPI search | `registry.npmjs.org`, `pypi.org` | Packages tagges `mcp-server` |

Regle : cache local du catalogue (refresh 1x/jour max), jamais de fetch bloquant au demarrage.

### Tailscale

A reutiliser pour :

- connectivite privee
- join entre machines
- SSH fallback
- verifications reseau

### RustDesk / Input Leap

A reutiliser pour :

- fallback remote control
- cas ou Tailscale seul ne suffit pas

---

## 5. Sources produit / UX

Le frontend doit suivre ces references de fond :

- cockpit minimal
- lisibilite immediate
- statuts fiables
- pages denses mais calmes

REX ne doit pas suivre :

- dashboards demo-friendly mais inutiles au quotidien
- interfaces qui dupliquent CLI, gateway et dashboard sans raison
- jargon partout a l'ecran

---

## 6. Sources techniques primaires a preferer

Toujours preferer :

- documentation officielle
- code source officiel
- schema/CLI officiels
- comportement reel du repo actuel

Toujours eviter comme source principale :

- resume marketing
- tweet/thread
- article secondaire si la doc officielle existe

---

## 7. Comment utiliser ce plan

### Si le sujet est backend

Lire :

- `CLAUDE.md`
- `AGENTS.md`
- `docs/plans/action.md`
- `docs/plans/backend-functions.md`
- addendum si hub/sync/gateway/fleet

### Si le sujet est frontend

Lire :

- `CLAUDE.md`
- `AGENTS.md`
- `docs/plans/action.md`
- `docs/plans/frontend-design.md`

### Si le sujet est documentation / cadrage / integration OSS

Lire :

- `CLAUDE.md`
- `docs/plans/action.md`
- `docs/plans/sources.md`
- addendum si besoin architecture

---

## 8. Definition of Done

Une bonne utilisation des sources laisse :

- moins de doublons
- moins de complexite maison
- une meilleure coherence entre code et docs
- une vision REX plus nette et plus defendable
