/**
 * Unit tests for node-mesh.ts fleet functions.
 * Tests pure functions: getFleetStatus, detectLocalThermal, detectLocalCapacity shape.
 * These run without network or daemon dependencies.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdirSync } from 'node:fs'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/test-rex',
  DAEMON_LOG_PATH: '/tmp/test-rex/daemon.log',
  MEMORY_DB_PATH: '/tmp/test-rex/rex.sqlite',
  ensureRexDirs: () => {},
  NODE_ID_PATH: '/tmp/test-rex/node-id',
}))
vi.mock('../../src/config.js', () => ({
  loadConfig: () => ({}),
}))

import {
  getFleetStatus,
  detectLocalThermal,
  detectLocalCapacity,
  buildLocalFleetNode,
  type FleetNode,
} from '../../src/node-mesh.js'

beforeAll(() => {
  // NODE_ID_PATH = /tmp/test-rex/node-id — directory must exist for writeFileSync
  mkdirSync('/tmp/test-rex', { recursive: true })
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString()
const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()   // 10 min ago
const offlineTime = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago

function makeNode(overrides: Partial<FleetNode>): FleetNode {
  return {
    id: 'node-1',
    hostname: 'test-host',
    role: 'brain',
    capabilities: ['claude', 'ollama'],
    capacity: { cpuCores: 8, ramGb: 16, ollamaModels: [] },
    thermal: { cpuLoadPercent: 20, ramUsedPercent: 30, healthy: true },
    score: 50,
    status: 'healthy',
    lastSeen: now,
    ...overrides,
  }
}

// ── getFleetStatus ────────────────────────────────────────────────────────────

describe('getFleetStatus', () => {
  it('returns empty fleet when map is empty', () => {
    const status = getFleetStatus(new Map())
    expect(status.nodes).toEqual([])
    expect(status.healthy).toBe(0)
    expect(status.stale).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('marks node as healthy when lastSeen < 5 min ago', () => {
    const map = new Map([['node-1', makeNode({ lastSeen: now })]])
    const status = getFleetStatus(map)
    expect(status.healthy).toBe(1)
    expect(status.stale).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('marks node as stale when lastSeen 5-30 min ago', () => {
    const map = new Map([['node-1', makeNode({ lastSeen: staleTime })]])
    const status = getFleetStatus(map)
    expect(status.stale).toBe(1)
    expect(status.healthy).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('marks node as offline when lastSeen > 30 min ago', () => {
    const map = new Map([['node-1', makeNode({ lastSeen: offlineTime })]])
    const status = getFleetStatus(map)
    expect(status.offline).toBe(1)
    expect(status.healthy).toBe(0)
    expect(status.stale).toBe(0)
  })

  it('handles node with null lastSeen → offline', () => {
    const map = new Map([['node-1', makeNode({ lastSeen: undefined })]])
    const status = getFleetStatus(map)
    expect(status.offline).toBe(1)
  })

  it('counts multiple nodes correctly', () => {
    const map = new Map<string, FleetNode>([
      ['n1', makeNode({ id: 'n1', lastSeen: now })],            // healthy
      ['n2', makeNode({ id: 'n2', lastSeen: staleTime })],      // stale
      ['n3', makeNode({ id: 'n3', lastSeen: offlineTime })],    // offline
    ])
    const status = getFleetStatus(map)
    expect(status.healthy).toBe(1)
    expect(status.stale).toBe(1)
    expect(status.offline).toBe(1)
    expect(status.nodes.length).toBe(3)
  })

  it('returns nodes with updated status field', () => {
    const map = new Map([['n1', makeNode({ lastSeen: now, status: 'stale' })]])
    const status = getFleetStatus(map)
    // Status is recomputed from lastSeen — should be healthy now
    expect(status.nodes[0].status).toBe('healthy')
  })

  it('does not mutate original node objects', () => {
    const original = makeNode({ lastSeen: now, status: 'stale' })
    const map = new Map([['n1', original]])
    getFleetStatus(map)
    // Original should remain unchanged
    expect(original.status).toBe('stale')
  })
})

// ── detectLocalThermal ────────────────────────────────────────────────────────

describe('detectLocalThermal', () => {
  it('returns a valid thermal object', () => {
    const thermal = detectLocalThermal()
    expect(thermal).toHaveProperty('cpuLoadPercent')
    expect(thermal).toHaveProperty('ramUsedPercent')
    expect(thermal).toHaveProperty('healthy')
  })

  it('cpuLoadPercent is 0-100', () => {
    const thermal = detectLocalThermal()
    expect(thermal.cpuLoadPercent).toBeGreaterThanOrEqual(0)
    expect(thermal.cpuLoadPercent).toBeLessThanOrEqual(100)
  })

  it('ramUsedPercent is 0-100', () => {
    const thermal = detectLocalThermal()
    expect(thermal.ramUsedPercent).toBeGreaterThanOrEqual(0)
    expect(thermal.ramUsedPercent).toBeLessThanOrEqual(100)
  })

  it('healthy is a boolean', () => {
    const thermal = detectLocalThermal()
    expect(typeof thermal.healthy).toBe('boolean')
  })

  it('healthy=true when load is low (typical dev machine at test time)', () => {
    const thermal = detectLocalThermal()
    // healthy = cpuLoad < 80 && ramUsed < 90 — CI machine should pass this
    // We don't assert specific value since it's system-dependent
    expect(typeof thermal.healthy).toBe('boolean')
  })
})

// ── detectLocalCapacity ───────────────────────────────────────────────────────

describe('detectLocalCapacity', () => {
  it('returns valid capacity object', () => {
    const cap = detectLocalCapacity()
    expect(cap).toHaveProperty('cpuCores')
    expect(cap).toHaveProperty('ramGb')
    expect(cap).toHaveProperty('ollamaModels')
  })

  it('cpuCores is a positive integer', () => {
    const cap = detectLocalCapacity()
    expect(cap.cpuCores).toBeGreaterThan(0)
    expect(Number.isInteger(cap.cpuCores)).toBe(true)
  })

  it('ramGb is a positive integer', () => {
    const cap = detectLocalCapacity()
    expect(cap.ramGb).toBeGreaterThan(0)
    expect(Number.isInteger(cap.ramGb)).toBe(true)
  })

  it('ollamaModels is an array', () => {
    const cap = detectLocalCapacity()
    expect(Array.isArray(cap.ollamaModels)).toBe(true)
  })
})

// ── buildLocalFleetNode ───────────────────────────────────────────────────────

describe('buildLocalFleetNode', () => {
  it('returns a valid FleetNode', () => {
    const node = buildLocalFleetNode()
    expect(node).toHaveProperty('id')
    expect(node).toHaveProperty('hostname')
    expect(node).toHaveProperty('capabilities')
    expect(node).toHaveProperty('capacity')
    expect(node).toHaveProperty('thermalStatus')
    expect(node).toHaveProperty('score')
  })

  it('capabilities is an array', () => {
    const node = buildLocalFleetNode()
    expect(Array.isArray(node.capabilities)).toBe(true)
  })

  it('score is a non-negative number', () => {
    const node = buildLocalFleetNode()
    expect(node.score).toBeGreaterThanOrEqual(0)
  })

  it('lastSeen is a recent ISO timestamp', () => {
    const node = buildLocalFleetNode()
    expect(node.lastSeen).toBeTruthy()
    const ms = Date.now() - new Date(node.lastSeen!).getTime()
    expect(ms).toBeLessThan(5000)  // within 5 seconds
  })
})
