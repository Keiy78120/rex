/** @module WATCHDOG */
import { execSync, execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { REX_DIR } from '../paths.js'
import { createLogger } from '../logger.js'

const log = createLogger('watchdog')

// ─── Types ────────────────────────────────────────────────────

export interface WatchdogConfig {
  checkIntervalMs: number       // default: 60_000
  maxIdleIterations: number     // default: 10 (iterations without any output)
  dailyBudgetEur: number        // default: 2.0
  notifyTelegram: boolean       // default: true if creds available
}

export interface WatchdogReport {
  timestamp: string
  checks: {
    daemon: 'running' | 'down' | 'restarted'
    budget: 'ok' | 'warn' | 'exceeded'
    idleIterations: number
    loopDetected: boolean
    memoryHealth: 'ok' | 'warn' | 'critical'
  }
  actions: string[]
}

interface BudgetCheckResult {
  status: 'ok' | 'warn' | 'exceeded'
  spentToday: number
  limit: number
}

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULTS: WatchdogConfig = {
  checkIntervalMs: 60_000,
  maxIdleIterations: 10,
  dailyBudgetEur: 2.0,
  notifyTelegram: true,
}

// ─── Rex binary resolution ────────────────────────────────────

function findRexBin(): string {
  const candidates = [
    join(homedir(), '.nvm', 'versions', 'node', 'v22.20.0', 'bin', 'rex'),
    join(homedir(), '.local', 'bin', 'rex'),
    '/usr/local/bin/rex',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  try {
    return execFileSync('/usr/bin/which', ['rex'], { encoding: 'utf-8', timeout: 3000 }).trim() || 'rex'
  } catch {
    return 'rex'
  }
}

const REX_BIN = findRexBin()

// ─── Daemon check ─────────────────────────────────────────────

function isDaemonRunning(): boolean {
  try {
    const out = execSync('pgrep -f "rex daemon"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    return out.length > 0
  } catch {
    return false
  }
}

function restartDaemon(rexBin: string): void {
  const child = spawn(rexBin, ['daemon'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export async function checkDaemon(): Promise<'running' | 'down' | 'restarted'> {
  try {
    if (isDaemonRunning()) {
      log.debug('Daemon is running')
      return 'running'
    }
    log.warn('Daemon not running — restarting')
    restartDaemon(REX_BIN)
    return 'restarted'
  } catch (e: any) {
    log.error(`checkDaemon error: ${e.message?.slice(0, 80)}`)
    return 'down'
  }
}

// ─── Budget check ─────────────────────────────────────────────

interface BudgetJson {
  daily_limit_eur?: number
  spent_today?: number
  spent_month?: number
}

function readBudgetJson(): BudgetJson {
  const budgetPath = join(REX_DIR, 'budget.json')
  if (!existsSync(budgetPath)) return {}
  try {
    return JSON.parse(readFileSync(budgetPath, 'utf-8')) as BudgetJson
  } catch {
    return {}
  }
}

export async function checkBudget(dailyLimitEur?: number): Promise<BudgetCheckResult> {
  try {
    // Try rex budget --json first
    let spentToday = 0
    let limit = dailyLimitEur ?? 2.0

    try {
      const raw = execFileSync(REX_BIN, ['budget', '--json'], {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      // Extract JSON defensively (CLI output may include log lines)
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>
        // Fields: totals.today (USD) or spent_today (EUR)
        const totals = parsed.totals as Record<string, number> | undefined
        if (typeof totals?.today === 'number') spentToday = totals.today
        if (typeof parsed.daily_limit_eur === 'number') limit = parsed.daily_limit_eur
      }
    } catch {
      // Fallback: read budget.json directly
      const bj = readBudgetJson()
      spentToday = bj.spent_today ?? 0
      if (dailyLimitEur !== undefined) {
        limit = dailyLimitEur
      } else {
        limit = bj.daily_limit_eur ?? 2.0
      }
    }

    if (spentToday > limit) {
      log.warn(`Budget exceeded: ${spentToday.toFixed(2)} / ${limit.toFixed(2)}`)
      return { status: 'exceeded', spentToday, limit }
    }
    if (limit > 0 && spentToday / limit > 0.8) {
      log.warn(`Budget warning: ${spentToday.toFixed(2)} / ${limit.toFixed(2)} (${Math.round((spentToday / limit) * 100)}%)`)
      return { status: 'warn', spentToday, limit }
    }
    return { status: 'ok', spentToday, limit }
  } catch (e: any) {
    log.error(`checkBudget error: ${e.message?.slice(0, 80)}`)
    return { status: 'ok', spentToday: 0, limit: dailyLimitEur ?? 2.0 }
  }
}

// ─── Memory health check ──────────────────────────────────────

export async function checkMemoryHealth(): Promise<'ok' | 'warn' | 'critical'> {
  try {
    const raw = execFileSync(REX_BIN, ['memory-check', '--json'], {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    // Extract JSON defensively
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return 'ok'
    const parsed = JSON.parse(match[0]) as Record<string, unknown>

    // pending.count from MemoryHealthResult structure
    const pending = parsed.pending as Record<string, number> | undefined
    const pendingChunks = pending?.count ?? (typeof parsed.pendingChunks === 'number' ? parsed.pendingChunks : 0)

    if (pendingChunks > 2000) {
      log.warn(`Memory critical: ${pendingChunks} pending chunks`)
      return 'critical'
    }
    if (pendingChunks > 500) {
      log.warn(`Memory warn: ${pendingChunks} pending chunks`)
      return 'warn'
    }
    return 'ok'
  } catch {
    return 'ok'
  }
}

// ─── Loop detection ───────────────────────────────────────────

export function detectLoop(iterationsSinceLastOutput: number, max: number): boolean {
  return iterationsSinceLastOutput >= max
}

// ─── Telegram notification ────────────────────────────────────

interface ClaudeSettings {
  env?: Record<string, string>
}

function readTelegramCreds(): { token: string; chatId: string } | null {
  // Prefer process.env
  const envToken = process.env.REX_TELEGRAM_BOT_TOKEN
  const envChat = process.env.REX_TELEGRAM_CHAT_ID
  if (envToken && envChat) return { token: envToken, chatId: envChat }

  // Fallback: ~/.claude/settings.json
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return null
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as ClaudeSettings
    const token = settings.env?.REX_TELEGRAM_BOT_TOKEN
    const chatId = settings.env?.REX_TELEGRAM_CHAT_ID
    if (token && chatId) return { token, chatId }
  } catch {}
  return null
}

export async function notifyIfNeeded(message: string): Promise<void> {
  try {
    const creds = readTelegramCreds()
    if (!creds) return
    await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: creds.chatId, text: message, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {}
}

// ─── Daemon down > 5 min persistent alert ─────────────────────

const DOWN_STATE_PATH = join(REX_DIR, 'watchdog-down-state.json')
const DOWN_ALERT_THRESHOLD_MS = 5 * 60_000  // 5 minutes

interface DownState {
  firstDownAt: string | null  // ISO timestamp of first consecutive failure
  alerted: boolean            // true once the >5min alert was sent
}

function readDownState(): DownState {
  try {
    if (!existsSync(DOWN_STATE_PATH)) return { firstDownAt: null, alerted: false }
    return JSON.parse(readFileSync(DOWN_STATE_PATH, 'utf-8')) as DownState
  } catch { return { firstDownAt: null, alerted: false } }
}

function writeDownState(state: DownState): void {
  try { writeFileSync(DOWN_STATE_PATH, JSON.stringify(state, null, 2)) } catch {}
}

async function trackDaemonDown(
  daemonStatus: 'running' | 'down' | 'restarted',
  notifyTelegram: boolean,
): Promise<void> {
  const state = readDownState()

  if (daemonStatus === 'running') {
    // Reset on healthy state
    if (state.firstDownAt) writeDownState({ firstDownAt: null, alerted: false })
    return
  }

  // Daemon not running (down or restarted but still unhealthy)
  const now = Date.now()
  if (!state.firstDownAt) {
    writeDownState({ firstDownAt: new Date().toISOString(), alerted: false })
    return
  }

  const downMs = now - new Date(state.firstDownAt).getTime()
  if (downMs >= DOWN_ALERT_THRESHOLD_MS && !state.alerted) {
    const msg = `🚨 REX daemon DOWN for > ${Math.round(downMs / 60_000)} minutes — manual intervention may be needed`
    log.warn(msg)
    if (notifyTelegram) await notifyIfNeeded(msg)
    writeDownState({ ...state, alerted: true })
  }
}

// ─── Watchdog cycle ───────────────────────────────────────────

export async function runWatchdogCycle(
  config: WatchdogConfig = DEFAULTS,
  lastOutputAt?: Date,
): Promise<WatchdogReport> {
  const timestamp = new Date().toISOString()
  const actions: string[] = []

  // Run all checks in parallel
  const [daemonStatus, budgetResult, memHealth] = await Promise.all([
    checkDaemon(),
    checkBudget(config.dailyBudgetEur),
    checkMemoryHealth(),
  ])

  // Compute idle iterations
  let idleIterations = 0
  if (lastOutputAt) {
    const elapsedMs = Date.now() - lastOutputAt.getTime()
    idleIterations = Math.floor(elapsedMs / config.checkIntervalMs)
  }

  const loopDetected = detectLoop(idleIterations, config.maxIdleIterations)

  // Handle daemon restart
  if (daemonStatus === 'restarted') {
    const msg = '🔁 REX daemon restarted automatically'
    log.info(msg)
    actions.push('daemon_restarted')
    if (config.notifyTelegram) await notifyIfNeeded(msg)
  }

  // Handle loop detection
  if (loopDetected) {
    const msg = `⚠️ Watchdog: loop detected (${idleIterations} idle iterations) — pausing background tasks`
    log.warn(msg)
    actions.push('loop_detected_pause')
    if (config.notifyTelegram) await notifyIfNeeded(msg)
  }

  // Handle budget exceeded
  if (budgetResult.status === 'exceeded') {
    const msg = `💸 Budget limit reached (${budgetResult.spentToday.toFixed(2)} / ${budgetResult.limit.toFixed(2)}) — switching to free tiers only`
    log.warn(msg)
    actions.push('budget_exceeded_fallback')
    if (config.notifyTelegram) await notifyIfNeeded(msg)
  }

  // Handle critical memory
  if (memHealth === 'critical') {
    const msg = '⚠️ REX memory queue critical (>2000 pending chunks)'
    log.warn(msg)
    actions.push('memory_critical')
    if (config.notifyTelegram) await notifyIfNeeded(msg)
  }

  const report: WatchdogReport = {
    timestamp,
    checks: {
      daemon: daemonStatus,
      budget: budgetResult.status,
      idleIterations,
      loopDetected,
      memoryHealth: memHealth,
    },
    actions,
  }

  // Track persistent daemon down (alert if > 5min)
  await trackDaemonDown(daemonStatus, config.notifyTelegram)

  log.debug(`cycle complete: daemon=${daemonStatus} budget=${budgetResult.status} mem=${memHealth} idle=${idleIterations}`)
  return report
}

// ─── Watchdog loop ────────────────────────────────────────────

export function startWatchdog(config?: Partial<WatchdogConfig>): { stop: () => void } {
  const merged: WatchdogConfig = { ...DEFAULTS, ...config }
  log.info(`Starting watchdog (interval=${merged.checkIntervalMs}ms, maxIdle=${merged.maxIdleIterations}, budget=${merged.dailyBudgetEur}€)`)

  let lastOutputAt: Date | undefined = new Date()

  const handle = setInterval(async () => {
    try {
      const report = await runWatchdogCycle(merged, lastOutputAt)
      // Update lastOutputAt whenever checks produce meaningful output (no loop)
      if (!report.checks.loopDetected) {
        lastOutputAt = new Date()
      }
    } catch (e: any) {
      log.error(`Watchdog cycle failed: ${e.message?.slice(0, 80)}`)
    }
  }, merged.checkIntervalMs)

  // Unref so the interval doesn't keep the process alive if nothing else is running
  if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
    (handle as NodeJS.Timeout).unref()
  }

  return {
    stop: () => {
      clearInterval(handle)
      log.info('Watchdog stopped')
    },
  }
}
