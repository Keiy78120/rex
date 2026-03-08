/**
 * REX Lint Loop — script-first iterative code correction
 *
 * Pattern: script analyzes → LLM corrects → script re-analyzes → repeat
 * Converges when: no diff | max iterations reached | LLM says nothing to fix
 * 0 LLM calls if script passes on first try.
 *
 * Spec: docs/plans/action.md §28
 */

import { createLogger } from './logger.js'

const log = createLogger('lint-loop')

// ── Types ──────────────────────────────────────────────────────────

export interface LintLoopOptions {
  /** Path of the file or directory to lint */
  targetPath: string
  /** Script analyzer — returns report string (empty = clean) */
  analyzer: () => Promise<string>
  /** Max correction iterations (default: 5) */
  maxIterations?: number
  /** If true, show iteration output (default: false) */
  verbose?: boolean
}

export interface LintLoopResult {
  converged: boolean
  iterations: number
  finalReport: string
  reason: 'clean' | 'max-iterations' | 'no-diff' | 'llm-done'
}

// ── LLM correction request ─────────────────────────────────────────

const CORRECTION_SYSTEM = `You are a code fixer. Given a file path and a lint/type-check report,
produce ONLY the minimal code changes needed to fix the reported issues.
Output ONLY a unified diff (--- a/file, +++ b/file format).
If there is nothing to fix, output exactly: NOTHING_TO_FIX`

async function requestCorrection(
  targetPath: string,
  report: string,
): Promise<string> {
  const { orchestrate } = await import('./orchestrator.js')
  const prompt = `File: ${targetPath}\n\nLint report:\n${report.slice(0, 3000)}\n\nFix the issues. Output a unified diff or NOTHING_TO_FIX.`
  const result = await orchestrate(prompt, { capability: 'code' })
  return result.response
}

// ── Apply unified diff ─────────────────────────────────────────────

async function applyDiff(diff: string): Promise<boolean> {
  if (!diff || diff.trim() === 'NOTHING_TO_FIX') return false
  if (!diff.includes('---') || !diff.includes('+++')) return false

  try {
    const { execSync } = await import('node:child_process')
    const { writeFileSync, unlinkSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const patchPath = join(tmpdir(), `rex-lint-${Date.now()}.patch`)
    writeFileSync(patchPath, diff)

    execSync(`patch -p1 < ${patchPath}`, {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: 'pipe',
    })

    try { unlinkSync(patchPath) } catch {}
    return true
  } catch (e: any) {
    log.warn(`patch apply failed: ${e.message?.slice(0, 100)}`)
    return false
  }
}

// ── Main loop ──────────────────────────────────────────────────────

/**
 * Run the lint loop.
 *
 * 1. Run analyzer script
 * 2. If clean → done (0 LLM calls)
 * 3. Send report to LLM for correction
 * 4. Apply diff
 * 5. Re-run analyzer → if different → go to 3
 * 6. Stop at maxIterations or when LLM says NOTHING_TO_FIX
 */
export async function lintLoop(opts: LintLoopOptions): Promise<LintLoopResult> {
  const { targetPath, analyzer, maxIterations = 5, verbose = false } = opts
  let iterations = 0
  let lastReport = ''

  while (iterations < maxIterations) {
    // Step 1: run analyzer
    const report = await analyzer()

    if (verbose) {
      log.info(`Iteration ${iterations + 1}: ${report ? `${report.slice(0, 100)}...` : 'clean'}`)
    }

    // Step 2: clean pass → converged
    if (!report || report.trim() === '') {
      return {
        converged: true,
        iterations,
        finalReport: '',
        reason: 'clean',
      }
    }

    // Step 3: no diff from last iteration → converged (analyzer stuck)
    if (report === lastReport && iterations > 0) {
      return {
        converged: false,
        iterations,
        finalReport: report,
        reason: 'no-diff',
      }
    }

    lastReport = report
    iterations++

    // Step 4: ask LLM for correction
    const diff = await requestCorrection(targetPath, report)

    if (diff.trim() === 'NOTHING_TO_FIX') {
      return {
        converged: false,
        iterations,
        finalReport: report,
        reason: 'llm-done',
      }
    }

    // Step 5: apply diff
    const applied = await applyDiff(diff)
    if (!applied) {
      // LLM didn't produce valid diff → stop
      return {
        converged: false,
        iterations,
        finalReport: report,
        reason: 'llm-done',
      }
    }
  }

  // Exhausted iterations
  const finalReport = await analyzer()
  return {
    converged: !finalReport,
    iterations,
    finalReport,
    reason: 'max-iterations',
  }
}

// ── Built-in analyzers ─────────────────────────────────────────────

/** TypeScript type-check analyzer using tsc --noEmit */
export function tscAnalyzer(cwd: string): () => Promise<string> {
  return async () => {
    const { execSync } = await import('node:child_process')
    try {
      execSync('npx tsc --noEmit 2>&1', {
        encoding: 'utf-8',
        timeout: 60_000,
        cwd,
        stdio: 'pipe',
      })
      return ''
    } catch (e: any) {
      return (e.stdout ?? '') + (e.stderr ?? '')
    }
  }
}

/** ESLint analyzer */
export function eslintAnalyzer(targetPath: string): () => Promise<string> {
  return async () => {
    const { execSync } = await import('node:child_process')
    try {
      execSync(`npx eslint ${targetPath} --format compact 2>&1`, {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: 'pipe',
      })
      return ''
    } catch (e: any) {
      return (e.stdout ?? '') + (e.stderr ?? '')
    }
  }
}

/** Secret-scan analyzer using regex patterns */
export function secretScanAnalyzer(targetPath: string): () => Promise<string> {
  return async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    if (!existsSync(targetPath)) return ''
    const content = readFileSync(targetPath, 'utf-8')

    const findings: string[] = []
    const patterns: Array<{ name: string; re: RegExp }> = [
      { name: 'api-key', re: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i },
      { name: 'secret', re: /(?:secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i },
      { name: 'private-key', re: /-----BEGIN (?:RSA|EC|OPENSSH|PGP) PRIVATE KEY-----/ },
    ]

    for (const { name, re } of patterns) {
      if (re.test(content)) findings.push(`Secret found: ${name} in ${targetPath}`)
    }

    return findings.join('\n')
  }
}
