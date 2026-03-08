/**
 * REX Resource Inventory
 * Detects and catalogues all available resources on the machine:
 * CLIs, services, hardware, LLM models, and providers.
 * Owned-first, free-first, CLI > MCP > API.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hostname, platform } from 'node:os'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('inventory')

export const INVENTORY_PATH = join(REX_DIR, 'inventory.json')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export interface ResourceInventory {
  timestamp: string
  hostname: string
  platform: string
  hardware: {
    cpu: string
    ram: string
    gpu: string
    diskFree: string
  }
  clis: Array<{ name: string; path: string; version: string }>
  services: Array<{ name: string; status: 'running' | 'stopped' | 'unknown'; url?: string }>
  models: {
    generation: string[]
    embedding: string[]
  }
  providers: Array<{ name: string; configured: boolean; details?: string }>
}

// ── Helpers ────────────────────────────────────────────

function exec(cmd: string, timeoutMs = 3000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function whichCli(name: string): string {
  return exec(`which ${name}`, 2000)
}

function getVersion(name: string, path: string): string {
  if (!path) return ''
  // Some CLIs use non-standard version flags
  const versionFlags: Record<string, string> = {
    ollama: 'ollama --version',
    docker: 'docker --version',
    tailscale: 'tailscale version',
    sqlite3: 'sqlite3 --version',
  }
  const cmd = versionFlags[name] ?? `${path} --version`
  const raw = exec(cmd, 3000)
  if (!raw) return 'unknown'
  // Extract version-like pattern from first line
  const firstLine = raw.split('\n')[0]
  const match = firstLine.match(/v?(\d+\.\d+[\w.-]*)/)
  return match ? `v${match[1].replace(/^v/, '')}` : firstLine.slice(0, 40)
}

// ── CLI Detection ──────────────────────────────────────

const CLI_LIST = [
  'node', 'npm', 'pnpm', 'bun',
  'python', 'python3', 'pip',
  'flutter', 'dart',
  'go', 'cargo', 'rustc',
  'docker', 'podman',
  'git', 'gh',
  'claude',
  'ollama',
  'ffmpeg', 'whisper',
  'tailscale',
  'sqlite3',
  'rex',
]

function detectClis(): Array<{ name: string; path: string; version: string }> {
  const results: Array<{ name: string; path: string; version: string }> = []

  for (const name of CLI_LIST) {
    const path = whichCli(name)
    if (path) {
      const version = getVersion(name, path)
      results.push({ name, path, version })
    }
  }

  log.debug(`Detected ${results.length}/${CLI_LIST.length} CLIs`)
  return results
}

// ── Services ───────────────────────────────────────────

async function checkOllama(): Promise<{ name: string; status: 'running' | 'stopped' | 'unknown'; url: string }> {
  const url = OLLAMA_URL
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) return { name: 'Ollama', status: 'running', url }
  } catch {}
  return { name: 'Ollama', status: 'stopped', url }
}

function checkDocker(): { name: string; status: 'running' | 'stopped' | 'unknown' } {
  const out = exec('docker info', 3000)
  if (out.includes('Server Version') || out.includes('Containers')) {
    return { name: 'Docker', status: 'running' }
  }
  return { name: 'Docker', status: whichCli('docker') ? 'stopped' : 'unknown' }
}

function checkTailscale(): { name: string; status: 'running' | 'stopped' | 'unknown' } {
  const out = exec('tailscale status', 3000)
  if (out && !out.includes('not running') && !out.includes('stopped')) {
    return { name: 'Tailscale', status: 'running' }
  }
  return { name: 'Tailscale', status: whichCli('tailscale') ? 'stopped' : 'unknown' }
}

async function detectServices(): Promise<ResourceInventory['services']> {
  const [ollama, docker, tailscale] = await Promise.all([
    checkOllama(),
    Promise.resolve(checkDocker()),
    Promise.resolve(checkTailscale()),
  ])
  return [ollama, docker, tailscale]
}

// ── Hardware ───────────────────────────────────────────

function detectHardware(): ResourceInventory['hardware'] {
  let cpu = 'unknown'
  let ram = 'unknown'
  let gpu = 'unknown'
  let diskFree = 'unknown'

  if (platform() === 'darwin') {
    cpu = exec('sysctl -n machdep.cpu.brand_string') || 'unknown'
    const memBytes = exec('sysctl -n hw.memsize')
    if (memBytes) {
      const gb = Math.round(parseInt(memBytes, 10) / (1024 ** 3))
      ram = `${gb} GB`
    }
    const gpuRaw = exec('system_profiler SPDisplaysDataType 2>/dev/null')
    if (gpuRaw) {
      const gpuMatch = gpuRaw.match(/Chipset Model:\s*(.+)|Model:\s*(.+)/)
      if (gpuMatch) gpu = (gpuMatch[1] || gpuMatch[2]).trim()
    }
  } else {
    // Linux fallback
    cpu = exec('cat /proc/cpuinfo 2>/dev/null | grep "model name" | head -1 | cut -d: -f2') || 'unknown'
    const memKb = exec('cat /proc/meminfo 2>/dev/null | grep MemTotal | awk \'{print $2}\'')
    if (memKb) {
      const gb = Math.round(parseInt(memKb, 10) / (1024 ** 2))
      ram = `${gb} GB`
    }
    gpu = exec('lspci 2>/dev/null | grep -i vga | cut -d: -f3') || 'unknown'
  }

  const dfRaw = exec('df -h / | tail -1')
  if (dfRaw) {
    const parts = dfRaw.split(/\s+/)
    // macOS: filesystem size used avail capacity ...
    // Linux: filesystem size used avail use% mount
    diskFree = parts[3] ? `${parts[3]} free` : 'unknown'
  }

  return { cpu: cpu.trim(), ram, gpu: gpu.trim(), diskFree }
}

// ── LLM Models ─────────────────────────────────────────

async function detectModels(): Promise<ResourceInventory['models']> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json() as { models: Array<{ name: string }> }
    const all = data.models.map(m => m.name)

    const embedding = all.filter(m => m.includes('embed') || m.includes('nomic'))
    const generation = all.filter(m => !m.includes('embed') && !m.includes('nomic'))

    log.debug(`Models: ${generation.length} generation, ${embedding.length} embedding`)
    return { generation, embedding }
  } catch {
    return { generation: [], embedding: [] }
  }
}

// ── Providers ──────────────────────────────────────────

function detectProviders(services: ResourceInventory['services']): ResourceInventory['providers'] {
  const providers: ResourceInventory['providers'] = []

  // Claude Code
  const claudePath = whichCli('claude')
  providers.push({
    name: 'Claude',
    configured: !!claudePath,
    details: claudePath ? 'Claude Code CLI' : undefined,
  })

  // Ollama
  const ollamaService = services.find(s => s.name === 'Ollama')
  providers.push({
    name: 'Ollama',
    configured: ollamaService?.status === 'running',
    details: ollamaService?.status === 'running' ? ollamaService.url : undefined,
  })

  // Telegram
  const HOME = process.env.HOME || '~'
  let telegramConfigured = false
  if (process.env.REX_TELEGRAM_BOT_TOKEN && process.env.REX_TELEGRAM_CHAT_ID) {
    telegramConfigured = true
  } else {
    try {
      const settingsPath = join(HOME, '.claude', 'settings.json')
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        const env = settings.env || {}
        telegramConfigured = !!(env.REX_TELEGRAM_BOT_TOKEN && env.REX_TELEGRAM_CHAT_ID)
      }
    } catch {}
  }
  providers.push({
    name: 'Telegram',
    configured: telegramConfigured,
    details: telegramConfigured ? 'Bot token + chat ID set' : undefined,
  })

  return providers
}

// ── Resource Ranking ───────────────────────────────────

export type ResourceCost = 'owned' | 'free' | 'subscription' | 'pay-per-use'

export interface Resource {
  name: string
  type: 'cli' | 'service' | 'hardware' | 'model' | 'provider' | 'quota'
  available: boolean
  cost: ResourceCost
  priority: number
  details?: Record<string, string>
}

const COST_PRIORITY: Record<ResourceCost, number> = {
  owned: 0,
  free: 1,
  subscription: 2,
  'pay-per-use': 3,
}

/**
 * Convert a raw ResourceInventory into a flat, ranked Resource[] list.
 * Sorted by priority: owned > free > subscription > pay-per-use.
 */
export function rankResources(inv: ResourceInventory): Resource[] {
  const resources: Resource[] = []

  // Hardware — always owned
  resources.push({
    name: `CPU: ${inv.hardware.cpu}`,
    type: 'hardware',
    available: true,
    cost: 'owned',
    priority: COST_PRIORITY.owned,
    details: { ram: inv.hardware.ram, gpu: inv.hardware.gpu, disk: inv.hardware.diskFree },
  })

  // CLIs — owned (local installs)
  for (const cli of inv.clis) {
    resources.push({
      name: cli.name,
      type: 'cli',
      available: true,
      cost: 'owned',
      priority: COST_PRIORITY.owned,
      details: { version: cli.version, path: cli.path },
    })
  }

  // Services
  for (const svc of inv.services) {
    const cost: ResourceCost = svc.name === 'Ollama' ? 'free' : 'owned'
    resources.push({
      name: svc.name,
      type: 'service',
      available: svc.status === 'running',
      cost,
      priority: COST_PRIORITY[cost],
      details: { status: svc.status, ...(svc.url ? { url: svc.url } : {}) },
    })
  }

  // Models — free (local Ollama)
  for (const model of [...inv.models.generation, ...inv.models.embedding]) {
    const isEmbed = inv.models.embedding.includes(model)
    resources.push({
      name: model,
      type: 'model',
      available: true,
      cost: 'free',
      priority: COST_PRIORITY.free,
      details: { kind: isEmbed ? 'embedding' : 'generation' },
    })
  }

  // Providers — cost varies
  for (const p of inv.providers) {
    let cost: ResourceCost = 'free'
    if (p.name === 'Claude') cost = 'subscription'
    if (p.name === 'Telegram') cost = 'free'
    resources.push({
      name: p.name,
      type: 'provider',
      available: p.configured,
      cost,
      priority: COST_PRIORITY[cost],
      details: p.details ? { info: p.details } : undefined,
    })
  }

  // Sort by priority (owned first), then by name
  resources.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  return resources
}

/**
 * Get a full inventory snapshot with both raw data and ranked resources.
 */
export async function getInventorySnapshot(): Promise<{ inventory: ResourceInventory; resources: Resource[] }> {
  const inventory = await collectInventory()
  const resources = rankResources(inventory)
  return { inventory, resources }
}

// ── Main Collection ────────────────────────────────────

export async function collectInventory(): Promise<ResourceInventory> {
  log.info('Collecting resource inventory...')
  const start = Date.now()

  const [clis, services, hardware, models] = await Promise.all([
    Promise.resolve(detectClis()),
    detectServices(),
    Promise.resolve(detectHardware()),
    detectModels(),
  ])

  const providers = detectProviders(services)

  const inventory: ResourceInventory = {
    timestamp: new Date().toISOString(),
    hostname: hostname(),
    platform: `${platform()} ${exec('uname -r', 2000) || ''}`.trim(),
    hardware,
    clis,
    services,
    models,
    providers,
  }

  const elapsed = Date.now() - start
  log.info(`Inventory collected in ${elapsed}ms — ${clis.length} CLIs, ${models.generation.length} models`)
  return inventory
}

// ── Cache ──────────────────────────────────────────────

export function getInventoryCache(): ResourceInventory | null {
  if (!existsSync(INVENTORY_PATH)) return null
  try {
    return JSON.parse(readFileSync(INVENTORY_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export async function saveInventoryCache(inv: ResourceInventory): Promise<void> {
  ensureRexDirs()
  writeFileSync(INVENTORY_PATH, JSON.stringify(inv, null, 2))
  log.debug(`Inventory cached to ${INVENTORY_PATH}`)
}

// ── Pretty Print ───────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

const DOT_ON = `${C.green}\u25cf${C.reset}`
const DOT_OFF = `${C.dim}\u25cb${C.reset}`
const LINE = '\u2500'.repeat(40)

export async function showInventory(): Promise<void> {
  const inv = await collectInventory()
  await saveInventoryCache(inv)

  console.log(`\n${C.bold}REX Resource Inventory${C.reset}`)
  console.log(LINE)

  // Hardware
  console.log(`\n${C.cyan}\uD83D\uDDA5  Hardware${C.reset}`)
  console.log(`   CPU:  ${inv.hardware.cpu}`)
  console.log(`   RAM:  ${inv.hardware.ram}`)
  console.log(`   GPU:  ${inv.hardware.gpu}`)
  console.log(`   Disk: ${inv.hardware.diskFree}`)

  // CLIs
  const found = inv.clis.length
  const missing = CLI_LIST.filter(c => !inv.clis.find(i => i.name === c))
  console.log(`\n${C.cyan}\uD83D\uDD27  CLIs${C.reset} (${found} found)`)
  for (const cli of inv.clis) {
    const ver = cli.version ? `${C.dim}${cli.version}${C.reset}` : ''
    console.log(`   ${DOT_ON}  ${cli.name.padEnd(12)} ${ver.padEnd(28)} ${C.dim}${cli.path}${C.reset}`)
  }
  for (const name of missing) {
    console.log(`   ${DOT_OFF}  ${name.padEnd(12)} ${C.dim}not found${C.reset}`)
  }

  // Services
  console.log(`\n${C.cyan}\uD83C\uDF10  Services${C.reset}`)
  for (const svc of inv.services) {
    const dot = svc.status === 'running' ? DOT_ON : DOT_OFF
    const statusLabel = svc.status === 'running'
      ? `${C.green}running${C.reset}`
      : `${C.dim}${svc.status}${C.reset}`
    const url = svc.url ? `  ${C.dim}${svc.url}${C.reset}` : ''
    console.log(`   ${dot}  ${svc.name.padEnd(12)} ${statusLabel}${url}`)
  }

  // Models
  const genCount = inv.models.generation.length
  const embCount = inv.models.embedding.length
  console.log(`\n${C.cyan}\uD83E\uDD16  Models${C.reset} (${genCount} generation, ${embCount} embedding)`)
  if (genCount > 0) {
    const modelList = inv.models.generation.join(', ')
    console.log(`   ${C.dim}${modelList}${C.reset}`)
  } else {
    console.log(`   ${C.dim}No Ollama models found — run: ollama pull qwen3.5:latest${C.reset}`)
  }
  if (embCount > 0) {
    console.log(`   ${C.dim}embed: ${inv.models.embedding.join(', ')}${C.reset}`)
  }

  // Providers
  console.log(`\n${C.cyan}\uD83D\uDCE1  Providers${C.reset}`)
  for (const p of inv.providers) {
    const dot = p.configured ? DOT_ON : DOT_OFF
    const label = p.configured
      ? `${C.green}configured${C.reset}`
      : `${C.dim}not configured${C.reset}`
    const detail = p.details ? `  ${C.dim}${p.details}${C.reset}` : ''
    console.log(`   ${dot}  ${p.name.padEnd(12)} ${label}${detail}`)
  }

  console.log(`\n${LINE}`)
  console.log(`${C.dim}Collected at ${inv.timestamp} on ${inv.hostname}${C.reset}\n`)
}
