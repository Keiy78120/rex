/**
 * REX Tool Registry
 *
 * Governed catalog of capability implementations, ordered by integration tier:
 *   1. cli   — local binary, zero latency, zero cost
 *   2. mcp   — MCP protocol server (local or network)
 *   3. api   — external HTTP API (may cost money / rate-limited)
 *
 * Invariants:
 *   - Tools are DISABLED by default (user must explicitly enable)
 *   - Core OS tools (bash, git) are always active
 *   - getToolForCapability() always returns CLI before MCP before API
 *   - Availability is re-checked lazily (no hot loop)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('tool-registry')
const REGISTRY_PATH = join(REX_DIR, 'tool-registry.json')

// ── Types ──────────────────────────────────────────────

export type ToolTier = 'cli' | 'mcp' | 'api'

export type ToolStatus = 'active' | 'inactive' | 'unavailable'

export type ToolCapability =
  | 'web-search'
  | 'code-execution'
  | 'git'
  | 'github'
  | 'llm'
  | 'memory'
  | 'notify'
  | 'file-watch'
  | 'container'
  | 'browser'

export interface ToolEntry {
  id: string
  name: string
  description: string
  capability: ToolCapability
  tier: ToolTier
  /** CLI binary name or full path */
  command?: string
  /** MCP server name (matches ~/.claude/settings.json mcpServers key) */
  mcpServer?: string
  /** API base URL (tier = 'api') */
  apiEndpoint?: string
  /** Env var required for this tool to work */
  requiresEnv?: string
  /** Priority within same tier — lower wins */
  tierPriority: number
  /** User has explicitly enabled this tool */
  enabled: boolean
  /** Last availability check result */
  available: boolean
  /** ISO timestamp of last availability check */
  lastChecked: string | null
}

interface RegistryState {
  tools: ToolEntry[]
  updatedAt: string
}

// ── Built-in catalog ───────────────────────────────────

/** Core tools always active (no user opt-in needed). */
const CORE_TOOL_IDS = new Set(['bash', 'git'])

const BUILTIN_CATALOG: Omit<ToolEntry, 'available' | 'lastChecked'>[] = [
  // ── code-execution ──
  {
    id: 'bash',
    name: 'Bash',
    description: 'Local shell execution',
    capability: 'code-execution',
    tier: 'cli',
    command: 'bash',
    tierPriority: 0,
    enabled: true,
  },
  {
    id: 'node',
    name: 'Node.js',
    description: 'JavaScript/TypeScript runtime',
    capability: 'code-execution',
    tier: 'cli',
    command: 'node',
    tierPriority: 1,
    enabled: false,
  },

  // ── git ──
  {
    id: 'git',
    name: 'Git',
    description: 'Version control CLI',
    capability: 'git',
    tier: 'cli',
    command: 'git',
    tierPriority: 0,
    enabled: true,
  },

  // ── github ──
  {
    id: 'gh-cli',
    name: 'GitHub CLI',
    description: 'GitHub operations via gh',
    capability: 'github',
    tier: 'cli',
    command: 'gh',
    tierPriority: 0,
    enabled: false,
  },
  {
    id: 'github-mcp',
    name: 'GitHub MCP',
    description: 'GitHub MCP server (richer API surface)',
    capability: 'github',
    tier: 'mcp',
    mcpServer: 'github',
    tierPriority: 0,
    enabled: false,
  },

  // ── web-search ──
  {
    id: 'exa-cli',
    name: 'Exa CLI',
    description: 'Semantic web search via exa binary',
    capability: 'web-search',
    tier: 'cli',
    command: 'exa',
    tierPriority: 0,
    enabled: false,
  },
  {
    id: 'brave-mcp',
    name: 'Brave Search MCP',
    description: 'Brave Search via MCP server',
    capability: 'web-search',
    tier: 'mcp',
    mcpServer: 'brave-search',
    requiresEnv: 'BRAVE_SEARCH_API_KEY',
    tierPriority: 0,
    enabled: false,
  },
  {
    id: 'serper-api',
    name: 'Serper.dev',
    description: 'Google Search API via serper.dev',
    capability: 'web-search',
    tier: 'api',
    apiEndpoint: 'https://google.serper.dev/search',
    requiresEnv: 'SERPER_API_KEY',
    tierPriority: 0,
    enabled: false,
  },

  // ── llm ──
  {
    id: 'ollama-cli',
    name: 'Ollama',
    description: 'Local LLM inference via Ollama',
    capability: 'llm',
    tier: 'cli',
    command: 'ollama',
    tierPriority: 0,
    enabled: false,
  },
  {
    id: 'claude-cli',
    name: 'Claude Code CLI',
    description: 'Claude via claude CLI (subscription)',
    capability: 'llm',
    tier: 'cli',
    command: 'claude',
    tierPriority: 1,
    enabled: false,
  },

  // ── memory ──
  {
    id: 'rex-search',
    name: 'REX Memory Search',
    description: 'Semantic memory search via rex search',
    capability: 'memory',
    tier: 'cli',
    command: 'rex',
    tierPriority: 0,
    enabled: false,
  },

  // ── notify ──
  {
    id: 'rex-gateway',
    name: 'REX Gateway (Telegram)',
    description: 'Notifications via Telegram bot',
    capability: 'notify',
    tier: 'cli',
    command: 'rex',
    requiresEnv: 'REX_TELEGRAM_BOT_TOKEN',
    tierPriority: 0,
    enabled: false,
  },

  // ── container ──
  {
    id: 'docker-cli',
    name: 'Docker',
    description: 'Container management via Docker CLI',
    capability: 'container',
    tier: 'cli',
    command: 'docker',
    tierPriority: 0,
    enabled: false,
  },

  // ── browser ──
  {
    id: 'playwright-mcp',
    name: 'Playwright MCP',
    description: 'Browser automation via Playwright MCP server',
    capability: 'browser',
    tier: 'mcp',
    mcpServer: 'playwright',
    tierPriority: 0,
    enabled: false,
  },
]

// ── Persistence ────────────────────────────────────────

function loadState(): RegistryState {
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch {
    return { tools: [], updatedAt: new Date().toISOString() }
  }
}

function saveState(state: RegistryState): void {
  ensureRexDirs()
  state.updatedAt = new Date().toISOString()
  writeFileSync(REGISTRY_PATH, JSON.stringify(state, null, 2) + '\n')
}

// ── Availability check ─────────────────────────────────

function which(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 2000, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function checkAvailability(tool: ToolEntry): boolean {
  if (tool.tier === 'cli' && tool.command) {
    return which(tool.command)
  }
  if (tool.tier === 'mcp') {
    // Check if MCP server is configured in Claude settings
    try {
      const settings = JSON.parse(
        readFileSync(join(process.env.HOME || '~', '.claude', 'settings.json'), 'utf-8')
      )
      return !!(settings.mcpServers?.[tool.mcpServer!])
    } catch {
      return false
    }
  }
  if (tool.tier === 'api' && tool.requiresEnv) {
    // Check env var in process.env or settings.json
    if (process.env[tool.requiresEnv]) return true
    try {
      const settings = JSON.parse(
        readFileSync(join(process.env.HOME || '~', '.claude', 'settings.json'), 'utf-8')
      )
      return !!(settings.env?.[tool.requiresEnv])
    } catch {
      return false
    }
  }
  return true
}

// ── Registry merge ─────────────────────────────────────

/**
 * Merge built-in catalog with persisted user state.
 * Persisted enabled/disabled flags survive upgrades.
 * New tools from BUILTIN_CATALOG are added with defaults.
 */
function mergeWithBuiltin(persisted: ToolEntry[]): ToolEntry[] {
  const persistedMap = new Map(persisted.map(t => [t.id, t]))

  return BUILTIN_CATALOG.map(builtin => {
    const stored = persistedMap.get(builtin.id)
    return {
      ...builtin,
      // Preserve user's enabled choice; use builtin default for new tools
      enabled: stored ? stored.enabled : (CORE_TOOL_IDS.has(builtin.id) || builtin.enabled),
      available: stored?.available ?? false,
      lastChecked: stored?.lastChecked ?? null,
    }
  })
}

// ── Public API ─────────────────────────────────────────

/** Load registry, merging with built-in catalog. */
export function loadRegistry(): ToolEntry[] {
  const state = loadState()
  return mergeWithBuiltin(state.tools)
}

/** Persist registry state. */
export function saveRegistry(tools: ToolEntry[]): void {
  saveState({ tools, updatedAt: new Date().toISOString() })
}

/** Refresh availability for all tools (or a subset by id). */
export function syncAvailability(ids?: string[]): ToolEntry[] {
  const tools = loadRegistry()
  const now = new Date().toISOString()
  for (const t of tools) {
    if (ids && !ids.includes(t.id)) continue
    t.available = checkAvailability(t)
    t.lastChecked = now
  }
  saveRegistry(tools)
  log.info(`Synced availability for ${ids?.length ?? tools.length} tools`)
  return tools
}

/** Enable a tool by id. */
export function enableTool(id: string): boolean {
  const tools = loadRegistry()
  const t = tools.find(t => t.id === id)
  if (!t) return false
  t.enabled = true
  t.available = checkAvailability(t)
  t.lastChecked = new Date().toISOString()
  saveRegistry(tools)
  log.info(`Enabled tool: ${id}`)
  return true
}

/** Disable a tool by id. Core tools cannot be disabled. */
export function disableTool(id: string): boolean {
  if (CORE_TOOL_IDS.has(id)) {
    log.warn(`Cannot disable core tool: ${id}`)
    return false
  }
  const tools = loadRegistry()
  const t = tools.find(t => t.id === id)
  if (!t) return false
  t.enabled = false
  saveRegistry(tools)
  log.info(`Disabled tool: ${id}`)
  return true
}

/**
 * Get the best available tool for a capability.
 * Preference order: cli (tierPriority asc) → mcp → api
 */
export function getToolForCapability(capability: ToolCapability): ToolEntry | null {
  const tools = loadRegistry()
  const TIER_ORDER: ToolTier[] = ['cli', 'mcp', 'api']

  const candidates = tools
    .filter(t => t.capability === capability && t.enabled && t.available)
    .sort((a, b) => {
      const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
      if (tierDiff !== 0) return tierDiff
      return a.tierPriority - b.tierPriority
    })

  return candidates[0] ?? null
}

// ── CLI Display ────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
}

const TIER_LABEL: Record<ToolTier, string> = {
  cli: `${C.green}cli${C.reset}`,
  mcp: `${C.cyan}mcp${C.reset}`,
  api: `${C.yellow}api${C.reset}`,
}

export function printRegistry(tools?: ToolEntry[]): void {
  const list = tools ?? loadRegistry()

  // Group by capability
  const byCapability = new Map<ToolCapability, ToolEntry[]>()
  for (const t of list) {
    const arr = byCapability.get(t.capability) ?? []
    arr.push(t)
    byCapability.set(t.capability, arr)
  }

  console.log(`\n${C.bold}REX Tool Registry${C.reset}`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`${C.dim}tier order: cli → mcp → api  ·  disabled by default${C.reset}\n`)

  for (const [cap, capTools] of byCapability) {
    console.log(`  ${C.bold}${cap}${C.reset}`)
    const sorted = capTools.sort((a, b) => {
      const tiers: ToolTier[] = ['cli', 'mcp', 'api']
      return tiers.indexOf(a.tier) - tiers.indexOf(b.tier) || a.tierPriority - b.tierPriority
    })
    for (const t of sorted) {
      const status = !t.available
        ? `${C.dim}unavailable${C.reset}`
        : !t.enabled
          ? `${C.dim}disabled${C.reset}`
          : `${C.green}active${C.reset}`
      const core = CORE_TOOL_IDS.has(t.id) ? ` ${C.dim}[core]${C.reset}` : ''
      console.log(
        `    ${TIER_LABEL[t.tier]}  ${t.id.padEnd(20)} ${status.padEnd(24)} ${C.dim}${t.description}${C.reset}${core}`
      )
    }
    console.log()
  }

  const active = list.filter(t => t.enabled && t.available).length
  console.log(`  ${list.length} tools · ${active} active\n`)
}
