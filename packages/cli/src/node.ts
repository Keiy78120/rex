/**
 * REX Node Identity & Hub Client
 * Each machine running REX gets a persistent UUID.
 * Communicates with the hub if available, degrades gracefully to solo mode.
 * @module FLEET
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { hostname, platform, networkInterfaces } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('FLEET:node')
const execFileAsync = promisify(execFile)

const NODE_ID_PATH = join(REX_DIR, 'node-id')

// ── Node Identity ─────────────────────────────────────

export function getNodeId(): string {
  ensureRexDirs()
  if (existsSync(NODE_ID_PATH)) {
    const id = readFileSync(NODE_ID_PATH, 'utf-8').trim()
    if (id) return id
  }
  const id = randomUUID()
  writeFileSync(NODE_ID_PATH, id + '\n')
  log.info(`Generated node ID: ${id}`)
  return id
}

// ── Hub Discovery ─────────────────────────────────────

export async function discoverHub(): Promise<string | null> {
  const candidates: string[] = []

  if (process.env.REX_HUB_URL) {
    candidates.push(process.env.REX_HUB_URL.replace(/\/$/, ''))
  }
  candidates.push('http://localhost:7420')

  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        log.info(`Hub discovered at ${url}`)
        return url
      }
    } catch {
      // try next
    }
  }

  log.debug('No Commander found')
  return null
}

// ── Helpers ───────────────────────────────────────────

function getLocalIp(): string | null {
  const ifaces = networkInterfaces()
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') {
        return entry.address
      }
    }
  }
  return null
}

function loadInventoryCliNames(): string[] {
  try {
    const invPath = join(REX_DIR, 'inventory.json')
    if (!existsSync(invPath)) return []
    const inv = JSON.parse(readFileSync(invPath, 'utf-8'))
    if (Array.isArray(inv.clis)) {
      return inv.clis.map((c: { name: string }) => c.name)
    }
  } catch {}
  return []
}

// ── Registration ──────────────────────────────────────

export async function registerWithCommander(commanderUrl?: string): Promise<boolean> {
  const url = commanderUrl || await discoverHub()
  if (!url) {
    log.warn('No Commander available — running in solo mode')
    return false
  }

  const body = {
    id: getNodeId(),
    hostname: hostname(),
    platform: platform(),
    ip: getLocalIp(),
    capabilities: loadInventoryCliNames(),
  }

  try {
    const res = await fetch(`${url}/api/nodes/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      log.info(`Registered with hub at ${url}`)
      return true
    }
    log.warn(`Hub registration returned ${res.status}`)
    return false
  } catch (err) {
    log.warn(`Hub registration failed: ${err}`)
    return false
  }
}

// ── Heartbeat ─────────────────────────────────────────

let heartbeatInterval: NodeJS.Timeout | null = null
let consecutiveFailures = 0

export function startHeartbeat(commanderUrl?: string, intervalMs = 60_000): void {
  stopHeartbeat()
  consecutiveFailures = 0

  let inSoloMode = false

  const sendHeartbeat = async () => {
    const url = commanderUrl || await discoverHub()
    if (!url) {
      consecutiveFailures++
      if (consecutiveFailures >= 3 && !inSoloMode) {
        inSoloMode = true
        log.error('Hub unreachable, continuing in solo mode')
      }
      return
    }

    // Auto-rejoin: hub came back after being in solo mode
    if (inSoloMode) {
      log.info('Hub reachable again, re-registering...')
      const registered = await registerWithCommander(url)
      if (registered) {
        inSoloMode = false
        consecutiveFailures = 0
        cachedHubUrl = url
        cachedLastHeartbeat = new Date().toISOString()
        log.info('Auto-rejoined Commander successfully')
        return
      }
    }

    const nodeId = getNodeId()
    try {
      const res = await fetch(`${url}/api/nodes/${nodeId}/heartbeat`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        consecutiveFailures = 0
        inSoloMode = false
        cachedHubUrl = url
        cachedLastHeartbeat = new Date().toISOString()
      } else {
        consecutiveFailures++
        log.warn(`Heartbeat returned ${res.status}`)
      }
    } catch {
      consecutiveFailures++
      if (consecutiveFailures >= 3 && !inSoloMode) {
        inSoloMode = true
        log.error('Hub unreachable, continuing in solo mode')
      } else if (!inSoloMode) {
        log.warn(`Heartbeat failed (${consecutiveFailures}/3)`)
      }
    }
  }

  // Send immediately then schedule
  sendHeartbeat()
  heartbeatInterval = setInterval(sendHeartbeat, intervalMs)
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// ── Tailscale Peers ──────────────────────────────────

export interface TailscalePeer {
  hostname: string
  ip: string
  online: boolean
  direct: boolean
  lastSeen: string
}

export async function getTailscalePeers(): Promise<TailscalePeer[]> {
  try {
    const { stdout } = await execFileAsync('tailscale', ['status', '--json'], { timeout: 5000 })
    const data = JSON.parse(stdout)
    const peers: TailscalePeer[] = []

    if (data.Peer) {
      for (const peer of Object.values(data.Peer) as Record<string, unknown>[]) {
        const addrs = peer.TailscaleIPs as string[] | undefined
        peers.push({
          hostname: (peer.HostName as string) || 'unknown',
          ip: addrs?.[0] || '',
          online: peer.Online === true,
          direct: peer.CurAddr !== '' && peer.CurAddr !== undefined,
          lastSeen: (peer.LastSeen as string) || '',
        })
      }
    }

    return peers
  } catch {
    log.debug('Tailscale not available or not running')
    return []
  }
}

// ── Wake-on-LAN ─────────────────────────────────────

export async function wakeNode(mac: string): Promise<boolean> {
  for (const cmd of ['wakeonlan', 'etherwake']) {
    try {
      await execFileAsync(cmd, [mac], { timeout: 5000 })
      log.info(`WOL sent via ${cmd} to ${mac}`)
      return true
    } catch {
      // try next
    }
  }
  log.warn(`WOL failed: neither wakeonlan nor etherwake available`)
  return false
}

// ── Node Status ───────────────────────────────────────

let cachedHubUrl: string | null = null
let cachedLastHeartbeat: string | null = null

export interface SpecialistStatus {
  id: string
  hostname: string
  platform: string
  commanderUrl: string | null
  hubConnected: boolean
  lastHeartbeat: string | null
  tailscalePeers: TailscalePeer[]
  mode: 'solo' | 'cluster' | 'fleet'
}

export async function getSpecialistStatus(): Promise<SpecialistStatus> {
  const commanderUrl = cachedHubUrl || await discoverHub()
  const peers = await getTailscalePeers()
  const onlinePeers = peers.filter(p => p.online).length

  let mode: SpecialistStatus['mode'] = 'solo'
  if (commanderUrl) {
    mode = onlinePeers >= 5 ? 'fleet' : 'cluster'
  }

  return {
    id: getNodeId(),
    hostname: hostname(),
    platform: platform(),
    commanderUrl: commanderUrl,
    hubConnected: commanderUrl !== null,
    lastHeartbeat: cachedLastHeartbeat,
    tailscalePeers: peers,
    mode,
  }
}

// ── CLI Output ────────────────────────────────────────

const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

export async function showSpecialistStatus(): Promise<void> {
  const status = await getSpecialistStatus()

  const commanderDisplay = status.hubConnected
    ? `${GREEN}\u25CF${RESET} connected (${status.commanderUrl})`
    : `${RED}\u25CB${RESET} disconnected`

  const heartbeatDisplay = status.lastHeartbeat || `${DIM}never${RESET}`
  const modeDisplay = status.mode === 'fleet' ? `${GREEN}Fleet${RESET}` : status.mode === 'cluster' ? `${CYAN}Cluster${RESET}` : `${DIM}Solo${RESET}`

  console.log()
  console.log(`${BOLD}REX Specialist${RESET}`)
  console.log(`${DIM}${'─'.repeat(28)}${RESET}`)
  console.log(`  ID:            ${CYAN}${status.id}${RESET}`)
  console.log(`  Hostname:      ${status.hostname}`)
  console.log(`  Platform:      ${status.platform}`)
  console.log(`  Mode:          ${modeDisplay}`)
  console.log(`  Commander:     ${commanderDisplay}`)
  console.log(`  Last mission:  ${heartbeatDisplay}`)

  if (status.tailscalePeers.length > 0) {
    console.log(`  ${BOLD}Tailscale Peers:${RESET}`)
    for (const peer of status.tailscalePeers) {
      const dot = peer.online ? `${GREEN}\u25CF${RESET}` : `${RED}\u25CB${RESET}`
      const conn = peer.direct ? 'direct' : `${DIM}relay${RESET}`
      console.log(`    ${dot} ${peer.hostname} (${peer.ip}) ${conn}`)
    }
  }

  console.log()
}
