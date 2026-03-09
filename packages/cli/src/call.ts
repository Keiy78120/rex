/** @module GATEWAY */
import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface CallState {
  active: boolean
  app: string
  reason: string
  title: string
  startedAt: number
  updatedAt: number
  iso: string
}

const HOME = homedir()
const RUNTIME_DIR = join(HOME, '.rex-memory', 'runtime')
const STATE_FILE = join(RUNTIME_DIR, 'call-state.json')
const EVENTS_FILE = join(RUNTIME_DIR, 'call-events.jsonl')

function ensureRuntime() {
  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true })
}

function emptyState(): CallState {
  return {
    active: false,
    app: '',
    reason: '',
    title: '',
    startedAt: 0,
    updatedAt: 0,
    iso: '',
  }
}

function readState(): CallState {
  try {
    if (!existsSync(STATE_FILE)) return emptyState()
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Partial<CallState>
    return {
      active: parsed.active === true,
      app: typeof parsed.app === 'string' ? parsed.app : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      iso: typeof parsed.iso === 'string' ? parsed.iso : '',
    }
  } catch {
    return emptyState()
  }
}

function printState(jsonMode: boolean) {
  const state = readState()
  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2))
    return
  }

  if (!state.active) {
    console.log('No active call detected.')
    return
  }

  console.log(`Active call: ${state.app || 'unknown app'}`)
  if (state.reason) console.log(`Reason: ${state.reason}`)
  if (state.title) console.log(`Title: ${state.title}`)
  if (state.startedAt > 0) console.log(`Started: ${new Date(state.startedAt * 1000).toISOString()}`)
}

function printEvents(jsonMode: boolean, tail: number) {
  if (!existsSync(EVENTS_FILE)) {
    if (jsonMode) {
      console.log(JSON.stringify({ events: [] }, null, 2))
      return
    }
    console.log('No call events yet.')
    return
  }

  const lines = readFileSync(EVENTS_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)

  const sliced = tail > 0 ? lines.slice(-tail) : lines

  if (jsonMode) {
    const events = sliced.map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>
      } catch {
        return { raw: line }
      }
    })
    console.log(JSON.stringify({ events }, null, 2))
    return
  }

  for (const line of sliced) console.log(line)
}

function selfCommand(args: string[]) {
  const script = process.argv[1]
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf-8' })
}

function runAudioCommand(sub: 'start' | 'stop') {
  selfCommand(['audio', sub])
}

function isAudioCapturing(): boolean {
  const res = selfCommand(['audio', 'status', '--json'])
  if (res.status !== 0) return false
  try {
    const parsed = JSON.parse((res.stdout || '').trim()) as { capturing?: boolean }
    return parsed.capturing === true
  } catch {
    return false
  }
}

async function watchAutoCapture() {
  ensureRuntime()
  console.log('REX call watcher daemon started (auto audio logger).')

  let lastActive: boolean | null = null
  while (true) {
    const state = readState()
    if (lastActive === null || state.active !== lastActive) {
      const capturing = isAudioCapturing()
      if (state.active && !capturing) {
        runAudioCommand('start')
        console.log(`[${new Date().toISOString()}] call_start -> audio start (${state.app || 'unknown'})`)
      }
      if (!state.active && capturing) {
        runAudioCommand('stop')
        console.log(`[${new Date().toISOString()}] call_end -> audio stop`)
      }
      lastActive = state.active
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

export async function call(args: string[]) {
  const sub = args[0] || 'status'
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'status':
      printState(jsonMode)
      return
    case 'events': {
      const tailIndex = args.findIndex((a) => a === '--tail')
      const tail = tailIndex >= 0 ? parseInt(args[tailIndex + 1] || '20', 10) : 20
      printEvents(jsonMode, Number.isFinite(tail) ? tail : 20)
      return
    }
    case 'watch':
      await watchAutoCapture()
      return
    default:
      console.log('Usage: rex call <status|events|watch> [--json] [--tail N]')
  }
}
