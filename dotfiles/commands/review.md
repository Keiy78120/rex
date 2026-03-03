Review the current branch's changes before creating a PR.

Steps:
1. Run `git diff main...HEAD` to see all changes
2. Check for:
   - Security issues (hardcoded secrets, SQL injection, XSS)
   - Missing error handling (uncaught promises, missing try/catch)
   - Missing loading/empty/error states in UI components
   - Pagination missing on list endpoints
   - TypeScript `any` or `@ts-ignore` without justification
   - Console.log left in production code
   - Unused imports or variables
3. Run the project's linter if available
4. Run `npm run build` to verify compilation
5. Report findings with severity (critical/warning/info) and suggested fixes
