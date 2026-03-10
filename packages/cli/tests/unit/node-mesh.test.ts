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

import { detectLocalThermal, detectLocalCapacity, getFleetStatus, type FleetNode } from '../../src/node-mesh.js'

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

// ── getFleetStatus ────────────────────────────────────────────────────────────

function makeNode(id: string, lastSeen: string | null, overrides: Partial<FleetNode> = {}): FleetNode {
  return {
    id,
    hostname: `host-${id}`,
    ip: '127.0.0.1',
    role: 'worker',
    status: 'healthy',
    lastSeen,
    capabilities: { hasOllama: false, ollamaModels: [], hasGpu: false, hasCuda: false, hasDocker: false, hasSeatbelt: false, claudeCode: true, codex: false },
    capacity: { cpuCores: 4, ramGb: 8, ollamaModels: [] },
    thermal: { cpuLoadPercent: 20, ramUsedPercent: 50, healthy: true },
    ...overrides,
  }
}

describe('getFleetStatus', () => {
  it('returns object with nodes, healthy, stale, offline', () => {
    const result = getFleetStatus(new Map())
    expect(result).toHaveProperty('nodes')
    expect(result).toHaveProperty('healthy')
    expect(result).toHaveProperty('stale')
    expect(result).toHaveProperty('offline')
  })

  it('returns empty nodes for empty map', () => {
    const result = getFleetStatus(new Map())
    expect(result.nodes).toHaveLength(0)
    expect(result.healthy).toBe(0)
    expect(result.stale).toBe(0)
    expect(result.offline).toBe(0)
  })

  it('marks recently-seen node as healthy', () => {
    const recentDate = new Date(Date.now() - 60_000).toISOString() // 1 min ago
    const map = new Map([['n1', makeNode('n1', recentDate)]])
    const result = getFleetStatus(map)
    expect(result.healthy).toBe(1)
    expect(result.stale).toBe(0)
    expect(result.offline).toBe(0)
  })

  it('marks node with no lastSeen as offline', () => {
    const map = new Map([['n1', makeNode('n1', null)]])
    const result = getFleetStatus(map)
    expect(result.offline).toBe(1)
    expect(result.healthy).toBe(0)
  })

  it('marks node seen >30min ago as offline', () => {
    const oldDate = new Date(Date.now() - 31 * 60_000).toISOString()
    const map = new Map([['n1', makeNode('n1', oldDate)]])
    const result = getFleetStatus(map)
    expect(result.offline).toBe(1)
  })

  it('marks node seen 10min ago as stale', () => {
    const staleDate = new Date(Date.now() - 10 * 60_000).toISOString()
    const map = new Map([['n1', makeNode('n1', staleDate)]])
    const result = getFleetStatus(map)
    expect(result.stale).toBe(1)
    expect(result.healthy).toBe(0)
    expect(result.offline).toBe(0)
  })

  it('counts correctly with mixed nodes', () => {
    const recent = new Date(Date.now() - 60_000).toISOString()
    const stale = new Date(Date.now() - 10 * 60_000).toISOString()
    const map = new Map([
      ['n1', makeNode('n1', recent)],
      ['n2', makeNode('n2', stale)],
      ['n3', makeNode('n3', null)],
    ])
    const result = getFleetStatus(map)
    expect(result.healthy).toBe(1)
    expect(result.stale).toBe(1)
    expect(result.offline).toBe(1)
    expect(result.nodes).toHaveLength(3)
  })
})
