---
name: seo
description: SEO implementation for Next.js. Metadata, OG tags, sitemap, robots.txt, structured data, and Core Web Vitals. Use when building landing pages, blog, or any public-facing page.
user-invocable: true
---

# SEO (Next.js App Router)

SEO is plumbing. Do it right once and forget it. Do it wrong and it's invisible for 6 months.

## Metadata API (App Router)

```tsx
// app/layout.tsx — site-wide defaults
export const metadata: Metadata = {
  metadataBase: new URL('https://yourdomain.com'),
  title: {
    default: 'Your App Name',
    template: '%s | Your App Name',   // page title → "Page | Your App Name"
  },
  description: 'Clear, 150-char max description of what the app does.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://yourdomain.com',
    siteName: 'Your App Name',
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@yourhandle',
  },
  robots: { index: true, follow: true },
}

// app/blog/[slug]/page.tsx — dynamic per-page metadata
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug)
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: 'article',
      publishedTime: post.publishedAt,
      images: [{ url: post.ogImage, width: 1200, height: 630 }],
    },
  }
}
```

## OG Image generation

```tsx
// app/og/route.tsx — dynamic OG images (Vercel OG)
import { ImageResponse } from 'next/og'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const title = searchParams.get('title') || 'Default Title'

  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#000' }}>
      <h1 style={{ color: '#fff', fontSize: 60 }}>{title}</h1>
    </div>,
    { width: 1200, height: 630 }
  )
}

// Use in metadata:
// images: [{ url: `/og?title=${encodeURIComponent(post.title)}` }]
```

## Sitemap

```tsx
// app/sitemap.ts
import { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts()

  return [
    { url: 'https://yourdomain.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://yourdomain.com/pricing', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    ...posts.map(post => ({
      url: `https://yourdomain.com/blog/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
```

## Robots.txt

```tsx
// app/robots.ts
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/admin/'] },
    ],
    sitemap: 'https://yourdomain.com/sitemap.xml',
  }
}
```

## Structured data (JSON-LD)

```tsx
// app/blog/[slug]/page.tsx
export default function BlogPost({ post }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author },
    description: post.excerpt,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* page content */}
    </>
  )
}
```

Common schemas: `Article`, `Product`, `Organization`, `BreadcrumbList`, `FAQPage`, `LocalBusiness`

## Technical SEO checklist

- [ ] `metadataBase` set in root layout (required for absolute OG URLs)
- [ ] `title.template` set for consistent page titles
- [ ] Description 50–160 chars on every page
- [ ] OG image 1200×630px on every page (static or generated)
- [ ] `sitemap.ts` includes all public pages
- [ ] `robots.ts` blocks `/api/`, `/dashboard/`, `/admin/`
- [ ] Canonical URL set on duplicate content pages
- [ ] Structured data on blog posts, products, FAQ
- [ ] No `noindex` accidentally on important pages
- [ ] Images have descriptive `alt` text
- [ ] Headings hierarchy: one `h1` per page, logical `h2`/`h3` structure
- [ ] Core Web Vitals passing (LCP <2.5s, CLS <0.1, INP <200ms)

## Quick wins (do these first)

1. Add `metadataBase` + default `title.template` (20 min)
2. Add OG image to every public page (1h)
3. Generate sitemap (30 min)
4. Add `robots.ts` (15 min)
5. Add JSON-LD to blog/product pages (1h)
