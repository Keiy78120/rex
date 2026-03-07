---
name: ux-flow
description: Map UX flows, states, and edge cases before building any feature. Forces progressive disclosure, proper error/empty/loading states, and feedback timing. Use before implementing any form, page, or user-facing feature.
user-invocable: true
---

# UX Flow

Before writing a single line of code, map the full user experience. UI without flows is just decoration.

## When to use

- Building a new page, form, or feature
- Refactoring a user-facing flow
- When asked to "add a settings page", "build a checkout", "design an onboarding"

## Process

### 1. Map the flow

Identify every state a user can be in:

```
Entry → [Loading] → [Empty] → [Content] → [Action] → [Feedback] → [Success | Error]
```

For every transition, ask: "What if it fails? What if it's slow? What if it's empty?"

### 2. Define all states (mandatory for every component that fetches or mutates)

| State | What to show |
|-------|-------------|
| **Loading** | Skeleton or spinner — never blank |
| **Empty** | Illustration + CTA — never nothing |
| **Error** | Human-readable message + retry — never raw error |
| **Success** | Confirm feedback (toast, redirect, or inline) |
| **Partial** | Data loaded but incomplete (e.g. 0 items in a category) |

### 3. Progressive disclosure

- Show only what the user needs right now
- Advanced options behind "Advanced settings" toggle
- Destructive actions behind confirmation ("Are you sure?")
- Onboarding: one thing at a time, never a wall of forms

### 4. Feedback timing

| Action | Feedback deadline |
|--------|------------------|
| Click/tap | <100ms visual response |
| Form submit | Immediate disabled state on button |
| API call | Loading indicator if >300ms |
| Success/Error | Visible for ≥2s before disappearing |

### 5. Error design

- **Validation errors** — inline under the field, not a global banner
- **Network errors** — retry button, explain what failed in plain language
- **Auth errors** — redirect or prompt, never silently fail
- **Partial failures** — show what worked, explain what didn't

### 6. Edge cases to always handle

- [ ] Empty list (0 items, first time)
- [ ] Single item (layout still works?)
- [ ] Very long content (text overflow, truncation strategy)
- [ ] Very short content (minimum heights, placeholder states)
- [ ] Concurrent actions (double submit, race condition)
- [ ] Offline / timeout (show status, allow retry)
- [ ] Permission denied (explain why, offer an alternative)

## Output format

Before implementing, write a brief state map:

```
[Feature: User invitations]
States: loading | empty (no invites sent) | list (invites) | error (network)
Actions: Send invite → optimistic add → confirm/rollback
Edge cases: duplicate email, max 50 invites, expired invite
Feedback: inline toast on send, inline error on duplicate
```

Then implement. Never skip this step for user-facing features.

## Stack conventions (React/Next.js)

```tsx
// Always initialize loading state properly
const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

// Never nest ternaries for state rendering — use explicit conditions
if (state === 'loading') return <Skeleton />
if (state === 'error') return <ErrorState message={error} onRetry={refetch} />
if (data.length === 0) return <EmptyState cta="Add your first item" />
return <DataList items={data} />
```
