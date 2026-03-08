import { createServer, get as httpGet, IncomingMessage, ServerResponse, Server } from 'node:http'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { REX_DIR, PENDING_DIR, ensureRexDirs } from './paths.js'
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

addRoute('GET', '/api/v1/monitor', async (_req, res) => {
  try {
    const { getDevStatus } = await import('./dev-monitor.js')
    const report = await getDevStatus()
    sendJson(res, 200, report)
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message?.slice(0, 100) ?? 'Monitor failed')
  }
})

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
