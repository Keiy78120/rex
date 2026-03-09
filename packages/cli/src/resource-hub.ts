/** @module TOOLS — REX Resource Hub: unified catalog for all installable resources */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'

const log = createLogger('TOOLS:hub')
const HOME = homedir()

// ── Types ────────────────────────────────────────────────────────────────────

export type ResourceType = 'mcp' | 'guard' | 'skill' | 'script' | 'boilerplate' | 'tool'

export interface HubResource {
  id: string
  name: string
  type: ResourceType
  description: string
  source: string       // GitHub repo URL or 'local'
  installHint?: string // human-readable install note
  tags: string[]
  category?: string
  stars?: number
  verified: boolean
  addedAt: string
}

interface HubCatalog {
  version: 2
  updatedAt: string
  resources: HubResource[]
}

// ── Paths ────────────────────────────────────────────────────────────────────

const CATALOG_PATH = join(REX_DIR, 'hub-catalog.json')
const GUARDS_DIR = join(HOME, '.claude', 'rex-guards')
const SKILLS_DIR = join(HOME, '.claude', 'skills')
const SCRIPTS_DIR = join(REX_DIR, 'scripts')
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000 // 24h

// ── Built-in catalog (offline-safe) ─────────────────────────────────────────

const BUILTIN: HubResource[] = [
  // Guards
  { id: 'guard-completion', name: 'completion-guard', type: 'guard', description: 'Marks tasks complete in CLAUDE.md on session end', source: 'local', tags: ['guard', 'productivity'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-dangerous-cmd', name: 'dangerous-cmd-guard', type: 'guard', description: 'Blocks dangerous shell commands (rm -rf, drop table, etc.)', source: 'local', tags: ['guard', 'security'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-secret', name: 'secret-guard', type: 'guard', description: 'Prevents committing secrets and API keys', source: 'local', tags: ['guard', 'security'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-force-push', name: 'force-push-guard', type: 'guard', description: 'Blocks force pushes to main/master', source: 'local', tags: ['guard', 'git'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-large-file', name: 'large-file-guard', type: 'guard', description: 'Warns on files > 1MB being committed', source: 'local', tags: ['guard', 'git'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-env-commit', name: 'env-commit-guard', type: 'guard', description: 'Blocks .env files from being committed', source: 'local', tags: ['guard', 'security'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-todo-limit', name: 'todo-limit-guard', type: 'guard', description: 'Warns when TODO/FIXME count exceeds 20', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-post-edit', name: 'post-edit-guard', type: 'guard', description: 'Quality check after every file edit', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-error-pattern', name: 'error-pattern-guard', type: 'guard', description: 'Detects and logs recurring error patterns', source: 'local', tags: ['guard', 'debugging'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-notify-telegram', name: 'notify-telegram', type: 'guard', description: 'Sends Telegram notification on session end', source: 'local', tags: ['guard', 'notification'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-session-summary', name: 'session-summary', type: 'guard', description: 'Generates session summary on end', source: 'local', tags: ['guard', 'memory'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-any-type', name: 'any-type-guard', type: 'guard', description: 'Warns on TypeScript any usage', source: 'local', tags: ['guard', 'typescript'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-console-log', name: 'console-log-guard', type: 'guard', description: 'Warns on console.log in production files', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-scope', name: 'scope-guard', type: 'guard', description: 'Warns on out-of-scope file edits', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-test-protect', name: 'test-protect-guard', type: 'guard', description: 'Protects test files from modification without explicit flag', source: 'local', tags: ['guard', 'testing'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-ui-checklist', name: 'ui-checklist-guard', type: 'guard', description: 'Runs UI checklist (a11y, empty states, loading states)', source: 'local', tags: ['guard', 'ui'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-a11y', name: 'a11y-guard', type: 'guard', description: 'Checks accessibility (WCAG) on changed UI files', source: 'local', tags: ['guard', 'accessibility'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-import', name: 'import-guard', type: 'guard', description: 'Validates imports follow project conventions', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-perf', name: 'perf-guard', type: 'guard', description: 'Warns on performance anti-patterns', source: 'local', tags: ['guard', 'performance'], verified: true, addedAt: '2026-03-01' },
  { id: 'guard-honesty', name: 'honesty-guard', type: 'guard', description: 'Verifies AI claims are backed by actual code', source: 'local', tags: ['guard', 'quality'], verified: true, addedAt: '2026-03-01' },

  // Skills
  { id: 'skill-rex-monitor', name: 'rex-monitor', type: 'skill', description: 'Recurring REX health + sync monitoring', source: 'local', tags: ['skill', 'monitoring'], verified: true, addedAt: '2026-03-08' },
  { id: 'skill-notify', name: 'notify', type: 'skill', description: 'Send Telegram notification from Claude Code', source: 'local', tags: ['skill', 'notification'], verified: true, addedAt: '2026-03-01' },
  { id: 'skill-loop', name: 'loop', type: 'skill', description: 'Schedule recurring prompts with CronCreate', source: 'local', tags: ['skill', 'automation'], verified: true, addedAt: '2026-03-01' },

  // Boilerplates
  { id: 'bp-next-saas', name: 'next-saas-starter', type: 'boilerplate', description: 'Next.js 15 + shadcn/ui + Drizzle + Auth SaaS template', source: 'https://github.com/shadcn-ui/next-template', tags: ['boilerplate', 'nextjs', 'saas'], verified: false, addedAt: '2026-03-01' },
  { id: 'bp-cf-worker', name: 'cloudflare-worker', type: 'boilerplate', description: 'Cloudflare Worker with D1 + KV + R2', source: 'https://github.com/cloudflare/workers-sdk', tags: ['boilerplate', 'cloudflare', 'serverless'], verified: false, addedAt: '2026-03-01' },
  { id: 'bp-cli-ts', name: 'cli-typescript', type: 'boilerplate', description: 'TypeScript CLI with commander.js + tsup', source: 'local', tags: ['boilerplate', 'cli', 'typescript'], verified: true, addedAt: '2026-03-01' },
]

// ── Catalog persistence ───────────────────────────────────────────────────────

function readCatalog(): HubCatalog | null {
  if (!existsSync(CATALOG_PATH)) return null
  try {
    const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as HubCatalog
    if (data.version !== 2 || !Array.isArray(data.resources)) return null
    return data
  } catch {
    return null
  }
}

function writeCatalog(catalog: HubCatalog): void {
  const dir = dirname(CATALOG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2))
}

function isFresh(catalog: HubCatalog): boolean {
  const age = Date.now() - new Date(catalog.updatedAt).getTime()
  return age < CATALOG_TTL_MS
}

function mergeResources(base: HubResource[], extras: HubResource[]): HubResource[] {
  const ids = new Set(base.map(r => r.id))
  return [...base, ...extras.filter(r => !ids.has(r.id))]
}

// ── Remote fetchers ───────────────────────────────────────────────────────────

async function fetchAwesomeMcpServers(): Promise<HubResource[]> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/petercat-ai/awesome-mcp-servers/main/README.md',
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return []
    const text = await res.text()
    const resources: HubResource[] = []
    // Parse markdown table rows: | Name | Description | Link | ...
    const rows = text.match(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|([^|]+)\|/g) ?? []
    for (const row of rows) {
      const m = row.match(/\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|([^|]+)\|/)
      if (!m) continue
      const [, name, url, desc] = m
      if (!url.includes('github.com')) continue
      const id = `mcp-aws-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`
      resources.push({
        id,
        name: name.trim(),
        type: 'mcp',
        description: desc.trim(),
        source: url.trim(),
        tags: ['mcp', 'community'],
        verified: false,
        addedAt: new Date().toISOString().slice(0, 10),
      })
    }
    log.info(`Fetched ${resources.length} MCPs from awesome-mcp-servers`)
    return resources
  } catch (e: any) {
    log.warn(`awesome-mcp-servers fetch failed: ${e.message?.slice(0, 80)}`)
    return []
  }
}

async function fetchAwesomeClaudeCode(): Promise<HubResource[]> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/README.md',
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return []
    const text = await res.text()
    const resources: HubResource[] = []
    // Parse sections for slash commands, hooks, workflows
    const lines = text.split('\n')
    let currentSection = ''
    for (const line of lines) {
      if (/^#+\s*(slash|hook|workflow|skill|script)/i.test(line)) {
        currentSection = line.toLowerCase().includes('hook') ? 'guard'
          : line.toLowerCase().includes('skill') ? 'skill'
          : 'script'
      }
      const m = line.match(/[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[–—-]?\s*(.*)/)
      if (m && currentSection) {
        const [, name, url, desc] = m
        const id = `acc-${currentSection}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`
        resources.push({
          id,
          name: name.trim(),
          type: currentSection as ResourceType,
          description: desc.trim() || name.trim(),
          source: url.trim(),
          tags: [currentSection, 'community'],
          verified: false,
          addedAt: new Date().toISOString().slice(0, 10),
        })
      }
    }
    log.info(`Fetched ${resources.length} resources from awesome-claude-code`)
    return resources
  } catch (e: any) {
    log.warn(`awesome-claude-code fetch failed: ${e.message?.slice(0, 80)}`)
    return []
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Load catalog from disk, merging with builtins. Refresh if stale. */
export async function getHub(forceRefresh = false): Promise<HubCatalog> {
  const cached = readCatalog()
  if (cached && !forceRefresh && isFresh(cached)) {
    return cached
  }
  // Start with builtins
  let resources: HubResource[] = [...BUILTIN]
  // Fetch remote if online
  try {
    const [mcps, claudeCode] = await Promise.all([
      fetchAwesomeMcpServers(),
      fetchAwesomeClaudeCode(),
    ])
    resources = mergeResources(resources, mcps)
    resources = mergeResources(resources, claudeCode)
  } catch {
    // Offline — use builtins only
  }
  const catalog: HubCatalog = {
    version: 2,
    updatedAt: new Date().toISOString(),
    resources,
  }
  writeCatalog(catalog)
  return catalog
}

/** Search resources across all types */
export function searchHub(catalog: HubCatalog, query: string, type?: ResourceType): HubResource[] {
  const q = query.toLowerCase()
  return catalog.resources.filter(r => {
    if (type && r.type !== type) return false
    return r.name.toLowerCase().includes(q)
      || r.description.toLowerCase().includes(q)
      || r.tags.some(t => t.includes(q))
  })
}

/** Check if a resource is already installed */
export function isInstalled(resource: HubResource): boolean {
  if (resource.source === 'local') {
    // Local resources are always "installed"
    return true
  }
  switch (resource.type) {
    case 'guard': {
      const guardPath = join(GUARDS_DIR, `${resource.name}.sh`)
      return existsSync(guardPath)
    }
    case 'skill': {
      const skillPath = join(SKILLS_DIR, resource.name, 'SKILL.md')
      return existsSync(skillPath)
    }
    case 'mcp': {
      // Check claude settings.json
      try {
        const settings = JSON.parse(readFileSync(join(HOME, '.claude', 'settings.json'), 'utf-8'))
        const mcpServers = settings.mcpServers ?? {}
        return Object.keys(mcpServers).some(k => k.toLowerCase().includes(resource.name.toLowerCase()))
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

/** Install a resource by type */
export async function installResource(resource: HubResource): Promise<{ ok: boolean; message: string }> {
  if (resource.source === 'local') {
    return { ok: true, message: 'Built-in resource — use rex guard add / rex skills to manage' }
  }

  try {
    switch (resource.type) {
      case 'mcp': {
        // Delegate to mcp_registry
        const { mcpRegistry } = await import('./mcp_registry.js')
        await mcpRegistry(['install', resource.source])
        return { ok: true, message: `MCP ${resource.name} installed` }
      }
      case 'guard': {
        if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })
        // Fetch raw script from source URL
        const rawUrl = resource.source.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
        const res = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return { ok: false, message: `HTTP ${res.status} fetching guard` }
        const content = await res.text()
        const dest = join(GUARDS_DIR, `${resource.name}.sh`)
        writeFileSync(dest, content, { mode: 0o755 })
        return { ok: true, message: `Guard installed: ${dest}` }
      }
      case 'skill': {
        if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
        // Fetch raw SKILL.md from source
        const rawUrl = resource.source.includes('raw.githubusercontent') ? resource.source
          : resource.source.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
        const res = await fetch(rawUrl, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) return { ok: false, message: `HTTP ${res.status} fetching skill` }
        const content = await res.text()
        const skillDir = join(SKILLS_DIR, resource.name)
        if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true })
        writeFileSync(join(skillDir, 'SKILL.md'), content)
        return { ok: true, message: `Skill installed: ${skillDir}/SKILL.md` }
      }
      case 'boilerplate': {
        return {
          ok: false,
          message: `Boilerplate: clone manually → git clone ${resource.source} <project-name>`,
        }
      }
      default:
        return { ok: false, message: `Install not automated for type: ${resource.type}` }
    }
  } catch (e: any) {
    return { ok: false, message: `Install failed: ${e.message?.slice(0, 150)}` }
  }
}

// ── CLI printer ───────────────────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m',
}

const TYPE_ICONS: Record<ResourceType, string> = {
  mcp: '⚡', guard: '🛡', skill: '✨', script: '📜', boilerplate: '📦', tool: '🔧',
}

function colorForType(type: ResourceType): string {
  switch (type) {
    case 'guard': return COLORS.yellow
    case 'skill': return COLORS.cyan
    case 'mcp': return COLORS.green
    case 'boilerplate': return COLORS.bold
    default: return COLORS.dim
  }
}

export function printHubList(resources: HubResource[], showInstalled = true): void {
  if (resources.length === 0) {
    console.log(`  ${COLORS.dim}No resources found${COLORS.reset}`)
    return
  }
  const byType: Partial<Record<ResourceType, HubResource[]>> = {}
  for (const r of resources) {
    if (!byType[r.type]) byType[r.type] = []
    byType[r.type]!.push(r)
  }
  for (const [type, items] of Object.entries(byType) as [ResourceType, HubResource[]][]) {
    const icon = TYPE_ICONS[type] ?? '·'
    console.log(`\n  ${COLORS.bold}${icon} ${type.toUpperCase()}S${COLORS.reset}  ${COLORS.dim}(${items.length})${COLORS.reset}`)
    for (const r of items) {
      const installed = isInstalled(r)
      const statusDot = installed
        ? `${COLORS.green}●${COLORS.reset}`
        : `${COLORS.dim}○${COLORS.reset}`
      const verBadge = r.verified ? '' : ` ${COLORS.dim}[community]${COLORS.reset}`
      console.log(`    ${statusDot} ${colorForType(type)}${r.name}${COLORS.reset}${verBadge}`)
      console.log(`      ${COLORS.dim}${r.description}${COLORS.reset}`)
    }
  }
  console.log()
}

/** Main entry point for `rex hub` resource subcommands */
export async function resourceHub(args: string[]): Promise<void> {
  const sub = args[0] ?? 'list'
  const jsonFlag = args.includes('--json')

  switch (sub) {
    case 'update': {
      console.log('Refreshing hub catalog from GitHub...')
      const catalog = await getHub(true)
      if (jsonFlag) {
        console.log(JSON.stringify({ total: catalog.resources.length, updatedAt: catalog.updatedAt }))
      } else {
        console.log(`${COLORS.green}✓${COLORS.reset} Catalog updated — ${catalog.resources.length} resources (${catalog.updatedAt.slice(0, 10)})`)
      }
      break
    }

    case 'list': {
      const typeFilter = args.find(a => !a.startsWith('--') && a !== 'list') as ResourceType | undefined
      const catalog = await getHub()
      const items = typeFilter
        ? catalog.resources.filter(r => r.type === typeFilter)
        : catalog.resources
      if (jsonFlag) {
        console.log(JSON.stringify({ total: items.length, resources: items }))
      } else {
        console.log(`\n  ${COLORS.bold}REX HUB${COLORS.reset}  ${COLORS.dim}${catalog.resources.length} resources${COLORS.reset}`)
        console.log(`  ${COLORS.dim}Types: mcp · guard · skill · script · boilerplate · tool${COLORS.reset}`)
        printHubList(items)
        console.log(`  ${COLORS.dim}● = installed  ○ = available  rex hub install <id>${COLORS.reset}\n`)
      }
      break
    }

    case 'search': {
      const query = args.find(a => !a.startsWith('--') && a !== 'search') ?? ''
      if (!query) {
        console.error('Usage: rex hub search <query> [--type=mcp|guard|skill|script|boilerplate|tool]')
        process.exit(1)
      }
      const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1] as ResourceType | undefined
      const catalog = await getHub()
      const results = searchHub(catalog, query, typeArg)
      if (jsonFlag) {
        console.log(JSON.stringify({ total: results.length, resources: results }))
      } else {
        console.log(`\n  Search: "${query}"  ${COLORS.dim}${results.length} results${COLORS.reset}`)
        printHubList(results)
      }
      break
    }

    case 'install': {
      const id = args.find(a => !a.startsWith('--') && a !== 'install')
      if (!id) {
        console.error('Usage: rex hub install <resource-id>')
        process.exit(1)
      }
      const catalog = await getHub()
      const resource = catalog.resources.find(r => r.id === id || r.name === id)
      if (!resource) {
        console.error(`${COLORS.red}✗${COLORS.reset} Resource not found: ${id}`)
        console.log(`  Run: rex hub search <query> to find resources`)
        process.exit(1)
      }
      console.log(`Installing ${TYPE_ICONS[resource.type]} ${resource.name}...`)
      const result = await installResource(resource)
      if (result.ok) {
        console.log(`${COLORS.green}✓${COLORS.reset} ${result.message}`)
      } else {
        console.log(`${COLORS.yellow}!${COLORS.reset} ${result.message}`)
      }
      break
    }

    default:
      console.error(`Unknown hub subcommand: ${sub}`)
      console.log('Usage: rex hub list [type] | search <query> | install <id> | update')
  }
}
