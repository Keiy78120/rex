---
name: perf
description: Performance audit. Identifies bottlenecks in frontend (Core Web Vitals, bundle, rendering), backend (slow queries, N+1, missing indexes), and infrastructure (caching, CDN). Reports with file:line and concrete fixes. Use when the app feels slow or before a launch.
user-invocable: true
---

# Performance

Measure first. Never guess where the bottleneck is.

## Frontend

### Core Web Vitals targets
| Metric | Good | Needs work |
|--------|------|-----------|
| LCP (largest content) | <2.5s | >4s |
| INP (interaction) | <200ms | >500ms |
| CLS (layout shift) | <0.1 | >0.25 |

### Bundle audit
```bash
# Next.js
ANALYZE=true next build   # needs @next/bundle-analyzer

# Check for duplicate deps
npx depcheck
npx bundlephobia <package>   # before adding anything
```

**Red flags:**
- `moment.js` (replace with `date-fns` or `dayjs`)
- Full `lodash` import (use `lodash-es` + tree-shaking)
- Unoptimized images (no `next/image`, missing `width`/`height`)
- No code splitting (all JS in one chunk)
- `useEffect` on every render with no dep array

### Rendering bottlenecks

```tsx
// BAD: expensive filter on every render
const filtered = items.filter(...)

// GOOD: memoized
const filtered = useMemo(() => items.filter(...), [items, query])

// BAD: new function reference breaks child memo
<Child onClick={() => doSomething()} />

// GOOD
const handleClick = useCallback(() => doSomething(), [])
<Child onClick={handleClick} />
```

**Check:**
- [ ] Lists with 100+ items: use virtualization (`react-window` or `@tanstack/virtual`)
- [ ] Heavy components: lazy load with `dynamic(() => import(...), { ssr: false })`
- [ ] Images: `next/image` with `priority` on above-the-fold, lazy below
- [ ] Fonts: `next/font` only, never `<link>` to Google Fonts

## Backend / API

### Query audit

```sql
-- Spot slow queries (Postgres)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;

-- Missing indexes
EXPLAIN ANALYZE SELECT ...;   -- look for "Seq Scan" on large tables
```

**Red flags:**
- `SELECT *` on wide tables
- Missing indexes on foreign keys and filtered columns
- N+1: loop calling DB inside `.map()` — batch with `WHERE id IN (...)` instead
- No pagination on list endpoints
- Sorting on non-indexed column

### Caching strategy

| Layer | Tool | TTL |
|-------|------|-----|
| Static data | CDN edge cache | 1h–24h |
| API responses | Redis / Cloudflare KV | 1min–1h |
| DB queries | In-memory LRU | 30s |
| Images | `Cache-Control: public, max-age=31536000` | 1 year |

## Audit output format

```
## Perf Audit — [app/page]

### Critical (>1s impact)
- [file:line] Description + fix

### High (100ms–1s)
- ...

### Quick wins (<1h to fix)
- ...

### Metrics baseline
- Bundle: Xkb (main), Ykb (page)
- TTFB: Xms
- LCP: Xs
```
