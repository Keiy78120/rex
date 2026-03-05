---
name: one-shot
description: Generate a complete production-ready project in one shot. Next.js + Shadcn UI + dstudio-ui. Use for rapid prototyping and SAAS scaffolding.
---

# One-Shot Project Generator

Create a complete project: $ARGUMENTS

1. Read `~/.claude/docs/nextjs.md` and `~/.claude/docs/react.md` for current patterns
2. Load dstudio-ui design system context: `/dstudio-design-system`
3. Scaffold with: Next.js App Router, TypeScript, Tailwind v4, dstudio-ui components
4. Include: auth scaffold, API routes with validation, DB schema, loading/empty/error states
5. Apply all defensive engineering rules (pagination, error handling, rate limits)
6. Setup: `package.json`, `tsconfig.json`, `.env.example`, `README.md`
7. Run `npm install && npm run build` to verify

Output a working project, not a template.
