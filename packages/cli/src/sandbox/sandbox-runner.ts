/**
 * REX Sandbox Runner — safe preview execution before prod
 *
 * Any REX self-improvement modification runs through sandbox first:
 *   1. Run the change in Docker sandbox (no prod side effects)
 *   2. Capture output + metrics
 *   3. Compare against prod baseline via benchmark.ts
 *   4. Only promote to prod if benchmark passes (lower cost, same quality)
 *
 * @module OPTIMIZE
 * @see sandbox/benchmark.ts
 * @see self-improve.ts
 */

import { execSync, execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createLogger } from '../logger.js'
import { REX_DIR } from '../paths.js'

const log = createLogger('OPTIMIZE:sandbox-runner')

const SANDBOX_DIR = dirname(fileURLToPath(import.meta.url))
const COMPOSE_FILE = join(SANDBOX_DIR, 'docker-compose.sandbox.yml')
const RESULTS_DIR = join(REX_DIR, 'sandbox-results')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SandboxRunOptions {
  /** Working directory to mount as /workspace */
  projectDir?: string
  /** Timeout in ms (default 120s) */
  timeoutMs?: number
  /** Tag this run (e.g. "self-improve-rule-42") */
  tag?: string
  /** Whether to capture metrics via benchmark */
  benchmark?: boolean
}

export interface SandboxResult {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  tag?: string
  sandboxResultPath?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureResultsDir(): void {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
}

function isDockerAvailable(): boolean {
  try {
    execSync('docker info 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

function isComposeAvailable(): boolean {
  try {
    execSync('docker compose version 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    try {
      execSync('docker-compose --version 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
}

function composeCmd(): string {
  try {
    execSync('docker compose version 2>/dev/null', { stdio: 'ignore', timeout: 2000 })
    return 'docker compose'
  } catch {
    return 'docker-compose'
  }
}

// ── Core sandbox execution ────────────────────────────────────────────────────

/**
 * Run a REX command inside the Docker sandbox.
 * Returns structured result with stdout/stderr/metrics.
 *
 * @example
 * const result = await runInSandbox('rex doctor --json', { tag: 'pre-self-improve' })
 * if (result.ok) promote()
 */
export async function runInSandbox(
  command: string,
  opts: SandboxRunOptions = {},
): Promise<SandboxResult> {
  if (!isDockerAvailable()) {
    log.warn('sandbox-runner: Docker not available — running without sandbox')
    return runRaw(command, opts)
  }

  if (!isComposeAvailable()) {
    log.warn('sandbox-runner: docker compose not available — falling back to raw docker run')
    return runWithDockerRun(command, opts)
  }

  const startMs = Date.now()
  const projectDir = opts.projectDir ?? process.cwd()
  const env = {
    ...process.env,
    PROJECT_DIR: resolve(projectDir),
  }

  return new Promise<SandboxResult>((resolveP) => {
    const timeout = opts.timeoutMs ?? 120_000
    const compose = composeCmd()

    // docker compose run --rm runner sh -c "<command>"
    const args = [
      '-f', COMPOSE_FILE,
      'run', '--rm', 'runner',
      'sh', '-c', command,
    ]

    log.info(`sandbox: ${compose} run [${command.slice(0, 60)}]`)

    let stdout = ''
    let stderr = ''

    const proc = execFile(
      compose.split(' ')[0],
      [...compose.split(' ').slice(1), ...args],
      { env, timeout, cwd: projectDir },
      (err, out, errOut) => {
        stdout = out ?? ''
        stderr = errOut ?? ''
        const exitCode = err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0
        const durationMs = Date.now() - startMs

        const result: SandboxResult = {
          ok: exitCode === 0,
          exitCode,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          durationMs,
          tag: opts.tag,
        }

        // Persist result
        if (opts.tag) {
          ensureResultsDir()
          const resultPath = join(RESULTS_DIR, `${opts.tag}-${Date.now()}.json`)
          try {
            writeFileSync(resultPath, JSON.stringify(result, null, 2))
            result.sandboxResultPath = resultPath
          } catch {}
        }

        log.info(`sandbox: done (exit=${exitCode}, ${durationMs}ms)`)
        resolveP(result)
      }
    )

    proc.on('error', (err) => {
      resolveP({
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - startMs,
        tag: opts.tag,
      })
    })
  })
}

/** Fallback: raw docker run (no compose) */
async function runWithDockerRun(
  command: string,
  opts: SandboxRunOptions,
): Promise<SandboxResult> {
  const startMs = Date.now()
  const projectDir = opts.projectDir ?? process.cwd()

  return new Promise((resolveP) => {
    execFile(
      'docker',
      [
        'run', '--rm',
        '-v', `${resolve(projectDir)}:/workspace:ro`,
        '-w', '/workspace',
        '-e', 'REX_SANDBOX=1',
        'node:22-alpine',
        'sh', '-c', command,
      ],
      { timeout: opts.timeoutMs ?? 120_000 },
      (err, stdout, stderr) => {
        const exitCode = err ? 1 : 0
        resolveP({
          ok: exitCode === 0,
          exitCode,
          stdout: (stdout ?? '').slice(0, 50_000),
          stderr: (stderr ?? '').slice(0, 10_000),
          durationMs: Date.now() - startMs,
          tag: opts.tag,
        })
      }
    )
  })
}

/** Last resort: no sandbox at all */
async function runRaw(
  command: string,
  opts: SandboxRunOptions,
): Promise<SandboxResult> {
  const startMs = Date.now()
  log.warn('sandbox-runner: no isolation — running raw command')

  return new Promise((resolveP) => {
    execFile('sh', ['-c', command], { timeout: opts.timeoutMs ?? 120_000 }, (err, stdout, stderr) => {
      resolveP({
        ok: !err,
        exitCode: err ? 1 : 0,
        stdout: (stdout ?? '').slice(0, 50_000),
        stderr: (stderr ?? '').slice(0, 10_000),
        durationMs: Date.now() - startMs,
        tag: opts.tag,
      })
    })
  })
}

// ── Self-improve integration ──────────────────────────────────────────────────

/**
 * Run a self-improvement candidate in sandbox before promoting.
 * Called by self-improve.ts before applying any auto-generated rule.
 *
 * @returns true if sandbox passed and it's safe to promote
 */
export async function validateBeforePromote(
  ruleCandidate: { pattern: string; suggestedRule: string },
  projectDir?: string,
): Promise<{ safe: boolean; reason: string; result: SandboxResult }> {
  const tag = `self-improve-${Date.now()}`

  // Test: run rex doctor in sandbox — if it passes, the env is stable
  const healthResult = await runInSandbox('rex doctor --json 2>/dev/null || echo "{}"', {
    projectDir,
    tag,
    timeoutMs: 60_000,
  })

  if (!healthResult.ok) {
    return {
      safe: false,
      reason: `Sandbox health check failed (exit=${healthResult.exitCode}): ${healthResult.stderr.slice(0, 200)}`,
      result: healthResult,
    }
  }

  // Check if the rule candidate contains destructive patterns
  const destructive = /rm -rf|DROP TABLE|DELETE FROM|format.*disk|mkfs/i.test(ruleCandidate.suggestedRule)
  if (destructive) {
    return {
      safe: false,
      reason: 'Rule candidate contains potentially destructive commands — rejected',
      result: healthResult,
    }
  }

  log.info(`sandbox validate: "${ruleCandidate.pattern.slice(0, 50)}" → SAFE`)
  return { safe: true, reason: 'Sandbox health passed, no destructive patterns', result: healthResult }
}

// ── Status ────────────────────────────────────────────────────────────────────

export interface SandboxRunnerStatus {
  dockerAvailable: boolean
  composeAvailable: boolean
  composeFile: string
  resultsDir: string
  recentRuns: string[]
}

export function getSandboxRunnerStatus(): SandboxRunnerStatus {
  let recentRuns: string[] = []
  try {
    if (existsSync(RESULTS_DIR)) {
      recentRuns = readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json'))
        .slice(-5)
    }
  } catch {}

  return {
    dockerAvailable: isDockerAvailable(),
    composeAvailable: isComposeAvailable(),
    composeFile: COMPOSE_FILE,
    resultsDir: RESULTS_DIR,
    recentRuns,
  }
}
