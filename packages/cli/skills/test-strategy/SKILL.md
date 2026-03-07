---
name: test-strategy
description: Testing strategy. Defines what to test, at what level, and how to mock. Prevents over-testing, under-testing, and tests that slow down development. Use before writing tests for a new feature or when a test suite grows painful.
user-invocable: true
---

# Test Strategy

Test the behavior, not the implementation. A test that breaks when you rename a variable is worthless.

## The pyramid

```
         /‾‾‾‾‾‾\
        / E2E (5%) \       — Happy paths only. Slow, brittle, expensive.
       /────────────\
      / Integration  \     — API endpoints, DB queries, service boundaries.
     /   (25–35%)    \
    /──────────────────\
   /   Unit (60–70%)   \   — Business logic, transformations, edge cases.
  /──────────────────────\
```

If your pyramid is inverted (more E2E than unit), your tests are slow and fragile.

## What to test at each level

### Unit tests
Test pure functions, business logic, edge cases:
- Calculations, transformations, validations
- Error conditions and boundary values
- Utility functions
- State machines

```ts
// GOOD — tests behavior
test('calculates discount correctly', () => {
  expect(applyDiscount(100, 0.2)).toBe(80)
  expect(applyDiscount(100, 0)).toBe(100)
  expect(applyDiscount(0, 0.5)).toBe(0)
})

// BAD — tests implementation, breaks on refactor
test('calls Math.floor once', () => { ... })
```

### Integration tests
Test your API endpoints end-to-end (request → response, with real DB in test mode):

```ts
test('POST /api/v1/users creates user', async () => {
  const res = await request(app)
    .post('/api/v1/users')
    .send({ email: 'test@example.com', name: 'Test' })

  expect(res.status).toBe(201)
  expect(res.body.data.email).toBe('test@example.com')
  // verify it's actually in the DB
  const user = await db.users.findByEmail('test@example.com')
  expect(user).toBeTruthy()
})
```

### E2E tests
Reserve for critical user paths only:
- Authentication (login, logout, forgot password)
- Checkout / payment flow
- Core value action of the product (publish, send, submit)

Never E2E test: form validation, UI states, error messages, edge cases.

## Mocking rules

| Mock this | Don't mock this |
|-----------|----------------|
| External APIs (Stripe, SendGrid, S3) | Internal business logic |
| Email/SMS sending | Database in unit tests (use in-memory or test DB) |
| Time (`Date.now()`, `new Date()`) | Your own service layer |
| Random values (`Math.random()`) | Framework code |
| File system in unit tests | |

```ts
// GOOD — mock external, test logic
jest.mock('./email-service')
test('sends welcome email on registration', async () => {
  await registerUser({ email: 'test@example.com' })
  expect(sendWelcomeEmail).toHaveBeenCalledWith('test@example.com')
})

// BAD — mocking what you're testing
jest.mock('./user-service')
test('user service creates user', () => { ... })  // what are we even testing?
```

## Coverage as a signal, not a goal

- 80% coverage is fine. 100% is usually waste.
- Coverage doesn't measure quality — a test that does `expect(true).toBe(true)` counts.
- Focus on: critical paths, error branches, edge cases.
- Skip: trivial getters/setters, framework boilerplate, generated code.

## Red flags in test suites

- Tests that test implementation details (internals, private methods)
- `setTimeout` or `sleep` in tests (use fake timers or conditions)
- Tests that depend on execution order (each test must be independent)
- Snapshots for everything (become maintenance burden — use for UI components only)
- Mocking your own database service (test against a real test DB instead)

## Before writing tests

1. Identify the **behavior** you're testing (not the code)
2. Write the test name as a sentence: `"should return 404 when user doesn't exist"`
3. Arrange → Act → Assert — three clear sections, no more
4. One assertion per test (or one logical group)
5. Make the test fail first — if it passes without code, it's testing nothing

## Stack conventions

```ts
// Vitest (preferred for Vite/Next projects)
import { describe, test, expect, vi } from 'vitest'

// Jest (legacy, Node projects)
import { describe, test, expect, jest } from '@jest/globals'

// React Testing Library — test from user perspective
import { render, screen, userEvent } from '@testing-library/react'
test('shows error when email invalid', async () => {
  render(<LoginForm />)
  await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
  await userEvent.click(screen.getByRole('button', { name: 'Login' }))
  expect(screen.getByText('Invalid email')).toBeInTheDocument()
})
```
