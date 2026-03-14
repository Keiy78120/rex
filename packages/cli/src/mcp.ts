import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

const CLAUDE_DIR = join(homedir(), '.claude')
const SETTINGS_PATH = join(CLAUDE_DIR, 'settings.json')
const MCP_REGISTRY_PATH = join(homedir(), '.rex-memory', 'mcp-registry.json')

type JsonMap = Record<string, any>

interface ParsedArgs {
  positionals: string[]
  flags: Record<string, string | boolean>
}

interface McpRegistry {
  version: number
  servers: Record<string, JsonMap>
}

function ensureDirs() {
  mkdirSync(CLAUDE_DIR, { recursive: true })
  mkdirSync(join(homedir(), '.rex-memory'), { recursive: true })
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }

    const stripped = token.slice(2)
    const eq = stripped.indexOf('=')
    if (eq !== -1) {
      flags[stripped.slice(0, eq)] = stripped.slice(eq + 1)
      continue
    }

    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      flags[stripped] = next
      i++
    } else {
      flags[stripped] = true
    }
  }

  return { positionals, flags }
}

function flagString(flags: Record<string, string | boolean>, name: string, fallback = ''): string {
  const raw = flags[name]
  if (typeof raw === 'string') return raw
  if (raw === true) return '1'
  return fallback
}

function flagBool(flags: Record<string, string | boolean>, name: string, fallback = false): boolean {
  const raw = flags[name]
  if (raw === undefined) return fallback
  if (raw === true) return true
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function readJson(path: string): JsonMap | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as JsonMap
  } catch {
    return null
  }
}

function writeJson(path: string, data: JsonMap) {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function loadSettings(): JsonMap {
  ensureDirs()
  const settings = readJson(SETTINGS_PATH) ?? {}
  if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
    settings.mcpServers = {}
  }
  return settings
}

function saveSettings(settings: JsonMap) {
  ensureDirs()
  writeJson(SETTINGS_PATH, settings)
}

function loadRegistry(): McpRegistry {
  ensureDirs()
  const reg = readJson(MCP_REGISTRY_PATH)
  if (!reg || typeof reg !== 'object') {
    return { version: 1, servers: {} }
  }
  if (!reg.servers || typeof reg.servers !== 'object') reg.servers = {}
  if (!reg.version) reg.version = 1
  return reg as McpRegistry
}

function saveRegistry(registry: McpRegistry) {
  ensureDirs()
  writeJson(MCP_REGISTRY_PATH, registry as unknown as JsonMap)
}

function parseList(raw: string): string[] {
  const value = raw.trim()
  if (!value) return []
  if (value.startsWith('[')) {
    try {
      const arr = JSON.parse(value)
      if (Array.isArray(arr)) return arr.map(String)
    } catch {}
  }
  if (value.includes(',')) return value.split(',').map((s) => s.trim()).filter(Boolean)
  return value.split(/\s+/).map((s) => s.trim()).filter(Boolean)
}

function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of parseList(raw)) {
    const idx = pair.indexOf('=')
    if (idx === -1) continue
    const k = pair.slice(0, idx).trim()
    const v = pair.slice(idx + 1).trim()
    if (!k) continue
    out[k] = v
  }
  return out
}

function buildServerFromFlags(flags: Record<string, string | boolean>): JsonMap {
  const url = flagString(flags, 'url', '')
  if (url) {
    const server: JsonMap = { transport: 'sse', url }
    const headers = flagString(flags, 'headers', '')
    if (headers) server.headers = parseEnv(headers)
    if (flags.disabled !== undefined) server.disabled = flagBool(flags, 'disabled', false)
    return server
  }

  const command = flagString(flags, 'command', '')
  if (!command) throw new Error('Missing --command (or use --url for remote server)')

  const server: JsonMap = { command }
  const args = flagString(flags, 'args', '')
  if (args) server.args = parseList(args)
  const cwd = flagString(flags, 'cwd', '')
  if (cwd) server.cwd = cwd
  const env = flagString(flags, 'env', '')
  if (env) server.env = parseEnv(env)
  if (flags.disabled !== undefined) server.disabled = flagBool(flags, 'disabled', false)
  return server
}

function prettyServer(name: string, server: JsonMap): string {
  const status = server.disabled ? 'disabled' : 'enabled'
  if (server.url) {
    return `${name.padEnd(20)} ${status.padEnd(8)} remote ${server.url}`
  }
  const cmd = String(server.command || '')
  const args = Array.isArray(server.args) ? server.args.join(' ') : ''
  const cwd = server.cwd ? ` cwd=${server.cwd}` : ''
  return `${name.padEnd(20)} ${status.padEnd(8)} ${cmd} ${args}${cwd}`.trim()
}

async function testServer(name: string, server: JsonMap): Promise<{ ok: boolean; message: string }> {
  if (server.url) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(String(server.url), { method: 'GET', signal: controller.signal })
      clearTimeout(timeout)
      return { ok: res.ok, message: `HTTP ${res.status} ${res.statusText}` }
    } catch (e: any) {
      clearTimeout(timeout)
      return { ok: false, message: `Connection failed: ${e?.message || e}` }
    }
  }

  const cmd = String(server.command || '')
  if (!cmd) return { ok: false, message: 'No command configured' }
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
  } catch {
    return { ok: false, message: `Command not found in PATH: ${cmd}` }
  }

  const args = Array.isArray(server.args) ? server.args : []
  const cwd = server.cwd ? String(server.cwd) : process.cwd()
  try {
    execSync(`${cmd} ${args.map((a) => JSON.stringify(String(a))).join(' ')} --help >/dev/null 2>&1`, {
      cwd,
      stdio: 'ignore',
      timeout: 5000,
    })
  } catch {
    // --help may fail, command presence still valid
  }

  return { ok: true, message: `${name}: command resolved (${cmd})` }
}

function printHelp() {
  console.log(`
${COLORS.bold}rex mcp${COLORS.reset} — Manage MCP servers

Live settings (.claude/settings.json):
  rex mcp list
  rex mcp add <name> --command=<cmd> [--args="a,b,c"] [--cwd=<path>] [--env="K=V,K2=V2"]
  rex mcp add <name> --url=<https://...> [--headers="Authorization=Bearer ..."]
  rex mcp remove <name>
  rex mcp enable <name>
  rex mcp disable <name>
  rex mcp test <name>

Registry (persistent library, then sync to settings):
  rex mcp registry list
  rex mcp registry add <name> --command=<cmd> ... | --url=<...>
  rex mcp registry remove <name>
  rex mcp registry sync [--force]
`)
}

export async function mcp(argv: string[]) {
  const { positionals, flags } = parseArgs(argv)
  const sub = positionals[0] || 'help'

  if (sub === 'help') {
    printHelp()
    return
  }

  if (sub === 'list') {
    const settings = loadSettings()
    const servers = settings.mcpServers as Record<string, JsonMap>
    const names = Object.keys(servers).sort()
    if (names.length === 0) {
      console.log(`${COLORS.yellow}No MCP servers configured.${COLORS.reset}`)
      return
    }
    console.log(`${COLORS.bold}Configured MCP servers:${COLORS.reset}`)
    for (const name of names) {
      console.log(`- ${prettyServer(name, servers[name])}`)
    }
    return
  }

  if (sub === 'add') {
    const name = positionals[1]
    if (!name) {
      console.log('Usage: rex mcp add <name> --command=<cmd> [--args=...] or --url=...')
      process.exit(1)
    }
    const server = buildServerFromFlags(flags)
    const settings = loadSettings()
    settings.mcpServers[name] = server
    saveSettings(settings)
    console.log(`${COLORS.green}MCP server added:${COLORS.reset} ${name}`)
    console.log(`  ${prettyServer(name, server)}`)
    return
  }

  if (sub === 'remove' || sub === 'rm') {
    const name = positionals[1]
    if (!name) {
      console.log('Usage: rex mcp remove <name>')
      process.exit(1)
    }
    const settings = loadSettings()
    if (!settings.mcpServers[name]) {
      console.log(`${COLORS.red}Server not found:${COLORS.reset} ${name}`)
      process.exit(1)
    }
    delete settings.mcpServers[name]
    saveSettings(settings)
    console.log(`${COLORS.green}MCP server removed:${COLORS.reset} ${name}`)
    return
  }

  if (sub === 'enable' || sub === 'disable') {
    const name = positionals[1]
    if (!name) {
      console.log(`Usage: rex mcp ${sub} <name>`)
      process.exit(1)
    }
    const settings = loadSettings()
    const server = settings.mcpServers[name]
    if (!server) {
      console.log(`${COLORS.red}Server not found:${COLORS.reset} ${name}`)
      process.exit(1)
    }
    server.disabled = (sub === 'disable')
    saveSettings(settings)
    console.log(`${COLORS.green}MCP server ${sub}d:${COLORS.reset} ${name}`)
    return
  }

  if (sub === 'test') {
    const name = positionals[1]
    if (!name) {
      console.log('Usage: rex mcp test <name>')
      process.exit(1)
    }
    const settings = loadSettings()
    const server = settings.mcpServers[name]
    if (!server) {
      console.log(`${COLORS.red}Server not found:${COLORS.reset} ${name}`)
      process.exit(1)
    }
    const result = await testServer(name, server)
    if (result.ok) {
      console.log(`${COLORS.green}PASS${COLORS.reset} ${name} — ${result.message}`)
      return
    }
    console.log(`${COLORS.red}FAIL${COLORS.reset} ${name} — ${result.message}`)
    process.exit(1)
  }

  if (sub === 'registry') {
    const action = positionals[1] || 'list'
    const registry = loadRegistry()

    if (action === 'list') {
      const names = Object.keys(registry.servers).sort()
      if (names.length === 0) {
        console.log(`${COLORS.yellow}Registry is empty.${COLORS.reset}`)
        return
      }
      console.log(`${COLORS.bold}MCP registry:${COLORS.reset}`)
      for (const name of names) {
        console.log(`- ${prettyServer(name, registry.servers[name])}`)
      }
      return
    }

    if (action === 'add') {
      const name = positionals[2]
      if (!name) {
        console.log('Usage: rex mcp registry add <name> --command=... or --url=...')
        process.exit(1)
      }
      registry.servers[name] = buildServerFromFlags(flags)
      saveRegistry(registry)
      console.log(`${COLORS.green}Registry entry added:${COLORS.reset} ${name}`)
      return
    }

    if (action === 'remove' || action === 'rm') {
      const name = positionals[2]
      if (!name) {
        console.log('Usage: rex mcp registry remove <name>')
        process.exit(1)
      }
      if (!registry.servers[name]) {
        console.log(`${COLORS.red}Registry entry not found:${COLORS.reset} ${name}`)
        process.exit(1)
      }
      delete registry.servers[name]
      saveRegistry(registry)
      console.log(`${COLORS.green}Registry entry removed:${COLORS.reset} ${name}`)
      return
    }

    if (action === 'sync') {
      const settings = loadSettings()
      const force = flagBool(flags, 'force', false)
      let added = 0
      let updated = 0

      for (const [name, server] of Object.entries(registry.servers)) {
        if (!settings.mcpServers[name]) {
          settings.mcpServers[name] = server
          added++
          continue
        }
        if (force) {
          settings.mcpServers[name] = server
          updated++
        }
      }

      saveSettings(settings)
      console.log(`${COLORS.green}Registry sync complete.${COLORS.reset} added=${added} updated=${updated}`)
      return
    }

    console.log(`${COLORS.red}Unknown registry action:${COLORS.reset} ${action}`)
    process.exit(1)
  }

  console.log(`${COLORS.red}Unknown mcp subcommand:${COLORS.reset} ${sub}`)
  printHelp()
  process.exit(1)
}

