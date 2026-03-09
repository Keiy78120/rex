/** @module TOOLS */
import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, execFileSync } from 'node:child_process'

type McpType = 'stdio' | 'sse' | 'http'

interface McpServerEntry {
  id: string
  name: string
  type: McpType
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  enabled: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface McpRegistry {
  servers: McpServerEntry[]
}

const HOME = homedir()
const ROOT_DIR = join(HOME, '.claude', 'rex')
const REGISTRY_FILE = join(ROOT_DIR, 'mcp-registry.json')
const LEGACY_ROOT = join(HOME, '.rex-memory')
const LEGACY_REGISTRY = join(LEGACY_ROOT, 'mcp-registry.json')

function ensureDir() {
  if (!existsSync(ROOT_DIR)) mkdirSync(ROOT_DIR, { recursive: true })
}

function readRegistry(): McpRegistry {
  ensureDir()
  try {
    if (existsSync(REGISTRY_FILE)) {
      const parsed = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8')) as McpRegistry
      if (Array.isArray(parsed.servers)) return parsed
    }
  } catch {
    // noop
  }
  // Migrate from legacy path if exists
  try {
    if (existsSync(LEGACY_REGISTRY)) {
      const parsed = JSON.parse(readFileSync(LEGACY_REGISTRY, 'utf-8')) as McpRegistry
      if (Array.isArray(parsed.servers) && parsed.servers.length > 0) {
        writeRegistry(parsed)
        return parsed
      }
    }
  } catch {
    // noop
  }
  return { servers: [] }
}

function writeRegistry(registry: McpRegistry) {
  ensureDir()
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2))
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp'
}

function parseFlag(args: string[], name: string): string | null {
  const idx = args.findIndex((a) => a === name)
  if (idx < 0) return null
  return args[idx + 1] || null
}

function findServer(registry: McpRegistry, idOrName: string): McpServerEntry | null {
  return registry.servers.find((s) => s.id === idOrName || s.name === idOrName) || null
}

function printList(jsonMode: boolean) {
  const registry = readRegistry()
  if (jsonMode) {
    console.log(JSON.stringify(registry, null, 2))
    return
  }

  if (registry.servers.length === 0) {
    console.log('No MCP servers in registry.')
    return
  }

  for (const s of registry.servers) {
    const target = s.type === 'stdio'
      ? `${s.command || 'n/a'} ${(s.args || []).join(' ')}`.trim()
      : (s.url || 'n/a')
    console.log(`${s.id}  ${s.name}  type=${s.type}  enabled=${s.enabled}  target=${target}`)
  }
}

function addStdio(args: string[]) {
  const name = args[0]
  if (!name) {
    console.log('Usage: rex mcp add <name> --command <cmd> [--args a,b,c] [--cwd path] [--tags t1,t2]')
    process.exit(1)
  }

  const command = parseFlag(args, '--command')
  if (!command) {
    console.log('Missing --command')
    process.exit(1)
  }

  const argsCsv = parseFlag(args, '--args')
  const cwd = parseFlag(args, '--cwd')
  const tagsCsv = parseFlag(args, '--tags')

  const registry = readRegistry()
  const now = new Date().toISOString()
  const entry: McpServerEntry = {
    id: `${slug(name)}-${Date.now().toString().slice(-6)}`,
    name,
    type: 'stdio',
    command,
    args: argsCsv ? argsCsv.split(',').map((v) => v.trim()).filter(Boolean) : [],
    cwd: cwd || undefined,
    enabled: true,
    tags: tagsCsv ? tagsCsv.split(',').map((v) => v.trim()).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
  }

  registry.servers.push(entry)
  writeRegistry(registry)
  console.log(JSON.stringify({ ok: true, server: entry }, null, 2))
}

function addUrl(args: string[]) {
  const name = args[0]
  const url = args[1]
  if (!name || !url) {
    console.log('Usage: rex mcp add-url <name> <url> [--type sse|http] [--tags t1,t2]')
    process.exit(1)
  }

  const typeRaw = (parseFlag(args, '--type') || 'sse').toLowerCase()
  const type: McpType = typeRaw === 'http' ? 'http' : 'sse'
  const tagsCsv = parseFlag(args, '--tags')

  const registry = readRegistry()
  const now = new Date().toISOString()
  const entry: McpServerEntry = {
    id: `${slug(name)}-${Date.now().toString().slice(-6)}`,
    name,
    type,
    url,
    enabled: true,
    tags: tagsCsv ? tagsCsv.split(',').map((v) => v.trim()).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
  }

  registry.servers.push(entry)
  writeRegistry(registry)
  console.log(JSON.stringify({ ok: true, server: entry }, null, 2))
}

function removeServer(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log('Usage: rex mcp remove <id|name>')
    process.exit(1)
  }

  const registry = readRegistry()
  const idx = registry.servers.findIndex((s) => s.id === idOrName || s.name === idOrName)
  if (idx < 0) {
    console.log(`Server not found: ${idOrName}`)
    process.exit(1)
  }

  const removed = registry.servers[idx]
  registry.servers.splice(idx, 1)
  writeRegistry(registry)
  console.log(JSON.stringify({ ok: true, removed }, null, 2))
}

function setEnabled(args: string[], enabled: boolean) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log(`Usage: rex mcp ${enabled ? 'enable' : 'disable'} <id|name>`)
    process.exit(1)
  }

  const registry = readRegistry()
  const server = findServer(registry, idOrName)
  if (!server) {
    console.log(`Server not found: ${idOrName}`)
    process.exit(1)
  }

  server.enabled = enabled
  server.updatedAt = new Date().toISOString()
  writeRegistry(registry)
  console.log(JSON.stringify({ ok: true, id: server.id, enabled }, null, 2))
}

async function checkServer(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log('Usage: rex mcp check <id|name>')
    process.exit(1)
  }

  const registry = readRegistry()
  const server = findServer(registry, idOrName)
  if (!server) {
    console.log(`Server not found: ${idOrName}`)
    process.exit(1)
  }

  if (server.type === 'stdio') {
    if (!server.command) {
      console.log(JSON.stringify({ ok: false, reason: 'missing command' }, null, 2))
      process.exit(1)
    }

    try {
      execFileSync('which', [server.command], { stdio: 'ignore' })
      console.log(JSON.stringify({ ok: true, type: 'stdio', command: server.command }, null, 2))
    } catch {
      console.log(JSON.stringify({ ok: false, type: 'stdio', reason: `command not found: ${server.command}` }, null, 2))
      process.exitCode = 1
    }
    return
  }

  if (!server.url) {
    console.log(JSON.stringify({ ok: false, reason: 'missing url' }, null, 2))
    process.exit(1)
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(server.url, { signal: controller.signal })
    clearTimeout(t)
    console.log(JSON.stringify({ ok: res.ok, status: res.status, type: server.type, url: server.url }, null, 2))
    if (!res.ok) process.exitCode = 1
  } catch (e) {
    clearTimeout(t)
    const err = e instanceof Error ? e.message : String(e)
    console.log(JSON.stringify({ ok: false, type: server.type, url: server.url, error: err }, null, 2))
    process.exitCode = 1
  }
}

function syncClaudeSettings() {
  const registry = readRegistry()
  const settingsPath = join(HOME, '.claude', 'settings.json')
  const claudeDir = join(HOME, '.claude')
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true })

  let settings: any = {}
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  if (!settings.mcpServers) settings.mcpServers = {}

  const enabledStdio = registry.servers.filter((s) => s.enabled && s.type === 'stdio' && s.command)
  for (const s of enabledStdio) {
    settings.mcpServers[s.name] = {
      command: s.command,
      args: s.args || [],
      ...(s.cwd ? { cwd: s.cwd } : {}),
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log(JSON.stringify({ ok: true, synced: enabledStdio.length, settingsPath }, null, 2))
}

function importFromClaude() {
  const settingsPath = join(HOME, '.claude', 'settings.json')
  let settings: any = {}
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  const mcpServers = settings.mcpServers || {}

  const registry = readRegistry()
  let imported = 0
  const now = new Date().toISOString()

  for (const [name, config] of Object.entries(mcpServers)) {
    const cfg = config as any
    // Skip if already in registry
    if (registry.servers.some((s) => s.name === name)) continue

    const entry: McpServerEntry = {
      id: `${slug(name)}-${Date.now().toString().slice(-6)}`,
      name,
      type: 'stdio',
      command: cfg.command || '',
      args: Array.isArray(cfg.args) ? cfg.args : [],
      cwd: cfg.cwd || undefined,
      enabled: true,
      tags: ['imported-from-claude'],
      createdAt: now,
      updatedAt: now,
    }
    registry.servers.push(entry)
    imported++
  }

  if (imported > 0) writeRegistry(registry)
  console.log(JSON.stringify({ ok: true, imported, total: registry.servers.length }, null, 2))
}

interface MarketplaceEntry {
  name: string
  description: string
  command?: string
  args?: string[]
  installCmd?: string
  type: McpType
  url?: string
  tags: string[]
  source: string
}

const MARKETPLACE_DIR = join(HOME, '.claude', 'rex')
const MARKETPLACE_FILE = join(MARKETPLACE_DIR, 'mcp-marketplace.json')

const DEFAULT_MARKETPLACE: MarketplaceEntry[] = [
  { name: 'context7', description: 'Versioned docs for any library (npm, PyPI)', command: 'npx', args: ['-y', '@upstash/context7-mcp'], installCmd: 'npx -y @upstash/context7-mcp', type: 'stdio', tags: ['docs', 'libraries'], source: 'builtin' },
  { name: 'playwright', description: 'Browser automation and testing', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-playwright'], installCmd: 'npx -y @anthropic-ai/mcp-server-playwright', type: 'stdio', tags: ['browser', 'testing', 'automation'], source: 'builtin' },
  { name: 'filesystem', description: 'Local filesystem access (read/write/search)', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-filesystem'], installCmd: 'npx -y @anthropic-ai/mcp-server-filesystem', type: 'stdio', tags: ['files', 'local'], source: 'builtin' },
  { name: 'github', description: 'GitHub API (repos, issues, PRs, actions)', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-github'], installCmd: 'npm install -g @anthropic-ai/mcp-server-github', type: 'stdio', tags: ['git', 'github', 'ci'], source: 'builtin' },
  { name: 'slack', description: 'Slack messaging and channel management', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-slack'], installCmd: 'npx -y @anthropic-ai/mcp-server-slack', type: 'stdio', tags: ['messaging', 'slack'], source: 'builtin' },
  { name: 'linear', description: 'Linear issue tracker integration', command: 'npx', args: ['-y', 'mcp-linear'], installCmd: 'npx -y mcp-linear', type: 'stdio', tags: ['issues', 'project-management'], source: 'builtin' },
  { name: 'figma', description: 'Figma design file access and inspection', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-figma'], installCmd: 'npx -y @anthropic-ai/mcp-server-figma', type: 'stdio', tags: ['design', 'figma', 'ui'], source: 'builtin' },
  { name: 'brave-search', description: 'Web search via Brave Search API', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-brave-search'], installCmd: 'npx -y @anthropic-ai/mcp-server-brave-search', type: 'stdio', tags: ['search', 'web'], source: 'builtin' },
  { name: 'puppeteer', description: 'Headless Chrome browser automation', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-puppeteer'], installCmd: 'npx -y @anthropic-ai/mcp-server-puppeteer', type: 'stdio', tags: ['browser', 'scraping'], source: 'builtin' },
  { name: 'sequential-thinking', description: 'Step-by-step reasoning and problem solving', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-sequential-thinking'], installCmd: 'npx -y @anthropic-ai/mcp-server-sequential-thinking', type: 'stdio', tags: ['reasoning', 'thinking'], source: 'builtin' },
  { name: 'memory', description: 'Persistent memory via knowledge graph', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-memory'], installCmd: 'npx -y @anthropic-ai/mcp-server-memory', type: 'stdio', tags: ['memory', 'knowledge'], source: 'builtin' },
  { name: 'postgres', description: 'PostgreSQL database access', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-postgres'], installCmd: 'npx -y @anthropic-ai/mcp-server-postgres', type: 'stdio', tags: ['database', 'postgres', 'sql'], source: 'builtin' },
  { name: 'sqlite', description: 'SQLite database access', command: 'npx', args: ['-y', '@anthropic-ai/mcp-server-sqlite'], installCmd: 'npx -y @anthropic-ai/mcp-server-sqlite', type: 'stdio', tags: ['database', 'sqlite', 'sql'], source: 'builtin' },
  { name: 'docker', description: 'Docker container management', command: 'npx', args: ['-y', 'mcp-docker'], installCmd: 'npx -y mcp-docker', type: 'stdio', tags: ['docker', 'containers', 'devops'], source: 'builtin' },
  { name: 'kubernetes', description: 'Kubernetes cluster management', command: 'npx', args: ['-y', 'mcp-kubernetes'], installCmd: 'npx -y mcp-kubernetes', type: 'stdio', tags: ['kubernetes', 'k8s', 'devops'], source: 'builtin' },
  { name: 'sentry', description: 'Sentry error tracking integration', command: 'npx', args: ['-y', 'mcp-sentry'], installCmd: 'npx -y mcp-sentry', type: 'stdio', tags: ['monitoring', 'errors', 'sentry'], source: 'builtin' },
  { name: 'notion', description: 'Notion workspace access', command: 'npx', args: ['-y', 'mcp-notion'], installCmd: 'npx -y mcp-notion', type: 'stdio', tags: ['notion', 'docs', 'wiki'], source: 'builtin' },
  { name: 'google-drive', description: 'Google Drive file access', command: 'npx', args: ['-y', 'mcp-google-drive'], installCmd: 'npx -y mcp-google-drive', type: 'stdio', tags: ['google', 'drive', 'files'], source: 'builtin' },
  { name: 'exa', description: 'Exa AI-powered web search', command: 'npx', args: ['-y', 'mcp-exa'], installCmd: 'npx -y mcp-exa', type: 'stdio', tags: ['search', 'web', 'ai'], source: 'builtin' },
  { name: 'firecrawl', description: 'Web scraping and crawling', command: 'npx', args: ['-y', 'mcp-firecrawl'], installCmd: 'npx -y mcp-firecrawl', type: 'stdio', tags: ['scraping', 'crawling', 'web'], source: 'builtin' },
]

function readMarketplace(): MarketplaceEntry[] {
  try {
    if (existsSync(MARKETPLACE_FILE)) {
      const parsed = JSON.parse(readFileSync(MARKETPLACE_FILE, 'utf-8'))
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as MarketplaceEntry[]
    }
  } catch {
    // noop
  }
  // Create default cache
  if (!existsSync(MARKETPLACE_DIR)) mkdirSync(MARKETPLACE_DIR, { recursive: true })
  writeFileSync(MARKETPLACE_FILE, JSON.stringify(DEFAULT_MARKETPLACE, null, 2))
  return DEFAULT_MARKETPLACE
}

async function discoverServer(args: string[], jsonMode: boolean) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log('Usage: rex mcp discover <id|name>')
    process.exit(1)
  }

  const registry = readRegistry()
  const server = findServer(registry, idOrName)
  if (!server) {
    console.log(`Server not found: ${idOrName}`)
    process.exit(1)
  }

  if (server.type !== 'stdio' && server.url) {
    // URL-based server: send JSON-RPC tools/list
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
        signal: controller.signal,
      })
      clearTimeout(t)
      if (!res.ok) {
        console.log(`Could not discover tools for ${server.name} (HTTP ${res.status})`)
        return
      }
      const body = await res.json() as any
      const tools = body?.result?.tools || []
      if (jsonMode) {
        console.log(JSON.stringify(tools, null, 2))
      } else if (tools.length === 0) {
        console.log(`No tools found for ${server.name}`)
      } else {
        for (const tool of tools) {
          console.log(`  ${tool.name || 'unnamed'}  ${tool.description || ''}`)
        }
      }
    } catch {
      clearTimeout(t)
      console.log(`Could not discover tools for ${server.name}`)
    }
    return
  }

  // stdio server: try spawning with MCP protocol init + tools/list
  if (!server.command) {
    console.log(`Could not discover tools for ${server.name} (no command)`)
    return
  }

  try {
    const { spawn } = await import('node:child_process')
    const child = spawn(server.command, [...(server.args || [])], {
      cwd: server.cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let output = ''
    let done = false
    const timeout = setTimeout(() => {
      if (!done) { done = true; child.kill(); }
    }, 10000)

    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })

    // Send MCP initialize then tools/list
    const initMsg = JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 0, params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'rex', version: '1.0' } } }) + '\n'
    const toolsMsg = JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }) + '\n'

    child.stdin.write(initMsg)
    // Small delay before sending tools/list
    setTimeout(() => { child.stdin.write(toolsMsg) }, 500)
    // Give time for response
    setTimeout(() => {
      if (!done) {
        done = true
        clearTimeout(timeout)
        child.kill()

        // Parse tools from output (look for tools/list response)
        const lines = output.split('\n').filter(Boolean)
        let tools: any[] = []
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.id === 1 && parsed.result?.tools) {
              tools = parsed.result.tools
              break
            }
          } catch {
            // skip non-JSON lines
          }
        }

        if (jsonMode) {
          console.log(JSON.stringify(tools, null, 2))
        } else if (tools.length === 0) {
          console.log(`Could not discover tools for ${server.name}`)
        } else {
          console.log(`Tools for ${server.name}:`)
          for (const tool of tools) {
            console.log(`  ${tool.name || 'unnamed'}  ${tool.description || ''}`)
          }
        }
      }
    }, 3000)

    // Wait for the child to finish
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve())
      child.on('error', () => { if (!done) { done = true; clearTimeout(timeout) }; resolve() })
      setTimeout(() => resolve(), 12000)
    })
  } catch {
    console.log(`Could not discover tools for ${server.name}`)
  }
}

async function refreshMarketplace(jsonMode: boolean) {
  const existingMarketplace = readMarketplace()
  const existingNames = new Set(existingMarketplace.map(e => e.name))
  let newEntries: MarketplaceEntry[] = [...existingMarketplace]
  let fetched = 0

  // ── Source 1: awesome-mcp-servers GitHub READMEs ─────────────────
  const markdownSources = [
    'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md',
    'https://raw.githubusercontent.com/wong2/awesome-mcp-servers/main/README.md',
  ]
  for (const url of markdownSources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      const text = await res.text()

      const npmRegex = /\[([^\]]+)\]\(https?:\/\/(?:www\.)?(?:npmjs\.com\/package\/|github\.com\/)([^\)]+)\)\s*[-–—]\s*(.+)/g
      let match
      while ((match = npmRegex.exec(text)) !== null) {
        const name = match[1].toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        if (existingNames.has(name) || name.length < 2) continue

        const source = match[2]
        const desc = match[3].replace(/\*\*/g, '').trim().slice(0, 120)
        const isNpm = match[0].includes('npmjs.com')

        const entry: MarketplaceEntry = {
          name,
          description: desc,
          command: isNpm ? 'npx' : undefined,
          args: isNpm ? ['-y', source] : undefined,
          installCmd: isNpm ? `npx -y ${source}` : undefined,
          type: 'stdio',
          tags: ['community'],
          source: 'awesome-mcp-servers',
        }
        newEntries.push(entry)
        existingNames.add(name)
        fetched++
      }
    } catch {
      // Skip failed sources
    }
  }

  // ── Source 2: Smithery registry ────────────────────────────────
  try {
    const smitheryRes = await fetch(
      'https://registry.smithery.ai/servers?q=&pageSize=50',
      { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } }
    )
    if (smitheryRes.ok) {
      const data = await smitheryRes.json() as { servers?: Array<{ qualifiedName: string; displayName: string; description: string; isDeployed?: boolean }> }
      for (const srv of data.servers ?? []) {
        const name = (srv.qualifiedName ?? srv.displayName ?? '')
          .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
        if (!name || name.length < 2 || existingNames.has(name)) continue
        const desc = (srv.description ?? '').slice(0, 120)
        const npmPkg = `@smithery/${name}`
        const entry: MarketplaceEntry = {
          name,
          description: desc,
          command: 'npx',
          args: ['-y', npmPkg],
          installCmd: `npx -y ${npmPkg}`,
          type: 'stdio',
          tags: ['smithery', srv.isDeployed ? 'verified' : 'community'],
          source: 'smithery',
        }
        newEntries.push(entry)
        existingNames.add(name)
        fetched++
      }
    }
  } catch {
    // Smithery unavailable — skip silently
  }

  // Save updated marketplace
  if (!existsSync(MARKETPLACE_DIR)) mkdirSync(MARKETPLACE_DIR, { recursive: true })
  writeFileSync(MARKETPLACE_FILE, JSON.stringify(newEntries, null, 2))

  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, fetched, total: newEntries.length }))
  } else {
    console.log(`Refreshed marketplace: ${fetched} new entries, ${newEntries.length} total`)
  }
}

function searchMarketplace(args: string[], jsonMode: boolean) {
  const query = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase()
  if (!query) {
    console.log('Usage: rex mcp search <query>')
    process.exit(1)
  }

  const marketplace = readMarketplace()
  const matches = marketplace.filter((entry) => {
    const haystack = `${entry.name} ${entry.description} ${entry.tags.join(' ')}`.toLowerCase()
    return query.split(/\s+/).every((word) => haystack.includes(word))
  })

  if (jsonMode) {
    console.log(JSON.stringify(matches, null, 2))
    return
  }

  if (matches.length === 0) {
    console.log(`No servers found matching "${query}"`)
    return
  }

  console.log(`Found ${matches.length} server(s):\n`)
  for (const entry of matches) {
    console.log(`  ${entry.name.padEnd(22)} ${entry.description}`)
    if (entry.installCmd) console.log(`    install: ${entry.installCmd}`)
    if (entry.tags.length) console.log(`    tags: ${entry.tags.join(', ')}`)
    console.log('')
  }
}

async function installFromMarketplace(args: string[]) {
  const name = args[0]
  if (!name) {
    console.log('Usage: rex mcp install <name>')
    process.exit(1)
  }

  const marketplace = readMarketplace()
  const entry = marketplace.find((e) => e.name === name)
  if (!entry) {
    console.log(`Server "${name}" not found in marketplace. Run "rex mcp search ${name}" to check.`)
    process.exit(1)
  }

  if (!entry.installCmd) {
    console.log(`No install command for "${name}".`)
    if (entry.command) {
      console.log(`You can add it manually: rex mcp add ${name} --command ${entry.command} --args ${(entry.args || []).join(',')}`)
    }
    return
  }

  console.log(`Installing ${name}...`)
  console.log(`  $ ${entry.installCmd}\n`)

  // Validate install command starts with a safe prefix
  const safePrefix = ['npx ', 'npm ', 'pip ', 'pip3 ', 'brew ', 'docker ']
  if (!safePrefix.some(p => entry.installCmd!.startsWith(p))) {
    console.log(`\n⚠️ Install command rejected (unsafe prefix): ${entry.installCmd}`)
    return
  }

  try {
    execSync(entry.installCmd, { stdio: 'inherit', timeout: 120_000 })
  } catch {
    console.log(`\nInstall command failed. You may need to run it manually: ${entry.installCmd}`)
    return
  }

  // Auto-add to registry
  const registry = readRegistry()
  const existing = findServer(registry, name)
  if (existing) {
    console.log(`\nServer "${name}" already in registry (id=${existing.id}). Skipping auto-add.`)
    return
  }

  const now = new Date().toISOString()
  const newEntry: McpServerEntry = {
    id: `${slug(name)}-${Date.now().toString().slice(-6)}`,
    name: entry.name,
    type: entry.type,
    command: entry.command,
    args: entry.args || [],
    enabled: true,
    tags: entry.tags,
    createdAt: now,
    updatedAt: now,
  }

  registry.servers.push(newEntry)
  writeRegistry(registry)
  console.log(`\nAdded to registry: ${newEntry.id}`)
  console.log(JSON.stringify({ ok: true, server: newEntry }, null, 2))
}

// MCP_MAP: stack key → recommended MCP servers (§15.3 REX Master Plan)
const MCP_MAP: Record<string, Array<{ name: string; reason: string }>> = {
  'next':       [{ name: 'context7', reason: 'versioned docs for React/Next.js' }, { name: 'playwright', reason: 'browser testing for Next.js apps' }, { name: 'sentry', reason: 'error tracking' }],
  'react':      [{ name: 'context7', reason: 'versioned React docs' }, { name: 'playwright', reason: 'browser testing' }],
  'drizzle':    [{ name: 'postgres', reason: 'Drizzle → PostgreSQL access' }, { name: 'sqlite', reason: 'Drizzle → SQLite access' }],
  'prisma':     [{ name: 'postgres', reason: 'Prisma → PostgreSQL access' }],
  'vitest':     [],
  'playwright': [{ name: 'playwright', reason: 'direct Playwright MCP integration' }],
  'tailwind':   [{ name: 'context7', reason: 'Tailwind docs' }],
  'express':    [{ name: 'context7', reason: 'Express docs' }, { name: 'sentry', reason: 'API error tracking' }],
  'fastify':    [{ name: 'context7', reason: 'Fastify docs' }, { name: 'sentry', reason: 'API error tracking' }],
  'flutter':    [{ name: 'context7', reason: 'Flutter/Dart docs' }, { name: 'figma', reason: 'Flutter design integration' }],
  'python':     [{ name: 'context7', reason: 'Python library docs' }],
  'go':         [{ name: 'context7', reason: 'Go standard library docs' }],
}

// Always recommended regardless of stack
const ALWAYS_MCP: Array<{ name: string; reason: string }> = [
  { name: 'github', reason: 'Git workflow — PRs, issues, actions' },
]

async function autoRecommend(cwd: string, jsonMode: boolean) {
  const { detectStack } = await import('./project-init.js')
  const stack = detectStack(cwd)

  const seen = new Set<string>()
  const recommendations: Array<{ name: string; reason: string }> = []

  for (const always of ALWAYS_MCP) {
    if (!seen.has(always.name)) { seen.add(always.name); recommendations.push(always) }
  }

  for (const key of stack.keys) {
    for (const rec of MCP_MAP[key] ?? []) {
      if (!seen.has(rec.name)) { seen.add(rec.name); recommendations.push(rec) }
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify({ stack: stack.name, recommendations }, null, 2))
    return
  }

  console.log(`\n\x1b[1mREX MCP Auto\x1b[0m  \x1b[2mstack: ${stack.name}\x1b[0m\n`)
  console.log('  Recommended MCP servers for this project:\n')

  const registry = readRegistry()
  for (const rec of recommendations) {
    const installed = registry.servers.find(s => s.name === rec.name)
    const dot = installed?.enabled ? '\x1b[32m●\x1b[0m' : installed ? '\x1b[33m●\x1b[0m' : '\x1b[2m○\x1b[0m'
    const status = installed?.enabled ? '\x1b[2m(active)\x1b[0m' : installed ? '\x1b[2m(disabled)\x1b[0m' : '\x1b[2m(not installed)\x1b[0m'
    console.log(`  ${dot}  ${rec.name.padEnd(22)} ${status}`)
    console.log(`          \x1b[2m${rec.reason}\x1b[0m`)
    if (!installed) console.log(`          \x1b[2mrex mcp install ${rec.name}\x1b[0m`)
    console.log()
  }

  if (recommendations.length === 0) {
    console.log('  No specific recommendations for this stack.')
    console.log('  Run: rex mcp search <query>  to browse the marketplace\n')
  }
}

async function runScan(jsonMode: boolean) {
  // Check if mcp-scan is available (Invariant Labs tool)
  let hasScan = false
  try {
    execSync('mcp-scan --version 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
    hasScan = true
  } catch {}

  if (!hasScan) {
    // Try uvx (if uv is installed)
    try {
      execSync('uvx --version 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
      // uvx can run mcp-scan without install
      console.log('Running mcp-scan via uvx...\n')
      execSync('uvx mcp-scan@latest', { stdio: 'inherit', timeout: 120_000 })
      return
    } catch {}

    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: 'mcp-scan not installed', install: 'pip install mcp-scan  or  uvx mcp-scan@latest' }))
    } else {
      console.log('\x1b[33m! mcp-scan not installed\x1b[0m')
      console.log('  Install: pip install mcp-scan')
      console.log('  Or run directly: uvx mcp-scan@latest')
      console.log()
      console.log('  mcp-scan checks for tool poisoning, prompt injection, and rug-pull risks.')
      console.log('  GitHub: https://github.com/invariantlabs-ai/mcp-scan')
    }
    return
  }

  console.log('Running mcp-scan...\n')
  try {
    execSync('mcp-scan', { stdio: 'inherit', timeout: 120_000 })
  } catch {
    // mcp-scan exits non-zero if issues found — that's expected
  }
}

function showExport() {
  const registry = readRegistry()
  const enabledStdio = registry.servers.filter((s) => s.enabled && s.type === 'stdio' && s.command)
  const exported: Record<string, any> = {}
  for (const s of enabledStdio) {
    exported[s.name] = {
      command: s.command,
      args: s.args || [],
      ...(s.cwd ? { cwd: s.cwd } : {}),
    }
  }
  console.log(JSON.stringify({ mcpServers: exported }, null, 2))
}

export async function mcpRegistry(args: string[]) {
  const sub = args[0] || 'list'
  const rest = args.slice(1)
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'list':
      printList(jsonMode)
      return
    case 'add':
      addStdio(rest)
      return
    case 'add-url':
      addUrl(rest)
      return
    case 'remove':
      removeServer(rest)
      return
    case 'enable':
      setEnabled(rest, true)
      return
    case 'disable':
      setEnabled(rest, false)
      return
    case 'check':
      await checkServer(rest)
      return
    case 'sync-claude':
      syncClaudeSettings()
      return
    case 'import-claude':
      importFromClaude()
      return
    case 'export':
      showExport()
      return
    case 'discover':
      if (rest.length === 0) {
        // No args → show curated catalog from mcp-discover.ts
        const { printCatalog } = await import('./mcp-discover.js')
        printCatalog()
      } else {
        // Args → discover tools exposed by a registered server
        await discoverServer(rest, jsonMode)
      }
      return
    case 'refresh-marketplace':
      await refreshMarketplace(jsonMode)
      return
    case 'browse': {
      // List all marketplace entries, optionally filtered by category tag
      const tag = rest.filter(a => !a.startsWith('--'))[0]?.toLowerCase()
      const marketplace = readMarketplace()
      const entries = tag
        ? marketplace.filter(e => e.tags.some(t => t.toLowerCase().includes(tag)))
        : marketplace
      if (jsonMode) { console.log(JSON.stringify(entries, null, 2)); return }
      const header = tag ? `MCP Marketplace — category: ${tag}` : 'MCP Marketplace'
      console.log(`\n${header} (${entries.length} servers)\n`)
      // Group by source
      const grouped: Record<string, typeof entries> = {}
      for (const e of entries) {
        const src = e.source ?? 'other'
        grouped[src] ??= []
        grouped[src].push(e)
      }
      for (const [src, list] of Object.entries(grouped)) {
        console.log(`  ── ${src} ──`)
        for (const e of list) {
          console.log(`  ${e.name.padEnd(24)} ${e.description}`)
          if (e.tags.length) console.log(`  ${''.padEnd(24)} tags: ${e.tags.join(', ')}`)
        }
        console.log('')
      }
      console.log(`  Run "rex mcp search <query>" to filter, "rex mcp install <name>" to install.\n`)
      return
    }
    case 'search': {
      const query = rest.filter(a => !a.startsWith('--')).join(' ')
      if (!query) { console.log('Usage: rex mcp search <query>'); return }
      // Try curated catalog first
      const { searchCatalog, printCatalog: printCat } = await import('./mcp-discover.js')
      const catalogResults = searchCatalog(query)
      if (catalogResults.length > 0) {
        printCat(catalogResults)
      } else {
        searchMarketplace(rest, jsonMode)
      }
      return
    }
    case 'install': {
      const name = rest.filter(a => !a.startsWith('--'))[0]
      if (!name) { console.log('Usage: rex mcp install <name>'); return }
      // Try curated catalog first
      const { installServer } = await import('./mcp-discover.js')
      const result = await installServer(name)
      if (result.ok) {
        console.log(`\x1b[32m✓\x1b[0m Installed: ${name}  (registered in ~/.claude/settings.json)`)
      } else if (result.error?.includes('not found')) {
        // Fall back to marketplace
        await installFromMarketplace(rest)
      } else {
        console.log(`\x1b[31m✗\x1b[0m ${result.error}`)
      }
      return
    }
    case 'auto': {
      const cwd = rest.find(a => a.startsWith('--path='))?.split('=')[1] ?? process.cwd()
      await autoRecommend(cwd, jsonMode)
      return
    }
    case 'scan': {
      await runScan(jsonMode)
      return
    }
    case 'serve': {
      const { startMcpServer } = await import('./rex-mcp-server.js')
      await startMcpServer()
      return
    }
    case 'register': {
      const { getMcpServerConfig } = await import('./rex-mcp-server.js')
      const settingsPath = join(HOME, '.claude', 'settings.json')
      let settings: Record<string, any> = {}
      try {
        if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      } catch {}
      if (!settings.mcpServers) settings.mcpServers = {}
      const config = getMcpServerConfig()
      Object.assign(settings.mcpServers, config)
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      console.log('✓ REX registered as MCP server in ~/.claude/settings.json')
      console.log('  Restart Claude Code to pick up the new server.')
      return
    }
    default:
      console.log('Usage: rex mcp <list|add|add-url|remove|enable|disable|check|sync-claude|import-claude|export|discover|browse|search|install|refresh-marketplace|auto|scan|serve|register> ...')
  }
}
