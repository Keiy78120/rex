---
name: error-handling
description: Error handling strategy. Error boundaries, logging patterns, user-facing messages, monitoring setup, and async error flows. Use when building any feature that can fail, or auditing error handling in existing code.
user-invocable: true
---

# Error Handling

Every error falls into two buckets: expected (handle gracefully) and unexpected (log, alert, recover).
Never show users a stack trace. Never silently swallow an error.

## Error hierarchy

```
Expected errors (handle in code)
├── Validation errors → show to user, guide to fix
├── Not found → 404, redirect or empty state
├── Auth errors → redirect to login
├── Business rule violations → explain and offer alternative
└── External API failures → retry or fallback

Unexpected errors (log + alert + recover)
├── Unhandled promise rejections
├── Database connection failures
├── Third-party SDK crashes
└── Memory/timeout errors
```

## Frontend: React Error Boundaries

```tsx
// components/ErrorBoundary.tsx
'use client'
import { Component, ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to your monitoring service
    console.error('[ErrorBoundary]', error, info)
    reportError(error, { context: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}

// Wrap at route level and around risky components
<ErrorBoundary fallback={<ErrorPage />}>
  <Dashboard />
</ErrorBoundary>
```

## Frontend: async error patterns

```tsx
// NEVER: unhandled promise
useEffect(() => {
  fetchData()  // if this throws, silent failure
}, [])

// GOOD: handle errors explicitly
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  fetchData()
    .catch(err => {
      setError(getErrorMessage(err))
      reportError(err)
    })
}, [])

// GOOD: React Query handles this automatically
const { data, error, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
if (isError) return <ErrorState message={getErrorMessage(error)} />
```

## Next.js App Router error files

```tsx
// app/error.tsx — catches runtime errors in route segment
'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { reportError(error) }, [error])

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}

// app/not-found.tsx — 404 handler
export default function NotFound() {
  return <div>Page not found</div>
}

// app/global-error.tsx — catches errors in root layout
'use client'
export default function GlobalError({ error, reset }) { ... }
```

## Backend: error response pattern

```ts
// Never expose internal errors to clients
class AppError extends Error {
  constructor(
    public code: string,       // machine-readable
    public message: string,    // end-user safe
    public status: number,     // HTTP status
    public details?: unknown   // optional context (logged, not returned)
  ) { super(message) }
}

// Express global error handler
app.use((err: Error, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      data: null,
      error: { code: err.code, message: err.message }
    })
  }

  // Unexpected error — log full details, return generic message
  logger.error({ err, req: { method: req.method, url: req.url } })
  reportError(err)

  res.status(500).json({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  })
})
```

## Logging levels

| Level | When | Example |
|-------|------|---------|
| `error` | Unexpected failures, alerts needed | DB crash, unhandled exception |
| `warn` | Expected failures worth monitoring | Retry attempts, rate limit hit |
| `info` | Key business events | User registered, payment processed |
| `debug` | Dev only, never in production | Query params, response body |

```ts
// Always log with context, not just the message
logger.error({ err, userId: req.user?.id, endpoint: req.url }, 'Payment failed')
// Not: logger.error('Payment failed')
```

## Async error rules

- Every `async` function must have a `try/catch` or be called with `.catch()`
- Never `await` inside `forEach` — use `Promise.all` or `for...of`
- Unhandled promise rejections crash Node.js 15+ — always handle

```ts
// GOOD
const results = await Promise.all(items.map(item => processItem(item)))

// BAD (forEach ignores returned promise)
items.forEach(async (item) => await processItem(item))

// For sequential with error isolation:
for (const item of items) {
  try {
    await processItem(item)
  } catch (err) {
    logger.warn({ err, itemId: item.id }, 'Failed to process item, continuing')
  }
}
```

## Checklist

- [ ] Error boundaries around route segments and risky components
- [ ] Every `fetch`/`async` call has error handling
- [ ] User sees human-readable message, never stack trace or raw error
- [ ] Unexpected errors logged with full context (user, endpoint, stack)
- [ ] `app/error.tsx` and `app/not-found.tsx` exist and are styled
- [ ] Global error handler in API (Express/Hono/Next route handler)
- [ ] `AppError` class for expected errors with machine-readable codes
- [ ] Error monitoring service wired up (see monitoring patterns)
