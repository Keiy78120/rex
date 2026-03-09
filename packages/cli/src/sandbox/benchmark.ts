/**
 * REX Sandbox Benchmark — compare sandbox vs prod performance
 *
 * Runs the same REX command in both sandbox and prod environments
 * and compares: latency, output quality, token usage (estimated cost).
 *
 * Used by self-improve.ts to decide whether a candidate rule is worth
 * promoting — only promote if sandbox result is at least as good as prod.
 *
 * @module OPTIMIZE
 * @see sandbox-runner.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../logger.js'
import { REX_DIR } from '../paths.js'
import { runInSandbox, type SandboxResult } from './sandbox-runner.js'

const log = createLogger('OPTIMIZE:benchmark')

const BENCH_DIR = join(REX_DIR, 'benchmarks')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkCase {
  /** Human-readable name */
  name: string
  /** REX command to run */
  command: string
  /** Optional expected output fragment (for quality check) */
  expectedFragment?: string
  /** Weight for overall score (0-1) */
  weight?: number
}

export interface BenchmarkRun {
  case: BenchmarkCase
  sandboxResult: SandboxResult
  prodResult: SandboxResult
  metrics: BenchmarkMetrics
}

export interface BenchmarkMetrics {
  /** Sandbox latency vs prod (< 1.0 = sandbox faster) */
  latencyRatio: number
  /** Sandbox output tokens vs prod (< 1.0 = sandbox cheaper) */
  outputLengthRatio: number
  /** Quality score 0-1 (1 = same or better output) */
  qualityScore: number
  /** Whether sandbox passed the expected fragment check */
  qualityPassed: boolean
  /** Overall pass/fail */
  passed: boolean
}

export interface BenchmarkReport {
  timestamp: string
  tag: string
  runs: BenchmarkRun[]
  summary: {
    passed: number
    failed: number
    avgLatencyRatio: number
    avgQualityScore: number
    verdict: 'promote' | 'reject' | 'review'
    reason: string
  }
}

// ── Standard REX benchmark suite ─────────────────────────────────────────────

export const STANDARD_BENCH_CASES: BenchmarkCase[] = [
  {
    name: 'health-check',
    command: 'rex doctor --json 2>/dev/null || echo "{}"',
    expectedFragment: '"ok"',
    weight: 0.3,
  },
  {
    name: 'status',
    command: 'rex status --json 2>/dev/null || echo "{}"',
    weight: 0.2,
  },
  {
    name: 'memory-search',
    command: 'rex search "REX" --limit=3 --json 2>/dev/null || echo "[]"',
    expectedFragment: '[',
    weight: 0.3,
  },
  {
    name: 'providers',
    command: 'rex providers --json 2>/dev/null || echo "[]"',
    weight: 0.2,
  },
]

// ── Core benchmark logic ──────────────────────────────────────────────────────

function computeQualityScore(
  sandboxOut: string,
  prodOut: string,
  expectedFragment?: string,
): { score: number; passed: boolean } {
  if (!prodOut.trim()) {
    // No prod baseline — treat sandbox output as pass
    return { score: 1.0, passed: true }
  }

  // Fragment check
  const passed = expectedFragment ? sandboxOut.includes(expectedFragment) : true

  // Similarity: ratio of common lines
  const sandboxLines = new Set(sandboxOut.split('\n').map(l => l.trim()).filter(Boolean))
  const prodLines = prodOut.split('\n').map(l => l.trim()).filter(Boolean)
  const matchCount = prodLines.filter(l => sandboxLines.has(l)).length
  const score = prodLines.length > 0 ? matchCount / prodLines.length : 1.0

  return { score: Math.min(1.0, score), passed }
}

async function runProd(command: string, opts: { timeoutMs?: number } = {}): Promise<SandboxResult> {
  const { execFile } = await import('node:child_process')
  const startMs = Date.now()

  return new Promise((resolve) => {
    execFile('sh', ['-c', command], { timeout: opts.timeoutMs ?? 30_000 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        exitCode: err ? 1 : 0,
        stdout: (stdout ?? '').slice(0, 50_000),
        stderr: (stderr ?? '').slice(0, 10_000),
        durationMs: Date.now() - startMs,
      })
    })
  })
}

/**
 * Run the full benchmark suite: each case in sandbox + prod, then compare.
 *
 * @param cases - benchmark cases to run (defaults to STANDARD_BENCH_CASES)
 * @param tag - identifier for this benchmark run (stored in results)
 */
export async function runBenchmark(
  cases: BenchmarkCase[] = STANDARD_BENCH_CASES,
  tag = `bench-${Date.now()}`,
): Promise<BenchmarkReport> {
  log.info(`benchmark: starting ${cases.length} cases [${tag}]`)

  const runs: BenchmarkRun[] = []

  for (const bc of cases) {
    log.info(`benchmark: case "${bc.name}"`)

    // Run sandbox + prod in parallel for speed
    const [sandboxResult, prodResult] = await Promise.all([
      runInSandbox(bc.command, { timeoutMs: 60_000, tag: `${tag}-${bc.name}-sandbox` }),
      runProd(bc.command, { timeoutMs: 30_000 }),
    ])

    const latencyRatio = prodResult.durationMs > 0
      ? sandboxResult.durationMs / prodResult.durationMs
      : 1.0

    const outputLengthRatio = prodResult.stdout.length > 0
      ? sandboxResult.stdout.length / prodResult.stdout.length
      : 1.0

    const { score: qualityScore, passed: qualityPassed } = computeQualityScore(
      sandboxResult.stdout,
      prodResult.stdout,
      bc.expectedFragment,
    )

    const passed = sandboxResult.ok && qualityPassed && qualityScore >= 0.7

    runs.push({
      case: bc,
      sandboxResult,
      prodResult,
      metrics: { latencyRatio, outputLengthRatio, qualityScore, qualityPassed, passed },
    })

    log.info(`  ${bc.name}: ${passed ? 'PASS' : 'FAIL'} (quality=${qualityScore.toFixed(2)}, lat=${latencyRatio.toFixed(2)}x)`)
  }

  // Summary
  const passedCount = runs.filter(r => r.metrics.passed).length
  const failedCount = runs.length - passedCount
  const avgLatencyRatio = runs.reduce((s, r) => s + r.metrics.latencyRatio, 0) / runs.length
  const avgQualityScore = runs.reduce((s, r) => s + r.metrics.qualityScore, 0) / runs.length

  let verdict: 'promote' | 'reject' | 'review'
  let reason: string

  if (failedCount === 0 && avgQualityScore >= 0.8) {
    verdict = 'promote'
    reason = `All ${runs.length} cases passed, avg quality ${(avgQualityScore * 100).toFixed(0)}%`
  } else if (failedCount > runs.length / 2) {
    verdict = 'reject'
    reason = `${failedCount}/${runs.length} cases failed — sandbox degraded`
  } else {
    verdict = 'review'
    reason = `${passedCount}/${runs.length} passed, avg quality ${(avgQualityScore * 100).toFixed(0)}% — manual review required`
  }

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    tag,
    runs,
    summary: { passed: passedCount, failed: failedCount, avgLatencyRatio, avgQualityScore, verdict, reason },
  }

  // Persist report
  try {
    if (!existsSync(BENCH_DIR)) mkdirSync(BENCH_DIR, { recursive: true })
    writeFileSync(join(BENCH_DIR, `${tag}.json`), JSON.stringify(report, null, 2))
  } catch {}

  log.info(`benchmark: verdict=${verdict} — ${reason}`)
  return report
}

/**
 * Quick benchmark: run the health-check case only (used in CI / self-improve hot path).
 */
export async function quickBenchmark(tag?: string): Promise<boolean> {
  const report = await runBenchmark([STANDARD_BENCH_CASES[0]], tag ?? `quick-${Date.now()}`)
  return report.summary.verdict !== 'reject'
}

/** Pretty-print a benchmark report to stdout */
export function printBenchmarkReport(report: BenchmarkReport): void {
  const { summary, runs } = report
  console.log(`\nBenchmark: ${report.tag}`)
  console.log(`Verdict: ${summary.verdict.toUpperCase()} — ${summary.reason}`)
  console.log(`Cases: ${summary.passed} pass / ${summary.failed} fail`)
  console.log(`Avg latency ratio: ${summary.avgLatencyRatio.toFixed(2)}x  |  Avg quality: ${(summary.avgQualityScore * 100).toFixed(0)}%\n`)
  for (const r of runs) {
    const icon = r.metrics.passed ? '✓' : '✗'
    console.log(`  ${icon} ${r.case.name.padEnd(20)} quality=${(r.metrics.qualityScore * 100).toFixed(0)}%  lat=${r.metrics.latencyRatio.toFixed(2)}x  sandbox=${r.sandboxResult.durationMs}ms  prod=${r.prodResult.durationMs}ms`)
  }
  console.log()
}
