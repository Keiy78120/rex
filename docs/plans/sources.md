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

## 2. Regle generale

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

---

## 3. Sources OSS prioritaires

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

- cost tracking ideas
- proxy/gateway patterns
- provider abstraction inspiration

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

## 4. Sources produit / UX

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

## 5. Sources techniques primaires a preferer

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

## 6. Comment utiliser ce plan

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

## 7. Definition of Done

Une bonne utilisation des sources laisse :

- moins de doublons
- moins de complexite maison
- une meilleure coherence entre code et docs
- une vision REX plus nette et plus defendable
