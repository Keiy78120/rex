/** @module AGENTS */
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { REX_DIR } from './paths.js'
import { createLogger } from './logger.js'
import { appendEvent } from './event-journal.js'

// ── Re-exports from @langchain/langgraph ─────────────────────
export { StateGraph, Annotation, END, START, MemorySaver } from '@langchain/langgraph'
import { StateGraph, Annotation, END, START, MemorySaver } from '@langchain/langgraph'

const log = createLogger('lang-graph')
const execFileAsync = promisify(execFile)

const REX_BIN = join(homedir(), '.nvm', 'versions', 'node', 'v22.20.0', 'bin', 'rex')

// ── Constants ────────────────────────────────────────────────

const GRAPH_CHECKPOINTS_DIR = existsSync(REX_DIR)
  ? join(REX_DIR, 'graph-checkpoints')
  : join(homedir(), '.claude', 'rex', 'graph-checkpoints')

function ensureCheckpointsDir(): void {
  if (!existsSync(GRAPH_CHECKPOINTS_DIR)) {
    mkdirSync(GRAPH_CHECKPOINTS_DIR, { recursive: true })
  }
}

// ── Subprocess helper (avoids circular deps) ─────────────────

async function rexOrchestrate(task: string): Promise<string> {
  try {
    const bin = existsSync(REX_BIN) ? REX_BIN : 'rex'
    const { stdout } = await execFileAsync(bin, ['orchestrate', task], {
      timeout: 120_000,
      env: { ...process.env, PATH: process.env.PATH ?? '' },
    })
    return stdout.trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`[rexOrchestrate] failed: ${msg.slice(0, 120)}`)
    return `Error: ${msg}`
  }
}

// ── Trace types ───────────────────────────────────────────────

interface GraphStep {
  node: string
  timestamp: Date
  durationMs: number
}

interface GraphTrace {
  id: string
  graphName: string
  startedAt: Date
  completedAt?: Date
  steps: GraphStep[]
  status: 'running' | 'completed' | 'failed'
  error?: string
}

// ── Checkpoint I/O ────────────────────────────────────────────

function saveCheckpoint(trace: GraphTrace): void {
  try {
    ensureCheckpointsDir()
    const path = join(GRAPH_CHECKPOINTS_DIR, `${trace.id}.json`)
    writeFileSync(path, JSON.stringify(trace, null, 2))
  } catch (err) {
    log.warn(`Failed to save checkpoint: ${err}`)
  }
}

function loadCheckpoint(traceId: string): GraphTrace | null {
  try {
    const path = join(GRAPH_CHECKPOINTS_DIR, `${traceId}.json`)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as GraphTrace
  } catch {
    return null
  }
}

function listCheckpoints(): GraphTrace[] {
  try {
    ensureCheckpointsDir()
    return readdirSync(GRAPH_CHECKPOINTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50)
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(GRAPH_CHECKPOINTS_DIR, f), 'utf-8')) as GraphTrace
        } catch {
          return null
        }
      })
      .filter((t): t is GraphTrace => t !== null)
  } catch {
    return []
  }
}

// ── Pre-built template: scriptHelperGraph ────────────────────
// analyze → write → test → conditional(fix|done)

const ScriptState = Annotation.Root({
  task: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  script: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  testOutput: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  attempts: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
})

export function scriptHelperGraph() {
  return new StateGraph(ScriptState)
    .addNode('analyze', async (state) => {
      log.debug('[scriptHelper] analyze')
      const response = await rexOrchestrate(
        `Analyze this task and describe what shell script is needed:\n\n${state.task}`,
      )
      return { script: response }
    })
    .addNode('write', async (state) => {
      log.debug('[scriptHelper] write')
      const response = await rexOrchestrate(
        `Write a complete bash script for this task:\n${state.task}\n\nAnalysis:\n${state.script}`,
      )
      return { script: response }
    })
    .addNode('test', async (state) => {
      log.debug('[scriptHelper] test')
      const response = await rexOrchestrate(
        `Review this bash script for correctness and safety. Reply "PASS" if correct, or "FAIL: <reason>" if there are issues.\n\nScript:\n${state.script}`,
      )
      return { testOutput: response, attempts: state.attempts + 1 }
    })
    .addNode('fix', async (state) => {
      log.debug('[scriptHelper] fix')
      const response = await rexOrchestrate(
        `Fix this bash script based on the feedback:\n\nScript:\n${state.script}\n\nFeedback:\n${state.testOutput}`,
      )
      return { script: response }
    })
    .addNode('done', async () => {
      log.info('[scriptHelper] done')
      return { done: true }
    })
    .addEdge(START, 'analyze')
    .addEdge('analyze', 'write')
    .addEdge('write', 'test')
    .addConditionalEdges('test', (state) => {
      if (state.testOutput.startsWith('PASS') || state.attempts >= 3) return 'done'
      return 'fix'
    })
    .addEdge('fix', 'test')
    .addEdge('done', END)
    .compile({ checkpointer: new MemorySaver() })
}

// ── Pre-built template: codeReviewGraph ──────────────────────
// read_code → identify_issues → conditional(write_fixes|done)

const CodeReviewState = Annotation.Root({
  path: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  code: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  issues: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  fixes: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
})

export function codeReviewGraph() {
  return new StateGraph(CodeReviewState)
    .addNode('read_code', async (state) => {
      log.debug(`[codeReview] read_code: ${state.path}`)
      try {
        const { readFileSync: rfs, existsSync: efs } = await import('node:fs')
        if (!efs(state.path)) return { code: `[File not found: ${state.path}]` }
        const code = rfs(state.path, 'utf-8')
        return { code: code.slice(0, 8000) }
      } catch (err) {
        return { code: `[Error reading file: ${err}]` }
      }
    })
    .addNode('identify_issues', async (state) => {
      log.debug('[codeReview] identify_issues')
      const response = await rexOrchestrate(
        `Review this code for bugs, security issues, and performance problems. List each issue as a JSON array of strings:\n\n${state.code}`,
      )
      let issues: string[] = []
      try {
        const match = response.match(/\[[\s\S]*\]/)
        if (match) {
          const parsed: unknown = JSON.parse(match[0])
          if (Array.isArray(parsed)) {
            issues = parsed.filter((x): x is string => typeof x === 'string')
          }
        }
      } catch {
        issues = response.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('```'))
      }
      return { issues }
    })
    .addNode('write_fixes', async (state) => {
      log.debug('[codeReview] write_fixes')
      const issueList = state.issues.join('\n- ')
      const response = await rexOrchestrate(
        `Provide fixes for these code issues:\n\n- ${issueList}\n\nOriginal code:\n${state.code}`,
      )
      return { fixes: response, done: true }
    })
    .addNode('done', async () => {
      log.info('[codeReview] done (no issues found)')
      return { done: true }
    })
    .addEdge(START, 'read_code')
    .addEdge('read_code', 'identify_issues')
    .addConditionalEdges('identify_issues', (state) =>
      state.issues.length === 0 ? 'done' : 'write_fixes',
    )
    .addEdge('write_fixes', END)
    .addEdge('done', END)
    .compile({ checkpointer: new MemorySaver() })
}

// ── Pre-built template: monitorCycleGraph ────────────────────
// collect_metrics → analyze → conditional(alert|report|done)

const MonitorCycleState = Annotation.Root({
  metrics: Annotation<Record<string, unknown>>({ reducer: (_a, b) => b, default: () => ({}) }),
  alerts: Annotation<string[]>({ reducer: (_a, b) => b, default: () => [] }),
  report: Annotation<string>({ reducer: (_a, b) => b, default: () => '' }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
})

export function monitorCycleGraph() {
  return new StateGraph(MonitorCycleState)
    .addNode('collect_metrics', async () => {
      log.debug('[monitorCycle] collect_metrics')
      try {
        const { collectMetrics } = await import('./metrics.js')
        const m = await collectMetrics()
        return { metrics: m as unknown as Record<string, unknown> }
      } catch (err) {
        log.warn(`[monitorCycle] metrics collection failed: ${err}`)
        return { metrics: { error: String(err) } }
      }
    })
    .addNode('analyze', async (state) => {
      log.debug('[monitorCycle] analyze')
      const metricsStr = JSON.stringify(state.metrics, null, 2).slice(0, 3000)
      const response = await rexOrchestrate(
        `Analyze these system metrics and classify severity as "critical", "warning", or "ok". List any alerts.\n\nMetrics:\n${metricsStr}`,
      )
      const alerts: string[] = []
      for (const line of response.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('-') || trimmed.startsWith('•') || /^\d+\./.test(trimmed)) {
          alerts.push(trimmed.replace(/^[-•\d.]\s*/, ''))
        }
      }
      return { alerts }
    })
    .addNode('alert', async (state) => {
      const alertList = state.alerts.join('\n  - ')
      const summary = `CRITICAL alerts:\n  - ${alertList}`
      log.warn(`[monitorCycle] CRITICAL: ${state.alerts.length} alert(s)`)
      appendEvent('daemon_action', 'lang-graph:monitor', { action: 'critical_alerts', alerts: state.alerts })
      return { report: summary, done: true }
    })
    .addNode('report', async (state) => {
      const alertList = state.alerts.length > 0 ? `\nWarnings:\n  - ${state.alerts.join('\n  - ')}` : ''
      const report = `Monitor cycle complete.${alertList}`
      log.info(`[monitorCycle] report: ${state.alerts.length} warning(s)`)
      return { report, done: true }
    })
    .addNode('done', async () => {
      log.info('[monitorCycle] all clear')
      return { done: true }
    })
    .addEdge(START, 'collect_metrics')
    .addEdge('collect_metrics', 'analyze')
    .addConditionalEdges('analyze', (state) => {
      if (state.alerts.length === 0) return 'done'
      const criticalKeywords = ['critical', 'error', 'down', 'fail', 'crash', 'oom']
      const isCritical = state.alerts.some(a =>
        criticalKeywords.some(kw => a.toLowerCase().includes(kw)),
      )
      return isCritical ? 'alert' : 'report'
    })
    .addEdge('alert', END)
    .addEdge('report', END)
    .addEdge('done', END)
    .compile({ checkpointer: new MemorySaver() })
}

// ── Template registry ─────────────────────────────────────────

interface TemplateInfo {
  name: string
  description: string
  defaultInput: Record<string, unknown>
}

const TEMPLATES: TemplateInfo[] = [
  {
    name: 'scriptHelper',
    description: 'Autonomous script writing: analyze → write → test → fix loop',
    defaultInput: { task: '', script: '', testOutput: '', attempts: 0, done: false },
  },
  {
    name: 'codeReview',
    description: 'Code review pipeline: read → identify issues → write fixes',
    defaultInput: { path: '', code: '', issues: [], fixes: '', done: false },
  },
  {
    name: 'monitorCycle',
    description: 'System monitoring: collect metrics → analyze → alert/report',
    defaultInput: { metrics: {}, alerts: [], report: '', done: false },
  },
]

// ── CLI colors ────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

// ── CLI entry points ──────────────────────────────────────────

export async function cmdGraphRun(args: string[]): Promise<void> {
  const templateName = args[0]
  if (!templateName) {
    console.log(`Usage: rex graph run <template> [--input=<json>] [--verbose]`)
    console.log(`Templates: ${TEMPLATES.map(t => t.name).join(', ')}`)
    return
  }

  const inputArg = args.find(a => a.startsWith('--input='))
  const verboseFlag = args.includes('--verbose')
  const traceId = randomUUID()

  let inputState: Record<string, unknown> = {}
  if (inputArg) {
    try {
      inputState = JSON.parse(inputArg.split('=').slice(1).join('=')) as Record<string, unknown>
    } catch (err) {
      console.error(`${COLORS.red}✗${COLORS.reset} Invalid --input JSON: ${err}`)
      process.exit(1)
    }
  }

  const traceRecord: GraphTrace = {
    id: traceId,
    graphName: templateName,
    startedAt: new Date(),
    steps: [],
    status: 'running',
  }
  saveCheckpoint(traceRecord)
  appendEvent('daemon_action', 'lang-graph', { action: 'graph.start', graphName: templateName, traceId })

  const threadConfig = { configurable: { thread_id: traceId } }

  function onChunk(chunk: Record<string, unknown>): void {
    const node = Object.keys(chunk)[0] ?? 'unknown'
    const step: GraphStep = { node, timestamp: new Date(), durationMs: 0 }
    traceRecord.steps.push(step)
    saveCheckpoint(traceRecord)
    const mark = `${COLORS.green}→${COLORS.reset}`
    console.log(`  ${mark} ${COLORS.cyan}${node}${COLORS.reset}`)
    if (verboseFlag) {
      const stateChunk = (chunk as Record<string, Record<string, unknown>>)[node] ?? {}
      for (const [k, v] of Object.entries(stateChunk)) {
        if (typeof v === 'string' && v.length > 0) {
          console.log(`    ${COLORS.dim}${k}: ${v.slice(0, 100).replace(/\n/g, ' ')}${COLORS.reset}`)
        }
      }
    }
  }

  try {
    console.log(`\n${COLORS.bold}REX Graph${COLORS.reset} — ${templateName}`)
    console.log(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
    console.log(`  Trace: ${COLORS.dim}${traceId}${COLORS.reset}\n`)

    switch (templateName) {
      case 'scriptHelper': {
        const initial = { task: '', script: '', testOutput: '', attempts: 0, done: false, ...inputState }
        const g = scriptHelperGraph()
        for await (const chunk of await g.stream(initial, threadConfig)) {
          onChunk(chunk as Record<string, unknown>)
        }
        break
      }
      case 'codeReview': {
        const initial = { path: '', code: '', issues: [] as string[], fixes: '', done: false, ...inputState }
        if (!initial.path) {
          console.error(`${COLORS.red}✗${COLORS.reset} --input must include "path" for codeReview`)
          process.exit(1)
        }
        const g = codeReviewGraph()
        for await (const chunk of await g.stream(initial, threadConfig)) {
          onChunk(chunk as Record<string, unknown>)
        }
        break
      }
      case 'monitorCycle': {
        const initial = { metrics: {} as Record<string, unknown>, alerts: [] as string[], report: '', done: false, ...inputState }
        const g = monitorCycleGraph()
        for await (const chunk of await g.stream(initial, threadConfig)) {
          onChunk(chunk as Record<string, unknown>)
        }
        break
      }
      default:
        console.error(`${COLORS.red}✗${COLORS.reset} Unknown template: ${templateName}`)
        console.log(`Available: ${TEMPLATES.map(t => t.name).join(', ')}`)
        process.exit(1)
    }

    traceRecord.status = 'completed'
    traceRecord.completedAt = new Date()
    saveCheckpoint(traceRecord)
    appendEvent('daemon_action', 'lang-graph', {
      action: 'graph.complete',
      graphName: templateName,
      traceId,
      steps: traceRecord.steps.length,
    })
    console.log(`\n${COLORS.green}✓${COLORS.reset} Graph completed`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    traceRecord.status = 'failed'
    traceRecord.completedAt = new Date()
    traceRecord.error = msg
    saveCheckpoint(traceRecord)
    appendEvent('daemon_action', 'lang-graph', { action: 'graph.error', graphName: templateName, traceId, error: msg })
    console.error(`\n${COLORS.red}✗${COLORS.reset} Graph failed: ${msg}`)
    process.exit(1)
  }
}

export function cmdGraphList(jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify({ templates: TEMPLATES }, null, 2))
    return
  }

  console.log(`\n${COLORS.bold}REX Graph Templates${COLORS.reset}`)
  console.log(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
  for (const t of TEMPLATES) {
    console.log(`  ${COLORS.cyan}${t.name.padEnd(18)}${COLORS.reset} ${COLORS.dim}${t.description}${COLORS.reset}`)
  }
  console.log(`\n  Usage: ${COLORS.dim}rex graph run <template> [--input=<json>]${COLORS.reset}\n`)
}

export function cmdGraphStatus(args: string[]): void {
  const traceId = args.find(a => !a.startsWith('--'))
  const jsonMode = args.includes('--json')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

  if (traceId && traceId !== '--json') {
    const trace = loadCheckpoint(traceId)
    if (!trace) {
      console.error(`${COLORS.red}✗${COLORS.reset} Trace not found: ${traceId}`)
      process.exit(1)
    }
    if (jsonMode) {
      console.log(JSON.stringify(trace, null, 2))
    } else {
      printTrace(trace)
    }
    return
  }

  const traces = listCheckpoints().slice(0, limit)

  if (jsonMode) {
    console.log(JSON.stringify({ traces: traces.map(summarizeTrace) }, null, 2))
    return
  }

  if (traces.length === 0) {
    console.log(`${COLORS.dim}No graph traces found.${COLORS.reset}`)
    return
  }

  console.log(`\n${COLORS.bold}Recent Graph Traces${COLORS.reset} (${traces.length})\n`)
  console.log(`  ${'ID'.padEnd(38)} ${'Graph'.padEnd(14)} ${'Status'.padEnd(10)} Steps`)
  console.log(`  ${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`)

  for (const t of traces) {
    const statusColor = t.status === 'completed' ? COLORS.green
      : t.status === 'running' ? COLORS.cyan
      : COLORS.red
    const durMs = t.completedAt
      ? new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()
      : null
    const durStr = durMs !== null ? `${durMs}ms` : '—'
    console.log(
      `  ${COLORS.dim}${t.id.slice(0, 36)}${COLORS.reset}  ${t.graphName.padEnd(14)} ${statusColor}${t.status.padEnd(10)}${COLORS.reset} ${String(t.steps.length).padStart(5)}  ${COLORS.dim}${durStr}${COLORS.reset}`,
    )
  }
  console.log()
}

function summarizeTrace(t: GraphTrace): Record<string, unknown> {
  return {
    id: t.id,
    graphName: t.graphName,
    status: t.status,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    steps: t.steps.length,
    error: t.error,
  }
}

function printTrace(t: GraphTrace): void {
  const statusColor = t.status === 'completed' ? COLORS.green
    : t.status === 'running' ? COLORS.cyan
    : COLORS.red

  console.log(`\n${COLORS.bold}Graph Trace${COLORS.reset} — ${t.graphName}`)
  console.log(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
  console.log(`  ID:        ${COLORS.dim}${t.id}${COLORS.reset}`)
  console.log(`  Status:    ${statusColor}${t.status}${COLORS.reset}`)
  console.log(`  Started:   ${COLORS.dim}${new Date(t.startedAt).toLocaleString()}${COLORS.reset}`)
  if (t.completedAt) {
    const durMs = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()
    console.log(`  Completed: ${COLORS.dim}${new Date(t.completedAt).toLocaleString()} (${durMs}ms)${COLORS.reset}`)
  }
  if (t.error) {
    console.log(`  Error:     ${COLORS.red}${t.error}${COLORS.reset}`)
  }
  console.log(`\n  ${COLORS.bold}Steps${COLORS.reset} (${t.steps.length})\n`)
  for (let i = 0; i < t.steps.length; i++) {
    const step = t.steps[i]
    const ts = step.timestamp ? new Date(step.timestamp).toISOString().split('T')[1]?.slice(0, 12) : ''
    console.log(`  ${String(i + 1).padStart(3)}. ${COLORS.cyan}${step.node.padEnd(18)}${COLORS.reset}  ${COLORS.dim}${ts}  ${step.durationMs}ms${COLORS.reset}`)
  }
  console.log()
}

// ── Main CLI entry ─────────────────────────────────────────────

export async function graph(args: string[]): Promise<void> {
  const sub = args[0]

  switch (sub) {
    case 'run':
      await cmdGraphRun(args.slice(1))
      break
    case 'list':
      cmdGraphList(args.includes('--json'))
      break
    case 'status':
      cmdGraphStatus(args.slice(1))
      break
    default:
      console.log(`\n${COLORS.bold}rex graph${COLORS.reset} — LangGraph state machine runner (@langchain/langgraph)`)
      console.log(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
      console.log(`  rex graph list                    List available templates`)
      console.log(`  rex graph run <template>          Run a graph template`)
      console.log(`    --input=<json>                  Initial state (JSON)`)
      console.log(`    --verbose                       Stream step output`)
      console.log(`  rex graph status [traceId]        Show recent traces`)
      console.log(`    --json                          JSON output`)
      console.log(`    --limit=N                       Max traces to show`)
      console.log()
  }
}
