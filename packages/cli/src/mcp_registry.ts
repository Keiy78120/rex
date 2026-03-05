import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

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
const ROOT_DIR = join(HOME, '.rex-memory')
const REGISTRY_FILE = join(ROOT_DIR, 'mcp-registry.json')

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
      execSync(`which ${server.command}`, { stdio: 'ignore' })
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
    case 'export':
      showExport()
      return
    default:
      console.log('Usage: rex mcp <list|add|add-url|remove|enable|disable|check|sync-claude|export> ...')
  }
}
