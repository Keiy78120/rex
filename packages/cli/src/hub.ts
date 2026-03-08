import { createServer, get as httpGet, IncomingMessage, ServerResponse, Server } from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { REX_DIR, PENDING_DIR, MEMORY_DB_PATH, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'
import { getInventoryCache } from './inventory.js'
import { getEventLog, appendEvent, getUnacked, ackEvent, getQueueStats } from './sync-queue.js'
import type { EventType } from './sync-queue.js'
import { getMeshStatus } from './node-mesh.js'

const log = createLogger('hub')

const NODES_PATH = join(REX_DIR, 'hub-nodes.json')
const DEFAULT_PORT = 7420
const VERSION = '7.0.0'

// ── Auth ───────────────────────────────────────────────

function loadHubToken(): string | null {
  if (process.env.REX_HUB_TOKEN) return process.env.REX_HUB_TOKEN
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.env?.REX_HUB_TOKEN ?? null
    }
  } catch {}
  return null
}

/** Generate a cryptographically secure 64-char hex token for hub auth. */
export function generateHubToken(): string {
  return randomBytes(32).toString('hex')
}

const HUB_TOKEN = loadHubToken()
const CORS_ORIGIN = process.env.REX_HUB_CORS_ORIGIN ?? 'http://localhost:7420'

if (!HUB_TOKEN) {
  log.warn('REX_HUB_TOKEN not set — hub is open (set REX_HUB_TOKEN to secure)')
}

// ── Node registry ──────────────────────────────────────

interface NodeInfo {
  id: string
  hostname: string
  platform: string
  ip: string
  capabilities: string[]
  lastSeen: string
  registeredAt: string
}

const nodes = new Map<string, NodeInfo>()
let flushInterval: ReturnType<typeof setInterval> | null = null
let server: Server | null = null
const startTime = Date.now()

function loadNodes(): void {
  if (!existsSync(NODES_PATH)) return
  try {
    const data = JSON.parse(readFileSync(NODES_PATH, 'utf-8')) as NodeInfo[]
    for (const n of data) nodes.set(n.id, n)
    log.info(`Loaded ${nodes.size} nodes from disk`)
  } catch {
    log.warn('Failed to load nodes file, starting fresh')
  }
}

function flushNodes(): void {
  try {
    ensureRexDirs()
    writeFileSync(NODES_PATH, JSON.stringify([...nodes.values()], null, 2))
  } catch (err) {
    log.error(`Failed to flush nodes: ${err}`)
  }
}

function generateId(): string {
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── HTTP helpers ───────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown, meta?: Record<string, unknown>): void {
  const body = JSON.stringify({ data, meta: meta ?? {}, error: null })
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN })
  res.end(body)
}

function sendError(res: ServerResponse, statusCode: number, code: string, message: string): void {
  const body = JSON.stringify({ data: null, meta: {}, error: { code, message } })
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': CORS_ORIGIN })
  res.end(body)
}

// ── Router ─────────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void> | void

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: Handler
}

const routes: Route[] = []

function addRoute(method: string, path: string, handler: Handler): void {
  const paramNames: string[] = []
  const pattern = new RegExp(
    '^' + path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    }) + '$'
  )
  routes.push({ method, pattern, paramNames, handler })
}

function matchRoute(url: string, method: string): { handler: Handler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue
    const match = url.match(route.pattern)
    if (match) {
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1] })
      return { handler: route.handler, params }
    }
  }
  return null
}

// ── Route handlers ─────────────────────────────────────

addRoute('GET', '/api/health', (_req, res) => {
  sendJson(res, 200, {
    status: 'running',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    nodeCount: nodes.size,
    version: VERSION,
  })
})

addRoute('GET', '/api/nodes', (_req, res) => {
  const list = [...nodes.values()]
  sendJson(res, 200, list, { total: list.length })
})

addRoute('POST', '/api/nodes/register', async (req, res) => {
  const body = await parseBody(req)
  const hostname = body.hostname as string | undefined
  const platform = body.platform as string | undefined
  const ip = body.ip as string | undefined
  const capabilities = (body.capabilities as string[]) ?? []

  if (!hostname || !platform || !ip) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'hostname, platform, and ip are required')
  }

  const id = (body.id as string) || generateId()
  const now = new Date().toISOString()
  const existing = nodes.get(id)

  const node: NodeInfo = {
    id,
    hostname,
    platform,
    ip,
    capabilities,
    lastSeen: now,
    registeredAt: existing?.registeredAt ?? now,
  }
  nodes.set(id, node)
  log.info(`Node registered: ${id} (${hostname})`)
  sendJson(res, 201, node)
})

addRoute('POST', '/api/nodes/:id/heartbeat', (_req, res, params) => {
  const node = nodes.get(params.id)
  if (!node) {
    return sendError(res, 404, 'NOT_FOUND', `Node ${params.id} not found`)
  }
  node.lastSeen = new Date().toISOString()
  sendJson(res, 200, { acked: true })
})

// ── Node health aggregation ────────────────────────────

const STALE_MS = 5 * 60 * 1000   // 5 min → stale
const OFFLINE_MS = 30 * 60 * 1000 // 30 min → offline

addRoute('GET', '/api/nodes/status', (_req, res) => {
  const status = getMeshStatus(nodes as unknown as Map<string, import('./node-mesh.js').MeshNode>)
  sendJson(res, 200, status, { total: status.nodes.length })
})

addRoute('GET', '/api/v1/nodes/health', (_req, res) => {
  const now = Date.now()
  const health = [...nodes.values()].map(n => {
    const lastSeenMs = n.lastSeen ? now - new Date(n.lastSeen).getTime() : Infinity
    const status = lastSeenMs < STALE_MS ? 'healthy' : lastSeenMs < OFFLINE_MS ? 'stale' : 'offline'
    return {
      id: n.id,
      hostname: n.hostname,
      platform: n.platform,
      ip: n.ip,
      capabilities: n.capabilities,
      lastSeenSec: isFinite(lastSeenMs) ? Math.floor(lastSeenMs / 1000) : null,
      status,
    }
  })
  const counts = { healthy: 0, stale: 0, offline: 0 }
  for (const n of health) counts[n.status as keyof typeof counts]++
  sendJson(res, 200, health, { total: health.length, ...counts })
})

addRoute('GET', '/api/events', (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const events = getEventLog(limit, offset)
  sendJson(res, 200, events, { limit, offset })
})

addRoute('POST', '/api/events', async (req, res) => {
  const body = await parseBody(req)
  const type = body.type as EventType | undefined
  const payload = body.payload
  const source = body.source as string | undefined

  if (!type || payload === undefined) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'type and payload are required')
  }

  const id = appendEvent(type, payload, source)
  if (id < 0) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to append event')
  }
  sendJson(res, 201, { id })
})

addRoute('GET', '/api/events/unacked', (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const events = getUnacked(limit)
  sendJson(res, 200, events, { total: events.length })
})

addRoute('POST', '/api/events/:id/ack', (_req, res, params) => {
  const eventId = parseInt(params.id, 10)
  if (isNaN(eventId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid event ID')
  }
  const success = ackEvent(eventId)
  if (!success) {
    return sendError(res, 404, 'NOT_FOUND', `Event ${eventId} not found`)
  }
  sendJson(res, 200, { acked: true })
})

addRoute('GET', '/api/inventory', (_req, res) => {
  const cache = getInventoryCache()
  if (!cache) {
    return sendError(res, 404, 'NOT_FOUND', 'Inventory not available. Run rex inventory first.')
  }
  sendJson(res, 200, cache)
})

addRoute('GET', '/api/stats', (_req, res) => {
  const queueStats = getQueueStats()
  sendJson(res, 200, { ...queueStats, nodeCount: nodes.size })
})

// ── Tasks endpoints ───────────────────────────────────

addRoute('GET', '/api/v1/tasks', (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const events = getEventLog(limit + offset, 0)
    .filter(e => e.type === 'task.delegated' || e.type === 'task.completed')
  const sliced = events.slice(offset, offset + limit)
  sendJson(res, 200, sliced, { total: events.length, limit, offset })
})

addRoute('POST', '/api/v1/tasks', async (req, res) => {
  const body = await parseBody(req)
  if (!body.payload) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'payload is required')
  }
  const id = appendEvent('task.delegated', body.payload, body.source as string | undefined)
  if (id < 0) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create task event')
  }
  sendJson(res, 201, { id })
})

// ── Node actions ──────────────────────────────────────

addRoute('POST', '/api/v1/nodes/:id/wake', (_req, res, params) => {
  const node = nodes.get(params.id)
  if (!node) {
    return sendError(res, 404, 'NOT_FOUND', `Node ${params.id} not found`)
  }

  // Try to extract MAC from capabilities (format: "mac:XX:XX:XX:XX:XX:XX")
  const macEntry = node.capabilities.find(c => c.startsWith('mac:'))
  const mac = macEntry?.slice(4)
  if (!mac) {
    return sendError(res, 400, 'VALIDATION_ERROR', `Node ${params.id} has no MAC address in capabilities`)
  }

  // Try wakeonlan first, fallback to etherwake
  execFile('wakeonlan', [mac], (err) => {
    if (err) {
      execFile('etherwake', [mac], (err2) => {
        if (err2) {
          log.error(`WOL failed for ${params.id}: ${err2.message}`)
          return sendError(res, 500, 'WOL_FAILED', `Wake-on-LAN failed: ${err2.message}`)
        }
        log.info(`WOL sent to ${params.id} via etherwake (${mac})`)
        sendJson(res, 200, { sent: true, mac, tool: 'etherwake' })
      })
      return
    }
    log.info(`WOL sent to ${params.id} via wakeonlan (${mac})`)
    sendJson(res, 200, { sent: true, mac, tool: 'wakeonlan' })
  })
})

addRoute('POST', '/api/v1/nodes/:id/doctor', (_req, res, params) => {
  const node = nodes.get(params.id)
  if (!node) {
    return sendError(res, 404, 'NOT_FOUND', `Node ${params.id} not found`)
  }
  const id = appendEvent('daemon.job', { action: 'doctor', nodeId: params.id })
  if (id < 0) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create doctor event')
  }
  log.info(`Doctor job queued for node ${params.id}`)
  sendJson(res, 201, { eventId: id, nodeId: params.id, action: 'doctor' })
})

// ── Memory pending ────────────────────────────────────

addRoute('GET', '/api/v1/memory/pending', (_req, res) => {
  try {
    const files = existsSync(PENDING_DIR) ? readdirSync(PENDING_DIR) : []
    sendJson(res, 200, { count: files.length, directory: PENDING_DIR })
  } catch (err) {
    log.error(`Failed to read pending dir: ${err}`)
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to read pending directory')
  }
})

// Memory stats: total, pending, by category
addRoute('GET', '/api/v1/memory', (_req, res) => {
  try {
    const pendingFiles = existsSync(PENDING_DIR) ? readdirSync(PENDING_DIR) : []
    let total = 0
    const byCategory: Record<string, number> = {}
    if (existsSync(MEMORY_DB_PATH)) {
      try {
        // Read-only sync — no dynamic import needed, use spawn to avoid ESM issues
        const out = execFileSync('sqlite3', [MEMORY_DB_PATH, '-json',
          'SELECT category, COUNT(*) as c FROM memories GROUP BY category;'
        ], { encoding: 'utf-8', timeout: 3000 })
        const rows = JSON.parse(out) as Array<{ category: string; c: number }>
        for (const r of rows) { byCategory[r.category] = r.c; total += r.c }
      } catch { /* sqlite3 CLI unavailable, return pending only */ }
    }
    sendJson(res, 200, { total, pendingCount: pendingFiles.length, byCategory })
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message?.slice(0, 100) ?? 'Memory stats failed')
  }
})

// Events list with limit (alias for /api/events, supports /api/v1/events?limit=N)
addRoute('GET', '/api/v1/events', (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  try {
    const events = getEventLog(limit, offset)
    sendJson(res, 200, { events, total: events.length })
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message?.slice(0, 100) ?? 'Events failed')
  }
})

// Queue stats
addRoute('GET', '/api/v1/queue/stats', (_req, res) => {
  try {
    const stats = getQueueStats()
    sendJson(res, 200, stats)
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message?.slice(0, 100) ?? 'Queue stats failed')
  }
})

addRoute('GET', '/api/v1/monitor', async (_req, res) => {
  try {
    const { getDevStatus } = await import('./dev-monitor.js')
    const report = await getDevStatus()
    sendJson(res, 200, report)
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message?.slice(0, 100) ?? 'Monitor failed')
  }
})

// ── Web Dashboard ──────────────────────────────────────

function buildDashboardHtml(): string {
  const port = parseInt(process.env.REX_HUB_PORT ?? String(DEFAULT_PORT), 10)
  const token = HUB_TOKEN ? `?token=${HUB_TOKEN}` : ''
  const apiBase = `/api`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REX Dashboard</title>
  <style>
    :root { --bg: #1c1c24; --surface: #26262f; --card: #2e2e3a; --accent: #e5484d; --text: #f0f0f5; --dim: #8888a0; --green: #4caf50; --yellow: #ffb347; --red: #e5484d; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'SF Mono', monospace; font-size: 14px; }
    .header { background: var(--surface); border-bottom: 1px solid #333; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    .logo { width: 32px; height: 32px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
    .header h1 { font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
    .header .status { margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--dim); font-size: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 20px 24px; }
    .card { background: var(--card); border-radius: 10px; padding: 16px; border: 1px solid rgba(255,255,255,0.06); }
    .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--dim); margin-bottom: 12px; }
    .stat { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--dim); }
    .stat-value { font-weight: 600; font-family: 'SF Mono', monospace; }
    .repo-bar { margin: 6px 0; }
    .repo-name { font-size: 12px; color: var(--dim); margin-bottom: 2px; }
    .repo-row { display: flex; align-items: center; gap: 8px; }
    .bar { height: 6px; background: var(--accent); border-radius: 3px; min-width: 4px; }
    .bar-label { font-size: 11px; color: var(--dim); }
    .badge { display: inline-block; background: rgba(229,72,77,0.15); color: var(--accent); padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .loading { color: var(--dim); text-align: center; padding: 20px; }
    .err { color: var(--red); font-size: 12px; }
    .memory-list { max-height: 200px; overflow-y: auto; }
    .memory-item { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; color: var(--dim); }
    .memory-item:last-child { border-bottom: none; }
    .category { display: inline-block; background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-right: 4px; }
    .refresh-btn { background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-left: auto; }
    .refresh-btn:hover { opacity: 0.85; }
    .footer { text-align: center; padding: 16px; color: var(--dim); font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">R</div>
    <h1>REX Dashboard</h1>
    <div class="status">
      <div class="dot" id="status-dot"></div>
      <span id="status-text">Connecting…</span>
      <button class="refresh-btn" onclick="loadAll()">Refresh</button>
    </div>
  </div>

  <div class="grid">
    <div class="card" id="health-card">
      <h2>Health</h2>
      <div class="loading">Loading…</div>
    </div>
    <div class="card" id="monitor-card">
      <h2>Dev Activity (24h)</h2>
      <div class="loading">Loading…</div>
    </div>
    <div class="card" id="memory-card">
      <h2>Memory</h2>
      <div class="loading">Loading…</div>
    </div>
    <div class="card" id="nodes-card">
      <h2>Nodes</h2>
      <div class="loading">Loading…</div>
    </div>
    <div class="card" id="events-card">
      <h2>Recent Events</h2>
      <div class="loading">Loading…</div>
    </div>
    <div class="card" id="queue-card">
      <h2>Sync Queue</h2>
      <div class="loading">Loading…</div>
    </div>
  </div>

  <div class="footer">REX Hub · port ${port} · <span id="last-refresh">never</span></div>

  <script>
    const BASE = '${apiBase}';
    const HEADERS = {};

    async function get(path) {
      const r = await fetch(BASE + path, { headers: HEADERS });
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.json();
    }

    function stat(label, value) {
      return '<div class="stat"><span class="stat-label">' + label + '</span><span class="stat-value">' + value + '</span></div>';
    }

    async function loadHealth() {
      const card = document.getElementById('health-card');
      try {
        const d = await get('/health');
        const dot = document.getElementById('status-dot');
        const txt = document.getElementById('status-text');
        dot.style.background = d.status === 'healthy' ? '#4caf50' : '#ffb347';
        txt.textContent = d.status.toUpperCase();
        card.innerHTML = '<h2>Health</h2>' +
          stat('Status', '<span class="badge">' + d.status + '</span>') +
          stat('Version', d.version ?? '—') +
          stat('Node', d.hostname ?? '—') +
          stat('Uptime', d.uptime ? Math.floor(d.uptime / 60) + 'm' : '—');
      } catch(e) { card.innerHTML = '<h2>Health</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadMonitor() {
      const card = document.getElementById('monitor-card');
      try {
        const d = await get('/v1/monitor');
        let html = '<h2>Dev Activity (24h)</h2>' +
          stat('Commits', d.totalCommits) +
          stat('Sessions', d.sessionCount) +
          stat('Pending memories', d.pendingMemories);
        if (d.commits && d.commits.length > 0) {
          html += '<div style="margin-top:10px">';
          const max = Math.max(...d.commits.slice(0,5).map(c => c.count));
          d.commits.slice(0,5).forEach(c => {
            const w = Math.max(8, Math.round((c.count / max) * 120));
            html += '<div class="repo-bar"><div class="repo-name">' + c.repo + '</div>' +
              '<div class="repo-row"><div class="bar" style="width:' + w + 'px"></div><span class="bar-label">' + c.count + 'c — ' + c.lastMessage.slice(0,45) + '</span></div></div>';
          });
          html += '</div>';
        }
        card.innerHTML = html;
      } catch(e) { card.innerHTML = '<h2>Dev Activity</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadMemory() {
      const card = document.getElementById('memory-card');
      try {
        const d = await get('/v1/memory');
        let html = '<h2>Memory</h2>' +
          stat('Total', d.total) +
          stat('Pending', d.pendingCount);
        if (d.byCategory) {
          html += '<div style="margin-top:10px">';
          Object.entries(d.byCategory).slice(0,6).forEach(([k,v]) => {
            html += stat('<span class="category">' + k + '</span>', v);
          });
          html += '</div>';
        }
        card.innerHTML = html;
      } catch(e) { card.innerHTML = '<h2>Memory</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadNodes() {
      const card = document.getElementById('nodes-card');
      try {
        const d = await get('/nodes');
        const nodes = d.data?.nodes ?? d.nodes ?? [];
        let html = '<h2>Nodes</h2>' + stat('Total', nodes.length);
        nodes.slice(0,5).forEach(n => {
          const online = n.lastSeen && (Date.now() - new Date(n.lastSeen).getTime()) < 120000;
          html += stat(n.hostname ?? n.id, '<span style="color:' + (online ? '#4caf50' : '#888') + '">' + (online ? '● online' : '○ offline') + '</span>');
        });
        if (nodes.length === 0) html += '<div style="color:var(--dim);padding:8px 0;font-size:12px">No nodes registered</div>';
        card.innerHTML = html;
      } catch(e) { card.innerHTML = '<h2>Nodes</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadEvents() {
      const card = document.getElementById('events-card');
      try {
        const d = await get('/v1/events?limit=6');
        const events = d.data?.events ?? d.events ?? [];
        let html = '<h2>Recent Events</h2>';
        if (events.length === 0) {
          html += '<div style="color:var(--dim);padding:8px 0;font-size:12px">No events yet</div>';
        } else {
          events.slice(0,6).forEach(ev => {
            const ts = new Date(ev.ts ?? ev.timestamp ?? ev.created_at).toLocaleTimeString();
            html += '<div class="memory-item"><span class="category">' + (ev.type ?? 'event') + '</span>' + ts + ' — ' + (ev.source ?? '') + '</div>';
          });
        }
        card.innerHTML = html;
      } catch(e) { card.innerHTML = '<h2>Recent Events</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadQueue() {
      const card = document.getElementById('queue-card');
      try {
        const d = await get('/v1/queue/stats');
        const s = d.data ?? d;
        card.innerHTML = '<h2>Sync Queue</h2>' +
          stat('Total events', s.total ?? '—') +
          stat('Unacked', s.unacked ?? '—') +
          stat('Acked', s.acked ?? '—');
      } catch(e) { card.innerHTML = '<h2>Sync Queue</h2><div class="err">' + e.message + '</div>'; }
    }

    async function loadAll() {
      document.getElementById('last-refresh').textContent = new Date().toLocaleTimeString();
      await Promise.allSettled([loadHealth(), loadMonitor(), loadMemory(), loadNodes(), loadEvents(), loadQueue()]);
    }

    loadAll();
    setInterval(loadAll, 30000); // auto-refresh every 30s
  </script>
</body>
</html>`
}

// ── Server lifecycle ───────────────────────────────────

export async function startHub(port?: number): Promise<void> {
  const listenPort = port ?? parseInt(process.env.REX_HUB_PORT ?? String(DEFAULT_PORT), 10)

  ensureRexDirs()
  loadNodes()

  server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      })
      res.end()
      return
    }

    // Request timeout
    res.setTimeout(30_000, () => {
      sendError(res, 408, 'TIMEOUT', 'Request timed out')
    })

    const urlPath = req.url?.split('?')[0] ?? '/'
    const method = req.method ?? 'GET'

    // Serve web dashboard at root (no auth needed — Tailscale handles perimeter)
    if (urlPath === '/' || urlPath === '/dashboard') {
      const html = buildDashboardHtml()
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    // Auth middleware — skip for /api/health (always public)
    if (HUB_TOKEN && urlPath !== '/api/health') {
      const auth = req.headers.authorization
      if (!auth || auth !== `Bearer ${HUB_TOKEN}`) {
        log.warn(`Unauthorized ${method} ${urlPath} from ${req.socket.remoteAddress}`)
        sendError(res, 401, 'UNAUTHORIZED', 'Valid Bearer token required (REX_HUB_TOKEN)')
        return
      }
    }
    const matched = matchRoute(urlPath, method)

    if (!matched) {
      return sendError(res, 404, 'NOT_FOUND', `No route for ${method} ${urlPath}`)
    }

    try {
      await matched.handler(req, res, matched.params)
    } catch (err) {
      log.error(`${method} ${urlPath} failed: ${err}`)
      sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error')
    }
  })

  flushInterval = setInterval(flushNodes, 60_000)

  const shutdown = () => {
    log.info('Shutting down hub...')
    flushNodes()
    if (flushInterval) clearInterval(flushInterval)
    server?.close()
    server = null
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  return new Promise<void>((resolve) => {
    server!.listen(listenPort, () => {
      log.info(`Hub listening on port ${listenPort}`)
      resolve()
    })
  })
}

export function stopHub(): void {
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }
  flushNodes()
  if (server) {
    server.close()
    server = null
    log.info('Hub stopped')
  }
}

export async function getHubStatus(): Promise<{
  running: boolean
  port: number
  nodesCount: number
  nodes: NodeInfo[]
  uptime?: number
}> {
  const port = parseInt(process.env.REX_HUB_PORT ?? String(DEFAULT_PORT), 10)
  try {
    const res = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      const req = httpGet(
        { host: 'localhost', port, path: '/api/health', timeout: 3000 },
        (r: IncomingMessage) => {
          let data = ''
          r.on('data', (c: Buffer) => { data += c.toString() })
          r.on('end', () => resolve({ statusCode: r.statusCode ?? 0, data }))
        }
      )
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    })
    if (res.statusCode === 200) {
      try {
        const body = JSON.parse(res.data) as Record<string, unknown>
        return {
          running: true,
          port,
          nodesCount: (body.nodeCount as number) ?? 0,
          nodes: [],
          uptime: body.uptime as number | undefined,
        }
      } catch {
        return { running: true, port, nodesCount: 0, nodes: [] }
      }
    }
  } catch {
    // Hub not running
  }
  return { running: false, port, nodesCount: 0, nodes: [] }
}
