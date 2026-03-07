---
name: ui-review
description: Systematic UI/UX audit. Checks visual hierarchy, accessibility (WCAG AA), responsive breakpoints, component composition, and interaction quality. Read-only — reports findings with file:line refs. Use after building a component or page.
user-invocable: true
---

# UI Review

Post-implementation audit. Read-only — never modify files, only report. Every finding needs a file:line reference and a concrete fix.

## Scope

Run on: a component, a page, or a full feature. Grep for relevant files first.

## Audit Checklist

### 1. Visual Hierarchy

- [ ] One dominant element per viewport section (hero, card, list item)
- [ ] No more than 3 visual weights in the same area
- [ ] Text sizes follow a consistent scale (no arbitrary px values scattered)
- [ ] Spacing consistent (multiples of 4px)
- [ ] Color not the only differentiator between states

Report: "Section X has competing visual weights between `<ComponentA>` and `<ComponentB>`"

### 2. States completeness

For every component that fetches data or handles user actions:

- [ ] **Loading state** exists and shows skeleton or spinner
- [ ] **Empty state** exists with message + CTA (not just blank space)
- [ ] **Error state** exists with human-readable message + retry option
- [ ] **Success feedback** shown after mutation (toast, redirect, or inline)
- [ ] **Disabled state** on submit button while loading (prevents double submit)

Report: "Component `UserList` (src/components/UserList.tsx:42) has no empty state"

### 3. Accessibility (WCAG AA)

- [ ] All `<img>` have descriptive `alt` (or `alt=""` if decorative)
- [ ] All `<input>`, `<select>`, `<textarea>` have associated `<label>` (via `htmlFor` or `aria-label`)
- [ ] Interactive elements have visible focus indicator (`outline`, `ring`, or custom)
- [ ] No `outline: none` or `outline: 0` without replacement focus style
- [ ] Color contrast ≥4.5:1 for body text, ≥3:1 for large text and UI elements
- [ ] Buttons and links have accessible names (not just icons without `aria-label`)
- [ ] Keyboard navigation works: Tab, Shift+Tab, Enter, Escape for modals
- [ ] `role` and `aria-*` used when custom elements replace semantic HTML
- [ ] Motion: `prefers-reduced-motion` respected for decorative animations

Report: "Input `email` (src/app/login/page.tsx:18) has no associated label"

### 4. Responsive behavior

Check at 3 breakpoints: **375px** (mobile), **768px** (tablet), **1280px** (desktop)

- [ ] No horizontal scroll at any breakpoint
- [ ] Text readable at all sizes (no overflow, no ellipsis on critical content)
- [ ] Touch targets ≥44px on mobile
- [ ] No fixed widths that break on small screens
- [ ] Tables have scroll wrapper or collapse to cards on mobile
- [ ] Images don't overflow containers
- [ ] Forms are usable on mobile (inputs not too small, labels visible)

Report: "Component `PricingTable` (src/app/pricing/page.tsx:77) has no mobile layout — fixed width 1200px"

### 5. Component composition

- [ ] No inline styles (use Tailwind classes or CSS vars)
- [ ] No hardcoded colors (`#000`, `#fff`, `rgb(...)`) — use design tokens
- [ ] No `!important` unless absolutely necessary with comment explaining why
- [ ] Components are self-contained (no global CSS side effects)
- [ ] Props have sane defaults for optional UI props
- [ ] No deeply nested ternaries for conditional rendering — use early returns

Report: "Component `Button` (src/components/Button.tsx:34) uses hardcoded `color: '#3b82f6'` — should use `var(--color-primary)`"

### 6. Interaction quality

- [ ] Button/link hover states exist and are distinct
- [ ] Loading state on actions (buttons disable during async, show spinner)
- [ ] Form validation errors appear inline (not just an alert)
- [ ] Modals/dialogs are closeable via Escape key
- [ ] Scroll position preserved on back navigation (if applicable)
- [ ] No layout shift on data load (skeleton matches final layout)

Report: "Submit button `CreateInvoiceForm` (src/components/CreateInvoiceForm.tsx:88) stays enabled during submission — double-submit possible"

### 7. Performance signals

- [ ] No unbounded lists without pagination or virtualization
- [ ] Images use `next/image` (for Next.js) or have explicit `width`/`height`
- [ ] No `useEffect` with no dependencies that runs on every render
- [ ] No inline function definitions in render that break memoization
- [ ] Heavy components lazy-loaded if not in critical path

Report: "Component `ActivityFeed` (src/components/ActivityFeed.tsx:12) renders all items without virtualization — will lag at 1000+ items"

## Output format

```
## UI Review — [Component/Page name]

### Critical (must fix before shipping)
- [file:line] Description + fix

### High (fix this sprint)
- [file:line] Description + fix

### Medium (tech debt)
- [file:line] Description + fix

### Low (nice to have)
- [file:line] Description + fix

### Passed
- Visual hierarchy: ✓
- Loading states: ✓
- ...
```

If everything passes, say so explicitly with the list. Don't invent problems.
