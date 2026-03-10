/**
 * Unit tests for user-cycles.ts — computeSleepScore pure function.
 * Tests the weighted score calculation without any I/O or network.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-user-cycles-test',
  DAEMON_LOG_PATH: '/tmp/rex-user-cycles-test/daemon.log',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-user-cycles-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-user-cycles-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/activitywatch-bridge.js', () => ({
  getAfkIdleMinutes: vi.fn(async () => 0),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn(() => false), readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn() }
})

import { computeSleepScore } from '../../src/user-cycles.js'

// ── computeSleepScore ─────────────────────────────────────────────────────────

describe('computeSleepScore', () => {
  it('returns a number', () => {
    expect(typeof computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })).toBe('number')
  })

  it('returns 0 when all inputs are 0', () => {
    const score = computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })
    expect(score).toBe(0)
  })

  it('returns 1.0 when all inputs are at max', () => {
    // idleMinutes=240(max)→1.0×0.4, noMsg=360(max)→1.0×0.3, calendar=1×0.2, historical=1×0.1 = 1.0
    const score = computeSleepScore({ idleMinutes: 240, noMessageSinceMinutes: 360, calendarHint: 1, historicalPattern: 1 })
    expect(score).toBeCloseTo(1.0)
  })

  it('caps idleMinutes at 240 (does not exceed weight 0.4)', () => {
    const scoreAt240 = computeSleepScore({ idleMinutes: 240, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })
    const scoreAt999 = computeSleepScore({ idleMinutes: 999, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })
    expect(scoreAt240).toBeCloseTo(0.4)
    expect(scoreAt999).toBeCloseTo(0.4)
  })

  it('caps noMessageSinceMinutes at 360 (does not exceed weight 0.3)', () => {
    const scoreAt360 = computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 360, calendarHint: 0, historicalPattern: 0 })
    const scoreAt999 = computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 999, calendarHint: 0, historicalPattern: 0 })
    expect(scoreAt360).toBeCloseTo(0.3)
    expect(scoreAt999).toBeCloseTo(0.3)
  })

  it('calendarHint contributes 0.2 weight when 1', () => {
    const score = computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 0, calendarHint: 1, historicalPattern: 0 })
    expect(score).toBeCloseTo(0.2)
  })

  it('historicalPattern contributes 0.1 weight when 1', () => {
    const score = computeSleepScore({ idleMinutes: 0, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 1 })
    expect(score).toBeCloseTo(0.1)
  })

  it('score is between 0 and 1 inclusive for any input', () => {
    const inputs = [
      { idleMinutes: 120, noMessageSinceMinutes: 180, calendarHint: 0.5, historicalPattern: 0.8 },
      { idleMinutes: 10, noMessageSinceMinutes: 5, calendarHint: 0, historicalPattern: 0 },
      { idleMinutes: 500, noMessageSinceMinutes: 500, calendarHint: 2, historicalPattern: 2 },
    ]
    for (const input of inputs) {
      const s = computeSleepScore(input)
      expect(s).toBeGreaterThanOrEqual(0)
    }
  })

  it('proportional: more idle time → higher score', () => {
    const low = computeSleepScore({ idleMinutes: 30, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })
    const high = computeSleepScore({ idleMinutes: 120, noMessageSinceMinutes: 0, calendarHint: 0, historicalPattern: 0 })
    expect(high).toBeGreaterThan(low)
  })
})
