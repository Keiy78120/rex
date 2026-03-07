---
name: project-init
description: Initialize a project with perfect structure — GitHub, CI, docs, design system. Use when starting any new project or onboarding an existing one.
---
# Project Init — Setup parfait

Initialize project: $ARGUMENTS (path or name)

## 1. GitHub Setup
```bash
# Si pas de repo GitHub
gh repo create <nom> --private --source=. --remote=origin --push
# Branch protection
gh api repos/{owner}/{repo}/branches/main/protection --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}'
```

## 2. Fichiers obligatoires à créer
- `CLAUDE.md` — contexte projet complet
- `FRONTEND.md` — si projet avec UI (design tokens, règles visuelles)
- `docs/ARCHITECTURE.md` — structure technique
- `docs/CHANGELOG.md` — suivi des changements
- `docs/DECISIONS.md` — ADR (Architecture Decision Records)
- `.github/PULL_REQUEST_TEMPLATE.md` — template PR
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

## 3. GitHub Actions à configurer
- CI lint + test sur chaque PR
- Gemini Code Review automatique sur chaque PR
- Dependabot pour les dépendances

## 4. Workflow Git
- `main` = production, protégée
- `dev` = intégration
- Features : `feat/nom`, Bugs : `fix/nom`, Hotfix : `hotfix/nom`

## 5. Pour les projets existants (onboarding)
1. Read existing `package.json` / `composer.json` / config files to detect stack
2. Read existing `CLAUDE.md` if present, or create one
3. Scan project structure: key directories, entry points, routing
4. Load relevant framework docs from `~/.claude/docs/`
5. Call `rex_context(project_path)` for any past work history
6. Report: stack, structure, key files, any issues noticed

## CLAUDE.md template
```markdown
# Project Name

## Stack
- Framework: ...
- Language: ...
- Database: ...

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

## Key Files
- Entry: ...
- Config: ...
- Routes: ...
```
