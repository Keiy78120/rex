/** @module GATEWAY */
import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

interface VoiceSettings {
  optimizeEnabled: boolean
  optimizeModel: string
}

const HOME = homedir()
const RUNTIME_DIR = join(HOME, '.rex-memory', 'runtime')
const RECORDINGS_DIR = join(HOME, '.rex-memory', 'recordings')
const SETTINGS_FILE = join(RUNTIME_DIR, 'voice-settings.json')

function ensureDirs() {
  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true })
}

function readSettings(): VoiceSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Partial<VoiceSettings>
      return {
        optimizeEnabled: parsed.optimizeEnabled === true,
        optimizeModel: typeof parsed.optimizeModel === 'string' && parsed.optimizeModel.trim().length > 0
          ? parsed.optimizeModel
          : process.env.REX_OPTIMIZE_MODEL || 'qwen3.5:4b',
      }
    }
  } catch {
    // noop
  }
  return {
    optimizeEnabled: false,
    optimizeModel: process.env.REX_OPTIMIZE_MODEL || 'qwen3.5:4b',
  }
}

function writeSettings(settings: VoiceSettings) {
  ensureDirs()
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

function whisperExists(): boolean {
  const check = spawnSync('whisper-cli', ['--help'], { stdio: 'ignore' })
  return check.status === 0
}

function defaultWhisperModelPath(): string {
  const envPath = process.env.REX_WHISPER_MODEL
  if (envPath) return envPath

  const candidates = [
    join(HOME, '.rex-memory', 'models', 'ggml-base.en.bin'),
    join(HOME, '.rex-memory', 'models', 'ggml-small.en.bin'),
    join(HOME, '.rex-memory', 'models', 'ggml-tiny.en.bin'),
    join(HOME, '.whisper', 'models', 'ggml-base.en.bin'),
    join(HOME, '.whisper', 'models', 'ggml-small.en.bin'),
    join(HOME, '.whisper', 'models', 'ggml-tiny.en.bin'),
  ]

  const found = candidates.find((c) => existsSync(c))
  return found || candidates[0]
}

function latestRecording(): string | null {
  if (!existsSync(RECORDINGS_DIR)) return null

  const files = readdirSync(RECORDINGS_DIR)
    .filter((f) => f.endsWith('.wav'))
    .map((f) => join(RECORDINGS_DIR, f))

  if (files.length === 0) return null

  files.sort((a, b) => {
    try {
      return statSync(b).mtimeMs - statSync(a).mtimeMs
    } catch {
      return 0
    }
  })

  return files[0] || null
}

function parseWhisperOutput(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const cleaned: string[] = []

  for (const line of lines) {
    if (line.startsWith('whisper_') || line.startsWith('main:') || line.startsWith('system_info:')) {
      continue
    }

    const ts = line.match(/^\[[0-9:.\-\s>]+\]\s*(.*)$/)
    if (ts) {
      if (ts[1] && ts[1].trim().length > 0) cleaned.push(ts[1].trim())
      continue
    }

    cleaned.push(line)
  }

  const text = cleaned.join(' ').replace(/\s+/g, ' ').trim()
  return text
}

async function optimizePrompt(text: string, model: string): Promise<string> {
  const ollama = process.env.OLLAMA_URL || 'http://localhost:11434'
  const prompt = `You are a transcription optimizer for coding assistants. Rewrite the transcript into a clean, structured prompt with technical terms corrected and no filler. Return only optimized text.\n\nTranscript:\n${text}`

  const res = await fetch(`${ollama}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      prompt,
    }),
  })

  if (!res.ok) {
    throw new Error(`LLM optimize failed (${res.status})`)
  }

  const data = await res.json() as { response?: string }
  const out = (data.response || '').trim()
  if (!out) throw new Error('LLM optimize returned empty output')
  return out
}

async function transcribe(args: string[]) {
  const jsonMode = args.includes('--json')
  const optimizeFlag = args.includes('--optimize')

  const fileArg = args.find((a) => a.endsWith('.wav')) || null
  const source = fileArg || latestRecording()
  if (!source) {
    const msg = 'No recording found. Provide a WAV path or start audio logger first.'
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2))
      return
    }
    console.error(msg)
    process.exit(1)
  }

  if (!whisperExists()) {
    const msg = 'whisper-cli not found. Install whisper.cpp CLI and ensure whisper-cli is in PATH.'
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2))
      return
    }
    console.error(msg)
    process.exit(1)
  }

  const modelPath = defaultWhisperModelPath()
  if (!existsSync(modelPath)) {
    const msg = `Whisper model not found: ${modelPath}. Set REX_WHISPER_MODEL or place ggml model in ~/.rex-memory/models.`
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: msg }, null, 2))
      return
    }
    console.error(msg)
    process.exit(1)
  }

  const run = spawnSync('whisper-cli', ['-m', modelPath, '-f', source, '-nt'], {
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 10,
  })

  if (run.status !== 0) {
    const err = (run.stderr || run.stdout || '').trim() || 'whisper-cli failed'
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: err }, null, 2))
      return
    }
    console.error(err)
    process.exit(1)
  }

  const transcript = parseWhisperOutput((run.stdout || '').toString())
  const settings = readSettings()

  const optimize = optimizeFlag || settings.optimizeEnabled
  let optimized: string | null = null
  let optimizeError: string | null = null

  if (optimize && transcript.length > 0) {
    try {
      optimized = await optimizePrompt(transcript, settings.optimizeModel)
    } catch (e) {
      optimizeError = e instanceof Error ? e.message : String(e)
    }
  }

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          source,
          modelPath,
          transcript,
          optimizeEnabled: optimize,
          optimizeModel: settings.optimizeModel,
          optimized,
          optimizeError,
          output: optimized || transcript,
        },
        null,
        2,
      ),
    )
    return
  }

  if (optimized) {
    console.log(optimized)
  } else {
    console.log(transcript)
    if (optimizeError) {
      console.error(`Optimize skipped: ${optimizeError}`)
    }
  }
}

function showStatus(jsonMode: boolean) {
  const settings = readSettings()
  const payload = {
    optimizeEnabled: settings.optimizeEnabled,
    optimizeModel: settings.optimizeModel,
    whisperCliAvailable: whisperExists(),
    whisperModelPath: defaultWhisperModelPath(),
    whisperModelExists: existsSync(defaultWhisperModelPath()),
    recordingsDir: RECORDINGS_DIR,
  }

  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(`Optimize: ${payload.optimizeEnabled ? 'on' : 'off'} (${payload.optimizeModel})`)
  console.log(`whisper-cli: ${payload.whisperCliAvailable ? 'available' : 'missing'}`)
  console.log(`Model: ${payload.whisperModelPath}`)
  console.log(`Recordings: ${payload.recordingsDir}`)
}

function setOptimize(args: string[]) {
  const value = (args[0] || '').toLowerCase()
  const model = args[1]

  if (!['on', 'off'].includes(value)) {
    console.log('Usage: rex voice set-optimize <on|off> [model]')
    process.exit(1)
  }

  const current = readSettings()
  const next: VoiceSettings = {
    optimizeEnabled: value === 'on',
    optimizeModel: model || current.optimizeModel,
  }
  writeSettings(next)
  console.log(JSON.stringify({ ok: true, ...next }, null, 2))
}

export async function voice(args: string[]) {
  const sub = args[0] || 'status'
  const rest = args.slice(1)

  switch (sub) {
    case 'status':
    case 'settings':
      showStatus(args.includes('--json'))
      return
    case 'set-optimize':
      setOptimize(rest)
      return
    case 'transcribe':
      await transcribe(rest)
      return
    default:
      console.log('Usage: rex voice <status|settings|set-optimize|transcribe>')
  }
}
