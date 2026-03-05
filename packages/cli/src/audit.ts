import { spawnSync } from 'node:child_process'

type CheckStatus = 'pass' | 'warn' | 'fail'

interface Check {
  name: string
  status: CheckStatus
  message: string
}

interface AuditOptions {
  json?: boolean
  strict?: boolean
}

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

function runSelf(args: string[], timeout = 30000) {
  const script = process.argv[1]
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf-8',
    timeout,
  })
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function add(checks: Check[], name: string, status: CheckStatus, message: string) {
  checks.push({ name, status, message })
}

function printChecks(checks: Check[]) {
  console.log(`\n${COLORS.bold}REX AUDIT${COLORS.reset}`)
  for (const c of checks) {
    const icon = c.status === 'pass' ? `${COLORS.green}✓${COLORS.reset}`
      : c.status === 'warn' ? `${COLORS.yellow}!${COLORS.reset}`
      : `${COLORS.red}✗${COLORS.reset}`
    console.log(`  ${icon} ${c.name} ${COLORS.dim}— ${c.message}${COLORS.reset}`)
  }

  const pass = checks.filter(c => c.status === 'pass').length
  const warn = checks.filter(c => c.status === 'warn').length
  const fail = checks.filter(c => c.status === 'fail').length

  console.log(`\n  Summary: ${pass} pass, ${warn} warn, ${fail} fail`)
}

export async function audit(options: AuditOptions = {}) {
  const checks: Check[] = []

  {
    const res = runSelf(['--version'])
    if (res.status === 0 && (res.stdout || '').includes('rex-claude')) {
      add(checks, 'CLI version', 'pass', (res.stdout || '').trim())
    } else {
      add(checks, 'CLI version', 'fail', (res.stderr || res.stdout || 'version command failed').trim())
    }
  }

  {
    const res = runSelf(['doctor'], 60000)
    const out = `${res.stdout || ''}${res.stderr || ''}`
    if ((res.status === 0 || res.status === 1) && out.includes('REX DOCTOR')) {
      add(checks, 'Doctor command', 'pass', 'doctor output rendered')
    } else {
      add(checks, 'Doctor command', 'fail', (out || 'doctor command failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['status'])
    const out = (res.stdout || '').trim()
    if (res.status === 0 && out.startsWith('REX')) {
      add(checks, 'Status command', 'pass', out)
    } else {
      add(checks, 'Status command', 'fail', ((res.stderr || out) || 'status command failed').slice(0, 200))
    }
  }

  {
    const res = runSelf(['call', 'status', '--json'])
    const parsed = parseJson<{ active?: boolean }>((res.stdout || '').trim())
    if (res.status === 0 && parsed && typeof parsed.active === 'boolean') {
      add(checks, 'Call watcher status', 'pass', `active=${String(parsed.active)}`)
    } else {
      add(checks, 'Call watcher status', 'warn', 'call state file not ready or watcher not running yet')
    }
  }

  {
    const res = runSelf(['audio', 'status', '--json'])
    const parsed = parseJson<{ capturing?: boolean; recordingsCount?: number }>((res.stdout || '').trim())
    if (res.status === 0 && parsed && typeof parsed.capturing === 'boolean') {
      add(checks, 'Audio logger status', 'pass', `capturing=${String(parsed.capturing)}, recordings=${String(parsed.recordingsCount ?? 0)}`)
    } else {
      add(checks, 'Audio logger status', 'fail', ((res.stderr || res.stdout) || 'audio status failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['voice', 'status', '--json'])
    const parsed = parseJson<{ whisperCliAvailable?: boolean; optimizeEnabled?: boolean }>((res.stdout || '').trim())
    if (res.status === 0 && parsed && typeof parsed.optimizeEnabled === 'boolean') {
      const whisper = parsed.whisperCliAvailable === true ? 'ready' : 'missing'
      add(checks, 'Voice pipeline status', parsed.whisperCliAvailable ? 'pass' : 'warn', `whisper=${whisper}, optimize=${String(parsed.optimizeEnabled)}`)
    } else {
      add(checks, 'Voice pipeline status', 'fail', ((res.stderr || res.stdout) || 'voice status failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['prune', '--stats'])
    if (res.status === 0) {
      add(checks, 'Memory stats', 'pass', 'prune --stats ok')
    } else {
      add(checks, 'Memory stats', 'warn', ((res.stderr || res.stdout) || 'memory stats failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['context'])
    if (res.status === 0) {
      add(checks, 'Context analysis', 'pass', 'context command ok')
    } else {
      add(checks, 'Context analysis', 'warn', ((res.stderr || res.stdout) || 'context command failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['agents', 'profiles', '--json'])
    const parsed = parseJson<{ profiles?: unknown[] }>((res.stdout || '').trim())
    if (res.status === 0 && parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
      add(checks, 'Agents profiles', 'pass', `${parsed.profiles.length} profiles available`)
    } else {
      add(checks, 'Agents profiles', 'fail', ((res.stderr || res.stdout) || 'agents profiles failed').trim().slice(0, 200))
    }
  }

  {
    const res = runSelf(['mcp', 'list', '--json'])
    const parsed = parseJson<{ servers?: unknown[] }>((res.stdout || '').trim())
    if (res.status === 0 && parsed && Array.isArray(parsed.servers)) {
      add(checks, 'MCP registry', 'pass', `servers=${parsed.servers.length}`)
    } else {
      add(checks, 'MCP registry', 'fail', ((res.stderr || res.stdout) || 'mcp list failed').trim().slice(0, 200))
    }
  }

  const failCount = checks.filter(c => c.status === 'fail').length
  const warnCount = checks.filter(c => c.status === 'warn').length

  if (options.json) {
    console.log(JSON.stringify({ checks, failCount, warnCount }, null, 2))
  } else {
    printChecks(checks)
  }

  if (failCount > 0 || (options.strict && warnCount > 0)) {
    process.exitCode = 1
  }
}
