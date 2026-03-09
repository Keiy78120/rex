/**
 * REX Load Test
 *
 * Fires concurrent requests at the mock LLM server or a real endpoint to
 * measure throughput and latency under load.
 *
 * Usage:
 *   rex test:load                         # default: 5 rps, 30s, mock LLM
 *   rex test:load --rps=10 --duration=60  # custom load
 *   rex test:load --url=http://localhost:7420/api/chat  # custom endpoint
 *
 * @module CORE
 */

import { createLogger } from './logger.js'
import { MOCK_PORT } from './mock-llm-server.js'

const log = createLogger('CORE:load-test')

export interface LoadTestOpts {
  rps: number          // requests per second
  duration: number     // seconds
  url?: string         // target (default: mock LLM /v1/chat/completions)
  concurrency?: number // max in-flight requests (default: rps * 2)
  messages?: string[]  // cycling user messages
}

export interface LoadTestResult {
  totalRequests: number
  successful: number
  failed: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  maxMs: number
  minMs: number
  avgMs: number
  rps: number   // actual measured rps
  errors: string[]
}

const DEFAULT_MESSAGES = [
  'status',
  'search for recent commits',
  'fix the bug in the parser',
  'create a new component',
  'analyze memory usage',
  'budget report',
  'relay chain test',
]

async function sendRequest(url: string, message: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now()
  try {
    const body = JSON.stringify({
      model: 'mock-model',
      messages: [{ role: 'user', content: message }],
    })
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    const ms = Date.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, ms, error: `HTTP ${res.status}: ${text.slice(0, 100)}` }
    }
    await res.json()
    return { ok: true, ms }
  } catch (e: any) {
    return { ok: false, ms: Date.now() - start, error: e.message?.slice(0, 100) }
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

export async function runLoadTest(opts: LoadTestOpts): Promise<LoadTestResult> {
  const {
    rps,
    duration,
    url = `http://localhost:${MOCK_PORT}/v1/chat/completions`,
    concurrency = Math.max(rps * 2, 4),
    messages = DEFAULT_MESSAGES,
  } = opts

  log.info(`Load test: ${rps} rps, ${duration}s, url=${url}, concurrency=${concurrency}`)

  const latencies: number[] = []
  const errors: string[] = []
  let successful = 0
  let failed = 0
  let msgIdx = 0

  const intervalMs = 1000 / rps
  const endTime = Date.now() + duration * 1000
  let inFlight = 0
  const pending: Promise<void>[] = []

  async function fire(): Promise<void> {
    const msg = messages[msgIdx % messages.length]
    msgIdx++
    inFlight++
    const r = await sendRequest(url, msg)
    inFlight--
    latencies.push(r.ms)
    if (r.ok) successful++
    else {
      failed++
      if (errors.length < 20 && r.error) errors.push(r.error)
    }
  }

  while (Date.now() < endTime) {
    if (inFlight < concurrency) {
      const p = fire()
      pending.push(p)
      p.finally(() => { const i = pending.indexOf(p); if (i >= 0) pending.splice(i, 1) })
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }

  // Wait for in-flight requests to finish (max 10s)
  await Promise.race([
    Promise.all(pending),
    new Promise(r => setTimeout(r, 10_000)),
  ])

  const totalRequests = successful + failed
  const sorted = [...latencies].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const actualRps = totalRequests / duration

  return {
    totalRequests,
    successful,
    failed,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    minMs: sorted[0] ?? 0,
    avgMs: Math.round(sum / (sorted.length || 1)),
    rps: Math.round(actualRps * 10) / 10,
    errors: errors.slice(0, 10),
  }
}

// ── CLI printer ───────────────────────────────────────────────────────────────

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' }

export function printLoadTestResult(r: LoadTestResult, opts: LoadTestOpts): void {
  const successPct = r.totalRequests ? Math.round((r.successful / r.totalRequests) * 100) : 0
  const color = successPct >= 99 ? C.green : successPct >= 90 ? C.yellow : C.red

  console.log(`\n${C.bold}REX Load Test Results${C.reset}`)
  console.log('─'.repeat(48))
  console.log(`  Target:    ${opts.url ?? `mock LLM :${MOCK_PORT}`}`)
  console.log(`  Load:      ${opts.rps} rps × ${opts.duration}s  (concurrency: ${opts.concurrency ?? opts.rps * 2})`)
  console.log()
  console.log(`  ${C.bold}Throughput${C.reset}`)
  console.log(`    Actual RPS:   ${r.rps}`)
  console.log(`    Total:        ${r.totalRequests}  (${color}${successPct}% success${C.reset})`)
  console.log(`    Successful:   ${C.green}${r.successful}${C.reset}`)
  if (r.failed) console.log(`    Failed:       ${C.red}${r.failed}${C.reset}`)
  console.log()
  console.log(`  ${C.bold}Latency${C.reset}`)
  console.log(`    p50:  ${r.p50Ms}ms`)
  console.log(`    p95:  ${r.p95Ms}ms`)
  console.log(`    p99:  ${r.p99Ms}ms`)
  console.log(`    max:  ${r.maxMs}ms  |  min: ${r.minMs}ms  |  avg: ${r.avgMs}ms`)
  if (r.errors.length) {
    console.log()
    console.log(`  ${C.red}Errors (first ${r.errors.length}):${C.reset}`)
    for (const e of r.errors) console.log(`    ${C.dim}${e}${C.reset}`)
  }
  console.log()
}
