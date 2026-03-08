/**
 * REX Project Intent Detector
 *
 * Detects developer intent from filesystem signals and git history.
 * Zero LLM — pure heuristics. Fast enough for SessionStart preload.
 *
 * Intent hierarchy (most specific wins):
 *   new-project > infra > bug-fix > refactor > feature > explore
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// ── Types ──────────────────────────────────────────────────────────

export type ProjectIntent =
  | 'new-project'   // Fresh repo, < 5 commits or no CI/lint/tests
  | 'feature'       // Active development on a known stack
  | 'bug-fix'       // Recent commits have "fix"/"bug"/"patch" keywords
  | 'refactor'      // Recent commits have "refactor"/"clean"/"rename"
  | 'infra'         // CI/CD, Docker, deployment files being touched
  | 'docs'          // README/docs-only changes
  | 'explore'       // Unknown or learning mode (no clear signals)

export interface MissingSetup {
  ci: boolean        // no .github/workflows/ or .gitlab-ci.yml
  lint: boolean      // no eslint/biome/prettier config
  tests: boolean     // no test files or test script
  readme: boolean    // no README.md
  gitignore: boolean // no .gitignore
  hooks: boolean     // no .husky or lefthook config
}

export interface IntentContext {
  intent: ProjectIntent
  confidence: 'high' | 'medium' | 'low'
  missing: Partial<MissingSetup>   // only flags that are missing
  actions: string[]                // REX-suggested next steps
  signals: string[]                // debug: which signals fired
}

// ── Git helpers ────────────────────────────────────────────────────

function git(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function getCommitCount(cwd: string): number {
  const out = git('git rev-list --count HEAD 2>/dev/null', cwd)
  const n = parseInt(out, 10)
  return isNaN(n) ? 0 : n
}

function getRecentCommitMessages(cwd: string, n = 5): string[] {
  const out = git(`git log -${n} --format=%s 2>/dev/null`, cwd)
  if (!out) return []
  return out.split('\n').filter(Boolean)
}

function getCurrentBranch(cwd: string): string {
  return git('git branch --show-current 2>/dev/null', cwd)
}

function isGitRepo(cwd: string): boolean {
  return !!git('git rev-parse --git-dir 2>/dev/null', cwd)
}

// ── Filesystem checks ──────────────────────────────────────────────

function checkMissing(cwd: string): MissingSetup {
  const has = (f: string) => existsSync(join(cwd, f))
  const hasGlob = (files: string[]) => files.some(f => has(f))

  return {
    ci: !hasGlob([
      '.github/workflows',
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'Jenkinsfile',
      '.travis.yml',
    ]),
    lint: !hasGlob([
      '.eslintrc.js', '.eslintrc.ts', '.eslintrc.json', '.eslintrc.cjs',
      'eslint.config.js', 'eslint.config.mjs',
      'biome.json', '.biome.json',
      '.prettierrc', '.prettierrc.json', '.prettierrc.js',
    ]),
    tests: !hasTestSetup(cwd),
    readme: !hasGlob(['README.md', 'README.txt', 'readme.md']),
    gitignore: !has('.gitignore'),
    hooks: !hasGlob(['.husky', 'lefthook.yml', '.lefthook.yml']),
  }
}

function hasTestSetup(cwd: string): boolean {
  const pkgPath = join(cwd, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified"') return true
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['vitest'] || allDeps['jest'] || allDeps['mocha'] || allDeps['ava']) return true
    } catch {}
  }
  // Language-native test patterns
  return existsSync(join(cwd, 'tests')) ||
    existsSync(join(cwd, '__tests__')) ||
    existsSync(join(cwd, 'spec')) ||
    existsSync(join(cwd, 'test'))
}

function hasInfraFiles(cwd: string): boolean {
  const infraFiles = [
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    '.github/workflows', 'terraform', 'k8s', 'helm',
    'deploy.sh', 'Makefile', 'ansible',
  ]
  return infraFiles.some(f => existsSync(join(cwd, f)))
}

// ── Intent detection ───────────────────────────────────────────────

export function detectIntent(cwd: string): IntentContext {
  const signals: string[] = []
  const missing: Partial<MissingSetup> = {}

  // Not a git repo at all
  if (!isGitRepo(cwd)) {
    signals.push('no-git-repo')
    return {
      intent: 'explore',
      confidence: 'low',
      missing: {},
      actions: ['git init', 'rex init — setup guards + hooks'],
      signals,
    }
  }

  const commitCount = getCommitCount(cwd)
  const branch = getCurrentBranch(cwd)
  const recentMessages = getRecentCommitMessages(cwd, 5)
  const allMissing = checkMissing(cwd)

  // Populate missing (only flags that are actually missing)
  for (const [k, v] of Object.entries(allMissing)) {
    if (v) missing[k as keyof MissingSetup] = true
  }

  // ── Signal detection ──────────────────────────────────────────

  // New project signals
  if (commitCount === 0) signals.push('zero-commits')
  if (commitCount < 5) signals.push('few-commits')
  if (allMissing.ci && allMissing.lint && allMissing.tests) signals.push('no-tooling')

  // Branch name signals
  const branchLower = branch.toLowerCase()
  if (/^(fix|bugfix|hotfix)[\/-]/.test(branchLower)) signals.push('branch:fix')
  if (/^(feat|feature)[\/-]/.test(branchLower)) signals.push('branch:feature')
  if (/^(refactor|cleanup|clean)[\/-]/.test(branchLower)) signals.push('branch:refactor')
  if (/^(ci|infra|deploy|release)[\/-]/.test(branchLower)) signals.push('branch:infra')
  if (/^(docs?|documentation)[\/-]/.test(branchLower)) signals.push('branch:docs')

  // Commit message signals
  const combined = recentMessages.join(' ').toLowerCase()
  if (combined) {
    if (/\bfix(es|ed)?\b|\bbug\b|\bpatch\b|\bcorrect\b|\bresolv/.test(combined)) signals.push('commits:fix')
    if (/\brefactor\b|\bclean(up)?\b|\breshuffle\b|\breorganiz/.test(combined)) signals.push('commits:refactor')
    if (/\bfeat(ure)?\b|\badd\b|\bimplement\b|\bnew\b/.test(combined)) signals.push('commits:feature')
    if (/\bdocs?\b|\breadme\b|\bchangelog\b/.test(combined)) signals.push('commits:docs')
    if (/\bci\b|\bdeploy\b|\bdocker\b|\binfra\b|\bterraform\b/.test(combined)) signals.push('commits:infra')
  }

  // Infra file presence
  if (hasInfraFiles(cwd)) signals.push('infra-files')

  // ── Intent resolution (priority order) ───────────────────────

  // New project: 0-4 commits + missing core tooling
  if (commitCount < 5 && (allMissing.ci || allMissing.lint || allMissing.tests)) {
    const actions = buildNewProjectActions(missing)
    return { intent: 'new-project', confidence: 'high', missing, actions, signals }
  }

  // Infra: branch or commits or files clearly infra-focused
  if (
    signals.includes('branch:infra') ||
    (signals.includes('commits:infra') && signals.includes('infra-files'))
  ) {
    return {
      intent: 'infra',
      confidence: signals.includes('branch:infra') ? 'high' : 'medium',
      missing,
      actions: ['rex review — run CI/lint/secret scan', 'rex guard list — check guards'],
      signals,
    }
  }

  // Docs: branch or all commits are docs
  if (signals.includes('branch:docs') ||
    (signals.includes('commits:docs') && !signals.some(s => s.startsWith('commits:feat') || s.startsWith('commits:fix')))) {
    return {
      intent: 'docs',
      confidence: signals.includes('branch:docs') ? 'high' : 'medium',
      missing,
      actions: ['rex review --ai — AI-assisted doc review'],
      signals,
    }
  }

  // Bug-fix: branch or commits have fix signals
  if (signals.includes('branch:fix') || signals.includes('commits:fix')) {
    return {
      intent: 'bug-fix',
      confidence: signals.includes('branch:fix') ? 'high' : 'medium',
      missing,
      actions: [
        '/debug-assist — systematic debugging skill',
        'rex search "<error>" — search past solutions',
      ],
      signals,
    }
  }

  // Refactor: branch or commits have refactor signals
  if (signals.includes('branch:refactor') || signals.includes('commits:refactor')) {
    return {
      intent: 'refactor',
      confidence: signals.includes('branch:refactor') ? 'high' : 'medium',
      missing,
      actions: ['rex review — check for regressions', 'rex search "<pattern>" — find related sessions'],
      signals,
    }
  }

  // Feature: branch or commits suggest active feature work
  if (signals.includes('branch:feature') || signals.includes('commits:feature')) {
    return {
      intent: 'feature',
      confidence: signals.includes('branch:feature') ? 'high' : 'medium',
      missing,
      actions: buildFeatureActions(missing),
      signals,
    }
  }

  // Default: explore (active project but no clear intent signal)
  return {
    intent: 'explore',
    confidence: 'low',
    missing,
    actions: ['rex context — analyze project stack + suggest MCP/skills'],
    signals,
  }
}

// ── Action builders ────────────────────────────────────────────────

function buildNewProjectActions(missing: Partial<MissingSetup>): string[] {
  const actions: string[] = []
  if (missing.gitignore) actions.push('Add .gitignore')
  if (missing.readme) actions.push('Create README.md')
  if (missing.lint) actions.push('Add lint config (biome or eslint)')
  if (missing.ci) actions.push('Add CI workflow (.github/workflows/)')
  if (missing.tests) actions.push('Add test setup (vitest recommended)')
  if (missing.hooks) actions.push('Add pre-commit hooks (lefthook or husky)')
  actions.push('rex init — install REX guards + hooks')
  return actions
}

function buildFeatureActions(missing: Partial<MissingSetup>): string[] {
  const actions: string[] = [
    '/ux-flow — map user flows before coding',
    '/api-design — design endpoint contracts first',
  ]
  if (missing.tests) actions.push('Add tests — no test setup detected')
  return actions
}

// ── Pretty print ───────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

const INTENT_ICONS: Record<ProjectIntent, string> = {
  'new-project': '🌱',
  'feature':     '✨',
  'bug-fix':     '🐛',
  'refactor':    '♻️',
  'infra':       '⚙️',
  'docs':        '📝',
  'explore':     '🔍',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high:   C.green,
  medium: C.yellow,
  low:    C.dim,
}

export function printIntent(ctx: IntentContext, debug = false): void {
  const icon = INTENT_ICONS[ctx.intent]
  const conf = CONFIDENCE_COLOR[ctx.confidence]

  console.log(`\n${C.bold}REX Intent Detection${C.reset}`)
  console.log('─'.repeat(32))
  console.log(`  Intent:     ${icon} ${C.bold}${ctx.intent}${C.reset}`)
  console.log(`  Confidence: ${conf}${ctx.confidence}${C.reset}`)

  if (Object.keys(ctx.missing).length > 0) {
    console.log(`\n  ${C.yellow}Missing setup:${C.reset}`)
    for (const k of Object.keys(ctx.missing)) {
      console.log(`    ${C.dim}✗${C.reset}  ${k}`)
    }
  }

  if (ctx.actions.length > 0) {
    console.log(`\n  ${C.cyan}Suggested actions:${C.reset}`)
    for (const a of ctx.actions) {
      console.log(`    →  ${a}`)
    }
  }

  if (debug && ctx.signals.length > 0) {
    console.log(`\n  ${C.dim}Signals: ${ctx.signals.join(', ')}${C.reset}`)
  }

  console.log()
}

// ── Compact preload string (for SessionStart budget) ───────────────

/**
 * Returns a ≤80-char string suitable for injection into preload context.
 * e.g. "Intent: bug-fix (high) | Missing: ci, tests | Next: /debug-assist"
 */
export function intentToPreloadLine(ctx: IntentContext): string {
  const parts: string[] = [`Intent: ${ctx.intent} (${ctx.confidence})`]

  const missingKeys = Object.keys(ctx.missing)
  if (missingKeys.length > 0) {
    parts.push(`Missing: ${missingKeys.join(', ')}`)
  }

  if (ctx.actions.length > 0) {
    parts.push(`Next: ${ctx.actions[0]}`)
  }

  return parts.join(' | ').slice(0, 200)
}
