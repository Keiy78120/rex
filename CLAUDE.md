# REX — Contexte projet pour agents

Ce fichier est le point d'entrée rapide pour tout agent (Claude, Codex, Garry) qui travaille sur ce repo.
**Mettre à jour la section "En cours / Terminé" à chaque changement significatif.**

## Source Of Truth — CRITIQUE

- **Repo OFFICIEL** : `Keiy78120/rex` (branche `main`)
- **NE JAMAIS travailler sur un clone ou fork non officiel**
- `CLAUDE.md` du root de ce repo = seule source de vérité

## Contexte rapide

REX est un companion pour Claude Code : guards automatiques, mémoire sémantique, gateway Telegram, app macOS Flutter.

- **npm :** `rex-claude` — `rex install` pour tout installer en one-command
- **Monorepo :** pnpm workspaces
- **Stack :** TypeScript/Node (CLI), Dart/Flutter (app macOS), SQLite (mémoire)

## Règles de base

Voir `.claude/rules/` pour les détails :

- [`project.md`](.claude/rules/project.md) — structure, commandes, points critiques
- [`decisions.md`](.claude/rules/decisions.md) — choix techniques passés
- [`preferences.md`](.claude/rules/preferences.md) — style de code

Résumé :
- Pas de Co-Authored-By dans les commits
- Pas de mention Claude/AI dans les commits/PR
- `pnpm build` avant tout commit CLI
- `flutter build macos --debug` + test app avant commit Flutter

## Install

```bash
# Via npm (recommandé)
npm install -g rex-claude
rex install    # init + setup + audit

# Via clone (sans npm global)
git clone https://github.com/Keiy78120/rex
cd rex && ./install.sh
```

---

## En cours / Terminé

### ✅ Terminé (session 2026-03-05)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Memory categorization system (rex categorize + list-memories) | `packages/memory/src/categorize.ts`, `packages/cli/src/index.ts` |
| Memory page : chips cliquables → browser liste par catégorie | `memory_page.dart` |
| Settings Advanced : REX_CATEGORIZE_MODEL (Qwen/Claude) | `settings_page.dart` |
| RexService : runCategorize + listMemories + categorizingModel | `rex_service.dart` |
| Fix crash app (window_manager + MacosWindowUtils conflict) | `main.dart` |
| System tray : hide-to-tray, menu contextuel, click to show | `main.dart` |
| Telegram notify depuis l'app (curl direct + fallback script) | `gateway_page.dart`, `rex_service.dart` |
| Injection credentials Telegram dans tous les subprocess | `rex_service.dart` (`_env` getter) |
| Fix sandbox macOS (app-sandbox: false en debug) | `DebugProfile.entitlements` |
| Fix double notifyListeners pendant build (addPostFrameCallback) | `memory_page.dart`, `gateway_page.dart` |
| Fix isTranscribing detection (startsWith au lieu de ==) | `voice_page.dart` |
| Refonte theme (dark/light, textSecondary, codeBg, etc.) | `theme.dart` |
| Pages : Health, Memory, Gateway, Optimize, Context, Voice, Settings | `pages/` |
| Hotkey global Cmd+Shift+V pour Voice page | `main.dart` |
| REX CLI v4.0.1 : gateway, llm, setup, context, optimize --apply | `packages/cli/src/` |
| Gateway Telegram v3 : menu interactif, Wake-on-LAN, mode Qwen/Claude | `gateway.ts` |
| Gateway menu refactor : Quick actions + sous-menu Advanced | `packages/cli/src/gateway.ts` |
| Hammerspoon call watcher installé par `rex init` | `packages/cli/src/init.ts` |
| Voice: post-traitement Whisper -> optimisation prompt via LLM local | `rex_service.dart`, `settings_page.dart`, `voice_page.dart` |
| Voice: auto start/stop recording piloté par `call-state.json` | `rex_service.dart`, `settings_page.dart`, `voice_page.dart` |
| Gateway: anti-double update handling (`processingUpdates`) | `packages/cli/src/gateway.ts` |
| Gateway: per-update error catch (evite pause 5s sur exception) | `packages/cli/src/gateway.ts` |
| Gateway: Claude free-text mode utilise dino animation + edit same msg | `packages/cli/src/gateway.ts` |
| Flutter gateway_page: timer 5s poll checkGateway() pour real-time status | `packages/flutter_app/lib/pages/gateway_page.dart` |
| Flutter rex_service: stopGateway() utilise pkill pour tuer process orphelins | `packages/flutter_app/lib/services/rex_service.dart` |
| categorize.ts: --dry-run flag corrige | `packages/memory/src/categorize.ts` |
| categorize.ts: classifyWithClaude JSON extraction robuste | `packages/memory/src/categorize.ts` |
| Gateway: Qwen streaming Telegram + params optimisés | `packages/cli/src/gateway.ts` |
| Gateway: commandes `/babysit` et `/codex` | `packages/cli/src/gateway.ts` |
| Hybrid semantic consolidation (cosine 0.82 + Qwen summarize) | `packages/memory/src/categorize.ts` |
| Task-aware model router (7 taches, prefix match, cache 60s) | `packages/cli/src/router.ts` |
| Centralized hub `~/.claude/rex/` with paths.ts + config.ts | `packages/cli/src/paths.ts`, `packages/cli/src/config.ts` |
| DB migration from ~/.rex-memory/ to ~/.claude/rex/memory/ | `packages/cli/src/migrate.ts` |
| Project scanner with auto stack detection | `packages/cli/src/projects.ts` |
| Smart SessionStart pre-loading (200 token budget) | `packages/cli/src/preload.ts` |
| Self-improvement engine (lessons, error patterns, rule promotion) | `packages/cli/src/self-improve.ts` |
| Unified daemon replacing 3 LaunchAgents | `packages/cli/src/daemon.ts` |
| Centralized logger (`createLogger(source)`) across all modules | `packages/cli/src/logger.ts` |
| CLI agents autonomes + MCP manager + Skills system | `packages/cli/src/` |
| Flutter: merge rex_service.dart (1606 lignes) | `rex_service.dart` |
| Flutter: settings_page.dart 5 onglets | `settings_page.dart` |
| Flutter: sidebar fixe 220px non-resizable | `main.dart` |
| Flutter: theme.dart RexColors avec accent rouge REX #E5484D | `theme.dart` |

### ✅ Terminé (session 2026-03-06 — REX v6)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| Sidebar 10 items centree + page Logs centralisee | `main.dart`, `rex_sidebar.dart`, `logs_page.dart` |
| Profil orchestrator + Chat UI Flutter | `agents.ts`, `agents_page.dart` |
| Skills system (`rex skills list/add/show`) | `skills.ts`, `index.ts` |
| MCP discover/search/install + marketplace cache | `mcp_registry.ts`, `mcp_page.dart` |
| Gateway: fix double reponse + Qwen streaming progressif | `gateway.ts` |
| Multi-instance Claude (`CLAUDE_CONFIG_DIR` par agent) | `agents.ts` |
| Delta ingest + two-phase embed + lockfile mutex | `packages/memory/src/ingest.ts` |
| Watchdog agent profile (30min, auto-fix) | `agents.ts` |
| Hooks consolidation: 4 Stop → 1 script, 4 PostToolUse → 2 scripts | `~/.claude/rex-guards/` |

### ✅ Terminé (2026-03-07 — project-structure-cleanup)

| Ce qui a ete fait | Fichier(s) |
|-------------------|-----------|
| install.sh: fix chemin hardcodé Hammerspoon (→ $REX_DIR) | `install.sh` |
| install.sh: ajout check_deps (node, npm, jq) | `install.sh` |
| install.sh: merge intelligent settings.json (jq, préserve mcpServers existants) | `install.sh` |
| install.sh: détection OS, skip Hammerspoon+LaunchAgents sur Linux | `install.sh` |
| install.sh: message Linux → docs/linux-setup.md | `install.sh` |
| README: alignement rex init vs install.sh documenté | `README.md` |
| CLAUDE.md root: allégé → en-tête + .claude/rules/ + En cours/Terminé | `CLAUDE.md` |
| .claude/rules/project.md — facts repo | `.claude/rules/project.md` |
| .claude/rules/decisions.md — choix techniques | `.claude/rules/decisions.md` |
| .claude/rules/preferences.md — style de code | `.claude/rules/preferences.md` |
| packages/cli/CLAUDE.md | `packages/cli/CLAUDE.md` |
| packages/memory/CLAUDE.md | `packages/memory/CLAUDE.md` |
| packages/flutter_app/CLAUDE.md + FRONTEND.md | `packages/flutter_app/` |
| docs/PRD-template.md | `docs/PRD-template.md` |
| docs/linux-setup.md | `docs/linux-setup.md` |

### 🔄 En cours / A faire

| Tache | Priorite | Detail |
|-------|----------|--------|
| Training pipeline research approfondie | BASSE | Benchmarks reels mlx-lm vs unsloth + eval dataset interne |
| Flutter Settings: Model Router section | BASSE | Afficher task→model mapping depuis getRouterSnapshot() |
| MCP compatibility check dans `rex doctor` | MOYENNE | Diagnostic clair si MCP mal configure |
| Pipeline no memory loss | MOYENNE | Memoire cloud Claude + semantic search locale + resume |
