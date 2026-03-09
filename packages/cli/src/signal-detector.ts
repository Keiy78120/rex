/**
 * REX Signal Detector — Zero-LLM environmental signal detection
 *
 * Detects system-level signals to drive intelligent routing:
 * - Hardware capacity (CPU/RAM/disk pressure)
 * - Service presence (Ollama, Commander/hub, daemon, gateway)
 * - Development state (git, uncommitted changes, pending memory)
 * - Provider availability (API keys present)
 *
 * All detection is synchronous filesystem/process checks. Zero LLM.
 * Called by daemon every cycle and by rex-launcher at startup.
 *
 * Complements project-intent.ts (project-level) with system-level signals.
 * @module CURIOUS
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir, freemem, totalmem, cpus, loadavg } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('CURIOUS:signals')
const HOME = homedir()

// ── Types ──────────────────────────────────────────────────────────

export type PressureLevel = 'ok' | 'warn' | 'critical'

/** Signal categories for CURIOUS proactive notifications */
export type SignalType = 'DISCOVERY' | 'PATTERN' | 'OPEN_LOOP'

export interface ProactiveSignal {
  type: SignalType
  title: string
  detail: string
  url?: string
  source: string
  detectedAt: string
}

export interface HardwareSignals {
  cpuCores: number
  ramGb: number
  ramFreeGb: number
  ramPressure: PressureLevel     // warn < 20%, critical < 10%
  diskFreeGb: number | null
  diskPressure: PressureLevel    // warn < 5GB, critical < 2GB
}

export interface ServiceSignals {
  ollamaRunning: boolean
  commanderRunning: boolean      // hub HTTP API on port 7420
  daemonRunning: boolean         // rex daemon process
  gatewayRunning: boolean        // Telegram gateway process
  tailscaleConnected: boolean
}

export interface DevSignals {
  inGitRepo: boolean
  hasUncommittedChanges: boolean
  currentBranch: string | null
  pendingMemoryChunks: number    // chunks in ~/.claude/rex/memory/pending/
  lastCommitMinutesAgo: number | null
}

export interface ProviderSignals {
  ollamaModels: string[]
  hasGroqKey: boolean
  hasCerebrasKey: boolean
  hasTogetherKey: boolean
  hasMistralKey: boolean
  hasOpenRouterKey: boolean
  hasDeepSeekKey: boolean
  hasAnthropicKey: boolean
  freeProviderCount: number      // providers with API keys configured
}

export interface SystemSignals {
  hardware: HardwareSignals
  services: ServiceSignals
  dev: DevSignals
  providers: ProviderSignals
  capturedAt: string
}

// ── Hardware ────────────────────────────────────────────────────────

function detectHardware(): HardwareSignals {
  const cores = cpus().length
  const totalRam = totalmem() / (1024 ** 3)
  const freeRam = freemem() / (1024 ** 3)
  const freeRatio = freeRam / totalRam

  let diskFreeGb: number | null = null
  try {
    const out = execSync('df -BG / 2>/dev/null | tail -1', { encoding: 'utf-8', timeout: 3000 })
    const match = out.match(/\s+(\d+)G\s+\d+%/)
    if (match) diskFreeGb = parseInt(match[1])
  } catch {}

  const ramPressure: PressureLevel =
    freeRatio < 0.10 ? 'critical' :
    freeRatio < 0.20 ? 'warn' : 'ok'

  const diskPressure: PressureLevel =
    diskFreeGb === null ? 'ok' :
    diskFreeGb < 2 ? 'critical' :
    diskFreeGb < 5 ? 'warn' : 'ok'

  return {
    cpuCores: cores,
    ramGb: Math.round(totalRam * 10) / 10,
    ramFreeGb: Math.round(freeRam * 10) / 10,
    ramPressure,
    diskFreeGb,
    diskPressure,
  }
}

// ── Services ────────────────────────────────────────────────────────

function probePort(port: number): boolean {
  try {
    execSync(`nc -z -w1 127.0.0.1 ${port}`, { stdio: 'ignore', timeout: 2000 })
    return true
  } catch {
    return false
  }
}

function pgrepRunning(pattern: string): boolean {
  const r = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf-8' })
  return r.status === 0 && Boolean(r.stdout?.trim())
}

function detectServices(): ServiceSignals {
  const ollamaRunning = probePort(11434)
  const commanderRunning = probePort(7420)
  const daemonRunning = pgrepRunning('rex daemon')
  const gatewayRunning = pgrepRunning('rex gateway') || pgrepRunning('gateway.js')

  let tailscaleConnected = false
  try {
    const out = execSync('tailscale status --json 2>/dev/null', { encoding: 'utf-8', timeout: 3000 })
    const data = JSON.parse(out) as { BackendState?: string }
    tailscaleConnected = data.BackendState === 'Running'
  } catch {}

  return { ollamaRunning, commanderRunning, daemonRunning, gatewayRunning, tailscaleConnected }
}

// ── Dev ─────────────────────────────────────────────────────────────

function detectDev(): DevSignals {
  let inGitRepo = false
  let hasUncommittedChanges = false
  let currentBranch: string | null = null
  let lastCommitMinutesAgo: number | null = null

  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', timeout: 2000 })
    inGitRepo = true
    const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 3000 })
    hasUncommittedChanges = status.trim().length > 0
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 2000 }).trim()
    const tsStr = execSync('git log -1 --format=%ct', { encoding: 'utf-8', timeout: 2000 }).trim()
    if (tsStr) lastCommitMinutesAgo = Math.round((Date.now() - parseInt(tsStr) * 1000) / 60_000)
  } catch {}

  let pendingMemoryChunks = 0
  try {
    const pendingDir = join(HOME, '.claude/rex/memory/pending')
    if (existsSync(pendingDir)) {
      pendingMemoryChunks = readdirSync(pendingDir).filter(f => f.endsWith('.json')).length
    }
  } catch {}

  return { inGitRepo, hasUncommittedChanges, currentBranch, pendingMemoryChunks, lastCommitMinutesAgo }
}

// ── Providers ────────────────────────────────────────────────────────

function readSettingsEnv(): Record<string, string> {
  try {
    const settingsPath = join(HOME, '.claude/settings.json')
    if (!existsSync(settingsPath)) return {}
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { env?: Record<string, string> }
    return data.env ?? {}
  } catch {
    return {}
  }
}

function hasKey(envKey: string, env: Record<string, string>): boolean {
  return Boolean(process.env[envKey] || env[envKey])
}

function detectProviders(): ProviderSignals {
  const env = readSettingsEnv()

  let ollamaModels: string[] = []
  try {
    const out = execSync('curl -sf http://localhost:11434/api/tags --max-time 2', { encoding: 'utf-8', timeout: 3000 })
    const data = JSON.parse(out) as { models?: Array<{ name: string }> }
    ollamaModels = data.models?.map(m => m.name) ?? []
  } catch {}

  const hasGroqKey = hasKey('GROQ_API_KEY', env)
  const hasCerebrasKey = hasKey('CEREBRAS_API_KEY', env)
  const hasTogetherKey = hasKey('TOGETHER_API_KEY', env)
  const hasMistralKey = hasKey('MISTRAL_API_KEY', env)
  const hasOpenRouterKey = hasKey('OPENROUTER_API_KEY', env)
  const hasDeepSeekKey = hasKey('DEEPSEEK_API_KEY', env)
  const hasAnthropicKey = hasKey('ANTHROPIC_API_KEY', env)
  const freeProviderCount = [hasGroqKey, hasCerebrasKey, hasTogetherKey, hasMistralKey, hasOpenRouterKey, hasDeepSeekKey].filter(Boolean).length

  return {
    ollamaModels, hasGroqKey, hasCerebrasKey, hasTogetherKey,
    hasMistralKey, hasOpenRouterKey, hasDeepSeekKey, hasAnthropicKey,
    freeProviderCount,
  }
}

// ── Cache ────────────────────────────────────────────────────────────

let _cache: SystemSignals | null = null
let _cacheTime = 0
const CACHE_TTL_MS = 30_000  // 30s — fast enough for daemon cycles

// ── Public API ───────────────────────────────────────────────────────

/**
 * Detect all system signals. Cached 30s to avoid hammering disk/process.
 */
export function detectSignals(forceRefresh = false): SystemSignals {
  const now = Date.now()
  if (!forceRefresh && _cache && now - _cacheTime < CACHE_TTL_MS) return _cache

  log.debug('running full signal detection')
  const hardware = detectHardware()
  const services = detectServices()
  const dev = detectDev()
  const providers = detectProviders()

  _cache = { hardware, services, dev, providers, capturedAt: new Date().toISOString() }
  _cacheTime = now
  return _cache
}

/**
 * True if RAM or disk is at critical pressure.
 * Daemon uses this to throttle heavy operations.
 */
export function isUnderPressure(): boolean {
  const s = detectSignals()
  return s.hardware.ramPressure === 'critical' || s.hardware.diskPressure === 'critical'
}

/**
 * True if any LLM backend is available (Ollama or free tier API key).
 */
export function hasLLMBackend(): boolean {
  const s = detectSignals()
  return s.services.ollamaRunning || s.providers.freeProviderCount > 0
}

/**
 * True if Commander (hub) HTTP API is reachable on port 7420.
 */
export function isCommanderReachable(): boolean {
  return probePort(7420)
}

/**
 * Returns CPU load percentage (0–100) based on 1-min loadavg vs core count.
 * Values >80 indicate the system is under heavy CPU load.
 */
export function getCpuLoadPercent(): number {
  const avg1m = loadavg()[0]
  const cores = cpus().length
  return Math.min(100, Math.round((avg1m / cores) * 100))
}

/**
 * Returns RAM usage percentage (0–100).
 * Values >90 indicate high memory pressure.
 */
export function getRamUsedPercent(): number {
  const total = totalmem()
  const free = freemem()
  return Math.round(((total - free) / total) * 100)
}

/**
 * Print a compact signal summary to stdout.
 */
export function printSignals(signals?: SystemSignals): void {
  const s = signals ?? detectSignals()
  const { hardware: h, services: sv, dev: d, providers: p } = s

  const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m'
  const DIM = '\x1b[2m', RST = '\x1b[0m', BOLD = '\x1b[1m'

  const lvl = (l: PressureLevel) =>
    l === 'ok' ? `${G}ok${RST}` : l === 'warn' ? `${Y}warn${RST}` : `${R}critical${RST}`
  const dot = (ok: boolean) => ok ? `${G}●${RST}` : `${DIM}○${RST}`

  console.log(`\n${BOLD}REX Signals${RST}  ${DIM}${s.capturedAt}${RST}`)
  console.log(`\n  ${BOLD}Hardware${RST}`)
  console.log(`    CPU ${h.cpuCores}  RAM ${h.ramFreeGb}/${h.ramGb}GB ${lvl(h.ramPressure)}  Disk ${h.diskFreeGb ?? '?'}GB ${lvl(h.diskPressure)}`)
  console.log(`\n  ${BOLD}Services${RST}`)
  console.log(`    ${dot(sv.ollamaRunning)} Ollama  ${dot(sv.commanderRunning)} Commander  ${dot(sv.daemonRunning)} Daemon  ${dot(sv.gatewayRunning)} Gateway  ${dot(sv.tailscaleConnected)} Tailscale`)
  console.log(`\n  ${BOLD}Dev${RST}`)
  console.log(`    Branch: ${d.currentBranch ?? 'none'}  Changes: ${d.hasUncommittedChanges ? `${Y}yes${RST}` : 'no'}  Pending memory: ${d.pendingMemoryChunks}`)
  console.log(`\n  ${BOLD}Providers${RST}`)
  console.log(`    Ollama: ${p.ollamaModels.length} models  Free tier: ${p.freeProviderCount}/6 APIs  Anthropic: ${dot(p.hasAnthropicKey)}\n`)
}
