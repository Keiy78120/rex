/** @module HQ */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REX_DIR, DAEMON_LOG_PATH, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'
import { getJournalStats } from './event-journal.js'

const log = createLogger('user-state')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserCycleState = 'AWAKE_ACTIVE' | 'AWAKE_IDLE' | 'SLEEPING' | 'WAKING_UP'

export interface UserStateInfo {
  state: UserCycleState
  sleepScore: number
  lastActivityMs: number
  lastTelegramMs: number
  awIdleMs: number
  canUsePaidApi: boolean
  allowedTiers: ('local' | 'free' | 'subscription' | 'pay-per-use')[]
  reason: string
}

interface StoredState {
  state: UserCycleState
  updatedAt: string
}

interface HistoryEntry {
  hour: number
  state: UserCycleState
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const STATE_PATH   = join(REX_DIR, 'user-state.json')
const HISTORY_PATH = join(REX_DIR, 'user-state-history.json')

const DEFAULT_TELEGRAM_IDLE_MS = 2 * 60 * 60 * 1000 // 2h

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readStoredState(): StoredState | null {
  try {
    if (!existsSync(STATE_PATH)) return null
    const raw = readFileSync(STATE_PATH, 'utf-8')
    return JSON.parse(raw) as StoredState
  } catch (err) {
    log.warn(`Could not read user-state.json: ${err}`)
    return null
  }
}

function writeStoredState(state: UserCycleState): void {
  try {
    ensureRexDirs()
    const payload: StoredState = { state, updatedAt: new Date().toISOString() }
    writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2))
  } catch (err) {
    log.warn(`Could not write user-state.json: ${err}`)
  }
}

function readHistory(): HistoryEntry[] {
  try {
    if (!existsSync(HISTORY_PATH)) return []
    const raw = readFileSync(HISTORY_PATH, 'utf-8')
    return JSON.parse(raw) as HistoryEntry[]
  } catch (err) {
    log.warn(`Could not read user-state-history.json: ${err}`)
    return []
  }
}

function writeHistory(history: HistoryEntry[]): void {
  try {
    ensureRexDirs()
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2))
  } catch (err) {
    log.warn(`Could not write user-state-history.json: ${err}`)
  }
}

// ---------------------------------------------------------------------------
// ActivityWatch
// ---------------------------------------------------------------------------

interface AwBucket {
  id: string
  type: string
}

interface AwEvent {
  timestamp: string
  duration: number // seconds
  data: Record<string, unknown>
}

async function getActivityWatchIdleMs(): Promise<number> {
  try {
    const bucketsRes = await fetch('http://localhost:5600/api/0/buckets', {
      signal: AbortSignal.timeout(2000),
    })
    if (!bucketsRes.ok) return 0

    const buckets = (await bucketsRes.json()) as Record<string, AwBucket>

    const afkKey = Object.keys(buckets).find((k) => k.includes('aw-watcher-afk'))
    if (!afkKey) {
      log.debug('No aw-watcher-afk bucket found')
      return 0
    }

    const eventsRes = await fetch(
      `http://localhost:5600/api/0/buckets/${encodeURIComponent(afkKey)}/events?limit=1`,
      { signal: AbortSignal.timeout(2000) }
    )
    if (!eventsRes.ok) return 0

    const events = (await eventsRes.json()) as AwEvent[]
    if (!events.length) return 0

    const latest = events[0]
    const isAfk = (latest.data['status'] as string | undefined) === 'afk'
    if (!isAfk) return 0

    // duration is in seconds; convert to ms
    return Math.round(latest.duration * 1000)
  } catch {
    log.debug('ActivityWatch not available — awIdleMs = 0')
    return 0
  }
}

// ---------------------------------------------------------------------------
// Last Telegram detection
// ---------------------------------------------------------------------------

function getLastTelegramMs(): number {
  try {
    if (!existsSync(DAEMON_LOG_PATH)) return DEFAULT_TELEGRAM_IDLE_MS

    const content = readFileSync(DAEMON_LOG_PATH, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    const tail = lines.slice(-200)

    // Log lines look like: [2026-03-09T14:32:01.123Z] [INF] [gateway] ...
    const gatewayLines = tail.filter((l) => l.includes('[gateway]'))
    if (!gatewayLines.length) return DEFAULT_TELEGRAM_IDLE_MS

    const lastLine = gatewayLines[gatewayLines.length - 1]
    const match = lastLine.match(/^\[([^\]]+)\]/)
    if (!match) return DEFAULT_TELEGRAM_IDLE_MS

    const ts = Date.parse(match[1])
    if (isNaN(ts)) return DEFAULT_TELEGRAM_IDLE_MS

    return Date.now() - ts
  } catch (err) {
    log.warn(`Could not parse daemon.log for gateway timestamp: ${err}`)
    return DEFAULT_TELEGRAM_IDLE_MS
  }
}

// ---------------------------------------------------------------------------
// Historical pattern score
// ---------------------------------------------------------------------------

function computeHistoricalScore(currentHour: number, history: HistoryEntry[]): number {
  const sameHour = history.filter((e) => e.hour === currentHour)
  if (!sameHour.length) return 0 // no data → neutral

  const sleepingCount = sameHour.filter((e) => e.state === 'SLEEPING').length
  return Math.round((sleepingCount / sameHour.length) * 100)
}

// ---------------------------------------------------------------------------
// Sleep score
// ---------------------------------------------------------------------------

function computeSleepScore(
  awIdleMs: number,
  lastTelegramMs: number,
  currentHour: number,
  history: HistoryEntry[]
): number {
  // noTelegramScore: 0 if < 15min, 50 if 30min, 100 if > 2h
  const noTelegramScore = Math.min(
    100,
    Math.max(0, ((lastTelegramMs - 15 * 60_000) / (105 * 60_000)) * 100)
  )

  // awIdleScore: 0 if < 5min, 50 if 30min, 100 if > 1h
  const awIdleScore = Math.min(
    100,
    Math.max(0, ((awIdleMs - 5 * 60_000) / (55 * 60_000)) * 100)
  )

  const historicalScore = computeHistoricalScore(currentHour, history)

  // calendarScore: not implemented yet
  const calendarScore = 0

  const score = awIdleScore * 0.4 + noTelegramScore * 0.3 + calendarScore * 0.2 + historicalScore * 0.1
  return Math.round(score)
}

// ---------------------------------------------------------------------------
// State determination
// ---------------------------------------------------------------------------

function determineState(sleepScore: number, previousState: UserCycleState | null): UserCycleState {
  if (sleepScore > 70) return 'SLEEPING'
  if (sleepScore > 40) return 'AWAKE_IDLE'
  if (previousState === 'SLEEPING' && sleepScore < 40) return 'WAKING_UP'
  return 'AWAKE_ACTIVE'
}

function buildAllowedTiers(state: UserCycleState): ('local' | 'free' | 'subscription' | 'pay-per-use')[] {
  switch (state) {
    case 'AWAKE_ACTIVE':
      return ['local', 'free', 'subscription', 'pay-per-use']
    case 'WAKING_UP':
      return ['local', 'free', 'subscription', 'pay-per-use']
    case 'AWAKE_IDLE':
      return ['local', 'free']
    case 'SLEEPING':
      return ['local']
  }
}

function buildReason(
  state: UserCycleState,
  sleepScore: number,
  awIdleMs: number,
  lastTelegramMs: number
): string {
  const idle = Math.round(awIdleMs / 60_000)
  const telegram = Math.round(lastTelegramMs / 60_000)

  switch (state) {
    case 'SLEEPING':
      return `Sleep score ${sleepScore}/100 — PC idle ${idle}min, no Telegram for ${telegram}min`
    case 'AWAKE_IDLE':
      return `Sleep score ${sleepScore}/100 — PC idle ${idle}min, no Telegram for ${telegram}min`
    case 'WAKING_UP':
      return `First activity after sleep (score dropped to ${sleepScore}) — preparing morning digest`
    case 'AWAKE_ACTIVE':
      return `Active — sleep score ${sleepScore}/100, last Telegram ${telegram}min ago`
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Detect current user cycle state by combining ActivityWatch idle, Telegram silence, and historical pattern. */
export async function detectUserState(): Promise<UserStateInfo> {
  const history = readHistory()
  const currentHour = new Date().getHours()

  const [awIdleMs, lastTelegramMs] = await Promise.all([
    getActivityWatchIdleMs(),
    Promise.resolve(getLastTelegramMs()),
  ])

  const sleepScore = computeSleepScore(awIdleMs, lastTelegramMs, currentHour, history)

  const stored = readStoredState()
  const previousState: UserCycleState | null = stored?.state ?? null

  const state = determineState(sleepScore, previousState)
  const allowedTiers = buildAllowedTiers(state)
  const canUsePaidApi = state === 'AWAKE_ACTIVE' || state === 'WAKING_UP'
  const reason = buildReason(state, sleepScore, awIdleMs, lastTelegramMs)
  const lastActivityMs = awIdleMs > 0 ? awIdleMs : lastTelegramMs

  log.debug(`User state: ${state} (score=${sleepScore}, aw=${Math.round(awIdleMs / 60000)}min, tg=${Math.round(lastTelegramMs / 60000)}min)`)

  // Persist new state
  writeStoredState(state)

  return {
    state,
    sleepScore,
    lastActivityMs,
    lastTelegramMs,
    awIdleMs,
    canUsePaidApi,
    allowedTiers,
    reason,
  }
}

/** Append current hour + state to history. Max 168 entries (7 days of hourly data). */
export function updateStateHistory(state: UserCycleState): void {
  const history = readHistory()
  history.push({ hour: new Date().getHours(), state })
  const trimmed = history.slice(-168)
  writeHistory(trimmed)
  log.debug(`State history updated: hour=${new Date().getHours()} state=${state} (total=${trimmed.length})`)
}

/** Return recommended model tier string for a given state. */
export function getModelTierForState(state: UserCycleState): string {
  switch (state) {
    case 'AWAKE_ACTIVE':
      return 'auto'
    case 'AWAKE_IDLE':
      return 'free'
    case 'SLEEPING':
      return 'local'
    case 'WAKING_UP':
      return 'auto'
  }
}

/** Build a morning digest summarising what happened during sleep. Only call when state = WAKING_UP. */
export async function buildMorningDigest(stateInfo: UserStateInfo): Promise<string> {
  if (stateInfo.state !== 'WAKING_UP') {
    return 'buildMorningDigest called outside WAKING_UP state — nothing to summarise.'
  }

  try {
    const stats = getJournalStats()

    const lines: string[] = []
    lines.push('🌅 Pendant que tu dormais, j\'ai travaillé en arrière-plan :')
    lines.push('')

    if (stats.total === 0) {
      lines.push('— Aucun événement enregistré cette nuit.')
    } else {
      lines.push(`— ${stats.total} événements journalisés (${stats.unacked} en attente)`)

      const byType = Object.entries(stats.byType)
      if (byType.length) {
        for (const [type, count] of byType) {
          lines.push(`  • ${type}: ${count}`)
        }
      }

      if (stats.oldest && stats.newest) {
        const oldDate = new Date(stats.oldest)
        const newDate = new Date(stats.newest)
        lines.push(`— Période : ${oldDate.toLocaleTimeString('fr-FR')} → ${newDate.toLocaleTimeString('fr-FR')}`)
      }
    }

    lines.push('')
    lines.push(`Score de sommeil détecté : ${stateInfo.sleepScore}/100`)
    lines.push(`Tier recommandé maintenant : ${getModelTierForState('AWAKE_ACTIVE')} (AWAKE_ACTIVE)`)

    return lines.join('\n')
  } catch (err) {
    log.warn(`buildMorningDigest failed: ${err}`)
    return 'Digest indisponible — impossible de lire le journal d\'événements.'
  }
}
