/**
 * REX Quick Setup — rex setup --quick
 *
 * Zero-question auto-detection. Scans available resources, writes optimal
 * provider routing config, no interaction needed.
 *
 * Detection order:
 *   1. Ollama (local, free)
 *   2. Free tier API keys
 *   3. Claude Code CLI (subscription)
 *   4. Claude API key (pay-per-use)
 *   5. Tailscale (network)
 * @module OPTIMIZE
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform, totalmem } from 'node:os'
import { FREE_TIER_PROVIDERS, getApiKey } from '../free-tiers.js'
import { loadConfig, saveConfig } from '../config.js'
import { ensureRexDirs } from '../paths.js'
import { createLogger } from '../logger.js'

const log = createLogger('OPTIMIZE:quick-setup')

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

function dot(ok: boolean) { return ok ? `${C.green}●${C.reset}` : `${C.dim}○${C.reset}` }
function ok(msg: string) { console.log(`  ${C.green}✓${C.reset}  ${msg}`) }
function info(msg: string) { console.log(`  ${C.cyan}→${C.reset}  ${msg}`) }
function miss(msg: string) { console.log(`  ${C.dim}✗${C.reset}  ${C.dim}${msg}${C.reset}`) }

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

// ── Detectors ──────────────────────────────────────────────────────

function exec(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() } catch { return '' }
}

interface OllamaInfo {
  running: boolean
  models: string[]
  hasEmbed: boolean
  hasClassify: boolean   // smallest classify model available
  latencyMs: number | null
}

async function detectOllama(): Promise<OllamaInfo> {
  const start = Date.now()
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { running: false, models: [], hasEmbed: false, hasClassify: false, latencyMs: null }
    const latencyMs = Date.now() - start
    const data = await res.json() as { models: Array<{ name: string }> }
    const models = data.models.map((m: { name: string }) => m.name)
    const hasEmbed = models.some(m => m.includes('nomic-embed-text'))
    const hasClassify = models.some(m =>
      m.includes('qwen2.5:1.5b') || m.includes('qwen3.5:4b') || m.includes('qwen3.5:9b') ||
      m.includes('qwen') || m.includes('llama')
    )
    return { running: true, models, hasEmbed, hasClassify, latencyMs }
  } catch {
    return { running: false, models: [], hasEmbed: false, hasClassify: false, latencyMs: null }
  }
}

interface ClaudeInfo {
  cliInstalled: boolean
  apiKeySet: boolean
}

function detectClaude(): ClaudeInfo {
  const cliInstalled = !!exec('which claude')
  const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || getSettingsEnv('ANTHROPIC_API_KEY'))
  return { cliInstalled, apiKeySet }
}

function detectTailscale(): boolean {
  const out = exec('tailscale status')
  return !!out && !out.includes('not running') && !out.includes('stopped') && !out.includes('command not found')
}

function detectCodex(): boolean {
  return !!(exec('which codex') || exec('codex --version'))
}

// ── Settings helpers ───────────────────────────────────────────────

function loadSettings(): Record<string, any> {
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) } catch { return {} }
}

function saveSettings(settings: Record<string, any>): void {
  const dir = join(homedir(), '.claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
}

function getSettingsEnv(key: string): string {
  try {
    const s = loadSettings()
    return s.env?.[key] || ''
  } catch { return '' }
}

// ── Routing chain builder ──────────────────────────────────────────

interface ProviderEntry {
  name: string
  tier: 'local' | 'free' | 'subscription' | 'pay-per-use'
  available: boolean
  detail?: string
}

function buildRoutingChain(
  ollama: OllamaInfo,
  claude: ClaudeInfo,
  freeTiers: Array<{ name: string; available: boolean; model: string; rpm: number }>,
): string[] {
  const chain: string[] = []

  if (ollama.running && ollama.hasClassify) {
    const classifyModel = ollama.models.find(m => m.includes('qwen2.5:1.5b')) ??
      ollama.models.find(m => m.includes('qwen')) ??
      ollama.models[0]
    chain.push(`ollama:${classifyModel}`)
  }

  for (const ft of freeTiers) {
    if (ft.available) chain.push(`free:${ft.name.toLowerCase()}`)
  }

  if (claude.cliInstalled) chain.push('claude-code')
  if (claude.apiKeySet) chain.push('claude-api')

  return chain
}

// ── Main ───────────────────────────────────────────────────────────

export async function quickSetup(): Promise<void> {
  const line = '─'.repeat(48)
  console.log(`\n${C.bold}REX Quick Setup${C.reset}  ${C.dim}auto-detect, no questions${C.reset}`)
  console.log(line)

  ensureRexDirs()

  const ramGB = Math.round(totalmem() / (1024 ** 3))
  const os = platform()
  console.log(`\n  ${C.dim}${os} · ${ramGB}GB RAM${C.reset}\n`)

  // 1. Ollama
  console.log(`${C.bold}  Local LLMs${C.reset}`)
  const ollama = await detectOllama()
  if (ollama.running) {
    ok(`Ollama  ${C.dim}${ollama.latencyMs}ms${C.reset}`)
    if (ollama.hasEmbed) ok(`  nomic-embed-text ${C.dim}(memory)${C.reset}`)
    else miss(`  nomic-embed-text missing — run: ollama pull nomic-embed-text`)

    if (ollama.models.length > 0) {
      const classify = ollama.models.find(m => m.includes('qwen2.5:1.5b')) ??
        ollama.models.find(m => m.includes('qwen'))
      if (classify) ok(`  ${classify} ${C.dim}(classify/ingest)${C.reset}`)
      info(`  ${ollama.models.length} models total: ${ollama.models.slice(0, 3).join(', ')}${ollama.models.length > 3 ? '…' : ''}`)
    }
  } else {
    miss('Ollama not running — memory embeddings disabled')
    info('Start Ollama: ollama serve')
  }

  // 2. Free tier APIs
  console.log(`\n${C.bold}  Free Tier APIs${C.reset}`)
  const freeTiers: Array<{ name: string; available: boolean; model: string; rpm: number }> = []

  for (const p of FREE_TIER_PROVIDERS) {
    if (p.name === 'Ollama') continue
    const key = getApiKey(p.envKey)
    const available = !!key
    freeTiers.push({ name: p.name, available, model: p.defaultModel, rpm: p.rpmLimit })
    if (available) {
      ok(`${p.name.padEnd(16)} ${C.dim}${p.rpmLimit} RPM · ${p.defaultModel}${C.reset}`)
    } else {
      miss(`${p.name.padEnd(16)} ${C.dim}set ${p.envKey}${C.reset}`)
    }
  }

  const freeAvailable = freeTiers.filter(f => f.available).length

  // 3. Claude
  console.log(`\n${C.bold}  Claude${C.reset}`)
  const claude = detectClaude()
  if (claude.cliInstalled) ok(`Claude Code CLI ${C.dim}(subscription)${C.reset}`)
  else miss('Claude Code CLI  not found')
  if (claude.apiKeySet) ok(`ANTHROPIC_API_KEY ${C.dim}(pay-per-use)${C.reset}`)
  else miss('ANTHROPIC_API_KEY  not set')

  // 4. Network
  console.log(`\n${C.bold}  Network${C.reset}`)
  const hasTailscale = detectTailscale()
  const hasCodex = detectCodex()
  if (hasTailscale) ok('Tailscale active')
  else miss('Tailscale  not active')
  if (hasCodex) ok('Codex CLI  available')
  else miss('Codex CLI  not found')

  // 5. Build routing chain and write config
  console.log(`\n${C.bold}  Building routing chain...${C.reset}`)
  const chain = buildRoutingChain(ollama, claude, freeTiers)

  const config = loadConfig()
  ;(config as any).providerRouting = chain
  ;(config as any).quickSetupAt = new Date().toISOString()
  ;(config as any).quickSetupSummary = {
    ollama: ollama.running,
    ollamaModels: ollama.models,
    freeTiersConfigured: freeAvailable,
    claudeCli: claude.cliInstalled,
    claudeApi: claude.apiKeySet,
    tailscale: hasTailscale,
    codex: hasCodex,
    ramGB,
    os,
  }
  saveConfig(config)

  // 6. Write OLLAMA_URL to settings if not already there
  const settings = loadSettings()
  if (!settings.env) settings.env = {}
  if (!settings.env.OLLAMA_URL && ollama.running) {
    settings.env.OLLAMA_URL = OLLAMA_URL
  }
  saveSettings(settings)

  log.info(`Quick setup done. Chain: ${chain.join(' → ')}`)

  // 7. Summary
  console.log(`\n${line}`)

  if (chain.length === 0) {
    console.log(`\n  ${C.yellow}No providers detected.${C.reset}`)
    console.log(`  Add Ollama or an API key to unlock LLM features.\n`)
    return
  }

  console.log(`\n  ${C.green}${C.bold}REX configured.${C.reset}`)
  console.log(`\n  Routing chain:`)
  for (let i = 0; i < chain.length; i++) {
    console.log(`    ${C.dim}${i + 1}.${C.reset}  ${chain[i]}`)
  }

  const features: string[] = []
  if (ollama.running && ollama.hasEmbed) features.push('memory (SQLite + embeddings)')
  else features.push('memory (plain text, no embeddings)')
  if (freeAvailable > 0) features.push(`${freeAvailable} free tier provider${freeAvailable > 1 ? 's' : ''}`)
  if (claude.cliInstalled) features.push('Claude Code (code + agents)')
  if (hasTailscale) features.push('Tailscale mesh')

  console.log(`\n  Active features:`)
  for (const f of features) console.log(`    ${C.green}✓${C.reset}  ${f}`)

  console.log(`\n  Config saved → ${C.dim}~/.claude/rex/config.json${C.reset}`)
  console.log(`\n  Next: ${C.cyan}rex doctor${C.reset} to verify all services\n`)
}
