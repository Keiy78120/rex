# Defensive Engineering

CRITICAL — apply to EVERY feature. Before writing ANY code, think through the full lifecycle: "What happens when this scales? What breaks? What are the edge cases?"

## Scale & Pagination

- NEVER assume a small, fixed number of items. Every list/query MUST support `limit` + `offset` and return `total`.
- Frontend: paginate with "Load more" — never fetch unbounded data in one call.
- Display counts from backend `total`, not loaded array `.length`.

## Frontend ↔ Backend Sync

- When adding/changing a backend endpoint, ALWAYS verify the frontend calls match (URL, params, response shape).
- When changing a response shape, grep ALL frontend consumers — don't miss any caller.
- When adding a new route file, verify it maps to the correct URL path (e.g., `functions/api/admin/foo.ts` → `/api/admin/foo`).
- After rename/move of an endpoint, search for ALL old references (fetch calls, imports, tests).

## Rate Limits & Platform Limits

- Telegram: 30 msgs/sec — batch with delays, never fire-and-forget all at once.
- Cloudflare Workers: 50 subrequests/invocation — chunk-based processing with self-invoking chain for large operations.
- Any external API: assume it WILL rate-limit you. Build retry with backoff or chunking from day one.

## Error Handling & Fallbacks

- Every `fetch()` can fail: network error, timeout, 4xx, 5xx. Handle ALL cases, not just the happy path.
- Show user-friendly errors, not raw API responses. Never expose internal errors to end users.
- For background/async operations: always provide a status check mechanism (polling, webhook callback).
- When a feature flag is OFF, related UI must hide gracefully — no broken references, no empty sections.

## Telegram Mini App Projects — Mandatory Setup

- Every mini app project MUST have a Telegraph (telegra.ph) backup page with all client links/contact info.
- This serves as fallback if the bot or Cloudflare goes down (different infra = true redundancy).

## Think Before Implementing

- For every new feature, ask: "What if there are 10x more users/items/requests than today?"
- For every API call, ask: "What if this returns empty? null? error? takes 30 seconds?"
- For every state change, ask: "Who else reads this state? Will they break?"
- For every DB query, ask: "Does this need an index? Will it scan the whole table at scale?"
- For multi-project sync: when a fix applies to shared code, ALWAYS replicate to greenhouse-bot + frenchconnection-bot.
