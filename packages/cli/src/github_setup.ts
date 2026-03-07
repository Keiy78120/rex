/**
 * REX GitHub Auto-Setup
 * Runs in the background at SessionStart (fire-and-forget).
 * Does NOT block preload output.
 *
 * Actions:
 * 1. Init git repo if missing
 * 2. Create GitHub repo if no remote origin
 * 3. Copy .github/ templates if missing
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { GITHUB_TEMPLATES_DIR } from './paths.js'

const log = createLogger('github-setup')

// ─── Embedded templates ──────────────────────────────────────────────────────
// Kept minimal to avoid drift. Full versions live in dotfiles/.github/

const TEMPLATES: Record<string, string> = {
  '.github/PULL_REQUEST_TEMPLATE.md': `## Description
<!-- Ce que cette PR fait et pourquoi -->

## Type de changement
- [ ] 🐛 Bug fix
- [ ] ✨ Nouvelle feature
- [ ] 🔨 Refactor
- [ ] 📚 Documentation

## Checklist
- [ ] Tests ajoutés / mis à jour
- [ ] CHANGELOG.md mis à jour
- [ ] Testé localement
`,

  '.github/ISSUE_TEMPLATE/bug_report.md': `---
name: Bug Report
about: Rapport de bug
labels: bug
---
## Description du bug

## Pour reproduire
1. ...

## Comportement attendu

## Environnement
- OS:
- Version:
`,

  '.github/workflows/ci.yml': `name: CI
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
`,

  '.github/workflows/gemini-review.yml': `name: Gemini Code Review
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
`,

  '.github/dependabot.yml': `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
`,
}

function tryExec(cmd: string, cwd: string, timeoutMs = 8000): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function hasGit(cwd: string): boolean {
  return existsSync(join(cwd, '.git'))
}

function hasRemote(cwd: string): boolean {
  return tryExec('git remote get-url origin', cwd) !== null
}

function isGhAvailable(): boolean {
  return spawnSync('gh', ['--version'], { stdio: 'pipe' }).status === 0
}

function writeTemplate(projectRoot: string, relativePath: string, content: string): void {
  const fullPath = join(projectRoot, relativePath)
  if (existsSync(fullPath)) return  // never overwrite existing
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
  log.info(`Created ${relativePath}`)
}

/**
 * Recursively walk a source dir and return all file paths relative to it.
 */
function walkDir(dir: string, base = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const results: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      results.push(...walkDir(full, base))
    } else if (e.isFile()) {
      results.push(full.slice(base.length + 1))  // relative path
    }
  }
  return results
}

/** Copy GitHub templates into the project if .github/ is absent */
function ensureGithubTemplates(projectRoot: string): void {
  if (existsSync(join(projectRoot, '.github'))) return  // already configured
  log.info('No .github/ found — copying REX templates')

  // Prefer user-installed templates from ~/.claude/.github/
  if (existsSync(GITHUB_TEMPLATES_DIR)) {
    log.info(`Using templates from ${GITHUB_TEMPLATES_DIR}`)
    for (const rel of walkDir(GITHUB_TEMPLATES_DIR)) {
      const src = join(GITHUB_TEMPLATES_DIR, rel)
      const dest = join(projectRoot, '.github', rel)
      if (!existsSync(dest)) {
        mkdirSync(join(dest, '..'), { recursive: true })
        writeFileSync(dest, readFileSync(src), 'utf-8')
        log.info(`Copied .github/${rel}`)
      }
    }
    return
  }

  // Fallback: embedded minimal templates
  for (const [path, content] of Object.entries(TEMPLATES)) {
    writeTemplate(projectRoot, path, content)
  }
}

/** Create GitHub repo if no remote exists */
function ensureGithubRepo(projectRoot: string): void {
  if (!isGhAvailable()) return
  if (hasRemote(projectRoot)) return

  const name = projectRoot.split('/').pop() ?? 'project'

  // Get gh auth status silently
  const authStatus = tryExec('gh auth status', projectRoot)
  if (!authStatus?.includes('Logged in')) return

  log.info(`No GitHub remote found — creating repo: ${name}`)
  const result = tryExec(
    `gh repo create ${name} --private --source=. --remote=origin --push`,
    projectRoot,
    20_000
  )
  if (result !== null) {
    log.info(`GitHub repo created: ${name}`)
    // Create dev branch
    tryExec('git checkout -b dev && git push -u origin dev && git checkout main', projectRoot)
  } else {
    log.warn(`Failed to create GitHub repo for ${name}`)
  }
}

/**
 * Run all GitHub setup tasks for a project.
 * Designed to be called in a fire-and-forget pattern from preload.
 */
export async function runGithubSetup(projectRoot: string): Promise<void> {
  if (!hasGit(projectRoot)) return  // not a git repo, skip

  try {
    ensureGithubTemplates(projectRoot)
    ensureGithubRepo(projectRoot)
  } catch (e: any) {
    log.warn(`GitHub setup error: ${e.message?.slice(0, 100)}`)
  }
}
