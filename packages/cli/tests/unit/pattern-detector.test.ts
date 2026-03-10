/**
 * Unit tests for pattern-detector.ts — detectPatterns, SignalKind types.
 * ActivityWatch and Hammerspoon dependencies mocked.
 * @module REX-MONITOR
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/activitywatch-bridge.js', () => ({
  getAppUsage: vi.fn(async () => []),
  getProductivitySnapshot: vi.fn(async () => null),
  categorizeApp: vi.fn(() => 'work'),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    mkdirSync: vi.fn(),
  }
})

import { detectPatterns } from '../../src/pattern-detector.js'

// ── detectPatterns ────────────────────────────────────────────────────────────

describe('detectPatterns', () => {
  it('returns an object', async () => {
    const result = await detectPatterns()
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('result has signals array', async () => {
    const result = await detectPatterns()
    expect(result).toHaveProperty('signals')
    expect(Array.isArray(result.signals)).toBe(true)
  })

  it('result has awAvailable boolean', async () => {
    const result = await detectPatterns()
    expect(result).toHaveProperty('awAvailable')
    expect(typeof result.awAvailable).toBe('boolean')
  })

  it('awAvailable is false when ActivityWatch returns empty', async () => {
    const result = await detectPatterns()
    expect(result.awAvailable).toBe(false)
  })

  it('signals are empty when no events and no AW data', async () => {
    const result = await detectPatterns()
    expect(result.signals).toHaveLength(0)
  })

  it('accepts a custom hours parameter', async () => {
    const result = await detectPatterns(4)
    expect(Array.isArray(result.signals)).toBe(true)
  })

  it('each signal has required fields when signals exist', async () => {
    const result = await detectPatterns()
    for (const s of result.signals) {
      expect(s).toHaveProperty('kind')
      expect(s).toHaveProperty('message')
      expect(s).toHaveProperty('confidence')
      expect(s).toHaveProperty('source')
    }
  })
})
