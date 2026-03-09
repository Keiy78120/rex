/** @module REX-MONITOR */

import { createLogger } from './logger.js'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const log = createLogger('audio-logger')
const execFileAsync = promisify(execFile)

const AUDIO_DIR = join(homedir(), '.claude', 'rex', 'audio')

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AudioSession {
  id: string
  startedAt: string
  endedAt?: string
  duration?: number // seconds
  file: string
  transcript?: string
  summary?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ensureAudioDir(): void {
  mkdirSync(AUDIO_DIR, { recursive: true })
}

export function getAudioDir(): string {
  return AUDIO_DIR
}

// ─── Transcription ─────────────────────────────────────────────────────────────

/**
 * Transcribe an audio file via Whisper.
 * Tries whisper-cli (whisper.cpp) first, then openai-whisper Python package.
 */
export async function transcribeFile(audioFile: string): Promise<string | null> {
  if (!existsSync(audioFile)) {
    log.warn(`Audio file not found: ${audioFile}`)
    return null
  }

  // Try whisper-cli (whisper.cpp)
  try {
    const { stdout } = await execFileAsync('whisper-cli', [
      '--model', 'base',
      '--output-txt',
      '--no-prints',
      audioFile,
    ], { timeout: 120_000 })
    if (stdout.trim()) return stdout.trim()
  } catch { /* not installed */ }

  // Try openai-whisper Python package
  try {
    const { stdout } = await execFileAsync('whisper', [
      audioFile,
      '--model', 'base',
      '--output_format', 'txt',
      '--output_dir', AUDIO_DIR,
    ], { timeout: 180_000 })
    if (stdout.trim()) return stdout.trim()
  } catch { /* not installed */ }

  log.warn('No Whisper binary found — install whisper.cpp or: pip install openai-whisper')
  return null
}

// ─── Recording ─────────────────────────────────────────────────────────────────

/**
 * Start recording audio using macOS afrecord (built-in).
 * Returns a stop function that finalizes recording and triggers transcription.
 */
export async function startRecording(label = 'session'): Promise<{
  id: string
  file: string
  stop: () => Promise<AudioSession>
}> {
  ensureAudioDir()
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`
  const m4aFile = join(AUDIO_DIR, `${id}.m4a`)
  const startedAt = new Date().toISOString()

  // afrecord is macOS built-in — requires Microphone permission
  const child = spawn('afrecord', ['-f', 'aac', '-q', '7', m4aFile], {
    detached: false,
    stdio: 'ignore',
  })

  log.info(`Recording started → ${m4aFile}`)

  return {
    id,
    file: m4aFile,
    stop: async (): Promise<AudioSession> => {
      const endedAt = new Date().toISOString()
      child.kill('SIGINT')
      await new Promise(r => setTimeout(r, 800)) // let afrecord finalize

      const duration = Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
      )
      log.info(`Recording stopped (${duration}s)`)

      const session: AudioSession = { id, startedAt, endedAt, duration, file: m4aFile }

      // Transcribe asynchronously
      try {
        const transcript = await transcribeFile(m4aFile)
        if (transcript) {
          session.transcript = transcript
          const metaFile = join(AUDIO_DIR, `${id}.json`)
          writeFileSync(metaFile, JSON.stringify(session, null, 2))
          log.info(`Transcript saved → ${metaFile}`)
        }
      } catch (err) {
        log.warn(`Transcription failed: ${(err as Error).message}`)
      }

      return session
    },
  }
}

// ─── Session listing ────────────────────────────────────────────────────────────

export function listSessions(): AudioSession[] {
  ensureAudioDir()
  const files = readdirSync(AUDIO_DIR).filter(f => f.endsWith('.json'))
  const sessions: AudioSession[] = []
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(AUDIO_DIR, f), 'utf-8')) as AudioSession
      sessions.push(data)
    } catch { /* skip malformed */ }
  }
  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
