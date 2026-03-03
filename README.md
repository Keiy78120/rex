# REX — Senior Dev Companion

Config unifiée Claude Code + MCP memory server + activity logger pour Kevin (D-Studio).

## Architecture

```
rex/
├── dotfiles/                  # Claude Code config (symlinked → ~/.claude/)
│   ├── CLAUDE.md              # Instructions globales REX
│   ├── settings.json          # MCP servers, hooks, plugins
│   ├── commands/              # Slash commands custom
│   ├── rules/                 # Règles auto-chargées au boot (7 fichiers)
│   ├── skills/                # Skills on-demand (8 skills)
│   ├── agents/                # Vide — migré vers skills
│   ├── docs/                  # Cache docs frameworks (chargé on-demand)
│   └── templates/             # Templates de projets
├── memory/                    # MCP Server REX-Memory
│   ├── src/
│   │   ├── server.ts          # 3 tools MCP : rex_search, rex_learn, rex_context
│   │   ├── ingest.ts          # Parse sessions JSONL → SQLite + embeddings
│   │   ├── embed.ts           # Embeddings via Ollama (qwen3-embedding:4b)
│   │   └── search.ts          # Recherche sémantique sqlite-vec
│   ├── db/                    # SQLite DB (gitignored)
│   ├── package.json
│   └── tsconfig.json
├── activity/                  # Hammerspoon activity logger
│   ├── init.lua               # Log app switches → JSONL
│   └── config.lua             # Config (chemin de log, intervalle)
├── install.sh                 # Setup complet en 1 commande
├── package.json
└── .gitignore
```

## Installation

```bash
cd ~/Documents/Developer/_config/rex
./install.sh
```

Le script :
1. Crée les symlinks `dotfiles/*` → `~/.claude/`
2. `npm install` dans memory/
3. Build le MCP server (`npm run build`)
4. Copie la config Hammerspoon
5. Enregistre le MCP server dans `~/.claude/settings.json`

## MCP Server — REX Memory

### Tools disponibles

| Tool | Usage |
|------|-------|
| `rex_search(query)` | Recherche sémantique dans les sessions passées et faits mémorisés |
| `rex_learn(fact, category)` | Mémorise un pattern, debug insight, ou préférence |
| `rex_context(project_path)` | Retourne le contexte pertinent pour le projet courant |

### Stack technique

- **DB** : SQLite + [sqlite-vec](https://github.com/asg017/sqlite-vec) pour la recherche vectorielle
- **Embeddings** : Ollama local avec `qwen3-embedding:4b` (2560 dimensions)
- **Ingestion** : parse les JSONL de `~/.claude/projects/`, extrait messages + tool_use + metadata
- **Fix notable** : `CAST(? AS INTEGER)` pour contourner un bug sqlite-vec avec les BigInt rowid

### Ingestion manuelle

```bash
cd memory && npm run ingest
```

### Ingestion automatique

Un LaunchAgent macOS tourne toutes les heures :
- Fichier : `~/Library/LaunchAgents/com.dstudio.rex-ingest.plist`
- Logs : `/tmp/rex-ingest.log`
- RunAtLoad : oui (se lance au démarrage du Mac)

```bash
# Vérifier le status
launchctl list | grep rex

# Forcer une exécution
launchctl kickstart gui/$(id -u)/com.dstudio.rex-ingest

# Voir les logs
tail -f /tmp/rex-ingest.log
```

## Activity Logger (Hammerspoon)

Log les changements d'app active en JSONL :
- **Quoi** : app name, durée, timestamps
- **Pas de keylogger** (privacy)
- **Fichier** : `rex/activity/activity.jsonl`
- **Chargé via** : `~/.hammerspoon/init.lua` → `rex/activity/init.lua`

## Skills (chargés on-demand)

| Skill | Description |
|-------|-------------|
| `rex-boot` | Briefing de session — auto-détecte projet, git, PRs, demande l'objectif |
| `context-loader` | Charge docs + CLAUDE.md + mémoire REX avant de bosser |
| `debug-assist` | Debugging systématique — parse erreur, cherche dans mémoire, root cause |
| `token-guard` | Audit du contexte — fichiers redondants, sorties trop longues, suggestions /compact |
| `project-init` | Init un nouveau projet avec CLAUDE.md, git, docs cache |
| `build-validate` | Vérifie build, lint, tests, dev server — reporte sans modifier |
| `code-review` | Review de code : logique, sécu, perf, TypeScript strictness |
| `one-shot` | Génère un projet complet Next.js + Shadcn en une passe |

## Rules (chargées au boot, ~370 lignes total)

| Fichier | Contenu |
|---------|---------|
| `defensive-engineering.md` | Scale, pagination, rate limits, error handling |
| `api-design.md` | REST conventions, response envelopes, status codes |
| `frontend.md` | Loading/empty/error states, SSR, hydration, forms, a11y |
| `security.md` | OWASP, secrets, SQL injection, XSS, CORS, auth |
| `testing.md` | Test discipline, build verification, mocking |
| `git-workflow.md` | Commit conventions, branching, PR process |
| `never-assume.md` | Règles anti-erreurs, alternatives obligatoires |
| `docs-first.md` | Documentation-first, cache local, Context7 |

## Docs Cache (~/.claude/docs/)

Fichiers de patterns/gotchas pré-chargés (lus on-demand uniquement) :

- `nextjs.md` — App Router, SSR, caching, middleware
- `react.md` — Hooks, patterns, performance
- `cloudflare.md` — Workers, D1, KV, limites
- `telegram-bot.md` — Bot API, rate limits, webhooks
- `tailwind.md` — Classes utilitaires, responsive, dark mode

## Plugins Claude Code

| Plugin | Status | Notes |
|--------|--------|-------|
| Playwright | Actif | Browser automation, tests E2E |
| Frontend Design | Actif | UI/design quality |
| Figma | **Désactivé** | Réactiver manuellement quand besoin (auth pénible) |
| Superpowers | Actif | Capacités étendues |
| Trail of Bits (x4) | Actif | Sécurité : static analysis, semgrep, audit, insecure defaults |
| Vercel | Désactivé | Pas utilisé |
| Ralph Loop | Désactivé | Pas utilisé |

Pour activer/désactiver : éditer `~/.claude/settings.json` > `enabledPlugins`.

## Services auto-start au boot Mac

| Service | Méthode | Vérification |
|---------|---------|-------------|
| Ollama | Login Items macOS | `pgrep ollama` |
| Hammerspoon | Login Items macOS | Icône menubar |
| REX Ingest | LaunchAgent (hourly) | `launchctl list \| grep rex` |
| MCP Server | Claude Code (auto) | Démarre avec Claude |

## Historique des décisions

1. **agents → skills** : les agents se chargent entièrement au boot (~500 tokens chacun), les skills ne chargent que les métadonnées (~700 tokens pour les 8). Économie significative.
2. **docs on-demand** : les fichiers `~/.claude/docs/` ne sont jamais lus au boot, seulement quand le framework est pertinent pour la tâche en cours.
3. **sqlite-vec CAST workaround** : le rowid en BigInt de `better-sqlite3` est rejeté par sqlite-vec. Fix : `CAST(? AS INTEGER)` dans le SQL.
4. **Figma désactivé par défaut** : re-auth fréquente, activé manuellement quand besoin.
5. **qwen3-embedding:4b** : modèle d'embedding local via Ollama, 2560 dimensions, déjà installé.
