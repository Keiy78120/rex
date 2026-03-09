/**
 * REX Metrics — unified monitoring snapshot
 * Aggregates: burn rate, memory health, fleet nodes, ingest queue, system
 * JSON output for Grafana/external monitoring; prometheus text optional.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cpus, freemem, totalmem, uptime } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'

const log = createLogger('metrics')

export interface RexMetrics {
  timestamp: string
  system: {
    uptimeSec: number
    cpuCount: number
    ramTotalGb: number
    ramFreeGb: number
    ramUsedPct: number
  }
  memory: {
    pendingChunks: number
    dbSizeBytes: number
    lockfileActive: boolean
  }
  ingest: {
    pendingDir: string
    pendingCount: number
    lockActive: boolean
  }
  daemon: {
    pidFileExists: boolean
    logSizeBytes: number
  }
  hub: {
    reachable: boolean
    nodeCount: number
    healthyNodes: number
  }
  events: {
    totalEvents: number
    unackedEvents: number
  }
}

// ── System ──────────────────────────────────────────────────

function systemMetrics(): RexMetrics['system'] {
  const total = totalmem()
  const free = freemem()
  return {
    uptimeSec: Math.round(uptime()),
    cpuCount: cpus().length,
    ramTotalGb: +(total / (1024 ** 3)).toFixed(2),
    ramFreeGb: +(free / (1024 ** 3)).toFixed(2),
    ramUsedPct: +((1 - free / total) * 100).toFixed(1),
  }
}

// ── Memory (SQLite + pending) ────────────────────────────────

function memoryMetrics(): RexMetrics['memory'] {
  const memDir = join(REX_DIR, 'memory')
  const dbPath = join(memDir, 'rex.sqlite')
  const lockPath = join(memDir, 'ingest.lock')

  let dbSizeBytes = 0
  try { dbSizeBytes = statSync(dbPath).size } catch { /* no db yet */ }

  const pendingDir = join(memDir, 'pending')
  let pendingCount = 0
  try {
    if (existsSync(pendingDir)) {
      pendingCount = readdirSync(pendingDir).filter(f => f.endsWith('.json')).length
    }
  } catch { /* ok */ }

  const lockfileActive = existsSync(lockPath) && (() => {
    try {
      const st = statSync(lockPath)
      return (Date.now() - st.mtimeMs) < 10 * 60 * 1000
    } catch { return false }
  })()

  return { pendingChunks: pendingCount, dbSizeBytes, lockfileActive }
}

// ── Ingest ───────────────────────────────────────────────────

function ingestMetrics(): RexMetrics['ingest'] {
  const memDir = join(REX_DIR, 'memory')
  const pendingDir = join(memDir, 'pending')
  const lockPath = join(memDir, 'ingest.lock')

  let pendingCount = 0
  try {
    if (existsSync(pendingDir)) {
      pendingCount = readdirSync(pendingDir).filter(f => f.endsWith('.json')).length
    }
  } catch { /* ok */ }

  const lockActive = existsSync(lockPath) && (() => {
    try {
      const st = statSync(lockPath)
      return (Date.now() - st.mtimeMs) < 10 * 60 * 1000
    } catch { return false }
  })()

  return { pendingDir, pendingCount, lockActive }
}

// ── Daemon ───────────────────────────────────────────────────

function daemonMetrics(): RexMetrics['daemon'] {
  const pidPath = join(REX_DIR, 'daemon.pid')
  const pidFileExists = existsSync(pidPath)

  let logSizeBytes = 0
  try {
    const logPath = join(REX_DIR, 'daemon.log')
    if (existsSync(logPath)) logSizeBytes = statSync(logPath).size
  } catch { /* ok */ }

  return { pidFileExists, logSizeBytes }
}

// ── Hub ──────────────────────────────────────────────────────

async function hubMetrics(): Promise<RexMetrics['hub']> {
  const defaultResult = { reachable: false, nodeCount: 0, healthyNodes: 0 }
  try {
    const res = await fetch('http://localhost:7420/api/health', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return defaultResult
    const data = await res.json() as Record<string, unknown>
    const nodes = (data.nodes ?? []) as Array<{ status: string }>
    return {
      reachable: true,
      nodeCount: nodes.length,
      healthyNodes: nodes.filter(n => n.status === 'healthy').length,
    }
  } catch {
    return defaultResult
  }
}

// ── Event Journal ─────────────────────────────────────────────

function eventMetrics(): RexMetrics['events'] {
  try {
    const dbPath = join(REX_DIR, 'event-journal.sqlite')
    if (!existsSync(dbPath)) return { totalEvents: 0, unackedEvents: 0 }
    // Read journal count from file size estimation (avoid DB dependency)
    const size = statSync(dbPath).size
    return {
      totalEvents: Math.round(size / 200), // rough estimate: ~200 bytes/event
      unackedEvents: 0, // would need DB query
    }
  } catch {
    return { totalEvents: 0, unackedEvents: 0 }
  }
}

// ── Main collect ─────────────────────────────────────────────

export async function collectMetrics(): Promise<RexMetrics> {
  const [hubM] = await Promise.all([hubMetrics()])

  return {
    timestamp: new Date().toISOString(),
    system: systemMetrics(),
    memory: memoryMetrics(),
    ingest: ingestMetrics(),
    daemon: daemonMetrics(),
    hub: hubM,
    events: eventMetrics(),
  }
}

// ── Prometheus text format ────────────────────────────────────

export function toPrometheus(m: RexMetrics): string {
  const lines: string[] = [
    `# HELP rex_system_uptime_seconds Node uptime in seconds`,
    `# TYPE rex_system_uptime_seconds gauge`,
    `rex_system_uptime_seconds ${m.system.uptimeSec}`,
    `# HELP rex_system_ram_used_pct RAM used percentage`,
    `# TYPE rex_system_ram_used_pct gauge`,
    `rex_system_ram_used_pct ${m.system.ramUsedPct}`,
    `# HELP rex_ingest_pending_chunks Pending memory chunks to embed`,
    `# TYPE rex_ingest_pending_chunks gauge`,
    `rex_ingest_pending_chunks ${m.ingest.pendingCount}`,
    `# HELP rex_hub_reachable Hub API reachable (0/1)`,
    `# TYPE rex_hub_reachable gauge`,
    `rex_hub_reachable ${m.hub.reachable ? 1 : 0}`,
    `# HELP rex_hub_nodes_total Total registered nodes`,
    `# TYPE rex_hub_nodes_total gauge`,
    `rex_hub_nodes_total ${m.hub.nodeCount}`,
    `# HELP rex_hub_nodes_healthy Healthy registered nodes`,
    `# TYPE rex_hub_nodes_healthy gauge`,
    `rex_hub_nodes_healthy ${m.hub.healthyNodes}`,
    `# HELP rex_memory_db_bytes SQLite memory DB size in bytes`,
    `# TYPE rex_memory_db_bytes gauge`,
    `rex_memory_db_bytes ${m.memory.dbSizeBytes}`,
  ]
  return lines.join('\n') + '\n'
}

// ── CLI display ───────────────────────────────────────────────

export function printMetrics(m: RexMetrics): void {
  const BOLD = '\x1b[1m', RESET = '\x1b[0m', DIM = '\x1b[2m'
  const GREEN = '\x1b[32m', RED = '\x1b[31m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m'

  const ok = (v: boolean) => v ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`
  const gb = (b: number) => `${(b / (1024 ** 3)).toFixed(2)} GB`

  console.log()
  console.log(`${BOLD}REX Metrics${RESET}  ${DIM}${m.timestamp}${RESET}`)
  console.log(DIM + '─'.repeat(48) + RESET)

  console.log(`\n  ${BOLD}System${RESET}`)
  console.log(`    Uptime:    ${Math.round(m.system.uptimeSec / 60)} min`)
  console.log(`    CPUs:      ${m.system.cpuCount}`)
  console.log(`    RAM:       ${m.system.ramUsedPct}% used (${gb(m.memory.dbSizeBytes || 0)} db)`)

  console.log(`\n  ${BOLD}Ingest${RESET}`)
  const pendingColor = m.ingest.pendingCount > 100 ? YELLOW : GREEN
  console.log(`    Pending:   ${pendingColor}${m.ingest.pendingCount} chunks${RESET}`)
  console.log(`    Lock:      ${m.ingest.lockActive ? `${CYAN}active${RESET}` : DIM + 'idle' + RESET}`)

  console.log(`\n  ${BOLD}Daemon${RESET}`)
  console.log(`    PID file:  ${ok(m.daemon.pidFileExists)}`)
  console.log(`    Log size:  ${(m.daemon.logSizeBytes / 1024).toFixed(1)} KB`)

  console.log(`\n  ${BOLD}Hub${RESET}`)
  console.log(`    Reachable: ${ok(m.hub.reachable)}`)
  console.log(`    Nodes:     ${m.hub.healthyNodes}/${m.hub.nodeCount} healthy`)

  console.log()
}
