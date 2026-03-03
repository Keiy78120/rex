# Next.js — Doc Cache Local

> Dernière mise à jour : 2026-03-03
> Version : Next.js 15.x / 16.x (App Router)

## App Router Essentials

### Route Files
- `page.tsx` — route UI
- `layout.tsx` — layout partagé (ne re-render pas à la navigation)
- `loading.tsx` — Suspense boundary automatique
- `error.tsx` — error boundary (`'use client'` obligatoire)
- `not-found.tsx` — 404 page
- `route.ts` — API route (GET, POST, PUT, DELETE)

### Server vs Client Components
- **Par défaut** : Server Component (pas de state, pas de hooks)
- `'use client'` en haut du fichier pour un Client Component
- Server Components peuvent importer Client Components, pas l'inverse
- Les props passées de Server → Client doivent être sérialisables

### Data Fetching (App Router)
```tsx
// Server Component — fetch direct, pas de useEffect
async function Page() {
  const data = await fetch('https://api.example.com/data', {
    cache: 'force-cache',      // static (default)
    // cache: 'no-store',      // dynamic
    // next: { revalidate: 60 } // ISR
  });
  return <div>{data}</div>;
}
```

### Server Actions
```tsx
'use server'

async function createItem(formData: FormData) {
  const name = formData.get('name');
  await db.insert(items).values({ name });
  revalidatePath('/items');
}
```

## Gotchas / Pièges courants

1. **Hydration mismatch** : ne jamais utiliser `Date.now()`, `Math.random()`, ou `localStorage` dans le render initial — toujours dans `useEffect`
2. **`useSearchParams()`** : doit être wrappé dans `<Suspense>` sinon erreur en production
3. **Metadata** : export `metadata` ou `generateMetadata` uniquement dans `page.tsx` et `layout.tsx`
4. **Redirects dans Server Components** : utiliser `redirect()` de `next/navigation`, pas `router.push()`
5. **Route handlers** : `NextRequest` et `NextResponse` — pas `req`/`res` Express-style
6. **Middleware** : un seul fichier `middleware.ts` à la racine, matcher via config

## Patterns récurrents

### API Route avec validation
```tsx
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // validate...
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
```

### Dynamic metadata
```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next.js 15+ : params is async
  const item = await getItem(id);
  return { title: item.name };
}
```
