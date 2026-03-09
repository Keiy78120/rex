/**
 * REX User Cycles — XState machine for user activity detection
 *
 * States: AWAKE_ACTIVE → AWAKE_IDLE → SLEEPING ↔ WAKING_UP
 * Sleep score = idleTime*0.4 + noMessageSince*0.3 + calendarHint*0.2 + historicalPattern*0.1
 *
 * SLEEPING → Ollama-only tier (local inference, zero paid API)
 * WAKING_UP → send morning digest, switch back to full tier
 *
 * @module HQ
 * @see docs/REX-BRAIN.md §6
 */

import { createActor, createMachine, assign } from 'xstate'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { REX_DIR, DAEMON_LOG_PATH } from './paths.js'
import { createLogger } from './logger.js'
import { getAfkIdleMinutes } from './activitywatch-bridge.js'

const log = createLogger('HQ:user-cycles')

// ── Types ─────────────────────────────────────────────────────────────────────

export type CycleState = 'awake_active' | 'awake_idle' | 'sleeping' | 'waking_up'

export interface CycleContext {
  sleepScore: number
  idleMinutes: number
  lastActivityTs: number
  lastTelegramTs: number
  allowedTiers: ('local' | 'free' | 'subscription' | 'pay-per-use')[]
}

export interface CycleSnapshot {
  state: CycleState
  context: CycleContext
  updatedAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SNAPSHOT_PATH = join(REX_DIR, 'user-cycles-state.json')
const IDLE_THRESHOLD_MIN = 30   // 30 min idle → awake_idle
const SLEEP_SCORE_THRESHOLD = 0.65  // score > 0.65 → sleeping

// ── State Machine ─────────────────────────────────────────────────────────────

export const userCycleMachine = createMachine({
  id: 'userCycle',
  initial: 'awake_active',
  context: {
    sleepScore: 0,
    idleMinutes: 0,
    lastActivityTs: Date.now(),
    lastTelegramTs: Date.now(),
    allowedTiers: ['local', 'free', 'subscription', 'pay-per-use'] as CycleContext['allowedTiers'],
  } satisfies CycleContext,
  types: {} as {
    context: CycleContext
    events:
      | { type: 'IDLE_30MIN' }
      | { type: 'SCORE_HIGH'; score: number }
      | { type: 'ACTIVITY' }
      | { type: 'WAKE_UP' }
      | { type: 'DIGEST_SENT' }
      | { type: 'TICK'; idleMinutes: number; sleepScore: number }
  },
  states: {
    awake_active: {
      entry: assign({
        allowedTiers: () => ['local', 'free', 'subscription', 'pay-per-use'] as CycleContext['allowedTiers'],
      }),
      on: {
        IDLE_30MIN: 'awake_idle',
        SCORE_HIGH: {
          target: 'sleeping',
          actions: assign({ sleepScore: ({ event }) => (event as { type: 'SCORE_HIGH'; score: number }).score }),
        },
        TICK: {
          actions: assign({
            idleMinutes: ({ event }) => (event as { type: 'TICK'; idleMinutes: number; sleepScore: number }).idleMinutes,
            sleepScore: ({ event }) => (event as { type: 'TICK'; idleMinutes: number; sleepScore: number }).sleepScore,
          }),
        },
      },
    },
    awake_idle: {
      entry: assign({
        // In idle mode: only local + free tiers (no subscription billing)
        allowedTiers: () => ['local', 'free'] as CycleContext['allowedTiers'],
      }),
      on: {
        ACTIVITY: 'awake_active',
        SCORE_HIGH: {
          target: 'sleeping',
          actions: assign({ sleepScore: ({ event }) => (event as { type: 'SCORE_HIGH'; score: number }).score }),
        },
        TICK: {
          actions: assign({
            idleMinutes: ({ event }) => (event as { type: 'TICK'; idleMinutes: number; sleepScore: number }).idleMinutes,
            sleepScore: ({ event }) => (event as { type: 'TICK'; idleMinutes: number; sleepScore: number }).sleepScore,
          }),
        },
      },
    },
    sleeping: {
      entry: assign({
        // Sleeping: local only — Ollama, no paid API
        allowedTiers: () => ['local'] as CycleContext['allowedTiers'],
      }),
      on: {
        WAKE_UP: 'waking_up',
        ACTIVITY: 'waking_up',
      },
    },
    waking_up: {
      on: {
        DIGEST_SENT: 'awake_active',
        // If digest fails, also recover
        ACTIVITY: 'awake_active',
      },
    },
  },
})

// ── Snapshot persistence ──────────────────────────────────────────────────────

function loadSnapshot(): CycleSnapshot | null {
  try {
    if (!existsSync(SNAPSHOT_PATH)) return null
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as CycleSnapshot
  } catch { return null }
}

function saveSnapshot(state: CycleState, ctx: CycleContext): void {
  try {
    const snap: CycleSnapshot = { state, context: ctx, updatedAt: new Date().toISOString() }
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2))
  } catch {}
}

// ── Sleep score computation ───────────────────────────────────────────────────

interface ScoreInputs {
  idleMinutes: number
  noMessageSinceMinutes: number
  calendarHint: number    // 0 = no hint, 1 = known sleep hour
  historicalPattern: number // 0-1 based on past hour distribution
}

export function computeSleepScore(inputs: ScoreInputs): number {
  const { idleMinutes, noMessageSinceMinutes, calendarHint, historicalPattern } = inputs
  // Max idle considered: 4h (240 min) → 1.0
  const idleNorm = Math.min(idleMinutes / 240, 1)
  // Max no-message: 6h (360 min) → 1.0
  const msgNorm = Math.min(noMessageSinceMinutes / 360, 1)
  return (
    idleNorm * 0.4 +
    msgNorm * 0.3 +
    calendarHint * 0.2 +
    historicalPattern * 0.1
  )
}

// ── Historical pattern: are we usually sleeping at this hour? ─────────────────

function getHistoricalSleepPattern(): number {
  const hour = new Date().getHours()
  // Common sleep window: 22:00-07:00
  return (hour >= 22 || hour <= 7) ? 0.8 : 0.1
}

// ── Telegram idle detection ───────────────────────────────────────────────────

function getNoTelegramMinutes(): number {
  try {
    // Grep for last Telegram message timestamp in daemon log
    const out = execSync(
      `grep -i "telegram\\|gateway\\|update" "${DAEMON_LOG_PATH}" 2>/dev/null | tail -1`,
      { encoding: 'utf-8', timeout: 3000 }
    ).trim()
    if (!out) return 999
    const tsMatch = out.match(/\d{4}-\d{2}-\d{2}T[\d:]+/)
    if (!tsMatch) return 999
    const lastMs = new Date(tsMatch[0]).getTime()
    return Math.round((Date.now() - lastMs) / 60_000)
  } catch { return 999 }
}

// ── Main detect function ──────────────────────────────────────────────────────

/**
 * Detect current user cycle state using XState machine + live signals.
 * Persists state snapshot to disk for daemon polling.
 */
export async function detectUserCycle(): Promise<CycleSnapshot> {
  const snap = loadSnapshot()

  // Restore or create actor
  const actor = createActor(userCycleMachine, {
    snapshot: undefined, // always start fresh from initial — we override via events
  })
  actor.start()

  // Gather signals in parallel
  const [idleMinutes, noMessageSinceMinutes] = await Promise.all([
    getAfkIdleMinutes(),
    Promise.resolve(getNoTelegramMinutes()),
  ])

  const sleepScore = computeSleepScore({
    idleMinutes,
    noMessageSinceMinutes,
    calendarHint: snap?.state === 'sleeping' ? 0.6 : getHistoricalSleepPattern(),
    historicalPattern: getHistoricalSleepPattern(),
  })

  // Determine starting state from persisted snapshot
  let currentState: CycleState = (snap?.state as CycleState) ?? 'awake_active'

  // Send TICK to update context
  actor.send({ type: 'TICK', idleMinutes, sleepScore })

  // Apply transitions based on computed signals
  if (currentState === 'awake_active' || currentState === 'awake_idle') {
    if (sleepScore >= SLEEP_SCORE_THRESHOLD) {
      actor.send({ type: 'SCORE_HIGH', score: sleepScore })
      currentState = 'sleeping'
      log.info(`User cycle → SLEEPING (score=${sleepScore.toFixed(2)})`)
    } else if (idleMinutes >= IDLE_THRESHOLD_MIN && currentState === 'awake_active') {
      actor.send({ type: 'IDLE_30MIN' })
      currentState = 'awake_idle'
      log.info(`User cycle → AWAKE_IDLE (idle=${idleMinutes}min)`)
    } else if (idleMinutes < 5 && currentState === 'awake_idle') {
      actor.send({ type: 'ACTIVITY' })
      currentState = 'awake_active'
    }
  } else if (currentState === 'sleeping') {
    if (idleMinutes < 10 && sleepScore < 0.4) {
      actor.send({ type: 'WAKE_UP' })
      currentState = 'waking_up'
      log.info('User cycle → WAKING_UP')
    }
  } else if (currentState === 'waking_up') {
    // Morning digest would be sent by gateway; we mark transition after 5min
    const snapAge = snap ? Date.now() - new Date(snap.updatedAt).getTime() : Infinity
    if (snapAge > 5 * 60_000) {
      actor.send({ type: 'DIGEST_SENT' })
      currentState = 'awake_active'
    }
  }

  const ctx = actor.getSnapshot().context as CycleContext
  // Override allowedTiers based on resolved state (entry actions may not have fired)
  const allowedTiers: CycleContext['allowedTiers'] =
    currentState === 'sleeping'   ? ['local'] :
    currentState === 'awake_idle' ? ['local', 'free'] :
    ['local', 'free', 'subscription', 'pay-per-use']

  actor.stop()

  const result: CycleSnapshot = {
    state: currentState,
    context: { ...ctx, idleMinutes, sleepScore, allowedTiers },
    updatedAt: new Date().toISOString(),
  }

  saveSnapshot(currentState, result.context)
  return result
}

/**
 * Returns which API tier is allowed for the current user state.
 * Used by daemon + gateway to gate paid API calls.
 */
export async function getAllowedTiers(): Promise<CycleContext['allowedTiers']> {
  const snap = loadSnapshot()
  if (!snap) return ['local', 'free', 'subscription', 'pay-per-use']
  // Only trust snapshot if < 10 minutes old
  const age = Date.now() - new Date(snap.updatedAt).getTime()
  if (age > 10 * 60_000) {
    const fresh = await detectUserCycle()
    return fresh.context.allowedTiers
  }
  return snap.context.allowedTiers
}
