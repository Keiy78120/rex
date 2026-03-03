# Tailwind CSS v4 — Doc Cache Local

> Dernière mise à jour : 2026-03-03

## v4 Breaking Changes

- Config via CSS (`@theme`), plus de `tailwind.config.js`
- Import : `@import "tailwindcss"` (plus de `@tailwind base/components/utilities`)
- Content detection automatique (plus besoin de `content: [...]`)

```css
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --font-sans: "Inter", sans-serif;
}
```

## Classes les plus utilisées

### Layout
- `flex` `flex-col` `items-center` `justify-between` `gap-4`
- `grid` `grid-cols-3` `col-span-2`
- `container` `mx-auto` `max-w-7xl`

### Spacing
- `p-4` `px-6` `py-2` `m-auto` `mt-8` `space-y-4`

### Typography
- `text-sm` `text-lg` `text-xl` `font-bold` `font-medium`
- `text-gray-600` `text-primary` `leading-relaxed`

### Responsive
- `sm:` (640px) `md:` (768px) `lg:` (1024px) `xl:` (1280px)

### Dark mode
- `dark:bg-gray-900` `dark:text-white`

## Gotchas

1. **v4 pas de config JS** — tout est en CSS maintenant
2. **`@apply`** fonctionne toujours mais déconseillé — préférer les classes directes
3. **Arbitrary values** : `w-[calc(100%-2rem)]` `text-[#1a1a1a]`
4. **Group/peer** : `group-hover:opacity-100` `peer-invalid:text-red-500`
