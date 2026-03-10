/**
 * Unit tests for sync.ts — getSyncStatus, getSyncStatusData.
 * Dependencies mocked — no real network or disk access.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-sync-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/sync-queue.js', () => ({
  getUnacked: vi.fn(() => []),
  appendEvent: vi.fn(() => 1),
  ackEvent: vi.fn(() => true),
  getQueueStats: vi.fn(() => ({ total: 0, unacked: 0, byType: {} })),
  getQueueHealth: vi.fn(() => ({ status: 'ok', unackedCount: 0, totalCount: 0, pendingCount: 0 })),
}))

vi.mock('../../src/node.js', () => ({
  discoverHub: vi.fn(async () => null),
  getNodeId: vi.fn(() => 'test-node'),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => JSON.stringify({
      lastPushAt: null,
      lastPullAt: null,
      lastPushCount: 0,
      lastPullCount: 0,
      consecutiveFailures: 0,
      lastHubCheckAt: null,
      hubAvailable: false,
    })),
    writeFileSync: vi.fn(),
  }
})

import { getSyncStatus, getSyncStatusData } from '../../src/sync.js'

// ── getSyncStatus ─────────────────────────────────────────────────────────────

describe('getSyncStatus', () => {
  it('returns an object with required fields', () => {
    const status = getSyncStatus()
    expect(status).toHaveProperty('hubAvailable')
    expect(status).toHaveProperty('pendingCount')
    expect(status).toHaveProperty('lastSyncAt')
    expect(status).toHaveProperty('consecutiveFailures')
  })

  it('hubAvailable is a boolean', () => {
    expect(typeof getSyncStatus().hubAvailable).toBe('boolean')
  })

  it('pendingCount is a non-negative number', () => {
    expect(getSyncStatus().pendingCount).toBeGreaterThanOrEqual(0)
  })

  it('lastSyncAt is null when never synced', () => {
    expect(getSyncStatus().lastSyncAt).toBeNull()
  })

  it('consecutiveFailures is 0 initially', () => {
    expect(getSyncStatus().consecutiveFailures).toBe(0)
  })
})

// ── getSyncStatusData ─────────────────────────────────────────────────────────

describe('getSyncStatusData', () => {
  it('returns an object with push/pull/pending info', () => {
    const data = getSyncStatusData()
    expect(data).toHaveProperty('lastPush')
    expect(data).toHaveProperty('lastPull')
    expect(data).toHaveProperty('pendingPush')
    expect(data).toHaveProperty('autoSync')
    expect(data).toHaveProperty('consecutiveFailures')
  })

  it('autoSync is a boolean', () => {
    expect(typeof getSyncStatusData().autoSync).toBe('boolean')
  })

  it('does not throw', () => {
    expect(() => getSyncStatusData()).not.toThrow()
  })
})
