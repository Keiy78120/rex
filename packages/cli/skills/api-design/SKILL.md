---
name: api-design
description: REST API design. Enforces consistent endpoints, response envelopes, pagination, error codes, and versioning. Use before building any new endpoint or reviewing an existing API surface.
user-invocable: true
---

# API Design

Consistency is the only thing that matters in an API. One inconsistent endpoint breaks trust in all of them.

## URL conventions

```
GET    /api/v1/users           # list (always paginated)
GET    /api/v1/users/:id       # single resource
POST   /api/v1/users           # create
PATCH  /api/v1/users/:id       # partial update
DELETE /api/v1/users/:id       # delete

# Nested resources (max 2 levels deep)
GET    /api/v1/users/:id/orders
POST   /api/v1/users/:id/orders

# Actions (when REST doesn't fit)
POST   /api/v1/users/:id/activate
POST   /api/v1/invoices/:id/send
```

- Always plural nouns, never verbs in URL
- kebab-case for multi-word: `/order-items` not `/orderItems`
- Version prefix: `/api/v1/` — bump to v2 only for breaking changes

## Response envelope

**Every response** uses this shape:

```typescript
// Success
{
  "data": { ... } | [...],
  "meta": {
    "total": 150,    // always on lists
    "limit": 20,
    "offset": 0
  }
}

// Error
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",    // machine-readable, SCREAMING_SNAKE
    "message": "Email is required", // human-readable, end-user safe
    "field": "email"               // optional, for field-level errors
  }
}
```

Never return raw arrays at the top level. Never return different shapes for the same endpoint.

## Pagination (mandatory on all lists)

```
GET /api/v1/orders?limit=20&offset=0
GET /api/v1/orders?limit=20&offset=20

// Response
{
  "data": [...],
  "meta": { "total": 847, "limit": 20, "offset": 0 }
}
```

- Default limit: 20. Max limit: 100 (enforce server-side).
- Never return unbounded lists. Always paginate.
- Frontend shows `total` from meta, not `data.length`.

## HTTP status codes

| Code | When |
|------|------|
| 200 | Success (GET, PATCH) |
| 201 | Created (POST) — include `Location` header |
| 204 | Deleted (DELETE) — no body |
| 400 | Bad request (malformed JSON, invalid params) |
| 401 | Not authenticated (missing/expired token) |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, concurrent update) |
| 422 | Validation error (valid JSON but business rule violated) |
| 429 | Rate limited — include `Retry-After` header |
| 500 | Server error — log internally, never expose stack trace |

## Error codes

Use machine-readable `code` values the frontend can switch on:

```
VALIDATION_ERROR     — field validation failed
NOT_FOUND            — resource doesn't exist
UNAUTHORIZED         — not logged in
FORBIDDEN            — logged in but no permission
DUPLICATE            — unique constraint violation
RATE_LIMITED         — too many requests
INTERNAL_ERROR       — catch-all for 500s
```

## Validation

- Validate at the boundary — never trust client data inside business logic
- Return ALL validation errors at once, not one by one
- Use `422` + `field` in error for form validation, `400` for structural issues

## Rate limiting headers

Always include on authenticated endpoints:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1735689600   # Unix timestamp
Retry-After: 30                  # seconds, on 429
```

## Checklist before shipping an endpoint

- [ ] URL follows conventions (plural, kebab, versioned)
- [ ] Response uses the standard envelope
- [ ] List endpoint is paginated (limit+offset+total)
- [ ] All error cases return correct status + error code
- [ ] Validation errors return field-level details
- [ ] No secrets or internal paths in responses
- [ ] Auth required where needed (don't forget!)
- [ ] Rate limiting on sensitive endpoints (auth, email send)
