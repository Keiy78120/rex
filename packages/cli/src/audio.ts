import { homedir } from 'node:os'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

interface AudioState {
  pid: number | null
  startedAt: string | null
  currentFile: string | null
}

interface AudioStatus {
  capturing: boolean
  pid: number | null
  recordingsDir: string
  recordingsCount: number
  currentFile: string | null
  startedAt: string | null
}

const HOME = homedir()
const RUNTIME_DIR = join(HOME, '.rex-memory', 'runtime')
const RECORDINGS_DIR = join(HOME, '.rex-memory', 'recordings')
const STATE_FILE = join(RUNTIME_DIR, 'audio-logger.json')

function ensureDirs() {
  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true })
  if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true })
}

function ffmpegExists(): boolean {
  const check = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  return check.status === 0
}

function readState(): AudioState {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as AudioState
      return {
        pid: typeof parsed.pid === 'number' ? parsed.pid : null,
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
        currentFile: typeof parsed.currentFile === 'string' ? parsed.currentFile : null,
      }
    }
  } catch {
    // noop
  }
  return { pid: null, startedAt: null, currentFile: null }
}

function writeState(state: AudioState) {
  ensureDirs()
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function isPidRunning(pid: number | null): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function listRecordings(): string[] {
  ensureDirs()
  return readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith('.wav'))
    .sort()
    .reverse()
}

function currentStatus(): AudioStatus {
  const state = readState()
  const capturing = isPidRunning(state.pid)
  const recordings = listRecordings()

  return {
    capturing,
    pid: capturing ? state.pid : null,
    recordingsDir: RECORDINGS_DIR,
    recordingsCount: recordings.length,
    currentFile: capturing ? state.currentFile : null,
    startedAt: capturing ? state.startedAt : null,
  }
}

function printStatus(status: AudioStatus, jsonMode: boolean) {
  if (jsonMode) {
    console.log(JSON.stringify(status, null, 2))
    return
  }

  console.log(`Audio logger: ${status.capturing ? 'recording' : 'idle'}`)
  console.log(`Recordings: ${status.recordingsCount}`)
  console.log(`Directory: ${status.recordingsDir}`)
  if (status.currentFile) console.log(`Current: ${status.currentFile}`)
}

function startCapture(jsonMode: boolean) {
  ensureDirs()

  if (!ffmpegExists()) {
    const msg = 'ffmpeg not found. Install ffmpeg to use audio logger (brew install ffmpeg).'
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: msg }))
      return
    }
    console.error(msg)
    process.exit(1)
  }

  const state = readState()
  if (isPidRunning(state.pid)) {
    const status = currentStatus()
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, alreadyRunning: true, ...status }, null, 2))
      return
    }
    console.log('Audio logger already running.')
    return
  }

  const ts = new Date().toISOString().replace(/[.:]/g, '-').replace('T', '_').slice(0, 19)
  const output = join(RECORDINGS_DIR, `call-${ts}.wav`)

  // macOS avfoundation format: "<videoIndex>:<audioIndex>". Empty video means ":<audioIndex>".
  const input = process.env.REX_AUDIO_INPUT || ':0'
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'avfoundation',
    '-i',
    input,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-y',
    output,
  ]

  const child = spawn('ffmpeg', args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const nextState: AudioState = {
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    currentFile: output,
  }
  writeState(nextState)

  const status = currentStatus()
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, ...status }, null, 2))
  } else {
    console.log('Audio logger started.')
    console.log(`Input: ${input}`)
    console.log(`Output: ${output}`)
  }
}

function stopCapture(jsonMode: boolean) {
  const state = readState()
  const wasRunning = isPidRunning(state.pid)

  if (!state.pid || !wasRunning) {
    writeState({ pid: null, startedAt: null, currentFile: null })
    if (jsonMode) {
      console.log(JSON.stringify({ ok: true, stopped: false, message: 'Audio logger already stopped' }, null, 2))
      return
    }
    console.log('Audio logger already stopped.')
    return
  }

  try {
    process.kill(state.pid, 'SIGINT')
  } catch {
    try {
      process.kill(state.pid, 'SIGTERM')
    } catch {
      // noop
    }
  }

  writeState({ pid: null, startedAt: null, currentFile: null })

  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, stopped: true, file: state.currentFile }, null, 2))
  } else {
    console.log('Audio logger stopped.')
    if (state.currentFile) console.log(`Saved: ${state.currentFile}`)
  }
}

function printRecordings(jsonMode: boolean) {
  const recordings = listRecordings().map((f) => join(RECORDINGS_DIR, f))
  if (jsonMode) {
    console.log(JSON.stringify({ count: recordings.length, recordings }, null, 2))
    return
  }
  if (recordings.length === 0) {
    console.log('No recordings yet.')
    return
  }
  for (const file of recordings) console.log(file)
}

export async function audio(args: string[]) {
  const sub = args[0] || 'status'
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'start':
      startCapture(jsonMode)
      return
    case 'stop':
      stopCapture(jsonMode)
      return
    case 'status':
      printStatus(currentStatus(), jsonMode)
      return
    case 'list':
      printRecordings(jsonMode)
      return
    default:
      console.log('Usage: rex audio <start|stop|status|list> [--json]')
  }
}
