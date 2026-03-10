/**
 * Unit tests for sync-queue.ts — appendEvent, getUnacked, getQueueStats.
 * SQLite mocked.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-sync-queue-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  class MockDB {
    pragma = vi.fn()
    exec = vi.fn()
    prepare = vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      all: vi.fn(() => []),
      get: vi.fn(() => ({ cnt: 0, total: 0 })),
    }))
    close = vi.fn()
  }
  return { default: MockDB }
})

import { appendEvent, getUnacked, getQueueStats, getQueueHealth } from '../../src/sync-queue.js'

// ── appendEvent ───────────────────────────────────────────────────────────────

describe('appendEvent', () => {
  it('returns a number', () => {
    const id = appendEvent('notification', { message: 'test' })
    expect(typeof id).toBe('number')
  })

  it('returns positive id on success (mocked lastInsertRowid=1)', () => {
    const id = appendEvent('daemon.job', { job: 'ingest' })
    expect(id).toBe(1)
  })

  it('does not throw', () => {
    expect(() => appendEvent('gateway.message', { text: 'hello' })).not.toThrow()
  })
})

// ── getUnacked ────────────────────────────────────────────────────────────────

describe('getUnacked', () => {
  it('returns an array', () => {
    expect(Array.isArray(getUnacked())).toBe(true)
  })

  it('returns empty when no events', () => {
    expect(getUnacked()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => getUnacked()).not.toThrow()
  })
})

// ── getQueueStats ─────────────────────────────────────────────────────────────

describe('getQueueStats', () => {
  it('returns an object with total', () => {
    const stats = getQueueStats()
    expect(stats).toHaveProperty('total')
  })

  it('returns an object with unacked', () => {
    const stats = getQueueStats()
    expect(stats).toHaveProperty('unacked')
  })

  it('does not throw', () => {
    expect(() => getQueueStats()).not.toThrow()
  })
})

// ── getQueueHealth ────────────────────────────────────────────────────────────

describe('getQueueHealth', () => {
  it('returns an object with pendingCount field', () => {
    const health = getQueueHealth()
    expect(health).toHaveProperty('pendingCount')
  })

  it('pendingCount is a number', () => {
    const health = getQueueHealth()
    expect(typeof health.pendingCount).toBe('number')
  })

  it('does not throw', () => {
    expect(() => getQueueHealth()).not.toThrow()
  })
})
