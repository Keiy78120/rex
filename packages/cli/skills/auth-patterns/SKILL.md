---
name: auth-patterns
description: Authentication and authorization patterns. JWT, sessions, OAuth, RBAC, route protection. Use when implementing login, protected routes, or permission systems.
user-invocable: true
---

# Auth Patterns

Auth bugs are security bugs. Every decision here has a security consequence.

## Token storage

| Method | XSS safe | CSRF safe | Use for |
|--------|----------|-----------|---------|
| `httpOnly` cookie | ✅ | ❌ (need CSRF token) | Sessions, refresh tokens |
| Memory (React state) | ✅ | ✅ | Access tokens (short-lived) |
| `localStorage` | ❌ | ✅ | Never for auth tokens |
| `sessionStorage` | ❌ | ✅ | Never for auth tokens |

**Rule:** Access token in memory. Refresh token in `httpOnly` `Secure` `SameSite=Strict` cookie.

## JWT structure

```ts
// Access token: short-lived, stateless
const accessToken = jwt.sign(
  { sub: user.id, role: user.role, email: user.email },
  ACCESS_TOKEN_SECRET,
  { expiresIn: '15m' }   // never more than 1h
)

// Refresh token: long-lived, stored in DB for revocation
const refreshToken = jwt.sign(
  { sub: user.id, jti: crypto.randomUUID() },  // jti = unique ID for revocation
  REFRESH_TOKEN_SECRET,
  { expiresIn: '30d' }
)
// Store hashed refresh token in DB
await db.refreshTokens.insert({ userId: user.id, tokenHash: hash(refreshToken) })
```

**Never:** embed sensitive data in JWT (passwords, full profile, card numbers).
**Always:** verify on every request, don't trust payload without signature check.

## Route protection (Next.js App Router)

```ts
// middleware.ts — runs on every request before page render
import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/api/v1/:path*'],
}
```

**Never** protect routes only client-side — always enforce on server/middleware.

## RBAC (Role-Based Access Control)

```ts
// Define roles and permissions clearly
const PERMISSIONS = {
  'admin':   ['read', 'write', 'delete', 'manage_users'],
  'editor':  ['read', 'write'],
  'viewer':  ['read'],
} as const

// Check permission, not role (more flexible)
function can(user: User, action: string): boolean {
  return PERMISSIONS[user.role]?.includes(action) ?? false
}

// Usage
if (!can(user, 'delete')) {
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
}
```

**Never:** check `user.role === 'admin'` inline everywhere. Centralize permission logic.

## Password handling

```ts
import bcrypt from 'bcrypt'  // or argon2

// Hash on registration (never store plain text)
const hash = await bcrypt.hash(password, 12)  // cost factor 12

// Verify on login
const valid = await bcrypt.compare(password, user.passwordHash)

// Timing-safe comparison for tokens
import { timingSafeEqual } from 'node:crypto'
const match = timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken))
```

## OAuth (social login)

```ts
// Always use a library — don't implement OAuth yourself
// next-auth / auth.js for Next.js
// passport.js for Express

// Validate state parameter to prevent CSRF
// Validate redirect_uri server-side
// Store minimal profile data (don't keep what you don't need)
```

## Rate limiting on auth endpoints

```ts
// Login: 5 attempts per 15min per IP
// Password reset: 3 per hour per email
// Token refresh: 10 per minute per token
// Registration: 3 per hour per IP
```

## Checklist

- [ ] Access tokens expire in ≤1h
- [ ] Refresh tokens stored as hash in DB (revocable)
- [ ] Tokens in `httpOnly` cookies, never `localStorage`
- [ ] Passwords hashed with bcrypt/argon2 (cost ≥12)
- [ ] CSRF protection on all cookie-based state changes
- [ ] Rate limiting on login, register, reset endpoints
- [ ] All protected routes verified server-side (not just client guard)
- [ ] `HTTPS` only in production (`Secure` cookie flag)
- [ ] Logout invalidates refresh token in DB
- [ ] No sensitive data in JWT payload
