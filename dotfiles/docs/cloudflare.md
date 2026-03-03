# Cloudflare Workers — Doc Cache Local

> Dernière mise à jour : 2026-03-03

## Workers Basics

### Limite clé : 50 subrequests/invocation
Pour les opérations en batch : chunking + self-invoke pattern.

```ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // routing
    if (url.pathname === '/api/items') return handleItems(request, env);
    return new Response('Not found', { status: 404 });
  }
};
```

### D1 (SQLite)
```ts
const { results } = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
  .bind(userId)
  .all();
// TOUJOURS requêtes paramétrées, jamais de concaténation
```

### KV
```ts
await env.KV.put('key', JSON.stringify(value), { expirationTtl: 3600 });
const data = await env.KV.get('key', 'json');
// KV est eventually consistent — pas pour les données critiques temps réel
```

### Durable Objects
Pour state persistent + WebSocket — utilisé dans les bots Telegram.

## wrangler.toml
```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "xxx"

[[kv_namespaces]]
binding = "KV"
id = "xxx"
```

## Gotchas

1. **50 subrequests max** — inclut fetch(), D1, KV, tout appel réseau
2. **10ms CPU time** (free) / 30s (paid) — pas de boucles longues
3. **KV est eventually consistent** — délai de propagation ~60s
4. **D1 est en beta** — pas de transactions imbriquées
5. **CORS** : doit être géré manuellement dans le Worker
6. **`ctx.waitUntil()`** pour les tâches background après la réponse
