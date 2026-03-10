/**
 * Unit tests for node-mesh.ts — detectLocalThermal and detectLocalCapacity.
 * Tests OS-based detection functions that use cpu/memory/loadavg.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-node-mesh-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-node-mesh-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-node-mesh-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }
})

import { detectLocalThermal, detectLocalCapacity } from '../../src/node-mesh.js'

// ── detectLocalThermal ────────────────────────────────────────────────────────

describe('detectLocalThermal', () => {
  it('returns an object with cpuLoadPercent, ramUsedPercent, healthy', () => {
    const t = detectLocalThermal()
    expect(t).toHaveProperty('cpuLoadPercent')
    expect(t).toHaveProperty('ramUsedPercent')
    expect(t).toHaveProperty('healthy')
  })

  it('cpuLoadPercent is between 0 and 100', () => {
    const { cpuLoadPercent } = detectLocalThermal()
    expect(cpuLoadPercent).toBeGreaterThanOrEqual(0)
    expect(cpuLoadPercent).toBeLessThanOrEqual(100)
  })

  it('ramUsedPercent is between 0 and 100', () => {
    const { ramUsedPercent } = detectLocalThermal()
    expect(ramUsedPercent).toBeGreaterThanOrEqual(0)
    expect(ramUsedPercent).toBeLessThanOrEqual(100)
  })

  it('healthy is a boolean', () => {
    const { healthy } = detectLocalThermal()
    expect(typeof healthy).toBe('boolean')
  })

  it('healthy reflects cpu < 80 and ram < 90', () => {
    const { cpuLoadPercent, ramUsedPercent, healthy } = detectLocalThermal()
    expect(healthy).toBe(cpuLoadPercent < 80 && ramUsedPercent < 90)
  })

  it('ramUsedPercent is > 0 on any real system', () => {
    expect(detectLocalThermal().ramUsedPercent).toBeGreaterThan(0)
  })
})

// ── detectLocalCapacity ───────────────────────────────────────────────────────

describe('detectLocalCapacity', () => {
  it('returns an object with cpuCores, ramGb, ollamaModels', () => {
    const cap = detectLocalCapacity()
    expect(cap).toHaveProperty('cpuCores')
    expect(cap).toHaveProperty('ramGb')
    expect(cap).toHaveProperty('ollamaModels')
  })

  it('cpuCores is a positive integer', () => {
    const { cpuCores } = detectLocalCapacity()
    expect(Number.isInteger(cpuCores)).toBe(true)
    expect(cpuCores).toBeGreaterThan(0)
  })

  it('ramGb is a positive integer', () => {
    const { ramGb } = detectLocalCapacity()
    expect(Number.isInteger(ramGb)).toBe(true)
    expect(ramGb).toBeGreaterThan(0)
  })

  it('ollamaModels is an array', () => {
    expect(Array.isArray(detectLocalCapacity().ollamaModels)).toBe(true)
  })
})
