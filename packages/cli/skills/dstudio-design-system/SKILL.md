---
name: dstudio-design-system
description: Load the dstudio-ui design system context — tokens, components, patterns, and import guide. Use when building UI with @dstudio/ui components or design tokens.
user-invocable: true
---

# dstudio-ui Design System

You are working with the **@dstudio/ui** design system. Use this reference for all UI implementation.

## Architecture

- **Repo**: `/Users/keiy/Documents/Developer/dstudio-ui`
- **Package**: `@dstudio/ui` — exported from `src/index.ts`
- **Stack**: Next.js 16, Tailwind v4, Framer Motion (`motion/react`), Storybook v8, pnpm
- **`@` alias** maps to `src/` (NOT project root)

## Using in Another Project

```json
// package.json
"@dstudio/ui": "file:../dstudio-ui"
```

Then `pnpm install` and import:

```tsx
import { DSButton, MagicCard, KanbanBoard } from "@dstudio/ui"
```

The consumer project **must** share the same Tailwind v4 setup with CSS vars from `globals.css`. Tokens are CSS variables, not bundled.

## Design Tokens (Style Dictionary v4)

- **Format**: W3C DTCG `{ "$value": "...", "$type": "color" }`
- **Token files**: `tokens/core/*.json` + `tokens/semantic/colors.json`
- **Build**: `pnpm build:tokens` → `build/css/`, `build/tailwind/`, `build/figma/`, `build/js/`
- **Config**: `sd.config.ts` at repo root

### Key Semantic Colors

| Token | Value | CSS var |
|-------|-------|---------|
| background | #000000 | `--color-background` |
| foreground | #ffffff | `--color-foreground` |
| card | #080808 | `--color-card` |
| primary | #18181b | `--color-primary` |
| secondary | #f4f4f5 | `--color-secondary` |
| muted | #1a1a1a | `--color-muted` |
| border | #e4e4e7 | `--color-border` |
| destructive | #ef4444 | `--color-destructive` |

### Using tokens in Tailwind

```tsx
// Tokens live in @theme {} block → Tailwind v4 auto-generates utilities
className="bg-background text-foreground border-border"
className="text-gray-400 bg-dark-100"
```

### Adding a new token

1. Add to `tokens/core/*.json` or `tokens/semantic/colors.json`
2. `pnpm build:tokens`
3. Copy new var into `src/styles/globals.css` inside `@theme {}` block
4. Commit `build/` directory + `globals.css`

## Available Components

### D-Studio branded
GradientButton, GlassBadge, SmallButton, MultiLayerCard, SlightSeparator, DSButton, SquaredBadge

### Base UI (shadcn-style)
Badge, Button, Card, Input, Accordion, Dialog, Tabs, OrbitingCircles, Skeleton, Textarea, DropdownMenu

### Motion
BlurFade, InfiniteSlider, TextEffect, Tilt, GlowEffect, Magnetic, MagicCard, BorderTrail, TextScramble, SpinningText, TextReveal, Cursor

### Bits
StarBorder, GradualBlur, StackingCards

### PM (Project Management)
StatusBadge, AvatarStack, BoardTable, KanbanBoard, GanttChart, TimelineCalendar, DatePicker, StatusSelector, Notepad, NeonGlow, AnimatedBlob, PrioritySlider

### AI
AskAiButton, SuggestionChips

### Contact
ContactForm, MultiStateButton

### Shared
ScrambleRevealText, ProgressiveScrambleText, AnimatedSection

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main package export |
| `sd.config.ts` | Style Dictionary config |
| `tokens/core/colors.json` | Primitive color palette |
| `tokens/semantic/colors.json` | Semantic color aliases |
| `src/styles/globals.css` | `@theme` block (must be inline) |
| `src/app/components/page.tsx` | Components showcase page |
| `src/app/docs/components/component-data.ts` | Docs prop tables |

## Gotchas

- **`@theme {}` must be inline** in `globals.css` — `@import` of a file containing `@theme` breaks Vite/Storybook
- **`build/` directory is committed** (generated token outputs)
- **`Transition` type** import must come from `motion/react`
- **Framer Motion** — use `motion/react` not `framer-motion` for imports
- Nav variants: `floating-nav-landing.tsx` (next-intl), `floating-nav.tsx` (no i18n)

## When building UI with this system

1. Read the relevant component source in `dstudio-ui/src/` before using it
2. Follow existing Tailwind v4 patterns (CSS vars, not hardcoded colors)
3. Use `motion/react` for all animations
4. Check `src/index.ts` to see what's exported before importing
5. Run `pnpm build` in the consumer project to verify
