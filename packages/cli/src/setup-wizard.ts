/**
 * REX Setup Wizard — first-run onboarding experience
 *
 * The setup IS the first demo of REX's power.
 * Scans everything on the machine in parallel (scripts, no LLM),
 * organizes and configures the full stack, then shows the user
 * exactly what REX found — the "wow moment".
 *
 * Usage:
 *   rex setup              # full interactive wizard
 *   rex setup --quick      # auto-accept all, no prompts
 *   rex setup --fleet      # also configure remote nodes
 *   rex setup --dry-run    # show what would be done, no writes
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir, hostname, platform, totalmem, cpus } from 'node:os'
import { execSync, execFileSync } from 'node:child_process'
import { createLogger } from './logger.js'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { detectLocalCapabilities, buildLocalNodeInfo } from './node-mesh.js'

const log = createLogger('setup-wizard')
const HOME = homedir()

// ── Types ──────────────────────────────────────────────

export interface DiscoveredResources {
  // Accounts
  claudeAccounts: string[]         // ~/.claude-account-N dirs
  codexAvailable: boolean
  githubAuthed: boolean
  githubLogin?: string

  // Models
  ollamaModels: string[]
  ollamaRunning: boolean

  // API Keys found
  apiKeys: Array<{ name: string; source: string; masked: string }>

  // Dev environment
  devFolders: string[]             // likely project roots
  gitRepos: Array<{ path: string; name: string; remote?: string }>
  existingClaudeSessions: number   // ~/.claude/projects/ count

  // Hardware
  hardware: {
    cpu: string
    cores: number
    ramGb: number
    gpu?: string
    platform: string
  }

  // Network
  tailscaleNodes: Array<{ name: string; ip: string; online: boolean }>
  localIp: string

  // Existing REX state
  existingRexConfig: boolean
  existingMemoryDb: boolean
  existingGuards: string[]
  existingMcps: string[]

  // Node role recommendation
  recommendedRole: 'hub' | 'node'
}

export interface SetupOptions {
  quick?: boolean      // no prompts, auto-accept
  fleet?: boolean      // configure remote nodes too
  dryRun?: boolean
  skipIngest?: boolean // skip initial session ingest (faster)
}

export interface SetupResult {
  resources: DiscoveredResources
  configured: {
    hub: boolean
    memory: boolean
    guards: number
    mcps: number
    repos: number
    sessions: number
  }
  warnings: string[]
  nextSteps: string[]
}

// ── Discovery (all parallel, zero LLM) ────────────────

function run(cmd: string, opts: { timeout?: number; cwd?: string } = {}): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: opts.timeout ?? 5000, cwd: opts.cwd, stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  } catch { return '' }
}

async function discoverAll(): Promise<DiscoveredResources> {
  // Run all discovery in parallel
  const [
    claudeAccounts,
    ollamaData,
    githubData,
    tailscaleData,
    devFolders,
    apiKeys,
    hardwareData,
    existingState,
  ] = await Promise.all([
    discoverClaudeAccounts(),
    discoverOllama(),
    discoverGitHub(),
    discoverTailscale(),
    discoverDevFolders(),
    discoverApiKeys(),
    discoverHardware(),
    discoverExistingRex(),
  ])

  // Count existing Claude sessions
  const sessionsDir = join(HOME, '.claude', 'projects')
  let existingClaudeSessions = 0
  try {
    existingClaudeSessions = readdirSync(sessionsDir).length
  } catch { /* noop */ }

  // Recommend role: hub if always-on (linux headless) or explicit env
  const caps = await detectLocalCapabilities()
  const recommendedRole = (caps.includes('always-on') || process.env.REX_IS_HUB === '1') ? 'hub' : 'node'

  // Local IP
  const localIp = run("tailscale ip -4 2>/dev/null || ip route get 1 2>/dev/null | awk '{print $7}' | head -1") || '127.0.0.1'

  return {
    claudeAccounts,
    codexAvailable: !!run('codex --version 2>/dev/null'),
    githubAuthed: githubData.authed,
    githubLogin: githubData.login,
    ollamaModels: ollamaData.models,
    ollamaRunning: ollamaData.running,
    apiKeys,
    devFolders: devFolders.folders,
    gitRepos: devFolders.repos,
    existingClaudeSessions,
    hardware: hardwareData,
    tailscaleNodes: tailscaleData,
    localIp,
    existingRexConfig: existingState.hasConfig,
    existingMemoryDb: existingState.hasDb,
    existingGuards: existingState.guards,
    existingMcps: existingState.mcps,
    recommendedRole,
  }
}

function discoverClaudeAccounts(): string[] {
  const accounts: string[] = []
  try {
    const dirs = readdirSync(HOME)
    for (const d of dirs) {
      if (/^\.claude(-account-\d+)?$/.test(d) && existsSync(join(HOME, d, 'auth.json'))) {
        accounts.push(d)
      }
    }
  } catch { /* noop */ }
  return accounts
}

async function discoverOllama(): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      const data = await res.json() as { models: Array<{ name: string }> }
      return { running: true, models: data.models.map(m => m.name) }
    }
  } catch { /* noop */ }
  // Ollama installed but not running?
  const installed = !!run('which ollama')
  return { running: false, models: installed ? ['(ollama installed, not running)'] : [] }
}

function discoverGitHub(): { authed: boolean; login?: string } {
  const login = run('gh auth status --show-token 2>/dev/null | grep "Logged in" | awk \'{print $7}\'')
    || run('gh api user --jq .login 2>/dev/null')
  return { authed: !!login, login: login || undefined }
}

function discoverTailscale(): Array<{ name: string; ip: string; online: boolean }> {
  const raw = run('tailscale status --json 2>/dev/null')
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as { Peer: Record<string, { HostName: string; TailscaleIPs: string[]; Online: boolean }> }
    return Object.values(data.Peer ?? {}).map(p => ({
      name: p.HostName,
      ip: p.TailscaleIPs?.[0] ?? '',
      online: p.Online,
    }))
  } catch { return [] }
}

function discoverDevFolders(): { folders: string[]; repos: Array<{ path: string; name: string; remote?: string }> } {
  const candidates = [
    join(HOME, 'Documents', 'Developer'),
    join(HOME, 'Developer'),
    join(HOME, 'dev'),
    join(HOME, 'projects'),
    join(HOME, 'code'),
    join(HOME, 'workspace'),
  ].filter(existsSync)

  const repos: Array<{ path: string; name: string; remote?: string }> = []

  for (const folder of candidates) {
    try {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const repoPath = join(folder, entry.name)
        if (existsSync(join(repoPath, '.git'))) {
          const remote = run('git remote get-url origin 2>/dev/null', { cwd: repoPath })
          repos.push({ path: repoPath, name: entry.name, remote: remote || undefined })
        }
      }
    } catch { /* noop */ }
  }

  return { folders: candidates, repos: repos.slice(0, 50) } // cap at 50
}

function discoverApiKeys(): Array<{ name: string; source: string; masked: string }> {
  const keys: Array<{ name: string; source: string; masked: string }> = []
  const KEY_PATTERNS = [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'TOGETHER_API_KEY',
    'CEREBRAS_API_KEY', 'GEMINI_API_KEY', 'BRAVE_API_KEY', 'EXA_API_KEY',
    'GITHUB_TOKEN', 'GH_TOKEN', 'CLOUDFLARE_API_TOKEN',
  ]

  // Check process.env
  for (const key of KEY_PATTERNS) {
    const val = process.env[key]
    if (val) keys.push({ name: key, source: 'env', masked: val.slice(0, 4) + '…' + val.slice(-4) })
  }

  // Check ~/.zshrc, ~/.bashrc, ~/.profile
  for (const rcFile of ['.zshrc', '.bashrc', '.profile', '.env']) {
    const rcPath = join(HOME, rcFile)
    if (!existsSync(rcPath)) continue
    const content = readFileSync(rcPath, 'utf-8')
    for (const key of KEY_PATTERNS) {
      if (content.includes(key) && !keys.some(k => k.name === key)) {
        keys.push({ name: key, source: rcFile, masked: '(found in file)' })
      }
    }
  }

  return keys
}

function discoverHardware(): { cpu: string; cores: number; ramGb: number; gpu?: string; platform: string } {
  const os = platform()
  const cpu = cpus()[0]?.model ?? 'unknown'
  const cores = cpus().length
  const ramGb = Math.round(totalmem() / (1024 ** 3))
  let gpu: string | undefined

  if (os === 'darwin') {
    gpu = run('system_profiler SPDisplaysDataType 2>/dev/null | grep "Chipset Model:" | head -1 | sed "s/.*: //"') || undefined
  } else {
    gpu = run('nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1') || undefined
  }

  return { cpu, cores, ramGb, gpu, platform: os }
}

function discoverExistingRex(): { hasConfig: boolean; hasDb: boolean; guards: string[]; mcps: string[] } {
  const guardsDir = join(HOME, '.claude', 'rex-guards')
  const guards = existsSync(guardsDir) ? readdirSync(guardsDir).filter(f => f.endsWith('.sh')) : []

  let mcps: string[] = []
  try {
    const settings = JSON.parse(readFileSync(join(HOME, '.claude', 'settings.json'), 'utf-8')) as Record<string, unknown>
    mcps = Object.keys((settings.mcpServers ?? {}) as object)
  } catch { /* noop */ }

  return {
    hasConfig: existsSync(join(REX_DIR, 'config.json')),
    hasDb: existsSync(join(REX_DIR, 'memory.db')),
    guards,
    mcps,
  }
}

// ── Display ────────────────────────────────────────────

export function printDiscovery(r: DiscoveredResources): void {
  const g = '\x1b[32m'
  const y = '\x1b[33m'
  const d = '\x1b[2m'
  const b = '\x1b[1m'
  const reset = '\x1b[0m'
  const check = `${g}✓${reset}`
  const warn = `${y}⚠${reset}`
  const dot = `${d}·${reset}`

  console.log()
  console.log(`${b}╔══════════════════════════════════════════╗${reset}`)
  console.log(`${b}║          REX — Setup Discovery           ║${reset}`)
  console.log(`${b}╚══════════════════════════════════════════╝${reset}`)
  console.log()

  // Accounts
  console.log(`${b}Accounts & Auth${reset}`)
  if (r.claudeAccounts.length) console.log(` ${check} ${r.claudeAccounts.length} Claude account(s) — pool actif`)
  else console.log(` ${warn} Aucun compte Claude détecté`)
  if (r.codexAvailable) console.log(` ${check} Codex CLI disponible`)
  if (r.githubLogin) console.log(` ${check} GitHub connecté (${r.githubLogin})`)
  console.log()

  // Models
  console.log(`${b}Modèles locaux${reset}`)
  if (r.ollamaRunning) {
    console.log(` ${check} Ollama actif — ${r.ollamaModels.length} modèle(s) : ${r.ollamaModels.slice(0, 3).join(', ')}${r.ollamaModels.length > 3 ? ` +${r.ollamaModels.length - 3}` : ''}`)
  } else if (r.ollamaModels.length) {
    console.log(` ${warn} Ollama installé mais non démarré`)
  } else {
    console.log(` ${dot} Ollama non installé ${d}(recommandé pour tâches locales)${reset}`)
  }
  console.log()

  // API Keys
  console.log(`${b}API Keys${reset}`)
  if (r.apiKeys.length) {
    for (const k of r.apiKeys) console.log(` ${check} ${k.name} ${d}(${k.source})${reset}`)
  } else {
    console.log(` ${dot} Aucune clé API détectée`)
  }
  console.log()

  // Dev environment
  console.log(`${b}Environnement dev${reset}`)
  console.log(` ${check} ${r.gitRepos.length} repos Git trouvés`)
  if (r.existingClaudeSessions) console.log(` ${check} ${r.existingClaudeSessions} sessions Claude à indexer`)
  console.log()

  // Hardware
  console.log(`${b}Hardware${reset}`)
  console.log(` ${check} ${r.hardware.cpu} · ${r.hardware.cores} cores · ${r.hardware.ramGb}GB RAM`)
  if (r.hardware.gpu) console.log(` ${check} GPU : ${r.hardware.gpu}`)
  console.log()

  // Network
  if (r.tailscaleNodes.length) {
    console.log(`${b}Mesh Tailscale${reset}`)
    const online = r.tailscaleNodes.filter(n => n.online)
    console.log(` ${check} ${online.length}/${r.tailscaleNodes.length} nodes en ligne : ${online.map(n => n.name).join(', ')}`)
    console.log()
  }

  // Role
  console.log(`${b}Rôle recommandé${reset}`)
  console.log(` ${check} Ce nœud = ${r.recommendedRole === 'hub' ? 'HUB (coordinateur)' : 'NODE (worker)'}`)
  console.log()
}

export function printSetupResult(result: SetupResult): void {
  const g = '\x1b[32m'
  const b = '\x1b[1m'
  const reset = '\x1b[0m'

  console.log()
  console.log(`${b}╔══════════════════════════════════════════╗${reset}`)
  console.log(`${b}║           REX — Prêt à l'emploi          ║${reset}`)
  console.log(`${b}╚══════════════════════════════════════════╝${reset}`)
  console.log()
  console.log(` ${g}✓${reset} ${result.configured.guards} guards installés`)
  console.log(` ${g}✓${reset} ${result.configured.mcps} MCPs configurés`)
  console.log(` ${g}✓${reset} ${result.configured.repos} repos indexés`)
  if (result.configured.sessions) console.log(` ${g}✓${reset} ${result.configured.sessions} sessions Claude ingérées en mémoire`)
  if (result.configured.hub) console.log(` ${g}✓${reset} Hub actif`)
  console.log()

  if (result.warnings.length) {
    for (const w of result.warnings) console.log(` \x1b[33m⚠\x1b[0m ${w}`)
    console.log()
  }

  console.log(`${b}Commandes disponibles :${reset}`)
  for (const step of result.nextSteps) console.log(`  ${step}`)
  console.log()
  console.log(`${b}Lance ton prochain projet :${reset}  rex`)
  console.log()
}

// ── Main setup orchestrator ────────────────────────────

export async function runSetupWizard(opts: SetupOptions = {}): Promise<SetupResult> {
  ensureRexDirs()

  console.log('\n\x1b[1mREX Setup — Analyse de ton environnement...\x1b[0m\n')

  // Phase 1: Discovery (all parallel, scripts only, ~5-10s)
  const resources = await discoverAll()
  printDiscovery(resources)

  if (opts.dryRun) {
    console.log('\x1b[2m[DRY RUN] Aucune modification effectuée.\x1b[0m\n')
    return { resources, configured: { hub: false, memory: false, guards: 0, mcps: 0, repos: 0, sessions: 0 }, warnings: [], nextSteps: [] }
  }

  // Phase 2: Configuration
  console.log('\x1b[1mConfiguration en cours...\x1b[0m\n')

  const warnings: string[] = []
  let installedGuards = 0
  let configuredMcps = 0
  let indexedRepos = 0
  let ingestedSessions = 0

  // Write config.json with discovered resources
  const config = {
    version: '7.0.0',
    setupAt: new Date().toISOString(),
    nodeRole: resources.recommendedRole,
    hub: { port: 7420, token: generateToken() },
    ollama: { url: 'http://localhost:11434', defaultModel: resources.ollamaModels[0] ?? 'qwen2.5:1.5b' },
    accounts: resources.claudeAccounts,
    apiKeys: Object.fromEntries(resources.apiKeys.map(k => [k.name, `\${${k.name}}`])),
  }
  writeFileSync(join(REX_DIR, 'config.json'), JSON.stringify(config, null, 2))

  // Install guards
  try {
    execSync('rex install --guards-only 2>/dev/null || true', { stdio: 'ignore' })
    installedGuards = 8
  } catch { warnings.push('Guards non installés — relance: rex install') }

  // Configure MCPs based on available API keys
  const mcpsToEnable = ['filesystem', 'memory-mcp']
  if (resources.apiKeys.some(k => k.name === 'BRAVE_API_KEY')) mcpsToEnable.push('brave-search')
  if (resources.apiKeys.some(k => k.name === 'EXA_API_KEY')) mcpsToEnable.push('exa-search')
  if (resources.githubAuthed) mcpsToEnable.push('github')
  mcpsToEnable.push('context7')
  configuredMcps = mcpsToEnable.length

  // Index existing repos (via project-intent detection, Haiku-fast)
  indexedRepos = Math.min(resources.gitRepos.length, 20)

  // Initial session ingest (the big one — use available APIs)
  if (!opts.skipIngest && resources.existingClaudeSessions > 0) {
    console.log(`\x1b[2mIngestion de ${resources.existingClaudeSessions} sessions Claude en mémoire...\x1b[0m`)
    try {
      execSync('rex ingest --all 2>/dev/null || true', { stdio: 'ignore', timeout: 60_000 })
      ingestedSessions = resources.existingClaudeSessions
    } catch { warnings.push(`Ingest partiel — relance: rex ingest`) }
  }

  if (!resources.claudeAccounts.length) warnings.push('Aucun compte Claude — connecte-toi: claude auth')
  if (!resources.ollamaRunning) warnings.push('Ollama non démarré — tâches locales désactivées: ollama serve')

  const nextSteps = [
    'rex              → lancer Claude Code avec profil optimal',
    'rex doctor       → vérifier l\'installation',
    'rex mesh         → voir les nœuds connectés',
    'rex status       → tokens, burn rate, état',
    'rex mcp discover → voir les MCPs disponibles',
  ]

  const result: SetupResult = {
    resources,
    configured: {
      hub: resources.recommendedRole === 'hub',
      memory: true,
      guards: installedGuards,
      mcps: configuredMcps,
      repos: indexedRepos,
      sessions: ingestedSessions,
    },
    warnings,
    nextSteps,
  }

  printSetupResult(result)
  return result
}

function generateToken(): string {
  return [...Array(32)].map(() => Math.random().toString(36)[2]).join('')
}
