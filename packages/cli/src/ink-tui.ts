/**
 * REX Ink TUI — terminal dashboard for VPS / headless environments
 *
 * Displays real-time health, logs, fleet status without the Flutter app.
 * Designed for SSH sessions on VPS nodes or when macOS app is unavailable.
 *
 * Usage: rex tui
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

type Tab = 'health' | 'logs' | 'fleet'

// ── Helper to run rex CLI ─────────────────────────────────────────────────────

async function runRex(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('rex', args, { timeout: 10_000 })
    return stdout.trim()
  } catch (e: any) {
    return e.stdout?.trim() || e.message?.slice(0, 200) || 'error'
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

    let doctor: Record<string, unknown> = {}
    let mem: Record<string, unknown> = {}
    try { doctor = JSON.parse(doctorOut) } catch {}
    try { mem = JSON.parse(memOut) } catch {}

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
      setLines(all.slice(-20))  // last 20 lines
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
    React.createElement(Text, { bold: true, color: 'red', dimColor: false }, 'DAEMON LOGS', React.createElement(Text, { color: 'gray' }, ' (last 20 lines, 5s refresh)')),
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
      const data = JSON.parse(out) as { nodes?: FleetNode[] }
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
      const statusColor = n.status === 'healthy' ? 'green' : n.status === 'stale' ? 'yellow' : 'red'
      return React.createElement(Box, { key: n.id, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Box, { gap: 2 },
          React.createElement(Text, { color: statusColor, bold: true }, '● '),
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

// ── Main App ──────────────────────────────────────────────────────────────────

function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('health')
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
    if (input === '1') setTab('health')
    if (input === '2') setTab('logs')
    if (input === '3') setTab('fleet')
  })

  const tabs: Array<{ key: Tab; label: string; num: string }> = [
    { key: 'health', label: 'Health', num: '1' },
    { key: 'logs', label: 'Logs', num: '2' },
    { key: 'fleet', label: 'Fleet', num: '3' },
  ]

  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    // Header
    React.createElement(Box, { gap: 3, marginBottom: 1 },
      ...tabs.map(t =>
        React.createElement(Text, {
          key: t.key,
          bold: tab === t.key,
          color: tab === t.key ? 'red' : 'gray',
        }, `[${t.num}] ${t.label}`)
      ),
      React.createElement(Text, { color: 'gray', dimColor: true }, '  [Q] quit')
    ),
    // Content
    tab === 'health' ? React.createElement(HealthTab) :
    tab === 'logs'   ? React.createElement(LogsTab) :
                       React.createElement(FleetTab)
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
