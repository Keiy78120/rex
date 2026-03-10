/**
 * Unit tests for node-mesh.ts — upsertFleetNode and getFleetStatus (pure functions).
 * Tests fleet node management without network/daemon dependencies.
 * @module FLEET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-node-mesh-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-node-mesh-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync, writeFileSync: vi.fn() }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

import {
  upsertFleetNode,
  getFleetStatus,
  type FleetNode,
} from '../../src/node-mesh.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<FleetNode> & { hostname?: string; platform?: string; ip?: string } = {}): FleetNode {
  return {
    id: 'test-node-1',
    hostname: 'test-mac',
    platform: 'darwin',
    ip: '192.168.1.100',
    capabilities: ['llm', 'embed'],
    score: 100,
    lastSeen: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── upsertFleetNode ───────────────────────────────────────────────────────────

describe('upsertFleetNode', () => {
  it('returns a FleetNode', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, { hostname: 'mac', platform: 'darwin', ip: '10.0.0.1' })
    expect(node).toHaveProperty('id')
    expect(node).toHaveProperty('hostname')
    expect(node).toHaveProperty('platform')
    expect(node).toHaveProperty('ip')
    expect(node).toHaveProperty('lastSeen')
    expect(node).toHaveProperty('registeredAt')
    expect(node).toHaveProperty('capabilities')
    expect(node).toHaveProperty('score')
  })

  it('stores node in the map', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, { hostname: 'mac', platform: 'darwin', ip: '10.0.0.1' })
    expect(map.has(node.id)).toBe(true)
  })

  it('uses provided id if given', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, { id: 'my-custom-id', hostname: 'mac', platform: 'darwin', ip: '10.0.0.1' })
    expect(node.id).toBe('my-custom-id')
  })

  it('generates id when not provided', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, { hostname: 'auto-mac', platform: 'darwin', ip: '10.0.0.2' })
    expect(node.id.length).toBeGreaterThan(0)
    expect(node.id).toContain('auto-mac')
  })

  it('updates existing node preserving registeredAt', () => {
    const map = new Map<string, FleetNode>()
    const node1 = upsertFleetNode(map, { id: 'update-test', hostname: 'mac', platform: 'darwin', ip: '10.0.0.1' })
    const originalRegisteredAt = node1.registeredAt
    const node2 = upsertFleetNode(map, { id: 'update-test', hostname: 'mac', platform: 'darwin', ip: '10.0.0.2' })
    expect(node2.registeredAt).toBe(originalRegisteredAt)
    expect(node2.ip).toBe('10.0.0.2')
  })

  it('sets lastSeen to recent ISO timestamp', () => {
    const map = new Map<string, FleetNode>()
    const before = Date.now()
    const node = upsertFleetNode(map, { hostname: 'ts-mac', platform: 'darwin', ip: '10.0.0.3' })
    const after = Date.now()
    const lastSeenMs = new Date(node.lastSeen!).getTime()
    expect(lastSeenMs).toBeGreaterThanOrEqual(before)
    expect(lastSeenMs).toBeLessThanOrEqual(after)
  })

  it('uses provided capabilities', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, {
      hostname: 'cap-mac', platform: 'darwin', ip: '10.0.0.4',
      capabilities: ['llm', 'gpu', 'embed'],
    })
    expect(node.capabilities).toContain('llm')
    expect(node.capabilities).toContain('gpu')
  })

  it('defaults capabilities to empty array when not provided', () => {
    const map = new Map<string, FleetNode>()
    const node = upsertFleetNode(map, { hostname: 'nocap-mac', platform: 'darwin', ip: '10.0.0.5' })
    expect(Array.isArray(node.capabilities)).toBe(true)
  })
})

// ── getFleetStatus ────────────────────────────────────────────────────────────

describe('getFleetStatus', () => {
  it('returns object with nodes, healthy, stale, offline', () => {
    const status = getFleetStatus(new Map())
    expect(status).toHaveProperty('nodes')
    expect(status).toHaveProperty('healthy')
    expect(status).toHaveProperty('stale')
    expect(status).toHaveProperty('offline')
  })

  it('empty map → all zeros', () => {
    const status = getFleetStatus(new Map())
    expect(status.nodes).toHaveLength(0)
    expect(status.healthy).toBe(0)
    expect(status.stale).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('recently-seen node is healthy', () => {
    const map = new Map<string, FleetNode>()
    map.set('n1', makeNode({ id: 'n1', lastSeen: new Date().toISOString() }))
    const status = getFleetStatus(map)
    expect(status.healthy).toBe(1)
    expect(status.stale).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('old node (> 30 min) is offline', () => {
    const map = new Map<string, FleetNode>()
    const oldDate = new Date(Date.now() - 35 * 60 * 1000).toISOString()
    map.set('n2', makeNode({ id: 'n2', lastSeen: oldDate }))
    const status = getFleetStatus(map)
    expect(status.offline).toBe(1)
    expect(status.healthy).toBe(0)
  })

  it('stale node (5-30 min ago)', () => {
    const map = new Map<string, FleetNode>()
    const staleDate = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    map.set('n3', makeNode({ id: 'n3', lastSeen: staleDate }))
    const status = getFleetStatus(map)
    expect(status.stale).toBe(1)
    expect(status.healthy).toBe(0)
    expect(status.offline).toBe(0)
  })

  it('mixed nodes are counted correctly', () => {
    const map = new Map<string, FleetNode>()
    map.set('h1', makeNode({ id: 'h1', lastSeen: new Date().toISOString() }))
    map.set('h2', makeNode({ id: 'h2', lastSeen: new Date().toISOString() }))
    map.set('s1', makeNode({ id: 's1', lastSeen: new Date(Date.now() - 10 * 60 * 1000).toISOString() }))
    map.set('o1', makeNode({ id: 'o1', lastSeen: new Date(Date.now() - 40 * 60 * 1000).toISOString() }))
    const status = getFleetStatus(map)
    expect(status.healthy).toBe(2)
    expect(status.stale).toBe(1)
    expect(status.offline).toBe(1)
    expect(status.nodes).toHaveLength(4)
  })

  it('each returned node has status field', () => {
    const map = new Map<string, FleetNode>()
    map.set('n4', makeNode({ id: 'n4', lastSeen: new Date().toISOString() }))
    const status = getFleetStatus(map)
    expect(status.nodes[0]).toHaveProperty('status')
    expect(['healthy', 'stale', 'offline']).toContain(status.nodes[0].status)
  })
})
