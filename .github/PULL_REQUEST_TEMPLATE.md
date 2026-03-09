## Summary

<!--
What does this PR do? Use bullet points.
-->

-
-

## Type

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code improvement, no behavior change
- [ ] `docs` — documentation only
- [ ] `chore` — tooling, deps, config

## Breaking Changes

- [ ] Yes (describe below)
- [ ] No

<!--
If yes, describe what breaks and the migration path:
-->

## Test Plan

<!--
How was this tested? Paste actual output, not just "it works".
-->

- [ ] `pnpm build` passes:
  ```

  ```
- [ ] `flutter build macos --debug` passes (if Flutter changed)
- [ ] Manual test:
  ```
  # command run
  # observed output
  ```

## Checklist

- [ ] `pnpm build` passes with zero TypeScript errors
- [ ] No `console.log` — uses `createLogger` from `logger.ts`
- [ ] No hardcoded paths — uses `paths.ts`
- [ ] No `any` types without inline justification
- [ ] No `.env` or secrets committed
- [ ] No `Co-Authored-By` lines in commit messages
- [ ] `CLAUDE.md` "En cours / Terminé" section updated (if significant change)
