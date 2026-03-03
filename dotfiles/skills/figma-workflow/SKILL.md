---
name: figma-workflow
description: Implement UI from Figma designs using get_design_context, mapping to dstudio-ui components and project design tokens. Use when given a Figma URL or node ID.
---

# Figma to Code Workflow

Use this skill when implementing UI from Figma designs.

## Process
1. Call `get_design_context` with the Figma node ID and file key
2. Review the returned code, screenshot, and metadata
3. Map to existing dstudio-ui components — NEVER recreate what already exists
4. Extract design tokens (colors, spacing, typography) and map to project tokens
5. Adapt the reference code to the project's stack and conventions
6. Use Code Connect to link Figma components ↔ codebase components

## Rules
- Always check dstudio-ui for existing components first
- Use project's design tokens, not raw hex values
- Responsive: mobile-first approach
- Accessibility: proper ARIA labels, semantic HTML
- Loading/empty/error states for dynamic content
