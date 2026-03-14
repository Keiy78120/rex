/** @module CORE */
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { DAEMON_LOG_PATH, ensureRexDirs } from './paths.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const LEVEL_LABEL: Record<LogLevel, string> = { debug: 'DBG', info: 'INF', warn: 'WRN', error: 'ERR' }
const LEVEL_COLOR: Record<LogLevel, string> = { debug: '\x1b[2m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }
const RESET = '\x1b[0m'

let minLevel: LogLevel = 'info'
let logToFile = true
let logToConsole = true

export function configureLogger(opts: { level?: LogLevel; file?: boolean; console?: boolean }): void {
  if (opts.level) minLevel = opts.level
  if (opts.file !== undefined) logToFile = opts.file
  if (opts.console !== undefined) logToConsole = opts.console
}

function write(level: LogLevel, source: string, msg: string): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return

  const ts = new Date().toISOString()
  const label = LEVEL_LABEL[level]
  const fileLine = `[${ts}] [${label}] [${source}] ${msg}`

  if (logToConsole) {
    const color = LEVEL_COLOR[level]
    console.log(`${color}[${label}]${RESET} ${RESET}[${source}] ${msg}`)
  }

  if (logToFile) {
    try {
      ensureRexDirs()
      appendFileSync(DAEMON_LOG_PATH, fileLine + '\n')
    } catch {}
  }
}

export function createLogger(source: string) {
  return {
    debug: (msg: string) => write('debug', source, msg),
    info: (msg: string) => write('info', source, msg),
    warn: (msg: string) => write('warn', source, msg),
    error: (msg: string) => write('error', source, msg),
  }
}

const MAX_LOG_BYTES = 100 * 1024 * 1024  // 100 MB hard cap
const KEEP_LOG_BYTES = 20 * 1024 * 1024   // keep last 20 MB after rotation

/**
 * Rotate log file when it exceeds maxBytes (default 100 MB).
 * Keeps the last keepBytes of content, trimmed to the first full line.
 * Old content is dropped in-place (not archived) to bound disk usage.
 */
export function rotateLog(maxBytes = MAX_LOG_BYTES, keepBytes = KEEP_LOG_BYTES): void {
  if (!existsSync(DAEMON_LOG_PATH)) return
  try {
    const size = statSync(DAEMON_LOG_PATH).size
    if (size <= maxBytes) return
    const content = readFileSync(DAEMON_LOG_PATH)
    const kept = content.slice(content.length - keepBytes)
    const nl = kept.indexOf(10)  // '\n' byte
    writeFileSync(DAEMON_LOG_PATH, nl >= 0 ? kept.slice(nl + 1) : kept)
  } catch {}
}
