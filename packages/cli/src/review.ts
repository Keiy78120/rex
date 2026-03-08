import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('review')

interface StepResult {
  name: string
  status: 'ok' | 'warn' | 'fail' | 'skip'
  message: string
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /AKIA[A-Z0-9]{16}/,
  /Bearer\s+[a-zA-Z0-9._\-]{20,}/,
  /password\s*=\s*["'][^"']{4,}["']/i,
  /api[_-]?key\s*=\s*["'][^"']{8,}["']/i,
]

function cmdExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function runStep(name: string, fn: () => StepResult['status'] | { status: StepResult['status']; message: string }): StepResult {
  try {
    const result = fn()
    if (typeof result === 'string') {
      return { name, status: result, message: result === 'ok' ? 'Passed' : result === 'skip' ? 'Skipped' : 'Issue found' }
    }
    return { name, ...result }
  } catch (e: any) {
    return { name, status: 'fail', message: e.message?.slice(0, 120) || 'Unknown error' }
  }
}

function checkTypeScript(): StepResult {
  return runStep('TypeScript check', () => {
    const cwd = process.cwd()
    if (!existsSync(join(cwd, 'tsconfig.json'))) {
      return { status: 'skip', message: 'No tsconfig.json found' }
    }
    if (!cmdExists('tsc')) {
      return { status: 'skip', message: 'tsc not installed' }
    }
    try {
      execSync('npx tsc --noEmit 2>&1', { cwd, stdio: 'pipe', timeout: 60_000 })
      return { status: 'ok', message: 'No type errors' }
    } catch (e: any) {
      const output = e.stdout?.toString() || e.stderr?.toString() || ''
      const errorCount = (output.match(/error TS/g) || []).length
      return { status: 'fail', message: `${errorCount} type error${errorCount !== 1 ? 's' : ''} found` }
    }
  })
}

function checkLint(): StepResult {
  return runStep('Lint check', () => {
    const cwd = process.cwd()
    if (existsSync(join(cwd, 'biome.json')) || existsSync(join(cwd, 'biome.jsonc'))) {
      try {
        execSync('npx biome check . 2>&1', { cwd, stdio: 'pipe', timeout: 30_000 })
        return { status: 'ok', message: 'Biome: all clean' }
      } catch (e: any) {
        return { status: 'warn', message: 'Biome found issues' }
      }
    }
    if (existsSync(join(cwd, '.eslintrc')) || existsSync(join(cwd, '.eslintrc.json')) || existsSync(join(cwd, '.eslintrc.js')) || existsSync(join(cwd, 'eslint.config.js')) || existsSync(join(cwd, 'eslint.config.mjs'))) {
      try {
        execSync('npx eslint . 2>&1', { cwd, stdio: 'pipe', timeout: 60_000 })
        return { status: 'ok', message: 'ESLint: all clean' }
      } catch {
        return { status: 'warn', message: 'ESLint found issues' }
      }
    }
    return { status: 'skip', message: 'No linter config found (biome/eslint)' }
  })
}

function checkSecrets(): StepResult {
  return runStep('Secret scan', () => {
    try {
      const staged = execSync('git diff --cached --name-only 2>/dev/null', { stdio: 'pipe' }).toString().trim()
      if (!staged) {
        return { status: 'skip', message: 'No staged files' }
      }
      const files = staged.split('\n').filter(Boolean)
      const findings: string[] = []

      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8')
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(content)) {
              findings.push(`${file}: matches ${pattern.source.slice(0, 30)}...`)
              break
            }
          }
        } catch { /* file might be deleted */ }
      }

      if (findings.length > 0) {
        return { status: 'fail', message: `${findings.length} file${findings.length > 1 ? 's' : ''} with potential secrets: ${findings[0]}` }
      }
      return { status: 'ok', message: `${files.length} staged file${files.length !== 1 ? 's' : ''} scanned, no secrets found` }
    } catch {
      return { status: 'skip', message: 'Not in a git repo or no staged files' }
    }
  })
}

function checkTests(): StepResult {
  return runStep('Test run', () => {
    const cwd = process.cwd()
    const pkgPath = join(cwd, 'package.json')
    if (!existsSync(pkgPath)) {
      return { status: 'skip', message: 'No package.json found' }
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (!pkg.scripts?.test || pkg.scripts.test.includes('no test specified')) {
        return { status: 'skip', message: 'No test script defined' }
      }
      const pmLock = existsSync(join(cwd, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(cwd, 'yarn.lock')) ? 'yarn' : 'npm'
      execSync(`${pmLock} test 2>&1`, { cwd, stdio: 'pipe', timeout: 120_000 })
      return { status: 'ok', message: 'Tests passed' }
    } catch (e: any) {
      return { status: 'fail', message: 'Tests failed' }
    }
  })
}

export function runReview(mode: 'quick' | 'full' | 'ai'): StepResult[] {
  if (mode === 'ai') {
    console.log(`\n${COLORS.yellow}AI review requires provider config.${COLORS.reset}`)
    console.log(`${COLORS.dim}Configure with: rex providers${COLORS.reset}\n`)
    return []
  }

  log.info(`Starting review (mode: ${mode})`)

  const results: StepResult[] = []
  results.push(checkTypeScript())
  results.push(checkSecrets())

  if (mode === 'full') {
    results.push(checkLint())
    results.push(checkTests())
  }

  return results
}

function statusIcon(status: string): string {
  switch (status) {
    case 'ok': return `${COLORS.green}✓${COLORS.reset}`
    case 'warn': return `${COLORS.yellow}!${COLORS.reset}`
    case 'fail': return `${COLORS.red}✗${COLORS.reset}`
    case 'skip': return `${COLORS.dim}-${COLORS.reset}`
    default: return ' '
  }
}

export function printReviewResults(results: StepResult[], json = false): void {
  if (json) {
    console.log(JSON.stringify({ results }, null, 2))
    return
  }

  if (results.length === 0) return

  const line = '─'.repeat(45)
  console.log(`\n${COLORS.bold}REX Review${COLORS.reset}\n${line}`)

  for (const r of results) {
    console.log(`  ${statusIcon(r.status)} ${r.name.padEnd(20)} ${COLORS.dim}${r.message}${COLORS.reset}`)
  }

  const passed = results.filter(r => r.status === 'ok').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  console.log(`${line}`)
  console.log(`  ${COLORS.bold}${passed} passed${COLORS.reset}, ${failed > 0 ? COLORS.red : COLORS.dim}${failed} failed${COLORS.reset}, ${COLORS.dim}${skipped} skipped${COLORS.reset}\n`)

  log.info(`Review complete: ${passed} ok, ${failed} fail, ${skipped} skip`)
}
