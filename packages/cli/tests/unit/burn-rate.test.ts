/**
 * Unit tests for burn-rate.ts — pure utility functions.
 * Tests renderBar and formatDuration without any FS/network access.
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-burn-rate-test',
  ensureRexDirs: vi.fn(),
  DAEMON_LOG_PATH: '/tmp/rex-burn-rate-test/daemon.log',
  MEMORY_DB_PATH: '/tmp/rex-burn-rate-test/rex.sqlite',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isFile: () => false, size: 0, mtime: new Date() })),
  }
})

import { renderBar, formatDuration, getBurnRateStats } from '../../src/burn-rate.js'

// ── renderBar ─────────────────────────────────────────────────────────────────

describe('renderBar', () => {
  it('returns a string', () => {
    expect(typeof renderBar(50)).toBe('string')
  })

  it('contains the percentage value', () => {
    const bar = renderBar(75)
    expect(bar).toContain('75%')
  })

  it('contains the bracket delimiters', () => {
    const bar = renderBar(50)
    expect(bar).toContain('[')
    expect(bar).toContain(']')
  })

  it('handles 0%', () => {
    const bar = renderBar(0)
    expect(bar).toContain('0%')
    // At 0%, all chars should be dots (empty fill)
    expect(bar).toContain('·')
  })

  it('handles 100%', () => {
    const bar = renderBar(100)
    expect(bar).toContain('100%')
    // At 100%, should use critical fill char
    expect(bar).toContain('█')
  })

  it('uses red ANSI code at >= 90%', () => {
    const bar = renderBar(90)
    expect(bar).toContain('\x1b[31m') // red
  })

  it('uses yellow ANSI code at >= 70%', () => {
    const bar = renderBar(70)
    expect(bar).toContain('\x1b[33m') // yellow
  })

  it('uses green ANSI code at < 70%', () => {
    const bar = renderBar(50)
    expect(bar).toContain('\x1b[32m') // green
  })

  it('uses ▓ fill char at 70%–89%', () => {
    const bar = renderBar(80)
    // Strip ANSI codes to check chars
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '')
    expect(stripped).toContain('▓')
  })

  it('uses ▒ fill char at 40%–69%', () => {
    const bar = renderBar(55)
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '')
    expect(stripped).toContain('▒')
  })

  it('uses ░ fill char at < 40%', () => {
    const bar = renderBar(30)
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '')
    expect(stripped).toContain('░')
  })

  it('respects custom width', () => {
    const bar10 = renderBar(50, 10)
    const bar30 = renderBar(50, 30)
    // Wider bar has more characters inside brackets
    const inner10 = bar10.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[|\]|[0-9]+%/g, '').trim()
    const inner30 = bar30.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[|\]|[0-9]+%/g, '').trim()
    expect(inner30.length).toBeGreaterThan(inner10.length)
  })

  it('does not throw for edge values (0, 100, negative, >100)', () => {
    expect(() => renderBar(0)).not.toThrow()
    expect(() => renderBar(100)).not.toThrow()
    expect(() => renderBar(-10)).not.toThrow()
    expect(() => renderBar(110)).not.toThrow()
  })
})

// ── formatDuration ────────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds for ms < 60000', () => {
    expect(formatDuration(30_000)).toBe('30s')
    expect(formatDuration(1_000)).toBe('1s')
    expect(formatDuration(59_000)).toBe('59s')
  })

  it('formats minutes for ms in [60000, 3600000)', () => {
    expect(formatDuration(60_000)).toBe('1m')
    expect(formatDuration(120_000)).toBe('2m')
    expect(formatDuration(3_599_000)).toBe('60m')
  })

  it('formats hours for ms >= 3600000', () => {
    expect(formatDuration(3_600_000)).toBe('1.0h')
    expect(formatDuration(7_200_000)).toBe('2.0h')
    expect(formatDuration(5_400_000)).toBe('1.5h')
  })

  it('returns a string', () => {
    expect(typeof formatDuration(1000)).toBe('string')
  })

  it('handles 0ms', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('rounds seconds (not truncates)', () => {
    // 1500ms → 2s (rounds up)
    expect(formatDuration(1_500)).toBe('2s')
    // 1400ms → 1s (rounds down)
    expect(formatDuration(1_400)).toBe('1s')
  })
})

// ── getBurnRateStats ──────────────────────────────────────────────────────────

describe('getBurnRateStats', () => {
  it('returns an object without throwing', () => {
    expect(() => getBurnRateStats()).not.toThrow()
  })

  it('returns all required BurnRateStats fields', () => {
    const stats = getBurnRateStats(true)
    expect(stats).toHaveProperty('sessionTokensIn')
    expect(stats).toHaveProperty('sessionTokensOut')
    expect(stats).toHaveProperty('sessionTotal')
    expect(stats).toHaveProperty('sessionDurationMs')
    expect(stats).toHaveProperty('burnRatePerMin')
    expect(stats).toHaveProperty('burnRatePerHour')
    expect(stats).toHaveProperty('contextUsed')
    expect(stats).toHaveProperty('contextTotal')
    expect(stats).toHaveProperty('contextPercent')
    expect(stats).toHaveProperty('contextBar')
    expect(stats).toHaveProperty('dailyTokensIn')
    expect(stats).toHaveProperty('dailyTokensOut')
    expect(stats).toHaveProperty('dailyTotal')
    expect(stats).toHaveProperty('dailyLimit')
    expect(stats).toHaveProperty('dailyPercent')
    expect(stats).toHaveProperty('dailyBar')
    expect(stats).toHaveProperty('estimatedMinutesLeft')
    expect(stats).toHaveProperty('estimatedDepletionAt')
  })

  it('contextPercent is between 0 and 100', () => {
    const { contextPercent } = getBurnRateStats(true)
    expect(contextPercent).toBeGreaterThanOrEqual(0)
    expect(contextPercent).toBeLessThanOrEqual(100)
  })

  it('dailyPercent is between 0 and 100', () => {
    const { dailyPercent } = getBurnRateStats(true)
    expect(dailyPercent).toBeGreaterThanOrEqual(0)
    expect(dailyPercent).toBeLessThanOrEqual(100)
  })

  it('contextBar and dailyBar are non-empty strings', () => {
    const stats = getBurnRateStats(true)
    expect(typeof stats.contextBar).toBe('string')
    expect(stats.contextBar.length).toBeGreaterThan(0)
    expect(typeof stats.dailyBar).toBe('string')
    expect(stats.dailyBar.length).toBeGreaterThan(0)
  })

  it('with no sessions, tokens are all 0', () => {
    const stats = getBurnRateStats(true)
    // readdirSync is mocked to return [] → no session files scanned
    expect(stats.dailyTokensIn).toBe(0)
    expect(stats.dailyTokensOut).toBe(0)
    expect(stats.sessionTotal).toBe(0)
  })

  it('estimatedMinutesLeft is null when burnRate is 0', () => {
    const stats = getBurnRateStats(true)
    // No sessions → burnRate = 0 → no depletion estimate
    expect(stats.estimatedMinutesLeft).toBeNull()
    expect(stats.estimatedDepletionAt).toBeNull()
  })

  it('sessionDurationMs is at least 1000 (minimum clamp)', () => {
    const { sessionDurationMs } = getBurnRateStats(true)
    expect(sessionDurationMs).toBeGreaterThanOrEqual(1000)
  })

  it('dailyLimit is a positive number', () => {
    const { dailyLimit } = getBurnRateStats(true)
    expect(dailyLimit).toBeGreaterThan(0)
  })

  it('caching: second call without forceRefresh returns same object reference', () => {
    const first = getBurnRateStats(true)
    const second = getBurnRateStats(false) // uses cache
    expect(second).toBe(first)
  })
})
