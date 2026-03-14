/**
 * REX Session Guard — Proactive context window + rate limit monitor
 *
 * Watches token burn rate and fires alerts before the user hits limits.
 * Runs in daemon (5-min poll), standalone via `rex session-guard`, or as
 * a PostToolUse hook (lightweight, <50ms check from cache).
 *
 * Thresholds:
 *   context 70%  → Telegram warn + write compact-signal
 *   context 85%  → Telegram urgent + auto-ingest (preserve before compact)
 *   context 95%  → Telegram critical + Telegram command hint
 *   daily   80%  → Telegram warn (budget usage)
 *   daily  100%  → Telegram critical (daily limit hit)
 *
 * Signal files (read by preload.ts on next SessionStart):
 *   ~/.claude/rex/compact-signal.json   { reason, contextPercent, ts }
 *   ~/.claude/rex/session-state.json    { intent, cwd, tokens, ts }
 * @module TOOLS
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { REX_DIR } from '../paths.js'
import { createLogger } from '../logger.js'

const execFileAsync = promisify(execFile)
const log = createLogger('TOOLS:session-guard')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GuardState {
  lastContextPercent: number
  lastDailyPercent: number
  alertedContext70: boolean
  alertedContext85: boolean
  alertedContext95: boolean
  alertedDaily80: boolean
  alertedDaily100: boolean
  lastCheckAt: number
  sessionId?: string
}

export interface CompactSignal {
  reason: 'context-70' | 'context-85' | 'context-95'
  contextPercent: number
  dailyPercent: number
  ts: string
  hint: string
}

export interface GuardReport {
  contextPercent: number
  dailyPercent: number
  estimatedMinutesLeft: number | null
  alerted: string[]
  compactNeeded: boolean
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const GUARD_STATE_PATH   = join(REX_DIR, 'session-guard-state.json')
const COMPACT_SIGNAL_PATH = join(REX_DIR, 'compact-signal.json')
const SESSION_STATE_PATH  = join(REX_DIR, 'session-state.json')

// ── State persistence ─────────────────────────────────────────────────────────

function loadState(): GuardState {
  try {
    if (existsSync(GUARD_STATE_PATH)) {
      const s = JSON.parse(readFileSync(GUARD_STATE_PATH, 'utf-8')) as GuardState
      // Reset alert flags if a new session started (>4h since last check)
      const ageMs = Date.now() - (s.lastCheckAt || 0)
      if (ageMs > 4 * 3600_000) {
        return { ...s, alertedContext70: false, alertedContext85: false, alertedContext95: false, lastCheckAt: Date.now() }
      }
      return s
    }
  } catch { /* ignore */ }
  return {
    lastContextPercent: 0,
    lastDailyPercent: 0,
    alertedContext70: false,
    alertedContext85: false,
    alertedContext95: false,
    alertedDaily80: false,
    alertedDaily100: false,
    lastCheckAt: 0,
  }
}

function saveState(state: GuardState): void {
  try {
    writeFileSync(GUARD_STATE_PATH, JSON.stringify(state, null, 2))
  } catch { /* ignore */ }
}

// ── Compact signal ────────────────────────────────────────────────────────────

export function writeCompactSignal(signal: CompactSignal): void {
  try {
    writeFileSync(COMPACT_SIGNAL_PATH, JSON.stringify(signal, null, 2))
    log.info(`Compact signal written: ${signal.reason} at ${signal.contextPercent}%`)
  } catch { /* ignore */ }
}

export function readCompactSignal(): CompactSignal | null {
  try {
    if (existsSync(COMPACT_SIGNAL_PATH)) {
      return JSON.parse(readFileSync(COMPACT_SIGNAL_PATH, 'utf-8')) as CompactSignal
    }
  } catch { /* ignore */ }
  return null
}

export function clearCompactSignal(): void {
  try {
    if (existsSync(COMPACT_SIGNAL_PATH)) unlinkSync(COMPACT_SIGNAL_PATH)
  } catch { /* ignore */ }
}

// ── Session state snapshot ────────────────────────────────────────────────────

function saveSessionState(contextPercent: number, dailyPercent: number): void {
  try {
    const cwd = process.cwd()
    writeFileSync(SESSION_STATE_PATH, JSON.stringify({
      cwd,
      contextPercent,
      dailyPercent,
      ts: new Date().toISOString(),
    }, null, 2))
  } catch { /* ignore */ }
}

// ── Telegram notification ─────────────────────────────────────────────────────

async function sendTelegramAlert(msg: string): Promise<void> {
  const token  = process.env.REX_TELEGRAM_BOT_TOKEN
  const chatId = process.env.REX_TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    // Try loading from settings.json
    try {
      const settingsPath = join(process.env.HOME || '~', '.claude', 'settings.json')
      if (existsSync(settingsPath)) {
        const s = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        const env = s.env as Record<string, string> | undefined
        if (env?.REX_TELEGRAM_BOT_TOKEN && env?.REX_TELEGRAM_CHAT_ID) {
          process.env.REX_TELEGRAM_BOT_TOKEN = env.REX_TELEGRAM_BOT_TOKEN
          process.env.REX_TELEGRAM_CHAT_ID   = env.REX_TELEGRAM_CHAT_ID
          await sendTelegramAlert(msg) // retry with loaded creds
          return
        }
      }
    } catch { /* ignore */ }
    log.warn('No Telegram credentials for session guard alerts')
    return
  }

  try {
    await execFileAsync('curl', [
      '-s', '-X', 'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-d', `chat_id=${chatId}&text=${encodeURIComponent(msg)}&parse_mode=Markdown`,
    ], { timeout: 10_000 })
    log.info(`Telegram alert sent: ${msg.slice(0, 60)}…`)
  } catch (err) {
    log.warn(`Telegram alert failed: ${err}`)
  }
}

// ── Auto-ingest (preserve context before compact) ─────────────────────────────

async function triggerIngest(): Promise<void> {
  try {
    const rexBin = (await execFileAsync('which', ['rex'], { timeout: 3000 })).stdout.trim()
    if (rexBin) {
      execFile(rexBin, ['ingest', '--quiet'], { timeout: 60_000 }, () => {/* fire and forget */})
      log.info('Auto-ingest triggered (context preservation)')
    }
  } catch { /* rex not in PATH */ }
}

// ── Main check ────────────────────────────────────────────────────────────────

export async function checkSessionGuard(opts: { silent?: boolean } = {}): Promise<GuardReport> {
  const state  = loadState()
  const alerted: string[] = []
  let compactNeeded = false

  // Get stats from burn-rate (uses its 30s cache — lightweight)
  let contextPercent = 0
  let dailyPercent   = 0
  let estimatedMinutesLeft: number | null = null

  try {
    const { getBurnRateStats } = await import('../burn-rate.js')
    const stats = getBurnRateStats()
    contextPercent       = stats.contextPercent
    dailyPercent         = stats.dailyPercent
    estimatedMinutesLeft = stats.estimatedMinutesLeft
  } catch {
    log.debug('burn-rate stats unavailable')
    return { contextPercent: 0, dailyPercent: 0, estimatedMinutesLeft: null, alerted: [], compactNeeded: false }
  }

  saveSessionState(contextPercent, dailyPercent)

  // ── Context window thresholds ─────────────────────────────────────────────

  if (contextPercent >= 95 && !state.alertedContext95) {
    const msg = `🚨 *REX Session Guard* — CONTEXT CRITICAL\n\nContext window: *${contextPercent.toFixed(0)}%*\n\n💡 Run \`/compact\` NOW or you'll hit the limit.\nType this in Claude: \`/compact\``
    if (!opts.silent) await sendTelegramAlert(msg)
    writeCompactSignal({
      reason: 'context-95',
      contextPercent,
      dailyPercent,
      ts: new Date().toISOString(),
      hint: 'Run /compact immediately',
    })
    state.alertedContext95 = true
    alerted.push('context-95')
    compactNeeded = true
    log.warn(`Context at ${contextPercent.toFixed(0)}% — CRITICAL, compact signal written`)
  } else if (contextPercent >= 85 && !state.alertedContext85) {
    const minLeft = estimatedMinutesLeft !== null ? ` (~${Math.round(estimatedMinutesLeft)}min left)` : ''
    const msg = `⚠️ *REX Session Guard* — Context high\n\nContext: *${contextPercent.toFixed(0)}%*${minLeft}\n\nREX is auto-ingesting to preserve context.\nConsider running \`/compact\` soon.`
    if (!opts.silent) await sendTelegramAlert(msg)
    writeCompactSignal({
      reason: 'context-85',
      contextPercent,
      dailyPercent,
      ts: new Date().toISOString(),
      hint: 'Auto-ingested. Consider /compact soon',
    })
    state.alertedContext85 = true
    alerted.push('context-85')
    compactNeeded = true
    await triggerIngest()
    log.warn(`Context at ${contextPercent.toFixed(0)}% — auto-ingest triggered`)
  } else if (contextPercent >= 70 && !state.alertedContext70) {
    const minLeft = estimatedMinutesLeft !== null ? ` (~${Math.round(estimatedMinutesLeft)}min left)` : ''
    const msg = `💛 *REX Session Guard* — Context at 70%\n\nContext: *${contextPercent.toFixed(0)}%*${minLeft}\n\nAll good for now. REX will auto-ingest at 85%.`
    if (!opts.silent) await sendTelegramAlert(msg)
    state.alertedContext70 = true
    alerted.push('context-70')
    log.info(`Context at ${contextPercent.toFixed(0)}% — 70% threshold hit, Telegram notified`)
  }

  // ── Daily usage thresholds ────────────────────────────────────────────────

  if (dailyPercent >= 100 && !state.alertedDaily100) {
    const msg = `🔴 *REX Session Guard* — Daily limit hit!\n\nDaily usage: *${dailyPercent.toFixed(0)}%* — plan exhausted.\n\nREX will route to free tiers automatically.`
    if (!opts.silent) await sendTelegramAlert(msg)
    state.alertedDaily100 = true
    alerted.push('daily-100')
    log.warn(`Daily limit at ${dailyPercent.toFixed(0)}% — EXHAUSTED`)
  } else if (dailyPercent >= 80 && !state.alertedDaily80) {
    const msg = `📊 *REX Session Guard* — Daily budget 80%\n\nDaily usage: *${dailyPercent.toFixed(0)}%*\n\nREX will switch to free tiers when limit hits.`
    if (!opts.silent) await sendTelegramAlert(msg)
    state.alertedDaily80 = true
    alerted.push('daily-80')
    log.info(`Daily usage at ${dailyPercent.toFixed(0)}% — 80% threshold`)
  }

  // Reset context alerts when context drops (new session / after compact)
  if (contextPercent < 30 && (state.alertedContext70 || state.alertedContext85 || state.alertedContext95)) {
    state.alertedContext70 = false
    state.alertedContext85 = false
    state.alertedContext95 = false
    clearCompactSignal()
    log.info('Context dropped below 30% — alert flags reset (new session or post-compact)')
  }

  // Reset daily alerts at midnight
  const nowHour = new Date().getHours()
  if (nowHour === 0 && (state.alertedDaily80 || state.alertedDaily100)) {
    state.alertedDaily80  = false
    state.alertedDaily100 = false
    log.info('Daily alert flags reset at midnight')
  }

  state.lastContextPercent = contextPercent
  state.lastDailyPercent   = dailyPercent
  state.lastCheckAt        = Date.now()
  saveState(state)

  return { contextPercent, dailyPercent, estimatedMinutesLeft, alerted, compactNeeded }
}

// ── Standalone print ──────────────────────────────────────────────────────────

export async function printSessionGuardStatus(): Promise<void> {
  const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
  }

  const report = await checkSessionGuard({ silent: true })
  const state  = loadState()
  const signal = readCompactSignal()

  const ctxColor = report.contextPercent >= 95 ? C.red : report.contextPercent >= 70 ? C.yellow : C.green
  const dayColor = report.dailyPercent >= 100 ? C.red : report.dailyPercent >= 80 ? C.yellow : C.green

  console.log()
  console.log(`${C.bold}REX Session Guard${C.reset}`)
  console.log()
  console.log(`  Context window: ${ctxColor}${report.contextPercent.toFixed(1)}%${C.reset}`)
  console.log(`  Daily budget:   ${dayColor}${report.dailyPercent.toFixed(1)}%${C.reset}`)
  if (report.estimatedMinutesLeft !== null) {
    console.log(`  Est. remaining: ${Math.round(report.estimatedMinutesLeft)}min at current burn rate`)
  }

  console.log()
  console.log(`  Thresholds:  context 70% warn | 85% ingest | 95% compact`)
  console.log(`  Alerts sent: context-70=${state.alertedContext70} | context-85=${state.alertedContext85} | context-95=${state.alertedContext95}`)
  console.log(`               daily-80=${state.alertedDaily80} | daily-100=${state.alertedDaily100}`)

  if (signal) {
    console.log()
    console.log(`  ${C.yellow}⚠ Compact signal: ${signal.reason} at ${signal.contextPercent.toFixed(0)}%${C.reset}`)
    console.log(`    Hint: ${signal.hint}`)
  }

  if (report.alerted.length > 0) {
    console.log()
    console.log(`  Alerts fired this check: ${report.alerted.join(', ')}`)
  }

  console.log()
}
