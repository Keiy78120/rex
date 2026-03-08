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
- **Phase 2** : CURRENT (MCP marketplace, LiteLLM proxy, API keys config, free model catalog, account-pool, project-intent, quick-setup, runWithCodex)
- **Phase 3** : FUTURE (hub centralise, VPS brain, mesh multi-nodes, secure API routes)
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

---

## 5. Ressources externes — Claude Code ecosystem (ajout 2026-03-08)

Sources identifiees et validees pour enrichir REX. Integrer par priorite.

### 5.1 Awesome lists de reference

| Repo | Stars | Pourquoi utile pour REX |
|------|-------|------------------------|
| `hesreallyhim/awesome-claude-code` | ⭐⭐⭐ | Skills, hooks, slash-commands, orchestrators. Search Rust/Tantivy sessions. **Priorite 1** |
| `rohitg00/awesome-claude-code-toolkit` | ⭐⭐⭐ | 135 agents, 35 skills, 42 commands, 19 hooks, 7 templates CLAUDE.md. Bibliotheque complete |
| `travisvn/awesome-claude-skills` | ⭐⭐ | Liste curatee Claude Skills, tres active |
| `punkpeye/awesome-mcp-servers` | ⭐⭐⭐ | Collection MCP la plus complete (memory, search, browser, monitoring) |
| `wong2/awesome-mcp-servers` | ⭐⭐ | Autre liste MCP curatee |
| `modelcontextprotocol/servers` | ⭐⭐⭐ | Officiel Anthropic |
| `e2b-dev/awesome-ai-agents` | ⭐⭐ | Agents autonomes — patterns utiles pour orchestration REX |

### 5.2 Outils a integrer / adapter directement

#### Guards & Hooks (pour renforcer les guards REX)

| Outil | Repo | Usage REX |
|-------|------|-----------|
| **Dippy** | `ldayton/Dippy` | Auto-approve bash safe commands via AST parsing, block destructive. Integrer dans `post-bash-guard.sh` |
| **TDD Guard** | `nizos/tdd-guard` | Bloque les violations TDD en monitoring fichiers. Integrer dans hooks REX |
| **parry** | `vaporif/parry` | Scanner prompt injection + exfiltration dans hooks. Ajouter a PostToolUse |
| **TypeScript Quality Hooks** | `bartolli/claude-code-typescript-hooks` | TS compilation + ESLint + Prettier, cache SHA256, <5ms. Remplacer post-edit-guard.sh |
| **cchooks SDK** | `GowayLee/cchooks` | SDK Python propre pour ecrire des hooks — reutiliser le pattern |
| **agnix** | `avifenesh/agnix` | Linter CLAUDE.md/SKILL.md/hooks, 156 regles + LSP. Ajouter dans `rex doctor` |

#### Session Search & Memory

| Outil | Repo | Usage REX |
|-------|------|-----------|
| **claude-code-tools** | `pchalasani/claude-code-tools` | **Rust/Tantivy full-text search** sur sessions JSONL. Skill + CLI pour agents. Integrer dans `rex search` |
| **Claude Session Restore** | `ZENG3LD/claude-session-restore` | Restaure contexte depuis sessions + git history. Tail-based, gere fichiers 2GB. Integrer dans `rex ingest` |
| **recall** | `zippoxer/recall` | Full-text search sessions + resume. Alternative simple a implanter |
| **Claudex** | `kunwar-shah/claudex` | Browser sessions history local, full-text index. Pattern a adapter pour Flutter app |

#### Orchestration & Multi-agents

| Outil | Repo | Usage REX |
|-------|------|-----------|
| **Claude Squad** | `smtg-ai/claude-squad` | TUI pour gerer multiple Claude Code + Codex + Aider en parallel. Pattern pour `account-pool.ts` |
| **Claude Swarm** | `parruda/claude-swarm` | Swarm d'agents connectes. Pattern pour fleet REX |
| **TSK** | `dtormoen/tsk` | CLI Rust — agents en Docker sandbox paralleles, retour git branches. Pattern pour `runWithCodex()` |
| **Happy Coder** | `slopus/happy` | Multiple Claude Code en parallele depuis mobile, push notifs quand input requis. Pattern notifications Telegram REX |
| **Ralph for Claude Code** | `frankbria/ralph-claude-code` | Loop autonome avec circuit breaker + rate limiting + exit detection. Integrer dans daemon REX |

#### Usage Monitor & Statusline

| Outil | Repo | Usage REX |
|-------|------|-----------|
| **ccflare** | `snipeship/ccflare` | Dashboard usage web UI complet. Adapter pour Flutter health page |
| **CC Usage** | `ryoppippi/ccusage` | CLI usage dashboard — integrer dans `rex status` |
| **claudia-statusline** | `hagan/claudia-statusline` | Rust, SQLite-first, burn rate, context bars. Adapter pour statusline REX |
| **Claude Code Usage Monitor** | `Maciek-roboblog/Claude-Code-Usage-Monitor` | Real-time terminal token monitoring. Integrer dans daemon |

#### Skills utiles pour CLAUDE.md / guards REX

| Outil | Repo | Contenu |
|-------|------|---------|
| **Trail of Bits Security Skills** | `trailofbits/skills` | 12+ skills securite, CodeQL, Semgrep, vuln detection. Ajouter aux guards REX |
| **Compound Engineering Plugin** | `EveryInc/compound-engineering-plugin` | Lessons from errors → future improvement. Pattern pour `self-improve.ts` |
| **Context Engineering Kit** | `NeoLabHQ/context-engineering-kit` | Techniques avancees context engineering, minimal tokens. Reutiliser dans `preload.ts` |
| **Superpowers** | `obra/superpowers` | Bundle SDLC complet — planning, review, test, debug. Ajouter comme skills REX |
| **Everything Claude Code** | `affaan-m/everything-claude-code` | Resources core engineering. Integrer les meilleures dans skills/ |

#### MCP Servers utiles pour REX

| MCP Server | Repo | Usage |
|------------|------|-------|
| **cortex (knowledge graph)** | `gzoonet/cortex` | Local knowledge graph, watch fichiers, entities+relations. Integrer avec memory REX |
| **anyquery** | `julien040/anyquery` | SQL sur 40+ apps (GitHub, Notion, Slack…). Ajouter au marketplace REX |
| **Ollama bridge MCP** | `jaspertvdm/mcp-server-ollama-bridge` | Bridge Ollama via MCP. Reutiliser pattern pour `llm.ts` |
| **mcp-gateway** | `ViperJuice/mcp-gateway` | Meta-server, 9 outils stables, auto-start Playwright+Context7, 25+ serveurs on-demand. Adapter pour REX MCP registry |
| **magg** | `sitbon/magg` | Meta-MCP auto-install + orchestration serveurs. Pattern pour MCP marketplace REX |
| **forage** | `isaac-levine/forage` | Self-improving tool discovery, installe serveurs MCP comme subprocesses, persist knowledge. A integrer dans `mcp_registry.ts` |

### 5.3 Patterns d'architecture a adopter

#### Ralph Wiggum Loop

Technique autonome : loop agent sur un fichier prompt jusqu'a completion.
Repos de reference : `frankbria/ralph-claude-code`, `mikeyobrien/ralph-orchestrator`, `ClaytonFarr/ralph-playbook`

Integrer dans `daemon.ts` pour les taches longues non-interactives de REX.

Caracteristiques cles :
- circuit breaker (evite boucle infinie)
- rate limiting integre
- exit detection fiable
- 75+ tests pour `frankbria/ralph-claude-code`

#### Context Engineering

Reference : `NeoLabHQ/context-engineering-kit`
Appliquer dans `preload.ts` : injection minimale tokens, techniques progressives.

#### Agentic Workflow Patterns

Reference : `ThibautMelen/agentic-workflow-patterns`
Patterns Anthropic documentes : Subagent Orchestration, Parallel Tool Calling, Master-Clone, Wizard Workflows.
Appliquer dans `agents.ts` et `router.ts`.

### 5.4 Ordre d'integration recommande

**Sprint immediat (Phase 2 current) :**
1. `claude-code-tools` Rust search → integrer dans `rex search` (remplace SQLite full-text basique)
2. `Dippy` AST bash guard → remplacer/enrichir `post-bash-guard.sh`
3. `agnix` linter → ajouter dans `rex doctor` sous `rex doctor --lint-config`
4. `claudia-statusline` patterns → enrichir `rex status` avec burn rate + context bars

**Sprint suivant (Phase 3) :**
5. `forage` self-improving MCP discovery → `mcp_registry.ts`
6. Ralph loop → `daemon.ts` pour taches autonomes longues
7. `cortex` knowledge graph → couche memoire supplementaire
8. Trail of Bits security skills → nouveaux guards

**Phase 4 :**
9. Fleet orchestration patterns (`claude-swarm`, `tsk`) → multi-node REX
10. `ccflare` patterns → Flutter health/usage page
