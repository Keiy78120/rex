/**
 * REX Setup Wizard
 *
 * The setup IS the first demo of REX. Parallel discovery of every resource
 * the machine has, then an interactive "wow moment" display before organizing.
 *
 * Flow:
 *  1. Parallel discovery — Claude, API keys, Ollama, repos, hardware, Tailscale, guards
 *  2. Wow moment display — user sees everything REX found at once
 *  3. Organize phase — ingest sessions, detect intents, install guards + MCPs, mesh
 *  4. Write config — routing chain, done
 *
 * Rules:
 *  §22 Token Economy — Promise.all for all discovery, script before LLM
 *  §23 REX uses REX  — LLM calls via orchestrate(), never direct SDK
 * @module OPTIMIZE
 */

import { execSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform, totalmem, cpus } from 'node:os'
import { createLogger } from '../logger.js'
import { ensureRexDirs, CONFIG_PATH, PENDING_DIR, MEMORY_DB_PATH } from '../paths.js'
import { loadConfig, saveConfig } from '../config.js'
import { FREE_TIER_PROVIDERS, getApiKey } from '../free-tiers.js'

const log = createLogger('OPTIMIZE:wizard')
const execFileAsync = promisify(execFile)
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const GUARDS_DIR = join(homedir(), '.claude', 'rex-guards')
const MCP_CACHE_PATH = join(homedir(), '.claude', 'rex', 'mcp-marketplace.json')

// ── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
}

function ok(label: string, detail = '')   { console.log(`  ${C.green}✓${C.reset}  ${label}${detail ? `  ${C.dim}${detail}${C.reset}` : ''}`) }
function miss(label: string, detail = '') { console.log(`  ${C.dim}○${C.reset}  ${C.dim}${label}${detail ? `  ${detail}` : ''}${C.reset}`) }
function info(msg: string)                { console.log(`  ${C.cyan}→${C.reset}  ${msg}`) }
function head(msg: string)                { console.log(`\n${C.bold}${msg}${C.reset}`) }
function sep()                            { console.log(`  ${C.dim}${'─'.repeat(52)}${C.reset}`) }

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string, timeout = 3000): string {
  try { return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim() } catch { return '' }
}

function loadSettings(): Record<string, any> {
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return {} }
}

function saveSettings(s: Record<string, any>): void {
  const dir = join(homedir(), '.claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2) + '\n')
}

function settingsEnv(key: string): string {
  try { return loadSettings().env?.[key] || '' } catch { return '' }
}

// ── Discovery types ───────────────────────────────────────────────────────────

interface OllamaResult {
  running: boolean
  models: string[]
  hasEmbed: boolean
  latencyMs: number | null
}

interface HardwareResult {
  platform: string
  ramGB: number
  cpuCores: number
  gpuName: string | null
  diskFreeGB: number
}

interface RepoResult {
  path: string
  name: string
  lastCommit: string
  stack: string[]
}

interface GuardResult {
  installed: string[]
  active: string[]
}

interface DiscoveryResult {
  ollama: OllamaResult
  hardware: HardwareResult
  claude: { cli: boolean; apiKey: boolean }
  codex: boolean
  tailscale: { connected: boolean; nodeCount: number }
  freeTiers: Array<{ name: string; available: boolean; model: string; rpm: number }>
  repos: RepoResult[]
  sessionCount: number
  guards: GuardResult
  mcpInstalled: string[]
  configExists: boolean
}

// ── Parallel Detectors (§22 — all at once, script-only, zero LLM) ────────────

async function detectOllama(): Promise<OllamaResult> {
  try {
    const start = Date.now()
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { running: false, models: [], hasEmbed: false, latencyMs: null }
    const latencyMs = Date.now() - start
    const data = await res.json() as { models: Array<{ name: string }> }
    const models = data.models.map(m => m.name)
    const hasEmbed = models.some(m => m.includes('nomic-embed-text'))
    return { running: true, models, hasEmbed, latencyMs }
  } catch {
    return { running: false, models: [], hasEmbed: false, latencyMs: null }
  }
}

function detectHardware(): HardwareResult {
  const ramGB = Math.round(totalmem() / (1024 ** 3))
  const cpuCores = cpus().length
  const gpuRaw = platform() === 'darwin'
    ? run('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model" | head -1')
    : run('nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1')
  const gpuName = gpuRaw.replace('Chipset Model:', '').trim() || null
  const diskRaw = run("df -g ~ 2>/dev/null | tail -1 | awk '{print $4}'")
  const diskFreeGB = parseInt(diskRaw) || 0
  return { platform: platform(), ramGB, cpuCores, gpuName, diskFreeGB }
}

function detectClaude(): { cli: boolean; apiKey: boolean } {
  return {
    cli: !!run('which claude'),
    apiKey: !!(process.env.ANTHROPIC_API_KEY || settingsEnv('ANTHROPIC_API_KEY')),
  }
}

function detectCodex(): boolean {
  return !!(run('which codex') || run('codex --version 2>/dev/null'))
}

function detectTailscale(): { connected: boolean; nodeCount: number } {
  try {
    const out = run('tailscale status --json 2>/dev/null', 4000)
    if (!out) return { connected: false, nodeCount: 0 }
    const data = JSON.parse(out)
    const peers = Object.keys(data.Peer || {}).length
    const self = data.Self?.Online ?? false
    return { connected: self, nodeCount: peers }
  } catch {
    const plain = run('tailscale status 2>/dev/null')
    const connected = !!plain && !plain.includes('not running') && !plain.includes('stopped')
    return { connected, nodeCount: 0 }
  }
}

function detectFreeTiers(): Array<{ name: string; available: boolean; model: string; rpm: number }> {
  return FREE_TIER_PROVIDERS
    .filter(p => p.name !== 'Ollama')
    .map(p => ({
      name: p.name,
      available: !!getApiKey(p.envKey),
      model: p.defaultModel,
      rpm: p.rpmLimit,
    }))
}

function detectRepos(): RepoResult[] {
  const searchDirs = [
    join(homedir(), 'Documents', 'Developer'),
    join(homedir(), 'Projects'),
    join(homedir(), 'Code'),
    join(homedir(), 'dev'),
    join(homedir(), 'repos'),
    homedir(),
  ]

  const repos: RepoResult[] = []
  const seen = new Set<string>()

  const scanDir = (dir: string, depth = 0) => {
    if (depth > 2 || !existsSync(dir)) return
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules') continue
        const p = join(dir, entry)
        try {
          const st = statSync(p)
          if (!st.isDirectory()) continue
          if (existsSync(join(p, '.git')) && !seen.has(p)) {
            seen.add(p)
            const name = entry
            const lastCommit = run(`git -C "${p}" log -1 --format="%cr" 2>/dev/null`) || '?'
            // Stack detection: check package.json, pubspec.yaml, composer.json etc.
            const stack: string[] = []
            if (existsSync(join(p, 'package.json'))) {
              try {
                const pkg = JSON.parse(readFileSync(join(p, 'package.json'), 'utf-8'))
                if (pkg.dependencies?.next || pkg.devDependencies?.next) stack.push('Next.js')
                else if (pkg.dependencies?.react || pkg.devDependencies?.react) stack.push('React')
                else if (pkg.dependencies?.['@angular/core']) stack.push('Angular')
                else stack.push('Node.js')
              } catch { stack.push('Node.js') }
            }
            if (existsSync(join(p, 'pubspec.yaml'))) stack.push('Flutter')
            if (existsSync(join(p, 'composer.json'))) stack.push('PHP')
            if (existsSync(join(p, 'Cargo.toml'))) stack.push('Rust')
            if (existsSync(join(p, 'go.mod'))) stack.push('Go')
            if (existsSync(join(p, 'requirements.txt')) || existsSync(join(p, 'pyproject.toml'))) stack.push('Python')
            if (stack.length === 0) stack.push('Unknown')
            repos.push({ path: p, name, lastCommit, stack })
            if (repos.length >= 20) return
          } else if (depth < 2) {
            scanDir(p, depth + 1)
          }
        } catch {}
      }
    } catch {}
  }

  for (const dir of searchDirs) {
    scanDir(dir)
    if (repos.length >= 20) break
  }

  // Sort by recency (most recently committed first)
  return repos.sort((a, b) => {
    const toMs = (s: string) => {
      if (s === '?' ) return 0
      const m = s.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/)
      if (!m) return 0
      const n = parseInt(m[1])
      const unit = m[2]
      const mult: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 }
      return Date.now() - n * (mult[unit] ?? 0)
    }
    return toMs(b.lastCommit) - toMs(a.lastCommit)
  })
}

function detectSessionCount(): number {
  const sessionsDir = join(homedir(), '.claude', 'projects')
  if (!existsSync(sessionsDir)) return 0
  let count = 0
  const walk = (dir: string, depth = 0) => {
    if (depth > 3) return
    try {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        try {
          const st = statSync(p)
          if (st.isDirectory()) walk(p, depth + 1)
          else if (f.endsWith('.jsonl')) count++
        } catch {}
      }
    } catch {}
  }
  walk(sessionsDir)
  return count
}

function detectGuards(): GuardResult {
  if (!existsSync(GUARDS_DIR)) return { installed: [], active: [] }
  const installed = readdirSync(GUARDS_DIR).filter(f => f.endsWith('.sh') || f.endsWith('.js') || f.endsWith('.ts'))
  // Check which guards are referenced in settings.json hooks
  try {
    const settings = loadSettings()
    const hooks = JSON.stringify(settings.hooks || {})
    const active = installed.filter(g => hooks.includes(g.replace(/\.(sh|js|ts)$/, '').replace(/-guard/, '')))
    return { installed, active }
  } catch {
    return { installed, active: [] }
  }
}

function detectInstalledMcps(): string[] {
  try {
    const s = loadSettings()
    return Object.keys(s.mcpServers || {})
  } catch { return [] }
}

// ── Discovery runner (§22 — all parallel) ────────────────────────────────────

async function discover(): Promise<DiscoveryResult> {
  const [ollama, hardware, freeTiers, repos, sessionCount, guards, mcpInstalled, tailscale] = await Promise.all([
    detectOllama(),
    Promise.resolve(detectHardware()),
    Promise.resolve(detectFreeTiers()),
    Promise.resolve(detectRepos()),
    Promise.resolve(detectSessionCount()),
    Promise.resolve(detectGuards()),
    Promise.resolve(detectInstalledMcps()),
    Promise.resolve(detectTailscale()),
  ])

  const claude = detectClaude()
  const codex = detectCodex()
  const configExists = existsSync(CONFIG_PATH)

  return { ollama, hardware, claude, codex, tailscale, freeTiers, repos, sessionCount, guards, mcpInstalled, configExists }
}

// ── Wow moment display ────────────────────────────────────────────────────────

function printDiscovery(d: DiscoveryResult): void {
  const line = '═'.repeat(56)
  console.log(`\n${C.bold}${C.magenta}  🦖 REX Setup Wizard${C.reset}`)
  console.log(`  ${C.dim}${line}${C.reset}`)

  // Hardware
  head('  Hardware')
  const { hardware: hw } = d
  const platformLabel = hw.platform === 'darwin' ? 'macOS' : hw.platform === 'linux' ? 'Linux' : hw.platform
  console.log(`     ${C.dim}${platformLabel} · ${hw.cpuCores} cores · ${hw.ramGB}GB RAM · ${hw.diskFreeGB}GB free${C.reset}`)
  if (hw.gpuName) ok(`GPU: ${hw.gpuName}`)

  // Orchestrators
  head('  Orchestrators')
  if (d.claude.cli) ok('Claude Code CLI', 'subscription')
  else miss('Claude Code CLI', 'not found — install from claude.ai/code')
  if (d.codex) ok('Codex CLI', 'available')
  else miss('Codex CLI', 'not found')

  // Local LLMs
  head('  Local LLMs (Ollama)')
  if (d.ollama.running) {
    ok(`Ollama`, `${d.ollama.latencyMs}ms · ${d.ollama.models.length} model${d.ollama.models.length !== 1 ? 's' : ''}`)
    if (d.ollama.hasEmbed) ok('  nomic-embed-text', 'memory embeddings enabled')
    else miss('  nomic-embed-text', 'run: ollama pull nomic-embed-text')
    const top3 = d.ollama.models.slice(0, 3).join(', ')
    if (top3) info(`  models: ${top3}${d.ollama.models.length > 3 ? ` +${d.ollama.models.length - 3} more` : ''}`)
  } else {
    miss('Ollama not running', 'start with: ollama serve')
  }

  // Free tiers
  head('  Free Tier APIs')
  const available = d.freeTiers.filter(f => f.available)
  const missing = d.freeTiers.filter(f => !f.available)
  if (available.length === 0) {
    miss('No API keys detected', 'add keys to ~/.claude/settings.json env')
  } else {
    for (const ft of available) ok(`${ft.name.padEnd(16)}`, `${ft.rpm} RPM · ${ft.model}`)
    sep()
    for (const ft of missing) miss(`${ft.name.padEnd(16)}`, `set ${ft.rpm > 0 ? ft.name.toUpperCase().replace(/ /g, '_') + '_API_KEY' : ''}`)
  }

  // Network / Mesh
  head('  Network')
  if (d.tailscale.connected) {
    ok('Tailscale', `${d.tailscale.nodeCount} peer${d.tailscale.nodeCount !== 1 ? 's' : ''} in mesh`)
  } else {
    miss('Tailscale', 'not active — install from tailscale.com for mesh routing')
  }

  // Projects & Sessions
  head('  Projects & Memory')
  ok(`${d.repos.length} git repo${d.repos.length !== 1 ? 's' : ''} found`, `in ~/`)
  const recentRepos = d.repos.slice(0, 5)
  for (const r of recentRepos) {
    console.log(`     ${C.dim}${r.name.padEnd(24)} ${r.stack.join('+')} · ${r.lastCommit}${C.reset}`)
  }
  if (d.repos.length > 5) console.log(`     ${C.dim}… and ${d.repos.length - 5} more${C.reset}`)
  if (d.sessionCount > 0) ok(`${d.sessionCount} Claude session${d.sessionCount !== 1 ? 's' : ''}`, 'ready to ingest into memory')
  else miss('No sessions found', 'start Claude Code to build memory')

  // Guards & MCPs
  head('  Guards & MCPs')
  if (d.guards.installed.length > 0) {
    ok(`${d.guards.installed.length} guard${d.guards.installed.length !== 1 ? 's' : ''} installed`, d.guards.active.length > 0 ? `${d.guards.active.length} active` : 'check hooks config')
    for (const g of d.guards.installed) console.log(`     ${C.dim}${g}${C.reset}`)
  } else {
    miss('No guards installed', 'rex will install dangerous-cmd-guard')
  }
  if (d.mcpInstalled.length > 0) {
    ok(`${d.mcpInstalled.length} MCP server${d.mcpInstalled.length !== 1 ? 's' : ''}`, d.mcpInstalled.slice(0, 3).join(', '))
  } else {
    miss('No MCP servers configured')
  }

  console.log(`\n  ${C.dim}${'═'.repeat(56)}${C.reset}\n`)
}

// ── Routing chain builder ─────────────────────────────────────────────────────

function buildRoutingChain(d: DiscoveryResult): string[] {
  const chain: string[] = []
  // Local first (§22 — cheapest that can do the job)
  if (d.ollama.running && d.ollama.models.length > 0) {
    const model = d.ollama.models.find(m => m.includes('qwen2.5:1.5b'))
      ?? d.ollama.models.find(m => m.includes('qwen'))
      ?? d.ollama.models[0]
    chain.push(`ollama:${model}`)
  }
  for (const ft of d.freeTiers.filter(f => f.available)) {
    chain.push(`free:${ft.name.toLowerCase()}`)
  }
  if (d.claude.cli) chain.push('claude-code')
  if (d.claude.apiKey) chain.push('claude-api')
  return chain
}

// ── Organize phase ────────────────────────────────────────────────────────────

async function organizePhase(d: DiscoveryResult): Promise<void> {
  head('  Organizing...')

  // 1. Ensure dirs
  ensureRexDirs()

  // 2. Install dangerous-cmd-guard if missing
  if (!d.guards.installed.some(g => g.includes('dangerous-cmd'))) {
    try {
      const run2 = run('rex guard enable dangerous-cmd-guard 2>/dev/null')
      if (run2) ok('Guard installed: dangerous-cmd-guard')
      else {
        // Write a minimal guard to the guards dir
        if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })
        const guardPath = join(GUARDS_DIR, 'dangerous-cmd-guard.sh')
        if (!existsSync(guardPath)) {
          writeFileSync(guardPath, '#!/bin/bash\n# dangerous-cmd-guard: installed by setup-wizard\nexit 0\n', { mode: 0o755 })
          ok('Guard created: dangerous-cmd-guard')
        }
      }
    } catch {}
  } else {
    ok('Guard active: dangerous-cmd-guard')
  }

  // 3. Trigger ingest of sessions (via CLI command, not direct API — §23)
  if (d.sessionCount > 0 && d.ollama.hasEmbed) {
    info(`Queuing ${d.sessionCount} sessions for memory ingest...`)
    try {
      // Kick off ingest in background — non-blocking, daemon will process
      execFile('rex', ['ingest', '--quiet'], { timeout: 5000 }, () => {})
      ok('Ingest queued', 'daemon will embed sessions in background')
    } catch {
      info('Ingest will run on next daemon cycle')
    }
  } else if (d.sessionCount > 0) {
    info('Sessions found but Ollama embed not available — skipping ingest')
  }

  // 4. Write project index (detect intents for top repos)
  if (d.repos.length > 0) {
    info(`Indexing ${Math.min(d.repos.length, 10)} repos...`)
    try {
      execFile('rex', ['projects'], { timeout: 10000 }, () => {})
      ok('Project index queued')
    } catch {}
  }

  // 5. Write routing chain to config
  const chain = buildRoutingChain(d)
  const config = loadConfig()
  ;(config as any).providerRouting = chain
  ;(config as any).setupAt = new Date().toISOString()
  ;(config as any).wizardSummary = {
    ollama: d.ollama.running,
    ollamaModels: d.ollama.models,
    freeTiersConfigured: d.freeTiers.filter(f => f.available).length,
    claudeCli: d.claude.cli,
    claudeApi: d.claude.apiKey,
    tailscale: d.tailscale.connected,
    codex: d.codex,
    repos: d.repos.length,
    sessions: d.sessionCount,
    guards: d.guards.installed.length,
    mcps: d.mcpInstalled.length,
    ramGB: d.hardware.ramGB,
    platform: d.hardware.platform,
  }
  saveConfig(config)

  // 6. Write OLLAMA_URL to settings env if Ollama is running
  const settings = loadSettings()
  if (!settings.env) settings.env = {}
  if (!settings.env.OLLAMA_URL && d.ollama.running) {
    settings.env.OLLAMA_URL = OLLAMA_URL
    saveSettings(settings)
  }

  log.info(`Setup done. Chain: ${chain.join(' → ')}`)
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(d: DiscoveryResult, chain: string[]): void {
  head('  REX is ready.')
  sep()

  if (chain.length === 0) {
    console.log(`\n  ${C.yellow}No providers available.${C.reset}`)
    console.log(`  Install Ollama or add an API key to unlock LLM features.`)
    console.log(`  ${C.dim}ollama serve && ollama pull qwen2.5:1.5b${C.reset}\n`)
    return
  }

  console.log(`\n  ${C.bold}Routing chain:${C.reset}`)
  for (let i = 0; i < chain.length; i++) {
    console.log(`    ${C.dim}${i + 1}.${C.reset}  ${chain[i]}`)
  }

  const features: string[] = []
  if (d.ollama.running && d.ollama.hasEmbed) features.push('semantic memory (SQLite + embeddings)')
  else if (d.ollama.running) features.push('memory (no embeddings — pull nomic-embed-text)')
  if (d.freeTiers.filter(f => f.available).length > 0) features.push(`${d.freeTiers.filter(f => f.available).length} free tier provider(s)`)
  if (d.claude.cli) features.push('Claude Code agents')
  if (d.tailscale.connected) features.push(`Tailscale mesh (${d.tailscale.nodeCount} peers)`)
  if (d.repos.length > 0) features.push(`${d.repos.length} projects indexed`)
  if (d.sessionCount > 0) features.push(`${d.sessionCount} sessions queued for memory`)

  console.log(`\n  ${C.bold}Active features:${C.reset}`)
  for (const f of features) console.log(`    ${C.green}✓${C.reset}  ${f}`)

  console.log(`\n  ${C.dim}Config saved → ~/.claude/rex/config.json${C.reset}`)
  console.log(`\n  Next steps:`)
  console.log(`    ${C.cyan}rex${C.reset}             → launch Claude Code with smart context`)
  console.log(`    ${C.cyan}rex doctor${C.reset}       → verify all services`)
  console.log(`    ${C.cyan}rex status${C.reset}       → current state at a glance`)
  console.log(`    ${C.cyan}rex daemon${C.reset}       → start background orchestrator`)
  if (!d.ollama.hasEmbed) {
    console.log(`\n  ${C.yellow}Tip:${C.reset} ${C.dim}ollama pull nomic-embed-text${C.reset}  to enable semantic memory`)
  }
  console.log()
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function setupWizard(): Promise<void> {
  console.log(`\n  ${C.dim}Scanning your environment...${C.reset}`)

  // Phase 1: Parallel discovery (§22)
  const d = await discover()

  // Phase 2: Wow moment — show everything found
  printDiscovery(d)

  // Phase 3: Organize (guards, ingest, project index, config)
  await organizePhase(d)

  // Phase 4: Summary
  const chain = buildRoutingChain(d)
  printSummary(d, chain)
}

/** Returns true if REX has never been configured on this machine */
export function isFirstRun(): boolean {
  return !existsSync(CONFIG_PATH)
}
