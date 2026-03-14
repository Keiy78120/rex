# OpenClaw Fork Strategy — Ce qu'on aspire dans REX

> Date : 14/03/2026
> Principe : "Pourquoi réinventer quand 224K stars le font gratos"
> Source : https://github.com/openclaw/openclaw

---

## CE QUE OPENCLAW A (et qu'on peut aspirer)

### 1. Skills Registry — 5400+ skills
**Repo :** `github.com/openclaw/skills` + `VoltAgent/awesome-openclaw-skills`

OpenClaw a un registre de 5400+ skills catégorisées. REX a `resource-hub.ts` avec ~20 MCPs curated.

**À aspirer :**
- Le format SKILL.md (description + instructions + evals)
- Le registre de skills (filtrer les pertinentes pour REX)
- Le système d'install gating (vérifier avant d'installer)
- Les evals baseline (pass rate, tokens, latency)

**Adaptation REX :**
- `rex hub search` → cherche aussi dans le registre OpenClaw
- `security-scanner.ts` → scan avant install (déjà fait)
- Format compatible : SKILL.md = même chose que REX skills

### 2. Sandbox Docker — 4 niveaux d'isolation
**Source :** OpenClaw sandbox modes + ClawForge extension

OpenClaw a un système de sandbox Docker avec :
- Allowlist/denylist de tools par session
- Sandbox par session (pas global)
- 4 niveaux d'isolation (ClawForge)

**À aspirer :**
- Le pattern allowlist/denylist par session
- La config Docker sandbox per-session
- Les niveaux d'isolation (REX a déjà `sandbox.ts` avec seatbelt + Docker)

**Adaptation REX :**
- Enrichir `sandbox.ts` avec les patterns OpenClaw
- Session-level sandbox (pas juste global)

### 3. Multi-channel Gateway — 20+ plateformes
**Source :** OpenClaw supporte WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, IRC, etc.

REX a juste Telegram.

**À aspirer :**
- L'architecture multi-channel (adapter pattern)
- Les adapters pour les plateformes prioritaires (WhatsApp, Slack, Discord)
- Le pattern de routing channel → agent

**Adaptation REX :**
- `gateway/` pourrait avoir des adapters par plateforme
- Kevin a déjà mentionné WhatsApp dans la data consent wizard
- Priorité : WhatsApp > Slack > Discord (pour Kevin)

### 4. Trust Scoring (ClawForge)
**Source :** `github.com/moazbuilds/claudeclaw` (ClawForge extension)

Système de scoring de confiance pour skills et MCP servers :
- Vérifie avant exécution
- Score de confiance par source
- Audit trail + cost tracking

**À aspirer :**
- Le concept de trust score (REX a déjà security-scanner mais pas de score)
- L'audit trail (REX a event-journal)
- Le cost tracking (REX a budget.ts)

**Adaptation REX :**
- Ajouter un `trustScore` dans security-scanner
- Combiner avec le système de guards existant

### 5. Lifecycle Hooks — Full plugin system
**Source :** OpenClaw context engine

Hooks complets :
- bootstrap, ingest, assemble, compact, afterTurn
- prepareSubagentSpawn, onSubagentEnded
- Slot-based registry with config-driven resolution

**À aspirer :**
- Les lifecycle hooks (REX a des hooks Claude Code mais pas aussi complets)
- Le pattern slot-based registry
- Le plugin interface pour étendre REX

**Adaptation REX :**
- Enrichir le système de hooks REX
- Permettre des plugins tiers (skills communautaires)

### 6. Health Endpoints — Kubernetes-ready
**Source :** OpenClaw 2026.3.1

Built-in HTTP endpoints :
- `/health`, `/healthz`, `/ready`, `/readyz`
- Docker/Kubernetes health checks

**À aspirer :**
- REX hub.ts a déjà `/api/health` — enrichir avec `/ready` et `/healthz`
- Format compatible K8s pour déploiement VPS/cloud

### 7. MCP Bridge — OAuth2
**Source :** `github.com/freema/openclaw-mcp`

Bridge MCP sécurisé :
- OAuth2 authentication
- CORS protection
- Input validation

**À aspirer :**
- Le pattern OAuth2 pour sécuriser le hub API
- REX hub.ts a un Bearer token simple → upgrade vers OAuth2 quand multi-user

---

## CE QUE REX A ET PAS OPENCLAW

| Feature REX | OpenClaw |
|-------------|----------|
| **Fleet distribuée** (Tailscale mesh, scoring, thermal) | ❌ Local only |
| **6-tier routing** (SCRIPT→LOCAL→FREE→SONNET→OPUS→CODEX) | Routing basique |
| **Dynamic tool injection** (intent/model/health-aware) | Tools statiques |
| **rex-worker fine-tuné** | ❌ Pas de modèle dédié |
| **Signal detector** (20+ signaux, 0 LLM) | Basique |
| **CURIOUS** (découverte proactive) | ❌ |
| **Self-improvement loop** | ❌ |
| **Memory distribuée** (zero data loss, fleet sync) | Memory locale |
| **Budget tracking** + burn rate analytics | Basique |
| **Flutter app native** | Web UI |
| **User cycles** (XState AWAKE/SLEEPING) | ❌ |
| **REX identity** (system prompt partout) | Pas d'identité propre |

**REX > OpenClaw** sur : fleet, routing, intelligence autonome, identité, self-improvement.
**OpenClaw > REX** sur : communauté (224K stars), multi-channel, skills registry, plugins.

---

## PLAN D'ACTION

### P1 — Skills Registry
- [ ] Fork/scrape `openclaw/skills` → filtrer les skills pertinentes
- [ ] Adapter le format SKILL.md pour REX
- [ ] `rex hub search` → inclure skills OpenClaw
- [ ] Scanner sécurité avant install (déjà fait)

### P1 — Multi-channel adapters
- [ ] Étudier l'architecture adapter d'OpenClaw
- [ ] Adapter pattern pour `gateway/` : un adapter par plateforme
- [ ] Priorité : WhatsApp adapter (macOS/iOS via data sources)

### P2 — Trust Scoring
- [ ] Ajouter `trustScore` dans security-scanner
- [ ] Combiner avec event-journal pour audit trail
- [ ] Dashboard trust dans Flutter app

### P2 — Sandbox enrichi
- [ ] Session-level sandbox (pas juste global)
- [ ] Allowlist/denylist tools par session/agent
- [ ] 4 niveaux d'isolation (off/light/standard/full)

### P3 — Plugin system
- [ ] Lifecycle hooks enrichis (bootstrap→afterTurn)
- [ ] Plugin registry (skills communautaires)
- [ ] `rex plugin install <name>`

---

## REPOS À SURVEILLER

| Repo | Stars | Intérêt pour REX |
|------|-------|-----------------|
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | 224K+ | Core — multi-channel, sandbox, hooks |
| [openclaw/skills](https://github.com/openclaw/skills) | - | 5400+ skills registry |
| [VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills) | - | Skills filtrées et catégorisées |
| [moazbuilds/claudeclaw](https://github.com/moazbuilds/claudeclaw) | - | ClawForge — trust scoring, pipelines |
| [TechNickAI/openclaw-config](https://github.com/TechNickAI/openclaw-config) | - | Config patterns — memory, skills, autonomy |
| [ComposioHQ/secure-openclaw](https://github.com/ComposioHQ/secure-openclaw) | - | Secure variant — 500+ integrations |
| [freema/openclaw-mcp](https://github.com/freema/openclaw-mcp) | - | MCP bridge OAuth2 |

---

## RÈGLE D'OR

**Aspirer les PATTERNS, pas le code.**
- Format de skills → oui
- Architecture adapter → oui
- Copier du code → non (licence, maintenance, dette)
- Surveiller les évolutions → oui (REX CURIOUS peut le faire automatiquement)
