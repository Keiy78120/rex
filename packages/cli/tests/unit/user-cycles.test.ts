/**
 * Unit tests for user-cycles.ts
 * Tests: computeSleepScore pure function + XState machine state transitions
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/test-rex',
  DAEMON_LOG_PATH: '/tmp/test-daemon.log',
}))
vi.mock('../../src/activitywatch-bridge.js', () => ({
  getAfkIdleMinutes: async () => 0,
}))

import { computeSleepScore, userCycleMachine } from '../../src/user-cycles.js'
import { createActor } from 'xstate'

// ── computeSleepScore ─────────────────────────────────────────────────────────

describe('computeSleepScore', () => {
  it('returns 0 when all signals are zero', () => {
    const score = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 0,
      calendarHint: 0,
      historicalPattern: 0,
    })
    expect(score).toBe(0)
  })

  it('returns 1.0 when all signals are maxed', () => {
    const score = computeSleepScore({
      idleMinutes: 240,         // max (4h)
      noMessageSinceMinutes: 360, // max (6h)
      calendarHint: 1,
      historicalPattern: 1,
    })
    expect(score).toBeCloseTo(1.0, 5)
  })

  it('idle weight: 240min idle contributes 0.4 to score', () => {
    const score = computeSleepScore({
      idleMinutes: 240,
      noMessageSinceMinutes: 0,
      calendarHint: 0,
      historicalPattern: 0,
    })
    expect(score).toBeCloseTo(0.4, 5)
  })

  it('message weight: 360min no message contributes 0.3 to score', () => {
    const score = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 360,
      calendarHint: 0,
      historicalPattern: 0,
    })
    expect(score).toBeCloseTo(0.3, 5)
  })

  it('calendar hint contributes 0.2 when set to 1', () => {
    const score = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 0,
      calendarHint: 1,
      historicalPattern: 0,
    })
    expect(score).toBeCloseTo(0.2, 5)
  })

  it('historical pattern contributes 0.1 when set to 1', () => {
    const score = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 0,
      calendarHint: 0,
      historicalPattern: 1,
    })
    expect(score).toBeCloseTo(0.1, 5)
  })

  it('idle beyond 240min is clamped (no extra score)', () => {
    const atMax = computeSleepScore({
      idleMinutes: 240,
      noMessageSinceMinutes: 0,
      calendarHint: 0,
      historicalPattern: 0,
    })
    const beyond = computeSleepScore({
      idleMinutes: 999,
      noMessageSinceMinutes: 0,
      calendarHint: 0,
      historicalPattern: 0,
    })
    expect(atMax).toBe(beyond)
  })

  it('message gap beyond 360min is clamped', () => {
    const atMax = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 360,
      calendarHint: 0,
      historicalPattern: 0,
    })
    const beyond = computeSleepScore({
      idleMinutes: 0,
      noMessageSinceMinutes: 999,
      calendarHint: 0,
      historicalPattern: 0,
    })
    expect(atMax).toBe(beyond)
  })

  it('typical active user → low score (< 0.3)', () => {
    const score = computeSleepScore({
      idleMinutes: 5,
      noMessageSinceMinutes: 10,
      calendarHint: 0,
      historicalPattern: 0.1,
    })
    expect(score).toBeLessThan(0.3)
  })

  it('typical sleeping user → high score (> 0.7)', () => {
    const score = computeSleepScore({
      idleMinutes: 200,
      noMessageSinceMinutes: 300,
      calendarHint: 1,
      historicalPattern: 0.8,
    })
    expect(score).toBeGreaterThan(0.7)
  })

  it('score is always between 0 and 1', () => {
    const cases = [
      { idleMinutes: 50, noMessageSinceMinutes: 100, calendarHint: 0.5, historicalPattern: 0.3 },
      { idleMinutes: 0, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 },
      { idleMinutes: 9999, noMessageSinceMinutes: 9999, calendarHint: 1, historicalPattern: 1 },
    ]
    for (const inputs of cases) {
      const score = computeSleepScore(inputs)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})

// ── XState machine structure ──────────────────────────────────────────────────

describe('userCycleMachine', () => {
  it('initial state is awake_active', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    expect(actor.getSnapshot().value).toBe('awake_active')
    actor.stop()
  })

  it('transitions from awake_active to awake_idle on IDLE_30MIN', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'IDLE_30MIN' })
    expect(actor.getSnapshot().value).toBe('awake_idle')
    actor.stop()
  })

  it('transitions from awake_active to sleeping on SCORE_HIGH', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'SCORE_HIGH', score: 0.85 })
    expect(actor.getSnapshot().value).toBe('sleeping')
    actor.stop()
  })

  it('transitions from awake_idle to sleeping on SCORE_HIGH', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'IDLE_30MIN' })
    actor.send({ type: 'SCORE_HIGH', score: 0.9 })
    expect(actor.getSnapshot().value).toBe('sleeping')
    actor.stop()
  })

  it('transitions from sleeping to waking_up on WAKE_UP', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'SCORE_HIGH', score: 0.9 })
    actor.send({ type: 'WAKE_UP' })
    expect(actor.getSnapshot().value).toBe('waking_up')
    actor.stop()
  })

  it('transitions from sleeping to waking_up on ACTIVITY', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'SCORE_HIGH', score: 0.9 })
    actor.send({ type: 'ACTIVITY' })
    expect(actor.getSnapshot().value).toBe('waking_up')
    actor.stop()
  })

  it('transitions from waking_up back to awake_active on DIGEST_SENT', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'SCORE_HIGH', score: 0.9 })
    actor.send({ type: 'WAKE_UP' })
    actor.send({ type: 'DIGEST_SENT' })
    expect(actor.getSnapshot().value).toBe('awake_active')
    actor.stop()
  })

  it('returns to awake_active from awake_idle on ACTIVITY', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'IDLE_30MIN' })
    actor.send({ type: 'ACTIVITY' })
    expect(actor.getSnapshot().value).toBe('awake_active')
    actor.stop()
  })

  it('sleeping state sets allowedTiers to local only', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'SCORE_HIGH', score: 0.9 })
    const ctx = actor.getSnapshot().context
    expect(ctx.allowedTiers).toEqual(['local'])
    actor.stop()
  })

  it('awake_idle state limits tiers to local + free', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    actor.send({ type: 'IDLE_30MIN' })
    const ctx = actor.getSnapshot().context
    expect(ctx.allowedTiers).toContain('local')
    expect(ctx.allowedTiers).toContain('free')
    expect(ctx.allowedTiers).not.toContain('subscription')
    actor.stop()
  })

  it('awake_active state allows all tiers including subscription', () => {
    const actor = createActor(userCycleMachine)
    actor.start()
    const ctx = actor.getSnapshot().context
    expect(ctx.allowedTiers).toContain('subscription')
    actor.stop()
  })
})
