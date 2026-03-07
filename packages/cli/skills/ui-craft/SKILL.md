---
name: ui-craft
description: Premium UI execution. Enforces visual hierarchy, spatial rhythm, typography scale, and intentional aesthetics. Use when building any component or page to avoid generic bootstrap-style output.
user-invocable: true
---

# UI Craft

Good UX maps the flow. This skill makes it look intentional. Use alongside `ux-flow` — one before, one during.

## Mindset

Every UI decision must be intentional:
- Why this spacing?
- Why this color?
- Why this font size?
- What does the eye land on first?

If you can't answer "why", the default is wrong.

## Visual Hierarchy

Always establish a clear reading order:

```
1. Hero/title — largest, most contrast
2. Supporting info — secondary size/weight
3. Actions — visible, but not competing with content
4. Metadata — smallest, lowest contrast
```

Never put 3+ elements at the same visual weight. Force a hierarchy.

## Typography Scale

Use a proper scale (not arbitrary sizes):

```
xs:   12px / 0.75rem   — labels, metadata, captions
sm:   14px / 0.875rem  — body secondary, table cells
base: 16px / 1rem      — body, paragraphs
lg:   18px / 1.125rem  — card titles, emphasized body
xl:   20px / 1.25rem   — section titles
2xl:  24px / 1.5rem    — page headings
3xl:  30px / 1.875rem  — hero titles
4xl:  36px / 2.25rem   — landing hero
```

- **Font weight**: 400 body / 500 medium / 600 semibold / 700 bold. Never 400 for headings.
- **Line height**: 1.5 for body, 1.2 for headings, 1.0 for UI labels
- **Letter spacing**: `-0.02em` for large headings, `0.05em` for uppercase labels

## Spatial Rhythm

Use a 4px base grid. Every margin/padding should be a multiple of 4.

```
Micro:  4px  — icon gaps, tag padding
Small:  8px  — internal component spacing
Medium: 16px — between related elements
Large:  24px — between sections within a card
XL:     32px — between major sections
2XL:    48px — page sections, hero padding
3XL:    64px — landing page blocks
```

Never mix arbitrary values like `mt-3` next to `mb-5` — keep rhythm consistent.

## Color Usage

- **Primary action**: one color, one use. Don't scatter it.
- **Destructive**: red, always explicit — never subtle
- **Success**: green, only for confirmed completion
- **Disabled**: 40% opacity of normal state, not a different color
- **Focus**: always visible, never `outline: none` without a custom replacement
- **Background layers**: use 3 max (page → card → elevated). More = confusion.

### Contrast rules (WCAG AA minimum)
- Normal text: 4.5:1
- Large text (18px+ bold): 3:1
- UI components, icons: 3:1
- Never rely on color alone to convey state (add icon or text)

## Component aesthetics

### Buttons
```tsx
// Primary: filled, high contrast, clear label
// Secondary: outlined or ghost, same padding
// Destructive: red, add confirmation for irreversible actions
// Disabled: opacity, not hidden

// Sizing: consistent across the page
// sm: px-3 py-1.5 text-sm
// md: px-4 py-2 text-sm  (default)
// lg: px-6 py-3 text-base
```

### Cards
- Always: consistent border-radius (round-xl or round-2xl — pick one)
- Background: one step above page background
- Subtle border OR subtle shadow — not both
- Padding: 16px min, 24px comfortable, 32px spacious

### Forms
- Label above input, never placeholder-only
- Error message below field (not global)
- Success state: green border or checkmark, not just "no error"
- Input height: 36px sm / 40px md / 44px lg (touch-friendly minimum: 44px)

### Empty states
- Always: illustration or icon + title + subtitle + CTA
- Never: just "No data" in small gray text

## Motion

Use sparingly. Every animation must have a purpose:

- **Entrance** (fade+slide): 200ms ease-out. Only for modals, drawers, toasts.
- **Interaction feedback** (scale, color): 100-150ms ease. Buttons, checkboxes.
- **Layout shifts** (list reorder): 200ms ease-in-out. Avoid on initial load.
- **Page transitions**: 200-300ms. Never >400ms.

```tsx
// With motion/react (framer-motion)
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
/>
```

Never animate more than 2 properties simultaneously on the same element.

## Stack conventions

- **Tailwind v4**: CSS vars over hardcoded colors, `bg-background`, `text-foreground`
- **dstudio-ui**: Check existing components before building from scratch
- **Responsive**: design mobile-first, desktop enhancement — not desktop-first + mobile afterthought
- **Dark mode**: use `dark:` prefix, never hardcode `#000` or `#fff`

## Self-check before shipping

- [ ] Clear visual hierarchy — one dominant element per section
- [ ] Typography scale consistent throughout
- [ ] Spacing follows 4px grid
- [ ] Focus states visible on all interactive elements
- [ ] Contrast ≥4.5:1 for text
- [ ] No layout breaks at 375px, 768px, 1280px
- [ ] Motion feels snappy, not sluggish
- [ ] Empty/loading/error states have visual polish too
