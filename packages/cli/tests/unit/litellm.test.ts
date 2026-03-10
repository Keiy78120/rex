/**
 * Unit tests for litellm.ts — usage stats, cooldowns, provider summary, resetUsage.
 * Tests module-level state management without network calls.
 * @module BUDGET
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-litellm-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-litellm-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: () => false,
    readFileSync: actual.readFileSync,
    writeFileSync: vi.fn(),
  }
})

vi.mock('../../src/free-tiers.js', () => ({
  FREE_TIER_PROVIDERS: [],
  getApiKey: vi.fn(() => null),
  isProviderAvailable: vi.fn(() => false),
  callProvider: vi.fn(async () => { throw new Error('no providers') }),
}))

import {
  getCooldowns,
  getUsageStats,
  getProviderUsageSummary,
  resetUsage,
} from '../../src/litellm.js'

// ── resetUsage / getUsageStats ─────────────────────────────────────────────

describe('getUsageStats', () => {
  it('returns object with providers, totalRequests, totalErrors, lastResetAt', () => {
    const stats = getUsageStats()
    expect(stats).toHaveProperty('providers')
    expect(stats).toHaveProperty('totalRequests')
    expect(stats).toHaveProperty('totalErrors')
    expect(stats).toHaveProperty('lastResetAt')
  })

  it('returns queueLength field', () => {
    const stats = getUsageStats()
    expect(stats).toHaveProperty('queueLength')
    expect(typeof stats.queueLength).toBe('number')
  })

  it('returns cooldowns array', () => {
    const stats = getUsageStats()
    expect(stats).toHaveProperty('cooldowns')
    expect(Array.isArray(stats.cooldowns)).toBe(true)
  })

  it('totalRequests is a non-negative number', () => {
    const stats = getUsageStats()
    expect(typeof stats.totalRequests).toBe('number')
    expect(stats.totalRequests).toBeGreaterThanOrEqual(0)
  })
})

describe('resetUsage', () => {
  it('does not throw', () => {
    expect(() => resetUsage()).not.toThrow()
  })

  it('resets totalRequests to 0', () => {
    resetUsage()
    const stats = getUsageStats()
    expect(stats.totalRequests).toBe(0)
  })

  it('resets totalErrors to 0', () => {
    resetUsage()
    const stats = getUsageStats()
    expect(stats.totalErrors).toBe(0)
  })

  it('resets providers to empty object', () => {
    resetUsage()
    const stats = getUsageStats()
    expect(Object.keys(stats.providers)).toHaveLength(0)
  })

  it('sets lastResetAt to a valid ISO date', () => {
    const before = Date.now()
    resetUsage()
    const after = Date.now()
    const stats = getUsageStats()
    const resetMs = new Date(stats.lastResetAt).getTime()
    expect(resetMs).toBeGreaterThanOrEqual(before)
    expect(resetMs).toBeLessThanOrEqual(after)
  })
})

// ── getCooldowns ───────────────────────────────────────────────────────────────

describe('getCooldowns', () => {
  beforeEach(() => {
    resetUsage()
  })

  it('returns an array', () => {
    expect(Array.isArray(getCooldowns())).toBe(true)
  })

  it('returns empty array when no cooldowns are active', () => {
    // No providers have been called — cooldowns should be empty
    const cooldowns = getCooldowns()
    expect(cooldowns).toHaveLength(0)
  })

  it('each cooldown entry has provider, cooldownUntil, reason fields', () => {
    // This test is structural — passes when no cooldowns exist too
    const cooldowns = getCooldowns()
    for (const c of cooldowns) {
      expect(c).toHaveProperty('provider')
      expect(c).toHaveProperty('cooldownUntil')
      expect(c).toHaveProperty('reason')
    }
  })
})

// ── getProviderUsageSummary ────────────────────────────────────────────────────

describe('getProviderUsageSummary', () => {
  beforeEach(() => {
    resetUsage()
  })

  it('returns an array', () => {
    expect(Array.isArray(getProviderUsageSummary())).toBe(true)
  })

  it('returns empty array after reset with no providers used', () => {
    expect(getProviderUsageSummary()).toHaveLength(0)
  })
})
