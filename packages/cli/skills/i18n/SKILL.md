---
name: i18n
description: Internationalization patterns for Next.js. next-intl setup, message extraction, locale routing, date/number formatting, and pluralization. Use when adding multi-language support or auditing an existing i18n setup.
user-invocable: true
---

# i18n (Next.js + next-intl)

i18n added after launch is painful. i18n from day one is just a folder structure.

## Setup (next-intl)

```bash
npm install next-intl
```

```
messages/
├── en.json
├── fr.json
└── es.json

app/
├── [locale]/
│   ├── layout.tsx
│   └── page.tsx
├── i18n/
│   ├── routing.ts
│   └── request.ts
└── middleware.ts
```

```ts
// i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'fr', 'es'],
  defaultLocale: 'en',
})

// middleware.ts
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
```

## Message files

```json
// messages/en.json
{
  "nav": {
    "home": "Home",
    "pricing": "Pricing",
    "signin": "Sign in"
  },
  "dashboard": {
    "welcome": "Welcome back, {name}!",
    "items": "{count, plural, =0 {No items} one {# item} other {# items}}",
    "lastSeen": "Last seen {date, relativetime}"
  },
  "errors": {
    "required": "{field} is required",
    "notFound": "Page not found"
  }
}
```

## Usage in components

```tsx
// Server component
import { getTranslations } from 'next-intl/server'

export default async function Page() {
  const t = await getTranslations('dashboard')
  return <h1>{t('welcome', { name: 'Kevin' })}</h1>
}

// Client component
'use client'
import { useTranslations } from 'next-intl'

export function NavBar() {
  const t = useTranslations('nav')
  return <nav><a>{t('home')}</a></nav>
}

// Pluralization
t('items', { count: 0 })   // "No items"
t('items', { count: 1 })   // "1 item"
t('items', { count: 42 })  // "42 items"
```

## Date, number, and currency formatting

```tsx
import { useFormatter } from 'next-intl'

export function PricingCard({ price, date }: { price: number; date: Date }) {
  const format = useFormatter()

  return (
    <div>
      {/* Currency — auto-formats per locale */}
      <p>{format.number(price, { style: 'currency', currency: 'EUR' })}</p>
      {/* fr: 29,99 €  en: €29.99 */}

      {/* Relative time */}
      <time>{format.relativeTime(date)}</time>
      {/* "3 hours ago" / "il y a 3 heures" */}

      {/* Absolute date */}
      <span>{format.dateTime(date, { dateStyle: 'long' })}</span>
      {/* "March 7, 2026" / "7 mars 2026" */}
    </div>
  )
}
```

## Locale-aware routing

```tsx
import { Link } from '@/i18n/routing'  // next-intl's Link (adds locale prefix)

// /en/dashboard → /fr/dashboard automatically
<Link href="/dashboard">Dashboard</Link>

// Redirect to locale-specific path
import { redirect } from 'next-intl/navigation'
redirect({ href: '/login', locale: 'fr' })
```

## Common mistakes to avoid

| Don't | Do instead |
|-------|-----------|
| Hardcode strings in JSX | Extract to message files from day 1 |
| Use `new Date().toLocaleDateString()` | Use `format.dateTime()` |
| Build plural strings manually (`${count} item(s)`) | Use ICU plural syntax in messages |
| Store locale in state | Use URL-based routing (SEO + shareable) |
| Forget RTL support | Add `dir={locale === 'ar' ? 'rtl' : 'ltr'}` to `<html>` |

## Checklist

- [ ] Locale detected from URL, not browser/cookie (SEO friendly)
- [ ] All user-facing strings in message files (grep for hardcoded text)
- [ ] Dates formatted with `format.dateTime()`, numbers with `format.number()`
- [ ] Plurals use ICU syntax, not manual string building
- [ ] `<Link>` from next-intl (not next/link) for locale-aware navigation
- [ ] `<html lang={locale}>` set in root layout
- [ ] Fallback to `defaultLocale` when translation missing
- [ ] OG metadata localized per language
