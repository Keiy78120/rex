/**
 * REX Project Init
 * One-shot command to initialize a project with perfect structure:
 * GitHub repo, branch protection, CI/CD, docs, design system templates.
 *
 * Usage: rex project init [--no-github] [--public]
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const logger = createLogger('project-init')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

function ok(msg: string): void { console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`) }
function warn(msg: string): void { console.log(`  ${COLORS.yellow}!${COLORS.reset} ${msg}`) }

function tryExec(cmd: string, cwd?: string): boolean {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function ensureFile(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
  }
}

const CLAUDE_MD = `# Project Name

## Stack
- Framework: ...
- Language: ...
- Database: ...

## Commands
\`\`\`bash
npm run dev     # Development server
npm run build   # Production build
npm test        # Run tests
npm run lint    # Lint & format
\`\`\`

## Key Files
- Entry: ...
- Config: ...
- Routes: ...

## Architecture
See docs/ARCHITECTURE.md
`

const FRONTEND_MD = `# Frontend Guidelines

## Design Tokens
See tokens.css — do NOT hardcode colors or spacing.

## Typography
- Title: ...
- Body: ...
- Caption: ...

## Spacing (4px grid)
4 / 8 / 16 / 24 / 32 / 48 / 64px

## Colors
- Primary: ...
- Neutral: ...
- Accent: ...

## Components
- border-radius: 8px (consistent throughout)
- Transitions: 200ms ease-out (micro), 300ms ease-out (page)
`

const ARCHITECTURE_MD = `# Architecture

## Overview
...

## Structure
\`\`\`
src/
  components/   # UI components
  pages/        # Route pages
  lib/          # Utilities
  types/        # TypeScript types
\`\`\`

## Key Decisions
See DECISIONS.md

## Data Flow
...
`

const CHANGELOG_MD = `# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- Initial project structure

`

const DECISIONS_MD = `# Architecture Decision Records

## Template
### ADR-000: Title
**Status**: Proposed / Accepted / Deprecated
**Context**: Why does this decision need to be made?
**Decision**: What did we decide?
**Consequences**: What are the trade-offs?

---
`

const PR_TEMPLATE = `## Description
<!-- Ce que cette PR fait et pourquoi -->

## Type de changement
- [ ] 🐛 Bug fix
- [ ] ✨ Nouvelle feature
- [ ] 🔨 Refactor
- [ ] 📚 Documentation
- [ ] 🎨 UI/Design

## Checklist
- [ ] Tests ajoutés / mis à jour
- [ ] CHANGELOG.md mis à jour
- [ ] Docs mises à jour si nécessaire
- [ ] Testé localement

## Screenshots (si UI)
<!-- Avant / Après -->
`

const BUG_REPORT = `---
name: Bug Report
about: Rapport de bug
labels: bug
---
## Description du bug
<!-- Description claire et concise -->

## Pour reproduire
1. ...

## Comportement attendu
<!-- Ce qui devrait se passer -->

## Environnement
- OS: [ex: macOS 14]
- Node: [ex: 22.x]
- Version: [ex: v1.0.0]

## Logs
\`\`\`
<!-- Coller les logs ici -->
\`\`\`
`

const FEATURE_REQUEST = `---
name: Feature Request
about: Suggérer une nouvelle fonctionnalité
labels: enhancement
---
## Description
<!-- La fonctionnalité que vous souhaitez -->

## Motivation
<!-- Pourquoi est-ce utile ? -->

## Solution proposée
...
`

const CI_WORKFLOW = `name: CI
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
jobs:
  lint-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test --if-present
      - run: npm run lint --if-present
`

const GEMINI_REVIEW_WORKFLOW = `name: Gemini Code Review
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  pull-requests: write
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Get PR diff
        id: diff
        run: |
          git diff origin/\${{ github.base_ref }}...HEAD > pr_diff.txt
          echo "diff_size=\$(wc -c < pr_diff.txt)" >> \$GITHUB_OUTPUT
      - name: Gemini Review
        if: steps.diff.outputs.diff_size != '0'
        uses: google-github-actions/gemini-code-review@v1
        with:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
`

const DEPENDABOT = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
`

export interface ProjectInitOptions {
  github: boolean
  public: boolean
  cwd?: string
}

export async function projectInit(opts: ProjectInitOptions): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const projectName = cwd.split('/').pop() ?? 'project'

  console.log(`\n${COLORS.bold}REX Project Init${COLORS.reset} — ${COLORS.cyan}${projectName}${COLORS.reset}\n`)
  logger.info(`Project init: ${projectName} (github=${opts.github}, public=${opts.public})`)

  // 1. Git init
  if (!existsSync(join(cwd, '.git'))) {
    if (tryExec('git init', cwd)) ok('Git initialized')
    else warn('Git init failed — continuing anyway')
  } else {
    ok('Git already initialized')
  }

  // 2. Core docs
  ensureFile(join(cwd, 'CLAUDE.md'), CLAUDE_MD)
  ok('CLAUDE.md created')

  ensureFile(join(cwd, 'FRONTEND.md'), FRONTEND_MD)
  ok('FRONTEND.md created')

  mkdirSync(join(cwd, 'docs'), { recursive: true })
  ensureFile(join(cwd, 'docs', 'ARCHITECTURE.md'), ARCHITECTURE_MD)
  ensureFile(join(cwd, 'docs', 'CHANGELOG.md'), CHANGELOG_MD)
  ensureFile(join(cwd, 'docs', 'DECISIONS.md'), DECISIONS_MD)
  ok('docs/ created (ARCHITECTURE, CHANGELOG, DECISIONS)')

  // 3. GitHub templates
  mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true })
  mkdirSync(join(cwd, '.github', 'ISSUE_TEMPLATE'), { recursive: true })
  ensureFile(join(cwd, '.github', 'PULL_REQUEST_TEMPLATE.md'), PR_TEMPLATE)
  ensureFile(join(cwd, '.github', 'ISSUE_TEMPLATE', 'bug_report.md'), BUG_REPORT)
  ensureFile(join(cwd, '.github', 'ISSUE_TEMPLATE', 'feature_request.md'), FEATURE_REQUEST)
  ensureFile(join(cwd, '.github', 'workflows', 'ci.yml'), CI_WORKFLOW)
  ensureFile(join(cwd, '.github', 'workflows', 'gemini-review.yml'), GEMINI_REVIEW_WORKFLOW)
  ensureFile(join(cwd, '.github', 'dependabot.yml'), DEPENDABOT)
  ok('.github/ created (templates, CI, Gemini review, Dependabot)')

  // 4. Initial commit
  if (!tryExec('git rev-parse HEAD', cwd)) {
    tryExec('git add -A', cwd)
    tryExec('git commit -m "chore: initialize project structure with REX"', cwd)
    ok('Initial commit created')
  }

  // 5. GitHub repo
  if (opts.github) {
    const hasRemote = tryExec('git remote get-url origin', cwd)
    if (!hasRemote) {
      const visibility = opts.public ? '--public' : '--private'
      const created = tryExec(
        `gh repo create ${projectName} ${visibility} --source=. --remote=origin --push`,
        cwd
      )
      if (created) {
        ok(`GitHub repo created: ${opts.public ? 'public' : 'private'}`)
        // Branch protection
        const owner = execSync('gh api user --jq .login', { cwd }).toString().trim()
        const protectCmd = [
          `gh api repos/${owner}/${projectName}/branches/main/protection --method PUT`,
          `--field required_status_checks='{"strict":true,"contexts":["ci / lint-test"]}'`,
          `--field enforce_admins=false`,
          `--field required_pull_request_reviews='{"required_approving_review_count":1}'`,
          `--field restrictions=null`,
        ].join(' ')
        if (tryExec(protectCmd, cwd)) ok('Branch protection enabled on main')
        else warn('Branch protection skipped (needs at least one push to main)')
      } else {
        warn('GitHub repo creation failed — ensure `gh` is authenticated')
      }
    } else {
      ok('GitHub remote already configured')
    }
  }

  // 6. Summary
  console.log(`\n${COLORS.bold}🚀 Project initialized with REX structure${COLORS.reset}`)
  console.log(`\n  ${COLORS.dim}Next steps:${COLORS.reset}`)
  console.log(`  1. Edit ${COLORS.cyan}CLAUDE.md${COLORS.reset} with your project details`)
  console.log(`  2. Add ${COLORS.cyan}GEMINI_API_KEY${COLORS.reset} secret to GitHub for AI code review`)
  console.log(`  3. Run ${COLORS.cyan}rex init${COLORS.reset} to inject context into Claude Code\n`)
}
