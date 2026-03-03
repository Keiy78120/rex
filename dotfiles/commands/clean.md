Find and remove dead code, stale TODOs, and unused dependencies.

Steps:
1. Search for unused exports and imports
2. Find TODO/FIXME/HACK comments older than 30 days (check git blame)
3. Check for unused dependencies in package.json (use depcheck if available)
4. Find dead code: unreachable branches, unused functions
5. Report findings — do NOT auto-delete without confirmation
