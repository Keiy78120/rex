/**
 * REX Fabric — multi-node mesh capability layer
 *
 * Every node (Mac/VPS/RPi/GPU) advertises its capabilities.
 * Hub routes tasks to the best available node.
 * Zero LLM — pure script detection + HTTP.
 *
 * Token economy: all detection is execSync/which, no LLM calls here.
 *
 * Spec: docs/plans/action.md §21
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hostname, platform, networkInterfaces } from 'node:os'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR, ensureRexDirs } from './paths.js'

const log = createLogger('node-mesh')

// ── Types ──────────────────────────────────────────────────────────

export interface NodeCapabilities {
  claude: boolean     // claude CLI available
  codex: boolean      // codex CLI available
  ollama: boolean     // ollama running
  embed: boolean      // nomic-embed-text loaded in ollama
  docker: boolean     // docker daemon accessible
  ffmpeg: boolean     // ffmpeg binary
  tailscale: boolean  // tailscale connected
  gpu: boolean        // discrete GPU (M-series, NVIDIA)
  ssh: boolean        // ssh server running
}

export interface MeshNode {
  id: string
  hostname: string
  platform: string
  ip: string
  capabilities: string[]   // keys of NodeCapabilities that are true
  score: number            // capability count — higher = preferred
  lastSeen: string
  registeredAt: string
  status?: 'healthy' | 'stale' | 'offline'
}

export type TaskType = 'llm' | 'gpu' | 'embed' | 'docker' | 'transcribe' | 'claude' | 'codex'

const TASK_REQUIRES: Record<TaskType, string[]> = {
  llm:        ['ollama'],
  gpu:        ['gpu'],
  embed:      ['embed'],
  docker:     ['docker'],
  transcribe: ['ffmpeg', 'ollama'],
  claude:     ['claude'],
  codex:      ['codex'],
}

// ── Paths ──────────────────────────────────────────────────────────

const NODE_ID_PATH = join(REX_DIR, 'node-id')
const MESH_CACHE_PATH = join(REX_DIR, 'mesh-cache.json')

// ── Node ID (stable across reboots) ────────────────────────────────

function getNodeId(): string {
  if (existsSync(NODE_ID_PATH)) {
    const id = readFileSync(NODE_ID_PATH, 'utf-8').trim()
    if (id) return id
  }
  ensureRexDirs()
  const id = `${hostname()}-${Date.now().toString(36)}`
  writeFileSync(NODE_ID_PATH, id)
  return id
}

// ── Local IP ───────────────────────────────────────────────────────

function getLocalIp(): string {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

// ── Capability detection (pure script — zero LLM) ──────────────────

function whichExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', timeout: 2000 })
    return true
  } catch { return false }
}

function ollamaRunning(): boolean {
  try {
    const res = execSync('curl -sf http://localhost:11434/api/tags', { timeout: 2000, stdio: 'pipe' })
    return res.toString().includes('models')
  } catch { return false }
}

function embedAvailable(): boolean {
  try {
    const out = execSync('curl -sf http://localhost:11434/api/tags', { timeout: 2000, stdio: 'pipe' }).toString()
    return out.includes('nomic-embed') || out.includes('mxbai-embed') || out.includes('all-minilm')
  } catch { return false }
}

function gpuAvailable(): boolean {
  // macOS: Metal GPU (M-series always has GPU)
  if (platform() === 'darwin') {
    try {
      const out = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep -i "Metal"', { timeout: 3000, stdio: 'pipe' }).toString()
      return out.includes('Metal')
    } catch { return false }
  }
  // Linux: NVIDIA
  return whichExists('nvidia-smi')
}

function tailscaleConnected(): boolean {
  if (!whichExists('tailscale')) return false
  try {
    const out = execSync('tailscale status --json 2>/dev/null', { timeout: 3000, stdio: 'pipe' }).toString()
    const data = JSON.parse(out) as { BackendState?: string }
    return data.BackendState === 'Running'
  } catch { return false }
}

/**
 * Get Tailscale peer IPs for online peers only.
 * Returns empty array if tailscale is not running or has no peers.
 */
function getTailscalePeerIps(): string[] {
  if (!whichExists('tailscale')) return []
  try {
    const out = execSync('tailscale status --json 2>/dev/null', { timeout: 3000, stdio: 'pipe' }).toString()
    const data = JSON.parse(out) as {
      BackendState?: string
      Peer?: Record<string, { TailscaleIPs?: string[]; Online?: boolean }>
    }
    if (data.BackendState !== 'Running' || !data.Peer) return []
    const ips: string[] = []
    for (const peer of Object.values(data.Peer)) {
      if (peer.Online && peer.TailscaleIPs?.length) {
        // Take first IPv4 address only
        const ip4 = peer.TailscaleIPs.find(ip => !ip.includes(':'))
        if (ip4) ips.push(ip4)
      }
    }
    return ips
  } catch { return [] }
}

function sshRunning(): boolean {
  try {
    execSync('pgrep -x sshd', { timeout: 1000, stdio: 'pipe' })
    return true
  } catch { return false }
}

/**
 * Detect all local capabilities.
 * Uses parallel async detection where possible, short timeouts throughout.
 * Zero LLM — pure script/process checks.
 */
export function detectLocalCapabilities(): NodeCapabilities {
  // Run all checks — batch where possible, fast exits on failure
  const [hasOllama, hasEmbed] = ollamaRunning()
    ? [true, embedAvailable()]
    : [false, false]

  return {
    claude:    whichExists('claude'),
    codex:     whichExists('codex'),
    ollama:    hasOllama,
    embed:     hasEmbed,
    docker:    whichExists('docker'),
    ffmpeg:    whichExists('ffmpeg'),
    tailscale: tailscaleConnected(),
    gpu:       gpuAvailable(),
    ssh:       sshRunning(),
  }
}

/**
 * Build a MeshNode descriptor for this local machine.
 */
export function buildLocalNodeInfo(): MeshNode {
  const caps = detectLocalCapabilities()
  const active = Object.entries(caps)
    .filter(([, v]) => v)
    .map(([k]) => k)

  return {
    id:           getNodeId(),
    hostname:     hostname(),
    platform:     platform(),
    ip:           getLocalIp(),
    capabilities: active,
    score:        active.length,
    lastSeen:     new Date().toISOString(),
    registeredAt: new Date().toISOString(),
  }
}

// ── Hub registration ───────────────────────────────────────────────

function getHubUrl(): string | null {
  // Check env first, then settings.json
  if (process.env.REX_HUB_URL) return process.env.REX_HUB_URL
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const s = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
      const env = s.env as Record<string, string> | undefined
      if (env?.REX_HUB_URL) return env.REX_HUB_URL
    }
  } catch {}
  return null
}

/**
 * Probe a candidate URL to check if it's a REX hub.
 * Returns the URL if it responds to /api/health, otherwise null.
 */
async function probeHub(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) return url
  } catch {}
  return null
}

/**
 * Discover REX hubs on the Tailscale network by probing port 7420 on each online peer.
 * Returns an array of discovered hub URLs (e.g. ["http://100.x.x.x:7420"]).
 * Results are cached in the mesh-cache alongside node data.
 */
export async function autoDiscoverHubs(): Promise<string[]> {
  const peers = getTailscalePeerIps()
  if (peers.length === 0) return []

  const probes = peers.map(ip => probeHub(`http://${ip}:7420`))
  const results = await Promise.all(probes)
  const found = results.filter((u): u is string => u !== null)

  if (found.length > 0) {
    log.info(`Tailscale hub discovery: found ${found.length} hub(s) — ${found.join(', ')}`)
  }
  return found
}

/**
 * Register this node with the hub (POST /api/nodes/register).
 * Priority: configured URL → Tailscale peer discovery → localhost:7420
 */
export async function registerWithHub(nodeInfo?: MeshNode): Promise<boolean> {
  const info = nodeInfo ?? buildLocalNodeInfo()

  // Build candidate list: configured > tailscale-discovered > localhost fallback
  const configured = getHubUrl()
  const candidates: string[] = configured
    ? [configured]
    : [...(await autoDiscoverHubs()), 'http://localhost:7420']

  for (const hubUrl of candidates) {
    try {
      const res = await fetch(`${hubUrl}/api/nodes/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        log.info(`Registered with hub ${hubUrl}: ${info.id} (${info.capabilities.join(', ') || 'no caps'})`)
        try { saveMeshCache(await fetchMeshNodes(hubUrl)) } catch {}
        return true
      }
      log.warn(`Hub registration failed at ${hubUrl}: HTTP ${res.status}`)
    } catch (e: any) {
      log.debug(`Hub unreachable at ${hubUrl}: ${e.message?.slice(0, 80)}`)
    }
  }
  return false
}

// ── Mesh cache (offline fallback) ─────────────────────────────────

function saveMeshCache(nodes: MeshNode[]): void {
  try {
    ensureRexDirs()
    writeFileSync(MESH_CACHE_PATH, JSON.stringify({ nodes, updatedAt: new Date().toISOString() }, null, 2))
  } catch {}
}

function readMeshCache(): MeshNode[] {
  try {
    if (existsSync(MESH_CACHE_PATH)) {
      const data = JSON.parse(readFileSync(MESH_CACHE_PATH, 'utf-8')) as { nodes: MeshNode[] }
      return data.nodes ?? []
    }
  } catch {}
  return []
}

async function fetchMeshNodes(hubUrl: string): Promise<MeshNode[]> {
  const res = await fetch(`${hubUrl}/api/v1/nodes/health`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { data: MeshNode[] }
  return body.data ?? []
}

// ── Task routing ───────────────────────────────────────────────────

/**
 * Route a task to the best available node.
 * Returns the best matching node, or null if no node can handle the task.
 * Prefers hub-fresh data, falls back to local cache.
 * Score = capability count (more capable = preferred).
 */
export async function routeTask(taskType: TaskType): Promise<MeshNode | null> {
  const required = TASK_REQUIRES[taskType] ?? []

  // Try configured hub, then Tailscale-discovered hubs, then cache
  let nodes: MeshNode[] = []
  const configured = getHubUrl()
  const hubCandidates = configured ? [configured] : await autoDiscoverHubs()

  let fetched = false
  for (const hubUrl of hubCandidates) {
    try {
      nodes = await fetchMeshNodes(hubUrl)
      saveMeshCache(nodes)
      fetched = true
      break
    } catch { /* try next */ }
  }
  if (!fetched) {
    nodes = readMeshCache()
  }

  if (nodes.length === 0) {
    // Only local node available
    const local = buildLocalNodeInfo()
    nodes = [local]
  }

  // Filter: only healthy nodes with required capabilities
  const capable = nodes
    .filter(n => n.status !== 'offline')
    .filter(n => required.every(cap => n.capabilities.includes(cap)))
    .sort((a, b) => b.score - a.score)   // highest score first

  return capable[0] ?? null
}

// ── Hub-side helpers (imported by hub.ts) ──────────────────────────

/**
 * Upsert a node in the hub's nodes map.
 * Called from hub.ts route handlers.
 */
export function upsertNode(
  nodesMap: Map<string, MeshNode>,
  info: Partial<MeshNode> & { hostname: string; platform: string; ip: string }
): MeshNode {
  const existing = info.id ? nodesMap.get(info.id) : undefined
  const now = new Date().toISOString()
  const id = info.id ?? `${info.hostname}-${Date.now().toString(36)}`
  const caps = info.capabilities ?? []

  const node: MeshNode = {
    id,
    hostname:     info.hostname,
    platform:     info.platform,
    ip:           info.ip,
    capabilities: caps,
    score:        caps.length,
    lastSeen:     now,
    registeredAt: existing?.registeredAt ?? now,
  }
  nodesMap.set(id, node)
  return node
}

/**
 * Get a summary of mesh health (healthy/stale/offline counts + node list).
 * Called from hub.ts GET /api/nodes/status handler.
 */
export function getMeshStatus(nodesMap: Map<string, MeshNode>): {
  nodes: MeshNode[]
  healthy: number
  stale: number
  offline: number
} {
  const STALE_MS   = 5  * 60 * 1000   // 5 min
  const OFFLINE_MS = 30 * 60 * 1000   // 30 min
  const now = Date.now()

  const nodes: MeshNode[] = []
  let healthy = 0, stale = 0, offline = 0

  for (const n of nodesMap.values()) {
    const ms = n.lastSeen ? now - new Date(n.lastSeen).getTime() : Infinity
    const status: MeshNode['status'] =
      ms < STALE_MS   ? 'healthy' :
      ms < OFFLINE_MS ? 'stale'   : 'offline'

    if (status === 'healthy') healthy++
    else if (status === 'stale') stale++
    else offline++

    nodes.push({ ...n, status })
  }

  return { nodes, healthy, stale, offline }
}

// ── Display ────────────────────────────────────────────────────────

/**
 * Print mesh node table to stdout.
 * Fetches from hub if available, falls back to cache, then local-only.
 */
export async function printMeshStatus(): Promise<void> {
  const bold = '\x1b[1m', reset = '\x1b[0m', dim = '\x1b[2m'
  const green = '\x1b[32m', yellow = '\x1b[33m', red = '\x1b[31m'

  let nodes: MeshNode[] = []
  // Priority: configured URL → Tailscale-discovered hubs → localhost
  const configuredUrl = getHubUrl()
  const tailscaleHubs = configuredUrl ? [] : await autoDiscoverHubs()
  const candidates = configuredUrl
    ? [configuredUrl]
    : [...tailscaleHubs, 'http://localhost:7420']
  let resolved = false

  for (const url of candidates) {
    try {
      nodes = await fetchMeshNodes(url)
      saveMeshCache(nodes)
      resolved = true
      break
    } catch { /* try next */ }
  }

  if (!resolved) {
    nodes = readMeshCache()
    if (nodes.length === 0) {
      nodes = [{ ...buildLocalNodeInfo(), status: 'healthy' }]
      console.log(`${dim}Hub not reachable. Showing local node only.${reset}\n`)
    } else {
      console.log(`${yellow}Hub unreachable — showing cached data${reset}\n`)
    }
  }

  console.log(`\n${bold}REX Mesh — ${nodes.length} node(s)${reset}`)
  console.log('─'.repeat(72))

  for (const n of nodes) {
    const dot = n.status === 'healthy' ? `${green}●${reset}`
              : n.status === 'stale'   ? `${yellow}●${reset}`
              : `${red}○${reset}`
    const caps = n.capabilities.length > 0 ? n.capabilities.join(', ') : 'none'
    console.log(`${dot}  ${bold}${n.hostname.padEnd(20)}${reset}  ${n.ip.padEnd(16)}  ${dim}${caps}${reset}`)
  }

  const healthy = nodes.filter(n => n.status === 'healthy').length
  const stale   = nodes.filter(n => n.status === 'stale').length
  const offline = nodes.filter(n => n.status === 'offline').length

  console.log('─'.repeat(72))
  console.log(`  ${green}${healthy} healthy${reset}  ${yellow}${stale} stale${reset}  ${red}${offline} offline${reset}`)
  console.log()
}
