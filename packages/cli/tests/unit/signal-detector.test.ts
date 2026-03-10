/**
 * Unit tests for signal-detector.ts — getCpuLoadPercent, getRamUsedPercent,
 * and structural checks on detectSignals output shape.
 * Tests pure OS-based computations without network or daemon.
 * @module CURIOUS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-signal-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-signal-test/config.json',
  MEMORY_DB_PATH: '/tmp/rex-signal-test/memory.sqlite',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

import {
  getCpuLoadPercent,
  getRamUsedPercent,
  detectSignals,
  type SystemSignals,
  type PressureLevel,
} from '../../src/signal-detector.js'

// ── getCpuLoadPercent ─────────────────────────────────────────────────────────

describe('getCpuLoadPercent', () => {
  it('returns a number', () => {
    expect(typeof getCpuLoadPercent()).toBe('number')
  })

  it('returns a value between 0 and 100 inclusive', () => {
    const pct = getCpuLoadPercent()
    expect(pct).toBeGreaterThanOrEqual(0)
    expect(pct).toBeLessThanOrEqual(100)
  })

  it('returns an integer (rounded)', () => {
    const pct = getCpuLoadPercent()
    expect(Number.isInteger(pct)).toBe(true)
  })
})

// ── getRamUsedPercent ─────────────────────────────────────────────────────────

describe('getRamUsedPercent', () => {
  it('returns a number', () => {
    expect(typeof getRamUsedPercent()).toBe('number')
  })

  it('returns a value between 0 and 100 inclusive', () => {
    const pct = getRamUsedPercent()
    expect(pct).toBeGreaterThanOrEqual(0)
    expect(pct).toBeLessThanOrEqual(100)
  })

  it('returns an integer (rounded)', () => {
    const pct = getRamUsedPercent()
    expect(Number.isInteger(pct)).toBe(true)
  })

  it('returns a meaningful percentage (> 0 on real system)', () => {
    // Any real machine uses at least some RAM
    const pct = getRamUsedPercent()
    expect(pct).toBeGreaterThan(0)
  })
})

// ── detectSignals — structure ─────────────────────────────────────────────────

describe('detectSignals', () => {
  it('returns a SystemSignals object', () => {
    const s = detectSignals()
    expect(s).toHaveProperty('hardware')
    expect(s).toHaveProperty('services')
    expect(s).toHaveProperty('dev')
    expect(s).toHaveProperty('providers')
    expect(s).toHaveProperty('capturedAt')
  })

  it('hardware section has required fields', () => {
    const { hardware } = detectSignals()
    expect(hardware).toHaveProperty('cpuCores')
    expect(hardware).toHaveProperty('ramGb')
    expect(hardware).toHaveProperty('ramFreeGb')
    expect(hardware).toHaveProperty('diskFreeGb')
    expect(hardware).toHaveProperty('ramPressure')
    expect(hardware).toHaveProperty('diskPressure')
  })

  it('hardware pressure levels are valid', () => {
    const VALID_LEVELS: PressureLevel[] = ['ok', 'warn', 'critical']
    const { hardware } = detectSignals()
    expect(VALID_LEVELS).toContain(hardware.ramPressure)
    expect(VALID_LEVELS).toContain(hardware.diskPressure)
  })

  it('services section has boolean flags', () => {
    const { services } = detectSignals()
    expect(typeof services.ollamaRunning).toBe('boolean')
    expect(typeof services.daemonRunning).toBe('boolean')
    expect(typeof services.commanderRunning).toBe('boolean')
  })

  it('providers section has freeProviderCount as number', () => {
    const { providers } = detectSignals()
    expect(typeof providers.freeProviderCount).toBe('number')
    expect(providers.freeProviderCount).toBeGreaterThanOrEqual(0)
  })

  it('capturedAt is a valid ISO timestamp', () => {
    const { capturedAt } = detectSignals()
    expect(typeof capturedAt).toBe('string')
    expect(() => new Date(capturedAt)).not.toThrow()
    expect(new Date(capturedAt).getTime()).toBeGreaterThan(0)
  })

  it('hardware ramGb is positive', () => {
    const { hardware } = detectSignals()
    expect(hardware.ramGb).toBeGreaterThan(0)
  })

  it('hardware cpuCores is positive integer', () => {
    const { hardware } = detectSignals()
    expect(hardware.cpuCores).toBeGreaterThan(0)
    expect(Number.isInteger(hardware.cpuCores)).toBe(true)
  })

  it('dev section has pendingMemoryChunks as number', () => {
    const { dev } = detectSignals()
    expect(typeof dev.pendingMemoryChunks).toBe('number')
    expect(dev.pendingMemoryChunks).toBeGreaterThanOrEqual(0)
  })
})
