/**
 * REX Ink TUI — terminal dashboard for VPS / headless environments
 *
 * Displays real-time health, logs, fleet status without the Flutter app.
 * Designed for SSH sessions on VPS nodes or when macOS app is unavailable.
 *
 * Usage: rex tui
 * Keys: 1-7 to switch tabs, Q to quit
 *
 * @module GATEWAY
 */

import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput, useApp, Newline } from 'ink'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('GATEWAY:tui')
const execFileAsync = promisify(execFile)

const REX_DIR = join(homedir(), '.claude', 'rex')
const DAEMON_LOG = join(REX_DIR, 'daemon.log')

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthResult {
  status: 'ok' | 'warn' | 'error' | 'loading'
  label: string
  detail: string
}

interface FleetNode {
  id: string
  hostname: string
  status?: string
  score: number
  capabilities: string[]
  thermalStatus?: { cpuLoadPercent: number; ramUsedPercent: number; healthy: boolean }
}

interface MemoryStats {
  totalChunks: number
  embeddingCount: number
  pendingChunks: number
  status: string
}

interface AgentInfo {
  id: string
  name: string
  status: string
  model: string
  lastRun?: string
}

interface McpServer {
  name: string
  enabled: boolean
  command: string
}

interface ProviderInfo {
  name: string
  status: string
  costTier: string
  model?: string
}

type Tab = 'health' | 'logs' | 'fleet' | 'memory' | 'agents' | 'mcp' | 'providers'

// ── Helper to run rex CLI ─────────────────────────────────────────────────────

async function runRex(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('rex', args, { timeout: 10_000 })
    return stdout.trim()
  } catch (e: any) {
    return e.stdout?.trim() || e.message?.slice(0, 200) || 'error'
  }
}

function tryParseJson<T>(raw: string, fallback: T): T {
  try {
    // Extract first JSON object/array from mixed output
    const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/m)
    return match ? JSON.parse(match[0]) : fallback
  } catch {
    return fallback
  }
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function statusColor(s: HealthResult['status']): string {
  return s === 'ok' ? 'green' : s === 'warn' ? 'yellow' : s === 'error' ? 'red' : 'gray'
}

function statusIcon(s: HealthResult['status']): string {
  return s === 'ok' ? '●' : s === 'warn' ? '◐' : s === 'error' ? '○' : '·'
}

// ── Health Tab ────────────────────────────────────────────────────────────────

function HealthTab(): React.ReactElement {
  const [checks, setChecks] = useState<HealthResult[]>([
    { status: 'loading', label: 'Daemon', detail: 'checking...' },
    { status: 'loading', label: 'Ollama', detail: 'checking...' },
    { status: 'loading', label: 'Hub', detail: 'checking...' },
    { status: 'loading', label: 'Memory', detail: 'checking...' },
    { status: 'loading', label: 'Gateway', detail: 'checking...' },
  ])
  const [lastRefresh, setLastRefresh] = useState('')

  const refresh = async () => {
    const [doctorOut, memOut] = await Promise.all([
      runRex(['doctor', '--json']).catch(() => '{}'),
      runRex(['memory-check', '--json']).catch(() => '{}'),
    ])

    const doctor = tryParseJson<Record<string, unknown>>(doctorOut, {})
    const mem = tryParseJson<Record<string, unknown>>(memOut, {})

    const newChecks: HealthResult[] = [
      {
        label: 'Daemon',
        status: (doctor.daemon as boolean) ? 'ok' : 'error',
        detail: (doctor.daemon as boolean) ? 'running' : 'not running',
      },
      {
        label: 'Ollama',
        status: (doctor.ollama as boolean) ? 'ok' : 'warn',
        detail: (doctor.ollama as boolean) ? `${(doctor.ollamaModels as string[] | undefined)?.length ?? 0} models` : 'not running',
      },
      {
        label: 'Hub',
        status: (doctor.hub as boolean) ? 'ok' : 'warn',
        detail: (doctor.hub as boolean) ? 'port 7420' : 'offline',
      },
      {
        label: 'Memory',
        status: (mem.status as string) === 'ok' ? 'ok' : (mem.status as string) === 'warn' ? 'warn' : 'error',
        detail: `${(mem as any).embeddingCount ?? 0} embeddings`,
      },
      {
        label: 'Gateway',
        status: (doctor.gateway as boolean) ? 'ok' : 'warn',
        detail: (doctor.gateway as boolean) ? 'Telegram active' : 'stopped',
      },
    ]

    setChecks(newChecks)
    setLastRefresh(new Date().toLocaleTimeString())
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [])

  return React.createElement(Box, { flexDirection: 'column', gap: 0 },
    React.createElement(Box, { marginBottom: 1 },
      React.createElement(Text, { bold: true, color: 'red' }, 'REX HEALTH'),
      React.createElement(Text, { color: 'gray' }, `  refreshed ${lastRefresh}`)
    ),
    ...checks.map(c =>
      React.createElement(Box, { key: c.label, gap: 2 },
        React.createElement(Text, { color: statusColor(c.status) }, statusIcon(c.status)),
        React.createElement(Text, { bold: true, dimColor: c.status === 'loading' }, c.label.padEnd(10)),
        React.createElement(Text, { color: 'gray' }, c.detail)
      )
    )
  )
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab(): React.ReactElement {
  const [lines, setLines] = useState<string[]>(['loading...'])

  const refresh = () => {
    try {
      if (!existsSync(DAEMON_LOG)) { setLines(['No daemon log found']); return }
      const raw = readFileSync(DAEMON_LOG, 'utf-8')
      const all = raw.split('\n').filter(Boolean)
      // Strip ANSI escape codes
      setLines(all.slice(-20).map(l => l.replace(/\x1b\[[0-9;]*[mGKHFJhisuABCDlnr]/g, '')))
    } catch {
      setLines(['Error reading log'])
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 5_000)
    return () => clearInterval(timer)
  }, [])

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, 'DAEMON LOGS', React.createElement(Text, { color: 'gray' }, ' (last 20 lines, 5s refresh)')),
    React.createElement(Newline),
    ...lines.map((line, i) => {
      const color = line.includes('[ERROR]') ? 'red' : line.includes('[WARN]') ? 'yellow' : 'gray'
      return React.createElement(Text, { key: i, color, wrap: 'truncate' }, line)
    })
  )
}

// ── Fleet Tab ─────────────────────────────────────────────────────────────────

function FleetTab(): React.ReactElement {
  const [nodes, setNodes] = useState<FleetNode[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const out = await runRex(['mesh', '--json'])
      const data = tryParseJson<{ nodes?: FleetNode[] }>(out, {})
      setNodes(data.nodes ?? [])
    } catch {
      setNodes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 30_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return React.createElement(Text, { color: 'gray' }, 'Loading fleet...')
  if (nodes.length === 0) return React.createElement(Text, { color: 'gray' }, 'No nodes registered. Run: rex daemon')

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, `FLEET  `, React.createElement(Text, { color: 'gray' }, `${nodes.length} nodes`)),
    React.createElement(Newline),
    ...nodes.map(n => {
      const t = n.thermalStatus
      const thermal = t ? `CPU ${t.cpuLoadPercent}% RAM ${t.ramUsedPercent}%` : ''
      const nodeStatusColor = n.status === 'healthy' ? 'green' : n.status === 'stale' ? 'yellow' : 'red'
      return React.createElement(Box, { key: n.id, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Box, { gap: 2 },
          React.createElement(Text, { color: nodeStatusColor, bold: true }, '● '),
          React.createElement(Text, { bold: true }, n.hostname),
          React.createElement(Text, { color: 'gray' }, `score:${n.score}`),
          thermal ? React.createElement(Text, { color: t?.healthy ? 'green' : 'yellow' }, thermal) : null,
        ),
        React.createElement(Text, { color: 'gray', dimColor: true },
          `  ${n.capabilities.slice(0, 6).join(' · ')}`
        )
      )
    })
  )
}

// ── Memory Tab ────────────────────────────────────────────────────────────────

function MemoryTab(): React.ReactElement {
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])

  const refresh = async () => {
    setLoading(true)
    try {
      const out = await runRex(['memory-check', '--json'])
      const data = tryParseJson<MemoryStats>(out, { totalChunks: 0, embeddingCount: 0, pendingChunks: 0, status: 'unknown' })
      setStats(data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return React.createElement(Text, { color: 'gray' }, 'Loading memory stats...')

  const pct = stats && stats.totalChunks > 0
    ? Math.round((stats.embeddingCount / stats.totalChunks) * 100)
    : 0

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, 'MEMORY'),
    React.createElement(Newline),
    stats
      ? React.createElement(Box, { flexDirection: 'column', gap: 0 },
          React.createElement(Box, { gap: 2 },
            React.createElement(Text, { color: 'gray' }, 'Total chunks:  '),
            React.createElement(Text, { bold: true }, String(stats.totalChunks))
          ),
          React.createElement(Box, { gap: 2 },
            React.createElement(Text, { color: 'gray' }, 'Embedded:      '),
            React.createElement(Text, { bold: true, color: pct === 100 ? 'green' : pct > 80 ? 'yellow' : 'red' }, `${stats.embeddingCount} (${pct}%)`)
          ),
          React.createElement(Box, { gap: 2 },
            React.createElement(Text, { color: 'gray' }, 'Pending queue: '),
            React.createElement(Text, { bold: true, color: (stats.pendingChunks ?? 0) > 50 ? 'yellow' : 'green' }, String(stats.pendingChunks ?? 0))
          ),
          React.createElement(Box, { gap: 2 },
            React.createElement(Text, { color: 'gray' }, 'Status:        '),
            React.createElement(Text, { bold: true, color: stats.status === 'ok' ? 'green' : 'yellow' }, stats.status)
          ),
          React.createElement(Newline),
          React.createElement(Text, { color: 'gray', dimColor: true }, 'Use "rex search <query>" in another terminal to search.')
        )
      : React.createElement(Text, { color: 'red' }, 'Memory check failed')
  )
}

// ── Agents Tab ────────────────────────────────────────────────────────────────

function AgentsTab(): React.ReactElement {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const out = await runRex(['agents', 'list', '--json'])
      const data = tryParseJson<{ agents?: AgentInfo[] }>(out, {})
      setAgents(data.agents ?? [])
    } catch {
      setAgents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 15_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return React.createElement(Text, { color: 'gray' }, 'Loading agents...')
  if (agents.length === 0) return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, 'AGENTS'),
    React.createElement(Newline),
    React.createElement(Text, { color: 'gray' }, 'No agents configured. Run: rex agents create <name>'),
  )

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, `AGENTS  `, React.createElement(Text, { color: 'gray' }, `${agents.length} configured`)),
    React.createElement(Newline),
    ...agents.map(a => {
      const sc = a.status === 'running' ? 'green' : a.status === 'idle' ? 'gray' : 'yellow'
      return React.createElement(Box, { key: a.id, gap: 2, marginBottom: 0 },
        React.createElement(Text, { color: sc }, a.status === 'running' ? '▶' : '◼'),
        React.createElement(Text, { bold: true }, a.name.padEnd(18)),
        React.createElement(Text, { color: 'gray' }, a.model ?? ''),
        a.lastRun ? React.createElement(Text, { color: 'gray', dimColor: true }, `  ${a.lastRun}`) : null,
      )
    })
  )
}

// ── MCP Tab ───────────────────────────────────────────────────────────────────

function McpTab(): React.ReactElement {
  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const out = await runRex(['mcp', 'list', '--json'])
      const data = tryParseJson<{ servers?: McpServer[] }>(out, {})
      setServers(data.servers ?? [])
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return React.createElement(Text, { color: 'gray' }, 'Loading MCP servers...')

  const enabled = servers.filter(s => s.enabled)
  const disabled = servers.filter(s => !s.enabled)

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, 'MCP SERVERS  ',
      React.createElement(Text, { color: 'gray' }, `${enabled.length} active, ${disabled.length} inactive`)
    ),
    React.createElement(Newline),
    servers.length === 0
      ? React.createElement(Text, { color: 'gray' }, 'No MCP servers configured. Run: rex mcp add <name>')
      : React.createElement(Box, { flexDirection: 'column' },
          ...servers.map(s =>
            React.createElement(Box, { key: s.name, gap: 2 },
              React.createElement(Text, { color: s.enabled ? 'green' : 'gray' }, s.enabled ? '●' : '○'),
              React.createElement(Text, { bold: s.enabled }, s.name.padEnd(20)),
              React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'truncate' }, s.command.slice(0, 40)),
            )
          )
        ),
    React.createElement(Newline),
    React.createElement(Text, { color: 'gray', dimColor: true }, 'rex mcp add <name>  rex mcp disable <name>  rex mcp browse')
  )
}

// ── Providers Tab ─────────────────────────────────────────────────────────────

function ProvidersTab(): React.ReactElement {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    try {
      const out = await runRex(['providers', '--json'])
      const data = tryParseJson<{ providers?: ProviderInfo[] }>(out, {})
      setProviders(data.providers ?? [])
    } catch {
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) return React.createElement(Text, { color: 'gray' }, 'Loading providers...')

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' }, 'PROVIDERS  ',
      React.createElement(Text, { color: 'gray' }, `${providers.length} configured`)
    ),
    React.createElement(Newline),
    providers.length === 0
      ? React.createElement(Text, { color: 'gray' }, 'No providers detected. Run: rex providers')
      : React.createElement(Box, { flexDirection: 'column' },
          ...providers.map(p => {
            const sc = p.status === 'ok' ? 'green' : p.status === 'rate_limited' ? 'yellow' : 'gray'
            return React.createElement(Box, { key: p.name, gap: 2 },
              React.createElement(Text, { color: sc }, p.status === 'ok' ? '●' : p.status === 'rate_limited' ? '◐' : '○'),
              React.createElement(Text, { bold: true }, p.name.padEnd(18)),
              React.createElement(Text, { color: 'gray' }, (p.costTier ?? 'unknown').padEnd(10)),
              p.model ? React.createElement(Text, { color: 'gray', dimColor: true }, p.model) : null,
            )
          })
        )
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('health')
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
    if (input === '1') setTab('health')
    if (input === '2') setTab('logs')
    if (input === '3') setTab('fleet')
    if (input === '4') setTab('memory')
    if (input === '5') setTab('agents')
    if (input === '6') setTab('mcp')
    if (input === '7') setTab('providers')
  })

  const tabs: Array<{ key: Tab; label: string; num: string }> = [
    { key: 'health',    label: 'Health',    num: '1' },
    { key: 'logs',      label: 'Logs',      num: '2' },
    { key: 'fleet',     label: 'Fleet',     num: '3' },
    { key: 'memory',    label: 'Memory',    num: '4' },
    { key: 'agents',    label: 'Agents',    num: '5' },
    { key: 'mcp',       label: 'MCP',       num: '6' },
    { key: 'providers', label: 'Providers', num: '7' },
  ]

  const content =
    tab === 'health'    ? React.createElement(HealthTab) :
    tab === 'logs'      ? React.createElement(LogsTab) :
    tab === 'fleet'     ? React.createElement(FleetTab) :
    tab === 'memory'    ? React.createElement(MemoryTab) :
    tab === 'agents'    ? React.createElement(AgentsTab) :
    tab === 'mcp'       ? React.createElement(McpTab) :
                          React.createElement(ProvidersTab)

  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    // Header
    React.createElement(Box, { gap: 2, marginBottom: 1, flexWrap: 'wrap' },
      ...tabs.map(t =>
        React.createElement(Text, {
          key: t.key,
          bold: tab === t.key,
          color: tab === t.key ? 'red' : 'gray',
        }, `[${t.num}]${t.label}`)
      ),
      React.createElement(Text, { color: 'gray', dimColor: true }, '  [Q]quit')
    ),
    // Content
    content
  )
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function launchTui(): Promise<void> {
  try {
    render(React.createElement(App))
  } catch (e: any) {
    log.error(`TUI failed: ${e.message}`)
    console.error(`TUI requires a real terminal (TTY). Error: ${e.message}`)
    process.exit(1)
  }
}
