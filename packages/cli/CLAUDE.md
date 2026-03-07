# CLI — Contexte Claude Code

Stack: TypeScript, tsup, Node.js 22
Entry: src/index.ts
Build: pnpm build (tsup)
Test: pas de test runner configuré — vérifier avant d'en ajouter un

## Règles

- Toujours typer explicitement (pas de `any`)
- Logs via `createLogger(source)` de logger.ts — jamais console.log direct
- Commandes CLI: pattern commander.js, voir index.ts pour exemples
- Paths centralisés dans paths.ts — ne jamais hardcoder de chemins user
