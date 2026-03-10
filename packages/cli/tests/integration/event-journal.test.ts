/**
 * Integration tests for event-journal.ts — appendEvent, getUnacked, ackEvent,
 * replayUnacked, getJournalStats, purgeOldJournalEvents.
 * Uses a real SQLite DB in a temp directory.
 * @module HQ
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { rmSync } from 'node:fs'

const { TEST_DIR } = vi.hoisted(() => {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-journal-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
})

vi.mock('../../src/paths.js', () => {
  const { join } = require('node:path') as typeof import('node:path')
  return {
    REX_DIR: TEST_DIR,
    ensureRexDirs: () => {},
    MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
    CONFIG_PATH: join(TEST_DIR, 'config.json'),
    JOURNAL_DB_PATH: join(TEST_DIR, 'event-journal.sqlite'),
  }
})

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import {
  appendEvent,
  getUnacked,
  ackEvent,
  replayUnacked,
  getJournalStats,
  purgeOldJournalEvents,
} from '../../src/event-journal.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── appendEvent ───────────────────────────────────────────────────────────────

describe('appendEvent', () => {
  it('returns a positive integer ID', () => {
    const id = appendEvent('gateway_message', 'test', { text: 'hello' })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('each call returns an incrementing ID', () => {
    const id1 = appendEvent('memory_observation', 'test', { data: 1 })
    const id2 = appendEvent('memory_observation', 'test', { data: 2 })
    expect(id2).toBeGreaterThan(id1)
  })
})

// ── getUnacked ────────────────────────────────────────────────────────────────

describe('getUnacked', () => {
  it('returns an array', () => {
    expect(Array.isArray(getUnacked())).toBe(true)
  })

  it('newly appended events are unacked', () => {
    const before = getUnacked().length
    appendEvent('task_delegation', 'test-src', { task: 'x' })
    const after = getUnacked().length
    expect(after).toBeGreaterThan(before)
  })

  it('each event has required fields', () => {
    const events = getUnacked()
    for (const e of events) {
      expect(e).toHaveProperty('id')
      expect(e).toHaveProperty('event_type')
      expect(e).toHaveProperty('source')
      expect(e).toHaveProperty('payload')
      expect(e).toHaveProperty('node_id')
      expect(e).toHaveProperty('created_at')
      expect(e).toHaveProperty('acked')
    }
  })

  it('acked field is false for new events', () => {
    const events = getUnacked()
    for (const e of events) {
      expect(e.acked).toBe(false)
    }
  })
})

// ── ackEvent ──────────────────────────────────────────────────────────────────

describe('ackEvent', () => {
  it('returns true when event exists and is acked', () => {
    const id = appendEvent('gateway_message', 'ack-test', { msg: 'ack me' })
    expect(ackEvent(id)).toBe(true)
  })

  it('returns false when event does not exist', () => {
    expect(ackEvent(999999)).toBe(false)
  })

  it('acked event no longer appears in getUnacked()', () => {
    const id = appendEvent('gateway_message', 'ack-test-2', { msg: 'bye' })
    ackEvent(id)
    const unacked = getUnacked()
    expect(unacked.find(e => e.id === id)).toBeUndefined()
  })
})

// ── replayUnacked ─────────────────────────────────────────────────────────────

describe('replayUnacked', () => {
  it('returns { replayed, total } shape', () => {
    const result = replayUnacked()
    expect(result).toHaveProperty('replayed')
    expect(result).toHaveProperty('total')
  })

  it('replayed equals total after replay', () => {
    // Add new events before replay
    appendEvent('gateway_message', 'replay-src', { idx: 1 })
    appendEvent('gateway_message', 'replay-src', { idx: 2 })
    const result = replayUnacked()
    expect(result.replayed).toBe(result.total)
  })

  it('getUnacked() returns 0 after replayUnacked()', () => {
    replayUnacked() // ensure all acked
    expect(getUnacked().length).toBe(0)
  })
})

// ── getJournalStats ───────────────────────────────────────────────────────────

describe('getJournalStats', () => {
  it('returns stats with required fields', () => {
    const stats = getJournalStats()
    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('unacked')
    expect(stats).toHaveProperty('byType')
    expect(stats).toHaveProperty('bySource')
    expect(stats).toHaveProperty('oldest')
    expect(stats).toHaveProperty('newest')
  })

  it('total is a non-negative number', () => {
    const { total } = getJournalStats()
    expect(typeof total).toBe('number')
    expect(total).toBeGreaterThanOrEqual(0)
  })

  it('unacked is a non-negative number', () => {
    const { unacked } = getJournalStats()
    expect(typeof unacked).toBe('number')
    expect(unacked).toBeGreaterThanOrEqual(0)
  })

  it('byType is an object with event type counts', () => {
    appendEvent('gateway_message', 'stats-src', { x: 1 })
    const { byType } = getJournalStats()
    expect(typeof byType).toBe('object')
    expect(byType['gateway_message']).toBeGreaterThanOrEqual(1)
  })
})

// ── purgeOldJournalEvents ─────────────────────────────────────────────────────

describe('purgeOldJournalEvents', () => {
  it('returns a number', () => {
    const purged = purgeOldJournalEvents(0)
    expect(typeof purged).toBe('number')
    expect(purged).toBeGreaterThanOrEqual(0)
  })

  it('does not throw', () => {
    expect(() => purgeOldJournalEvents(30)).not.toThrow()
  })
})
