/**
 * Unit tests for hub.ts — generateHubToken, getCommanderStatus.
 * Network and FS mocked.
 * @module HUB
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-hub-test',
  PENDING_DIR: '/tmp/rex-hub-test/memory/pending',
  MEMORY_DB_PATH: '/tmp/rex-hub-test/memory/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/inventory.js', () => ({
  getInventoryCache: vi.fn(() => null),
}))

vi.mock('../../src/sync-queue.js', () => ({
  getEventLog: vi.fn(() => []),
  appendEvent: vi.fn(),
  getUnacked: vi.fn(() => []),
  ackEvent: vi.fn(),
  getQueueStats: vi.fn(() => ({ total: 0, unacked: 0, byType: {} })),
}))

vi.mock('../../src/node-mesh.js', () => ({
  getFleetStatus: vi.fn(async () => ({ nodes: [], timestamp: new Date().toISOString() })),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
    execFile: vi.fn(),
    execFileSync: vi.fn(() => ''),
  }
})

import { generateHubToken, getCommanderStatus } from '../../src/hub.js'

// ── generateHubToken ──────────────────────────────────────────────────────────

describe('generateHubToken', () => {
  it('returns a string', () => {
    expect(typeof generateHubToken()).toBe('string')
  })

  it('returns a 64-character hex string', () => {
    const token = generateHubToken()
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(token)).toBe(true)
  })

  it('generates unique tokens on each call', () => {
    const t1 = generateHubToken()
    const t2 = generateHubToken()
    expect(t1).not.toBe(t2)
  })
})

// ── getCommanderStatus ────────────────────────────────────────────────────────

describe('getCommanderStatus', () => {
  it('returns an object', async () => {
    const status = await getCommanderStatus()
    expect(typeof status).toBe('object')
    expect(status).not.toBeNull()
  })

  it('has running boolean', async () => {
    const status = await getCommanderStatus()
    expect(status).toHaveProperty('running')
    expect(typeof status.running).toBe('boolean')
  })

  it('has port number', async () => {
    const status = await getCommanderStatus()
    expect(status).toHaveProperty('port')
    expect(typeof status.port).toBe('number')
  })

  it('nodes is an array', async () => {
    const status = await getCommanderStatus()
    expect(status).toHaveProperty('nodes')
    expect(Array.isArray(status.nodes)).toBe(true)
  })
})
