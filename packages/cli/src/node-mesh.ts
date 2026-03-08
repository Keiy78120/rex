/**
 * REX Node Mesh — unified resource fabric
 *
 * Every node (Mac, VPS, RPi, GPU box) registers its capabilities.
 * The hub knows at all times who can do what.
 * Tasks arriving from any surface (Telegram, CLI, app) are routed
 * to the best available node — or queued if nothing is available.
 *
 * Architecture:
 *   Any surface → Hub → best node → result → back to surface
 *
 * Transport: Tailscale (preferred) or direct HTTP between nodes.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hostname, platform } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { appendEvent } from './sync-queue.js'

const log = createLogger('node-mesh')

// ── Node capabilities ──────────────────────────────────

/**
 * What a node can do. Detected automatically via inventory.ts.
 * Used by hub to route tasks to the right node.
 */
export type NodeCapability =
  | 'claude-code'      // can spawn Claude Code (needs interactive TTY + auth)
  | 'codex'            // can run Codex CLI (needs auth)
  | 'ollama'           // has local Ollama + models
  | 'gpu'              // has GPU (CUDA/Metal for inference)
  | 'browser'          // can run Playwright/headless browser
  | 'voice'            // has microphone (voice input)
  | 'mac-bridge'       // mac-bridge HTTP server running
  | 'gateway'          // Telegram gateway daemon running
  | 'hub'              // is the hub/coordinator node
  | 'always-on'        // stays online 24/7 (VPS/RPi)
  | 'high-memory'      // >16GB RAM available
  | 'wake-on-lan'      // can be woken remotely

export interface NodeInfo {
  id: string                    // unique node ID (hostname-platform)
  hostname: string
  platform: string              // darwin | linux | win32
  ip: string                    // Tailscale or LAN IP
  port: number                  // REX hub API port (default 7420)
  capabilities: NodeCapability[]
  ollamaModels?: string[]       // available Ollama models
  claudeAccounts?: number       // number of Claude accounts available
  lastSeen: string              // ISO timestamp
  registeredAt: string
  isHub: boolean
  status: 'online' | 'offline' | 'degraded'
  latencyMs?: number            // measured by hub ping
}

// ── Task routing ───────────────────────────────────────

export type TaskKind =
  | 'code'             // needs claude-code or codex
  | 'inference'        // LLM call — can use ollama or any provider
  | 'browser'          // web automation
  | 'voice'            // speech input/output
  | 'memory'           // memory read/write (any node with DB)
  | 'build'            // compile/test (CPU intensive)
  | 'background'       // low-priority, any node

export interface RoutedTask {
  id: string
  kind: TaskKind
  payload: unknown
  requiredCapabilities: NodeCapability[]
  preferredNodeId?: string
  timeoutMs?: number
  queueIfUnavailable?: boolean  // true = queue; false = fail fast
}

export interface TaskResult {
  taskId: string
  nodeId: string
  ok: boolean
  result?: unknown
  error?: string
  durationMs: number
}

// ── Required capabilities per task kind ───────────────

const TASK_REQUIREMENTS: Record<TaskKind, NodeCapability[]> = {
  code:        ['claude-code'],
  inference:   [],                  // any node (fallback to provider)
  browser:     ['browser'],
  voice:       ['voice'],
  memory:      [],                  // any node
  build:       [],                  // any node with the repo
  background:  [],                  // any node
}

// ── Mesh store ─────────────────────────────────────────

const MESH_PATH = join(REX_DIR, 'mesh-nodes.json')

interface MeshStore {
  nodes: NodeInfo[]
  updatedAt: string
}

function readMesh(): MeshStore {
  ensureRexDirs()
  try {
    if (existsSync(MESH_PATH)) return JSON.parse(readFileSync(MESH_PATH, 'utf-8')) as MeshStore
  } catch { /* noop */ }
  return { nodes: [], updatedAt: new Date().toISOString() }
}

function writeMesh(store: MeshStore): void {
  ensureRexDirs()
  writeFileSync(MESH_PATH, JSON.stringify(store, null, 2))
}

// ── Node capability detection ──────────────────────────

/**
 * Auto-detect capabilities of the current node.
 * Called at startup and periodically by the daemon.
 */
export async function detectLocalCapabilities(): Promise<NodeCapability[]> {
  const { execSync } = await import('node:child_process')
  const caps: NodeCapability[] = []
  const os = platform()

  const has = (cmd: string): boolean => {
    try { execSync(cmd, { stdio: 'ignore', timeout: 3000 }); return true } catch { return false }
  }

  // Claude Code
  if (has('claude --version')) caps.push('claude-code')

  // Codex
  if (has('codex --version')) caps.push('codex')

  // Ollama
  if (has('curl -s http://localhost:11434/api/tags')) caps.push('ollama')

  // Browser
  if (has('npx playwright --version') || has('chromium --version') || has('google-chrome --version')) {
    caps.push('browser')
  }

  // GPU (CUDA or Metal)
  if (has('nvidia-smi') || (os === 'darwin' && has('system_profiler SPDisplaysDataType'))) {
    caps.push('gpu')
  }

  // Voice (microphone available)
  if (os === 'darwin' || has('arecord --list-devices')) caps.push('voice')

  // Mac Bridge
  try {
    const res = await fetch('http://localhost:8765/ping', { signal: AbortSignal.timeout(1000) })
    if (res.ok) caps.push('mac-bridge')
  } catch { /* noop */ }

  // Always-on (VPS/RPi = linux without display)
  if (os === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) caps.push('always-on')

  // High memory (>16GB)
  try {
    const { totalmem } = await import('node:os')
    if (totalmem() > 16 * 1024 * 1024 * 1024) caps.push('high-memory')
  } catch { /* noop */ }

  return caps
}

/**
 * Build the full NodeInfo for the current node.
 */
export async function buildLocalNodeInfo(hubPort = 7420): Promise<NodeInfo> {
  const { networkInterfaces } = await import('node:os')
  const caps = await detectLocalCapabilities()

  // Try to find Tailscale IP first, fallback to first non-loopback
  let ip = '127.0.0.1'
  const nets = networkInterfaces()
  outer: for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (!net.internal && net.family === 'IPv4') {
        if (name.startsWith('tailscale') || name.startsWith('ts')) { ip = net.address; break outer }
        if (ip === '127.0.0.1') ip = net.address
      }
    }
  }

  // Ollama models
  let ollamaModels: string[] | undefined
  if (caps.includes('ollama')) {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
      const data = await res.json() as { models: Array<{ name: string }> }
      ollamaModels = data.models.map(m => m.name)
    } catch { /* noop */ }
  }

  const h = hostname()
  const p = platform()
  const id = `${h}-${p}`

  return {
    id,
    hostname: h,
    platform: p,
    ip,
    port: hubPort,
    capabilities: caps,
    ollamaModels,
    lastSeen: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    isHub: caps.includes('hub') || process.env.REX_IS_HUB === '1',
    status: 'online',
  }
}

// ── Hub registration ───────────────────────────────────

/**
 * Register this node with the hub.
 * Called at startup and every 60s by the daemon.
 */
export async function registerWithHub(hubUrl: string, nodeInfo: NodeInfo): Promise<boolean> {
  try {
    const res = await fetch(`${hubUrl}/nodes/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rex-Token': process.env.REX_HUB_TOKEN ?? '' },
      body: JSON.stringify(nodeInfo),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      log.info(`Registered with hub at ${hubUrl}`)
      return true
    }
  } catch {
    log.warn(`Could not reach hub at ${hubUrl} — operating standalone`)
  }
  return false
}

/**
 * Update mesh store locally (used by the hub node itself).
 */
export function upsertNode(info: NodeInfo): void {
  const store = readMesh()
  const idx = store.nodes.findIndex(n => n.id === info.id)
  if (idx >= 0) store.nodes[idx] = info
  else store.nodes.push(info)
  store.updatedAt = new Date().toISOString()
  writeMesh(store)
}

// ── Task routing ───────────────────────────────────────

/**
 * Find the best online node for a given task kind.
 * Priority: preferred node → capability match → lowest latency → hub
 */
export function routeTask(task: RoutedTask): NodeInfo | null {
  const store = readMesh()
  const online = store.nodes.filter(n => n.status === 'online')
  const required = [...TASK_REQUIREMENTS[task.kind], ...task.requiredCapabilities]

  // Preferred node
  if (task.preferredNodeId) {
    const preferred = online.find(n => n.id === task.preferredNodeId)
    if (preferred && required.every(c => preferred.capabilities.includes(c))) return preferred
  }

  // Capability match, sorted by latency
  const candidates = online
    .filter(n => required.every(c => n.capabilities.includes(c)))
    .sort((a, b) => (a.latencyMs ?? 999) - (b.latencyMs ?? 999))

  return candidates[0] ?? null
}

/**
 * Get all online nodes with a specific capability.
 */
export function getNodesWithCapability(cap: NodeCapability): NodeInfo[] {
  return readMesh().nodes.filter(n => n.status === 'online' && n.capabilities.includes(cap))
}

/**
 * Get current mesh status summary.
 */
export function getMeshStatus(): { total: number; online: number; capabilities: Record<string, number> } {
  const store = readMesh()
  const online = store.nodes.filter(n => n.status === 'online')
  const caps: Record<string, number> = {}
  for (const node of online) {
    for (const cap of node.capabilities) {
      caps[cap] = (caps[cap] ?? 0) + 1
    }
  }
  return { total: store.nodes.length, online: online.length, capabilities: caps }
}

// ── Delegation ─────────────────────────────────────────

/**
 * Delegate a task to a remote node via HTTP.
 * Falls back to local execution if delegation fails.
 */
export async function delegateTask(node: NodeInfo, task: RoutedTask): Promise<TaskResult> {
  const start = Date.now()
  const url = `http://${node.ip}:${node.port}/tasks/run`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rex-Token': process.env.REX_HUB_TOKEN ?? '' },
      body: JSON.stringify(task),
      signal: AbortSignal.timeout(task.timeoutMs ?? 30_000),
    })

    const result = await res.json() as TaskResult
    log.info(`Task ${task.id} delegated to ${node.hostname}: ${result.ok ? 'ok' : 'failed'}`)

    await appendEvent({ type: 'task_delegated', data: { taskId: task.id, nodeId: node.id, ok: result.ok } })
    return result
  } catch (err) {
    log.error(`Failed to delegate task ${task.id} to ${node.hostname}`, err)
    return { taskId: task.id, nodeId: node.id, ok: false, error: String(err), durationMs: Date.now() - start }
  }
}

/**
 * Print mesh status to stdout.
 */
export function printMeshStatus(): void {
  const store = readMesh()
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  const green = '\x1b[32m'
  const red = '\x1b[31m'
  const dim = '\x1b[2m'

  console.log()
  console.log(`${bold}REX Node Mesh${reset} — ${store.nodes.length} nodes`)
  console.log('─'.repeat(60))

  for (const node of store.nodes) {
    const status = node.status === 'online' ? `${green}●${reset}` : `${red}○${reset}`
    const hub = node.isHub ? ' [hub]' : ''
    const latency = node.latencyMs ? ` ${dim}${node.latencyMs}ms${reset}` : ''
    console.log(`${status} ${bold}${node.hostname}${reset}${hub} — ${node.ip}${latency}`)
    console.log(`  ${dim}${node.capabilities.join(' · ')}${reset}`)
    if (node.ollamaModels?.length) {
      console.log(`  ${dim}ollama: ${node.ollamaModels.slice(0, 3).join(', ')}${node.ollamaModels.length > 3 ? ` +${node.ollamaModels.length - 3}` : ''}${reset}`)
    }
  }
  console.log()
}
