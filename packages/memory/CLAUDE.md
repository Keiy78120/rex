# Memory — Contexte Claude Code

Stack: TypeScript, SQLite, sqlite-vec, nomic-embed-text via Ollama
DB: ~/.rex-memory/rex-memory.db

## Règles

- Embeddings: 768 dimensions (nomic-embed-text) — ne pas changer sans migration
- Chunking: 512 tokens max par chunk
- Throttling: 500ms entre embeddings pour ne pas saturer Ollama
- Toujours vérifier que Ollama est up avant d'embed (ping http://localhost:11434)
- Lockfile mutex: ~/.rex-memory/.ingest.lock — respecter le pattern existant
