/**
 * REX ActivityWatch Mock Server
 *
 * Simulates ActivityWatch at localhost:5600 for testing without AW installed.
 * Provides realistic idle-time simulation: awake / idle / sleeping states.
 *
 * Start: rex test aw
 * Port:  5600 (matches AW default — won't conflict if AW not installed)
 *
 * Supports:
 *   GET  /api/0/info
 *   GET  /api/0/buckets
 *   GET  /api/0/buckets/:id/events
 *   POST /api/0/buckets/:id/heartbeat
 *   GET  /health
 *
 * @module CORE
 */

import { createServer } from 'node:http'
import { createLogger } from './logger.js'

const log = createLogger('CORE:mock-aw')

export const AW_MOCK_PORT = parseInt(process.env.REX_MOCK_AW_PORT ?? '5600', 10)

// ── Idle state machine ───────────────────────────────────────────────────────

export type AwIdleState = 'awake' | 'idle' | 'sleeping'

let _idleState: AwIdleState = 'awake'
let _idleSeconds = 0
let _totalActiveSeconds = 0
const _startTime = Date.now()

export function setMockIdleState(state: AwIdleState): void { _idleState = state }
export function getMockIdleState(): AwIdleState { return _idleState }
export function getMockTotalActiveSeconds(): number { return _totalActiveSeconds }
export function resetMockAw(): void { _idleState = 'awake'; _idleSeconds = 0; _totalActiveSeconds = 0 }

// Advance time — call from tests or from a ticker
function tickSecond(): void {
  switch (_idleState) {
    case 'awake':
      _idleSeconds = 0
      _totalActiveSeconds++
      break
    case 'idle':
      _idleSeconds += 1
      break
    case 'sleeping':
      _idleSeconds += 1
      break
  }
}

// ── Fake bucket + events ─────────────────────────────────────────────────────

const MOCK_APPS: Array<{ app: string; title: string }> = [
  { app: 'Code', title: 'index.ts — rex' },
  { app: 'Code', title: 'daemon.ts — rex' },
  { app: 'iTerm2', title: 'zsh' },
  { app: 'Arc', title: 'GitHub · Pull Request' },
  { app: 'Notion', title: 'Sprint planning' },
  { app: 'Slack', title: 'D-Studio · general' },
  { app: 'Telegram', title: 'REX · claude_keiy_bot' },
]

function makeBucketId(hostname: string): string {
  return `aw-watcher-window_${hostname}`
}

function makeEvents(count: number): Array<{ id: number; timestamp: string; duration: number; data: Record<string, unknown> }> {
  const events = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const { app, title } = MOCK_APPS[i % MOCK_APPS.length]
    events.push({
      id: i + 1,
      timestamp: new Date(now - (count - i) * 60_000).toISOString(),
      duration: 55 + Math.round(Math.random() * 5),
      data: { app, title },
    })
  }
  return events
}

// ── Request body parser ──────────────────────────────────────────────────────

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// ── Server ───────────────────────────────────────────────────────────────────

let _server: ReturnType<typeof createServer> | null = null
let _tickInterval: ReturnType<typeof setInterval> | null = null

export function startMockAwServer(port = AW_MOCK_PORT): Promise<void> {
  if (_server) return Promise.resolve()

  const hostname = 'mock-host'
  const bucketId = makeBucketId(hostname)

  // Auto-tick idle counter every second
  _tickInterval = setInterval(tickSecond, 1000)

  _server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Mock-Server', 'rex-mock-aw')

    // OPTIONS preflight
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // GET /health
    if (method === 'GET' && url === '/health') {
      res.writeHead(200)
      res.end(JSON.stringify({ status: 'ok', idleState: _idleState, idleSeconds: _idleSeconds }))
      return
    }

    // GET /api/0/info
    if (method === 'GET' && url === '/api/0/info') {
      res.writeHead(200)
      res.end(JSON.stringify({
        hostname,
        version: '0.13.0-mock',
        testing: true,
        device_id: 'mock-device',
      }))
      return
    }

    // GET /api/0/buckets
    if (method === 'GET' && url === '/api/0/buckets') {
      res.writeHead(200)
      res.end(JSON.stringify({
        [bucketId]: {
          id: bucketId,
          name: bucketId,
          type: 'currentwindow',
          client: 'aw-watcher-window-mock',
          hostname,
          created: new Date(_startTime).toISOString(),
          last_updated: new Date().toISOString(),
        },
      }))
      return
    }

    // GET /api/0/buckets/:id/events
    const eventsMatch = url.match(/^\/api\/0\/buckets\/(.+)\/events(\?.*)?$/)
    if (method === 'GET' && eventsMatch) {
      const limit = parseInt(new URL(url, 'http://localhost').searchParams.get('limit') ?? '20', 10)
      res.writeHead(200)
      res.end(JSON.stringify(makeEvents(Math.min(limit, 50))))
      return
    }

    // GET /api/0/buckets/:id/export
    const exportMatch = url.match(/^\/api\/0\/buckets\/(.+)\/export$/)
    if (method === 'GET' && exportMatch) {
      res.writeHead(200)
      res.end(JSON.stringify({ bucketId: exportMatch[1], events: makeEvents(20) }))
      return
    }

    // POST /api/0/buckets/:id/heartbeat — accept and update idle state
    const hbMatch = url.match(/^\/api\/0\/buckets\/(.+)\/heartbeat(\?.*)?$/)
    if (method === 'POST' && hbMatch) {
      try {
        const body = JSON.parse(await readBody(req)) as { data?: { status?: string } }
        const status = body.data?.status
        if (status === 'afk') _idleState = 'idle'
        else if (status === 'not-afk') _idleState = 'awake'
        log.debug(`Heartbeat received: status=${status}, idleState=${_idleState}`)
      } catch {}
      res.writeHead(200)
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // GET /api/0/buckets/:id — single bucket info
    const bucketMatch = url.match(/^\/api\/0\/buckets\/([^/?]+)$/)
    if (method === 'GET' && bucketMatch) {
      res.writeHead(200)
      res.end(JSON.stringify({
        id: bucketMatch[1],
        type: 'currentwindow',
        hostname,
        created: new Date(_startTime).toISOString(),
      }))
      return
    }

    // 404
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Not found', url }))
  })

  return new Promise((resolve, reject) => {
    _server!.listen(port, () => {
      log.info(`Mock AW server running on port ${port} (REX_TEST_MODE)`)
      resolve()
    })
    _server!.on('error', reject)
  })
}

export function stopMockAwServer(): Promise<void> {
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null }
  return new Promise((resolve) => {
    if (!_server) { resolve(); return }
    _server.close(() => { _server = null; resolve() })
  })
}

// ── Standalone entry ─────────────────────────────────────────────────────────

if (process.env.REX_TEST_MODE === 'true' || process.argv[1]?.includes('mock-aw-server')) {
  startMockAwServer().then(() => {
    process.on('SIGTERM', () => stopMockAwServer().then(() => process.exit(0)))
    process.on('SIGINT', () => stopMockAwServer().then(() => process.exit(0)))
  }).catch((e) => {
    console.error('Mock AW server failed to start:', e)
    process.exit(1)
  })
}
