---
name: deploy-checklist
description: Pre-deployment checklist. Use when user says "deploy", "push to prod", "push to beta", "ship it", or before any deployment. Runs verification steps before allowing deploy.
disable-model-invocation: true
---

# Deploy Checklist

Run this checklist BEFORE any deployment. $ARGUMENTS can specify the target (beta/prod).

## Pre-Deploy Verification

1. **Check git status**:
   - All changes committed? No uncommitted work?
   - On the correct branch?
   - Branch is up to date with remote?

2. **Run tests** (if test suite exists):
   ```bash
   # Detect and run project tests
   # PHP: composer test or vendor/bin/phpunit
   # Node/Angular: npm test
   # Flutter: flutter test
   # Python: pytest
   ```

3. **Run linter/formatter** (if configured):
   ```bash
   # Detect and run linter
   # PHP: composer lint or vendor/bin/phpcs
   # Node: npm run lint
   # Flutter: flutter analyze
   ```

4. **Build check**:
   - Run production build to catch compile errors
   - Verify build output exists and looks correct

5. **Environment check**:
   - Verify environment config points to the correct target (beta vs prod)
   - NEVER deploy with local/dev config pointing to wrong DB or API
   - Check for hardcoded localhost URLs

6. **PR status** (if deploying from a PR):
   - All CI checks passing?
   - Gemini Code Assist review: any critical issues?
   - GitHub Copilot review: any critical issues?

## Deploy Decision

- If ANY check fails: STOP and report to user
- If all checks pass: proceed with deploy and confirm target with user

IMPORTANT: Always ask "beta or prod?" if not specified. Never assume prod.

## Auto-Learn

If any deploy issue is found, call `rex_learn` MCP tool:
- category: `"lesson"`
- fact: the deploy issue + environment + fix (e.g. "Cloudflare deploy failed: missing wrangler.toml env binding for PROD")
- Helps prevent repeating the same deploy mistakes
