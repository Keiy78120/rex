/**
 * Unit tests for event-journal.ts — appendEvent, getUnacked, getJournalStats.
 * SQLite mocked.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-journal-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  class MockDB {
    pragma = vi.fn()
    exec = vi.fn()
    prepare = vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      all: vi.fn(() => []),
      get: vi.fn(() => ({ cnt: 0, unacked: 0, oldest: null })),
    }))
    close = vi.fn()
  }
  return { default: MockDB }
})

import { appendEvent, getUnacked, getJournalStats, replayUnacked, ackEvent, purgeOldJournalEvents } from '../../src/event-journal.js'

// ── appendEvent ───────────────────────────────────────────────────────────────

describe('appendEvent', () => {
  it('returns a number', () => {
    const id = appendEvent('gateway.message', 'test', { text: 'hello' })
    expect(typeof id).toBe('number')
  })

  it('does not throw', () => {
    expect(() => appendEvent('daemon.job', 'daemon', { job: 'health' })).not.toThrow()
  })
})

// ── getUnacked ────────────────────────────────────────────────────────────────

describe('getUnacked', () => {
  it('returns an array', () => {
    expect(Array.isArray(getUnacked())).toBe(true)
  })

  it('returns empty when DB is empty', () => {
    expect(getUnacked()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => getUnacked()).not.toThrow()
  })
})

// ── getJournalStats ───────────────────────────────────────────────────────────

describe('getJournalStats', () => {
  it('returns an object', () => {
    expect(typeof getJournalStats()).toBe('object')
  })

  it('has total field', () => {
    expect(getJournalStats()).toHaveProperty('total')
  })

  it('does not throw', () => {
    expect(() => getJournalStats()).not.toThrow()
  })
})

// ── replayUnacked ─────────────────────────────────────────────────────────────

describe('replayUnacked', () => {
  it('returns object with replayed and total', () => {
    const result = replayUnacked()
    expect(result).toHaveProperty('replayed')
    expect(result).toHaveProperty('total')
  })

  it('does not throw', () => {
    expect(() => replayUnacked()).not.toThrow()
  })
})

// ── ackEvent ──────────────────────────────────────────────────────────────────

describe('ackEvent', () => {
  it('returns a boolean', () => {
    expect(typeof ackEvent(1)).toBe('boolean')
  })

  it('does not throw for any id', () => {
    expect(() => ackEvent(9999)).not.toThrow()
  })
})

// ── purgeOldJournalEvents ─────────────────────────────────────────────────────

describe('purgeOldJournalEvents', () => {
  it('returns a number', () => {
    expect(typeof purgeOldJournalEvents()).toBe('number')
  })

  it('accepts custom days param', () => {
    expect(() => purgeOldJournalEvents(7)).not.toThrow()
  })

  it('does not throw', () => {
    expect(() => purgeOldJournalEvents()).not.toThrow()
  })
})
