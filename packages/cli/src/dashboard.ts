/**
 * REX HQ Dashboard — Real-time aggregate view of all REX modules
 *
 * Aggregates data from Fleet, Budget, Memory, Agents, Curious, and Gateway
 * into a single snapshot. Used by `rex status` and the Flutter HQ page.
 *
 * Rules:
 *  §22 Token Economy — Promise.all for all reads, 0 LLM
 *  §23 REX uses REX  — all sub-calls are CLI/script, never direct SDK
 *
 * @module HQ
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'

const log = createLogger('HQ:dashboard')

// ── Types ────────────────────────────────────────────────────────────────

export interface FleetSummary {
  totalNodes: number
  healthy: number
  stale: number
  offline: number
  commanderRunning: boolean
}

export interface BudgetSummary {
  dailyTokens: number
  sessionTokens: number
  burnRatePerHour: number
  ctxPercent: number
  dailyPercent: number
}

export interface MemorySummary {
  totalMemories: number
  pendingChunks: number
  embeddingPercent: number
  lastIngestAt: string | null
}

export interface AgentProfile {
  name: string
  model: string
  profile: string
  running: boolean
}

export interface AgentSummary {
  activeSessions: number
  profiles: AgentProfile[]
  lastLaunchedAt: string | null
}

export interface CuriousSummary {
  lastRunAt: string | null
  newDiscoveries: number
  queuedProblems: number
}

export interface AlertEntry {
  level: 'warn' | 'critical'
  source: string
  message: string
}

export interface ClientSummaryEntry {
  id: string
  name: string
  trade: string
  plan: string
  status: string
}

export interface ClientsSummary {
  total: number
  active: number
  paused: number
  provisioning: number
  clients: ClientSummaryEntry[]
}

export interface HQSnapshot {
  capturedAt: string
  fleet: FleetSummary
  budget: BudgetSummary
  memory: MemorySummary
  agents: AgentSummary
  curious: CuriousSummary
  clients: ClientsSummary
  alerts: AlertEntry[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function runRex(args: string[]): unknown {
  const r = spawnSync('rex', args, { encoding: 'utf-8', timeout: 8000 })
  if (r.status !== 0 || !r.stdout?.trim()) return null
  try { return JSON.parse(r.stdout) } catch { return null }
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch { return null }
}

// ── Fleet ────────────────────────────────────────────────────────────────

async function getFleet(): Promise<FleetSummary> {
  const raw = runRex(['hub', 'status', '--json']) as Record<string, unknown> | null
  if (!raw) {
    return { totalNodes: 0, healthy: 0, stale: 0, offline: 0, commanderRunning: false }
  }
  return {
    totalNodes: (raw.nodesCount as number) ?? 0,
    healthy: (raw.healthy as number) ?? 0,
    stale: (raw.stale as number) ?? 0,
    offline: (raw.offline as number) ?? 0,
    commanderRunning: (raw.running as boolean) ?? false,
  }
}

// ── Budget ───────────────────────────────────────────────────────────────

async function getBudget(): Promise<BudgetSummary> {
  // burn-rate --json returns: burnRatePerHour, dailyTotal, dailyPercent, contextPercent, sessionTotal
  const raw = runRex(['burn-rate', '--json']) as Record<string, unknown> | null
  if (!raw) {
    return { dailyTokens: 0, sessionTokens: 0, burnRatePerHour: 0, ctxPercent: 0, dailyPercent: 0 }
  }
  return {
    dailyTokens: (raw.dailyTotal as number) ?? 0,
    sessionTokens: (raw.sessionTotal as number) ?? 0,
    burnRatePerHour: (raw.burnRatePerHour as number) ?? 0,
    ctxPercent: (raw.contextPercent as number) ?? 0,   // burn-rate uses contextPercent
    dailyPercent: (raw.dailyPercent as number) ?? 0,
  }
}

// ── Memory ───────────────────────────────────────────────────────────────

async function getMemory(): Promise<MemorySummary> {
  const raw = runRex(['memory-check', '--json']) as Record<string, unknown> | null
  if (!raw) {
    return { totalMemories: 0, pendingChunks: 0, embeddingPercent: 0, lastIngestAt: null }
  }
  const total = (raw.totalMemories as number) ?? 0
  const embedded = (raw.embeddedCount as number) ?? 0
  return {
    totalMemories: total,
    pendingChunks: (raw.pendingChunks as number) ?? 0,
    embeddingPercent: total > 0 ? Math.round((embedded / total) * 100) : 0,
    lastIngestAt: (raw.lastIngestAt as string) ?? null,
  }
}

// ── Agents ───────────────────────────────────────────────────────────────

async function getAgents(): Promise<AgentSummary> {
  const recoveryPath = join(REX_DIR, 'recovery-state.json')
  const recovery = readJson<{ launchedAt?: string; profile?: string }>(recoveryPath)

  // Count running claude processes via pgrep
  const r = spawnSync('pgrep', ['-c', '-f', 'claude'], { encoding: 'utf-8' })
  const activeSessions = r.status === 0 ? Math.max(0, parseInt(r.stdout.trim()) - 1) : 0

  // Get agent profiles from rex agents list --json
  let profiles: AgentProfile[] = []
  const agentsRaw = runRex(['agents', 'list', '--json']) as Record<string, unknown> | null
  if (agentsRaw) {
    const rows = (agentsRaw.agents as unknown[]) ?? []
    profiles = rows
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .filter(a => a.running === true || a.enabled === true)
      .map(a => ({
        name: (a.name as string) ?? 'agent',
        model: (a.model as string) ?? 'unknown',
        profile: (a.profile as string) ?? '',
        running: (a.running as boolean) ?? false,
      }))
  }

  return {
    activeSessions,
    profiles,
    lastLaunchedAt: recovery?.launchedAt ?? null,
  }
}

// ── Curious ──────────────────────────────────────────────────────────────

async function getCurious(): Promise<CuriousSummary> {
  const cachePath = join(REX_DIR, 'curious-cache.json')
  const cache = readJson<{ lastRun?: string; discoveries?: unknown[] }>(cachePath)

  const journalPath = join(REX_DIR, 'curious.log')
  let queuedProblems = 0
  try {
    if (existsSync(journalPath)) {
      const lines = readFileSync(journalPath, 'utf-8').split('\n').filter(Boolean)
      queuedProblems = lines.filter(l => l.includes('"status":"pending"')).length
    }
  } catch {}

  const discoveries = Array.isArray(cache?.discoveries) ? cache.discoveries : []
  const newDiscoveries = discoveries.filter((d: unknown) => (d as Record<string, unknown>)?.isNew === true).length

  return {
    lastRunAt: cache?.lastRun ?? null,
    newDiscoveries,
    queuedProblems,
  }
}

// ── Clients ───────────────────────────────────────────────────────────────

async function getClients(): Promise<ClientsSummary> {
  const indexPath = join(REX_DIR, 'clients', 'index.json')
  const list = readJson<Array<Record<string, unknown>>>(indexPath) ?? []
  const visible = list.filter(c => c['status'] !== 'removed')
  const active       = visible.filter(c => c['status'] === 'active').length
  const paused       = visible.filter(c => c['status'] === 'paused').length
  const provisioning = visible.filter(c => c['status'] === 'provisioning').length
  return {
    total: visible.length,
    active,
    paused,
    provisioning,
    clients: visible.map(c => ({
      id:     (c['id']    as string) ?? '',
      name:   (c['name']  as string) ?? '',
      trade:  (c['trade'] as string) ?? '',
      plan:   (c['plan']  as string) ?? '',
      status: (c['status'] as string) ?? '',
    })),
  }
}

// ── Alerts ───────────────────────────────────────────────────────────────

function buildAlerts(
  fleet: FleetSummary,
  budget: BudgetSummary,
  memory: MemorySummary,
): AlertEntry[] {
  const alerts: AlertEntry[] = []

  if (fleet.offline > 0) {
    alerts.push({ level: 'warn', source: 'FLEET', message: `${fleet.offline} node(s) offline` })
  }
  if (budget.ctxPercent >= 80) {
    alerts.push({ level: 'warn', source: 'BUDGET', message: `Context at ${budget.ctxPercent}% — compact soon` })
  }
  if (budget.ctxPercent >= 95) {
    alerts.push({ level: 'critical', source: 'BUDGET', message: `Context at ${budget.ctxPercent}% — compact now` })
  }
  if (memory.pendingChunks > 100) {
    alerts.push({ level: 'warn', source: 'MEMORY', message: `${memory.pendingChunks} chunks pending embed` })
  }

  return alerts
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Build a full HQ snapshot from all modules in parallel.
 * Zero LLM — all data from scripts/files.
 */
export async function getHQSnapshot(): Promise<HQSnapshot> {
  log.debug('building HQ snapshot')

  const [fleet, budget, memory, agents, curious, clients] = await Promise.all([
    getFleet(),
    getBudget(),
    getMemory(),
    getAgents(),
    getCurious(),
    getClients(),
  ])

  const alerts = buildAlerts(fleet, budget, memory)

  return {
    capturedAt: new Date().toISOString(),
    fleet,
    budget,
    memory,
    agents,
    curious,
    clients,
    alerts,
  }
}

/**
 * Print a compact HQ status to stdout.
 */
export async function printHQStatus(): Promise<void> {
  const snap = await getHQSnapshot()
  const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m'

  const dot = (ok: boolean) => ok ? `${G}●${RST}` : `${DIM}○${RST}`

  console.log(`\n${BOLD}REX HQ${RST}  ${DIM}${snap.capturedAt}${RST}`)

  // Fleet
  const f = snap.fleet
  console.log(`\n  ${BOLD}FLEET${RST}   Commander ${dot(f.commanderRunning)}  Nodes ${G}${f.healthy}✓${RST} ${f.stale > 0 ? `${Y}${f.stale}⚠${RST} ` : ''}${f.offline > 0 ? `${R}${f.offline}✗${RST}` : ''}`)

  // Budget
  const b = snap.budget
  const ctxColor = b.ctxPercent >= 80 ? R : b.ctxPercent >= 60 ? Y : G
  console.log(`  ${BOLD}BUDGET${RST}  Ctx ${ctxColor}${b.ctxPercent}%${RST}  Daily ${b.dailyPercent}%  Burn ${b.burnRatePerHour.toFixed(0)}/h`)

  // Memory
  const m = snap.memory
  console.log(`  ${BOLD}MEMORY${RST}  ${m.totalMemories} chunks  ${m.embeddingPercent}% embedded  ${m.pendingChunks > 0 ? `${Y}${m.pendingChunks} pending${RST}` : `${G}queue clean${RST}`}`)

  // Curious
  const c = snap.curious
  console.log(`  ${BOLD}CURIOUS${RST} ${c.newDiscoveries} new discoveries`)

  // Clients
  const cl = snap.clients
  if (cl.total > 0) {
    const clLine = [
      cl.active > 0       ? `${G}${cl.active} active${RST}` : '',
      cl.paused > 0       ? `${DIM}${cl.paused} paused${RST}` : '',
      cl.provisioning > 0 ? `${Y}${cl.provisioning} provisioning${RST}` : '',
    ].filter(Boolean).join('  ')
    console.log(`  ${BOLD}CLIENTS${RST} ${cl.total} total  ${clLine}`)
  }

  // Alerts
  if (snap.alerts.length > 0) {
    console.log(`\n  ${BOLD}Alerts${RST}`)
    for (const a of snap.alerts) {
      const icon = a.level === 'critical' ? `${R}✗${RST}` : `${Y}!${RST}`
      console.log(`    ${icon} [${a.source}] ${a.message}`)
    }
  }
  console.log()
}
