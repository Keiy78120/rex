/**
 * REX MCP Discover — forage-inspired self-improving MCP discovery
 *
 * Searches public MCP registries, installs servers as subprocesses,
 * and persists tool knowledge across sessions — no restarts needed.
 *
 * Inspired by: https://github.com/isaac-levine/forage
 * Integrates with: mcp_registry.ts, hub.ts
 *
 * Usage:
 *   rex mcp discover                    # scan known registries
 *   rex mcp discover --install context7 # install + register
 *   rex mcp discover --search memory    # search by keyword
 * @module TOOLS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { createLogger } from '../logger.js'
import { REX_DIR, ensureRexDirs } from '../paths.js'

const log = createLogger('TOOLS:mcp-discover')

// ── Types ──────────────────────────────────────────────

export interface McpServerMeta {
  id: string
  name: string
  description: string
  tags: string[]
  command?: string      // e.g. 'npx'
  args?: string[]       // e.g. ['-y', '@modelcontextprotocol/server-filesystem']
  url?: string          // for SSE/HTTP servers
  type: 'stdio' | 'sse' | 'http'
  source: string        // registry name
  installCmd?: string   // one-line install command
  homepage?: string
  stars?: number
  verified: boolean
}

export interface DiscoveryResult {
  found: McpServerMeta[]
  installed: McpServerMeta[]
  errors: string[]
}

// ── Curated catalog (offline-first, no API needed) ─────

/**
 * High-value MCP servers curated for REX users.
 * Covers: memory, search, browser, monitoring, GitHub, filesystem.
 * Ordered by REX relevance.
 */
export const REX_MCP_CATALOG: McpServerMeta[] = [
  // ── Memory & Knowledge ─────────────────────────────
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date library docs inline in Claude Code — no hallucinated APIs',
    tags: ['docs', 'memory', 'context', 'libraries'],
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @upstash/context7-mcp',
    homepage: 'https://context7.com',
    verified: true,
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Official MCP filesystem server — read/write files with permissions',
    tags: ['filesystem', 'files', 'official'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @modelcontextprotocol/server-filesystem',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    verified: true,
  },
  {
    id: 'memory-mcp',
    name: 'Memory (Official)',
    description: 'Persistent key-value memory for Claude — cross-session recall',
    tags: ['memory', 'persistence', 'official'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @modelcontextprotocol/server-memory',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    verified: true,
  },

  // ── Search ─────────────────────────────────────────
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search via Brave API — privacy-respecting, no tracking',
    tags: ['search', 'web', 'brave'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @modelcontextprotocol/server-brave-search',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    verified: true,
  },
  {
    id: 'exa-search',
    name: 'Exa Search',
    description: 'Semantic web search — better than keyword for dev research',
    tags: ['search', 'semantic', 'exa'],
    command: 'npx',
    args: ['-y', 'exa-mcp-server'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y exa-mcp-server',
    homepage: 'https://exa.ai',
    verified: true,
  },

  // ── Browser ────────────────────────────────────────
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation — navigate, screenshot, fill forms, scrape',
    tags: ['browser', 'automation', 'scraping', 'playwright'],
    command: 'npx',
    args: ['-y', '@playwright/mcp'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @playwright/mcp',
    homepage: 'https://playwright.dev',
    verified: true,
  },

  // ── GitHub ─────────────────────────────────────────
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API — issues, PRs, repos, code search, CI runs',
    tags: ['github', 'git', 'issues', 'pr', 'official'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @modelcontextprotocol/server-github',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    verified: true,
  },

  // ── Database ───────────────────────────────────────
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query local SQLite databases — great for inspecting REX memory DB',
    tags: ['database', 'sqlite', 'sql', 'official'],
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y @modelcontextprotocol/server-sqlite',
    homepage: 'https://github.com/modelcontextprotocol/servers',
    verified: true,
  },
  {
    id: 'anyquery',
    name: 'anyquery',
    description: 'SQL over 40+ apps (GitHub, Notion, Slack, Airtable…) — unified query',
    tags: ['database', 'sql', 'multi-app', 'notion', 'slack'],
    command: 'anyquery',
    args: ['mcp'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'go install github.com/julien040/anyquery@latest',
    homepage: 'https://anyquery.dev',
    verified: true,
  },

  // ── Monitoring & System ────────────────────────────
  {
    id: 'mcp-gateway',
    name: 'MCP Gateway',
    description: 'Meta-server: 9 stable tools + auto-start Playwright/Context7 + 25+ on-demand servers',
    tags: ['gateway', 'meta', 'orchestration', 'discovery'],
    command: 'npx',
    args: ['-y', 'mcp-gateway'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y mcp-gateway',
    homepage: 'https://github.com/ViperJuice/mcp-gateway',
    verified: false,
  },

  // ── Productivity ───────────────────────────────────
  {
    id: 'n8n-mcp',
    name: 'n8n Documentation',
    description: 'n8n node documentation and templates — no auth needed',
    tags: ['n8n', 'automation', 'workflows'],
    command: 'npx',
    args: ['-y', 'n8n-mcp-server'],
    type: 'stdio',
    source: 'rex-catalog',
    installCmd: 'npx -y n8n-mcp-server',
    homepage: 'https://n8n.io',
    verified: false,
  },
]

// ── Catalog store ──────────────────────────────────────

const CATALOG_PATH = join(REX_DIR, 'mcp-discover-catalog.json')
const INSTALLED_PATH = join(REX_DIR, 'mcp-discover-installed.json')

interface CatalogStore {
  servers: McpServerMeta[]
  lastUpdated: string
}

interface InstalledStore {
  servers: Array<{ id: string; installedAt: string; command?: string; args?: string[] }>
}

function readCatalog(): McpServerMeta[] {
  ensureRexDirs()
  try {
    if (existsSync(CATALOG_PATH)) {
      const store = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as CatalogStore
      // Merge with built-in catalog (built-in wins on conflict)
      const ids = new Set(REX_MCP_CATALOG.map(s => s.id))
      const external = store.servers.filter(s => !ids.has(s.id))
      return [...REX_MCP_CATALOG, ...external]
    }
  } catch {
    // noop
  }
  return REX_MCP_CATALOG
}

function readInstalled(): InstalledStore {
  try {
    if (existsSync(INSTALLED_PATH)) return JSON.parse(readFileSync(INSTALLED_PATH, 'utf-8')) as InstalledStore
  } catch { /* noop */ }
  return { servers: [] }
}

function saveInstalled(store: InstalledStore): void {
  ensureRexDirs()
  writeFileSync(INSTALLED_PATH, JSON.stringify(store, null, 2))
}

// ── Public API ─────────────────────────────────────────

/**
 * Search the catalog by keyword (name, description, tags).
 */
export function searchCatalog(query: string): McpServerMeta[] {
  const q = query.toLowerCase()
  return readCatalog().filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some(t => t.includes(q))
  )
}

/**
 * Get all servers in the catalog.
 */
export function listCatalog(): McpServerMeta[] {
  return readCatalog()
}

/**
 * Get installed servers.
 */
export function listInstalled(): InstalledStore['servers'] {
  return readInstalled().servers
}

/**
 * Install a server from the catalog by ID.
 * Adds it to the installed store and optionally to ~/.claude/settings.json MCP config.
 */
export async function installServer(id: string, autoRegister = true): Promise<{ ok: boolean; error?: string }> {
  const catalog = readCatalog()
  const server = catalog.find(s => s.id === id)
  if (!server) return { ok: false, error: `Server "${id}" not found in catalog. Run rex mcp discover --search <term>` }

  // Check if already installed
  const installed = readInstalled()
  if (installed.servers.some(s => s.id === id)) {
    return { ok: true, error: undefined } // idempotent
  }

  // Security scan before any install (§27)
  const scanContent = [server.name, server.description, server.installCmd ?? ''].join(' ')
  try {
    const { scan } = await import('../security-scanner.js')
    const scanResult = await scan(scanContent, 'mcp', id)
    if (scanResult.recommendation === 'block') {
      const reasons = scanResult.findings.map(f => `${f.severity}/${f.rule}`).join(', ')
      return { ok: false, error: `SECURITY_BLOCK: ${reasons}. Pass --force to override.` }
    }
    if (scanResult.recommendation === 'warn') {
      const reasons = scanResult.findings.map(f => f.rule).join(', ')
      log.warn(`Security warning for ${id}: ${reasons}. Proceeding — add --no-security-check to silence.`)
    }
  } catch {
    log.warn('Security scanner unavailable — proceeding without scan')
  }

  // Try to install via npm if command is npx
  if (server.command === 'npx' && server.args?.length) {
    const pkg = server.args.find(a => a.startsWith('@') || (!a.startsWith('-') && a.includes('/'))) ?? server.args[server.args.length - 1]
    try {
      execSync(`npm install -g ${pkg}`, { stdio: 'inherit' })
    } catch {
      log.warn(`Could not install ${pkg} globally — server may still work via npx`)
    }
  }

  // Save to installed store
  installed.servers.push({
    id,
    installedAt: new Date().toISOString(),
    command: server.command,
    args: server.args,
  })
  saveInstalled(installed)

  // Auto-register in Claude settings
  if (autoRegister) {
    registerInClaudeSettings(server)
  }

  log.info(`Installed MCP server: ${server.name}`)
  return { ok: true }
}

/**
 * Register a server in ~/.claude/settings.json mcpServers block.
 */
function registerInClaudeSettings(server: McpServerMeta): void {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  let settings: Record<string, unknown> = {}

  try {
    if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  } catch { /* noop */ }

  const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>

  if (server.command && server.args) {
    mcpServers[server.id] = { command: server.command, args: server.args }
  } else if (server.url) {
    mcpServers[server.id] = { url: server.url, type: server.type }
  }

  settings.mcpServers = mcpServers
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  log.info(`Registered ${server.id} in ~/.claude/settings.json`)
}

/**
 * Print catalog as formatted table.
 */
export function printCatalog(servers = listCatalog()): void {
  const installed = new Set(listInstalled().map(s => s.id))
  const reset = '\x1b[0m'
  const green = '\x1b[32m'
  const dim = '\x1b[2m'
  const bold = '\x1b[1m'

  console.log()
  console.log(`${bold}REX MCP Catalog${reset} — ${servers.length} servers`)
  console.log('─'.repeat(70))

  for (const s of servers) {
    const check = installed.has(s.id) ? `${green}✓${reset}` : ' '
    const verified = s.verified ? '' : ` ${dim}[unverified]${reset}`
    console.log(`${check} ${bold}${s.id.padEnd(20)}${reset} ${s.description}${verified}`)
    console.log(`   ${dim}tags: ${s.tags.join(', ')}${reset}`)
    if (s.installCmd) console.log(`   ${dim}install: ${s.installCmd}${reset}`)
    console.log()
  }
}
