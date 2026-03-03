# REX

Config unifiée Claude Code + MCP memory server + activity logger.

## Structure

```
rex/
├── dotfiles/     # Claude Code config (symlinked to ~/.claude/)
├── memory/       # MCP server — semantic search over past sessions
├── activity/     # Hammerspoon app switch logger
└── install.sh    # Setup everything
```

## Install

```bash
./install.sh
```

## MCP Tools

- `rex_search(query)` — Semantic search in past sessions and learned facts
- `rex_learn(fact, category)` — Memorize a pattern, debug insight, or preference
- `rex_context(project_path)` — Get relevant context for a project

## Ingest past sessions

```bash
cd memory && npm run ingest
```

Parses `~/.claude/projects/` JSONL files, generates embeddings via Ollama (`qwen3-embedding:4b`), stores in SQLite + sqlite-vec.
