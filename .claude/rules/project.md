# REX — Facts projet

## Stack

- **CLI** : TypeScript, tsup, Node.js 22, commander.js
- **Memory** : TypeScript, SQLite, sqlite-vec, nomic-embed-text (Ollama)
- **Flutter app** : Flutter 3.x, Dart, macOS native, Material 3
- **Monorepo** : pnpm workspaces

## Structure

```
packages/
├── cli/         CLI rex (TypeScript, tsup) — Entry: src/index.ts
├── core/        Checks partagés (rex doctor)
├── memory/      Embed + search (nomic-embed-text + SQLite)
└── flutter_app/ App macOS native — Entry: lib/main.dart
memory/          Legacy memory package (voir packages/memory/)
dotfiles/        Config ~/.claude/* (symlinks via install.sh)
activity/        Hammerspoon activity logger
docs/            Documentation
```

## Commandes clés

```bash
# CLI
cd packages/cli && pnpm build       # build tsup
rex doctor                          # health check
rex status
rex gateway                         # bot Telegram
rex daemon                          # daemon background unifié
rex install                         # one-command: init + setup + audit

# Flutter app
cd packages/flutter_app
flutter build macos --debug
open build/macos/Build/Products/Debug/rex_app.app

# Memory
rex ingest                          # indexer sessions (hourly via LaunchAgent/systemd)
rex categorize                      # auto-tag sessions
rex search "query"                  # recherche sémantique

# Migration
rex migrate                         # ~/.rex-memory/ → ~/.claude/rex/
rex recategorize                    # bulk re-classify
rex doctor --fix                    # auto-fix + health check
```

## Config utilisateur

Credentials dans `~/.claude/settings.json` sous la clé `env` :

```json
{
  "env": {
    "REX_TELEGRAM_BOT_TOKEN": "...",
    "REX_TELEGRAM_CHAT_ID":   "...",
    "REX_MAC_TAILSCALE_IP":   "...",
    "OLLAMA_URL":             "http://localhost:11434"
  }
}
```

Guards dans `~/.claude/rex-guards/`.
Hooks dans `~/.claude/settings.json` (SessionStart/End, PreToolUse, PostToolUse).
LaunchAgents (macOS) ou systemd (Linux) — voir docs/linux-setup.md.

## Points critiques Flutter

- **Sandbox désactivé** : `DebugProfile.entitlements` → `app-sandbox: false` — OBLIGATOIRE
- **window_manager** : NE JAMAIS re-ajouter `waitUntilReadyToShow`. Fix: `ensureInitialized()` + `setPreventClose(true)` uniquement
- **Provider** : toute l'app utilise `context.read<RexService>()` / `Consumer<RexService>`
- **9 pages** : Health, Voice, Audio, Memory, Gateway, Agents, MCP, Optimize, Settings

## Points critiques Gateway

- Long polling (timeout 30s) dans une boucle `while(true)`
- `execSync` bloque — utiliser `runAsync` pour actions longues
- Rate limit Telegram editMessageText : 1 edit / 600ms minimum

## Points critiques Memory

- SQLite dans `~/.rex-memory/rex-memory.db`
- Two-phase ingest : pending/ (instant) + embed lazily (30 chunks/run, 500ms throttle)
- Lockfile `~/.claude/rex/memory/ingest.lock` (stale après 10min)
