/**
 * Integration tests for event-journal.ts — HQ event log.
 * Uses a real temp SQLite DB. No network, no daemon.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, rmSync } from 'node:fs'

// ── Hoisted setup ─────────────────────────────────────────────────────────────

const { TEST_DIR } = vi.hoisted(() => {
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')
  const { mkdirSync } = require('node:fs')
  const dir = join(tmpdir(), `rex-event-journal-test-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  process.env['REX_DIR'] = dir
  return { TEST_DIR: dir }
})

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => {
  const { join } = require('node:path')
  const { mkdirSync } = require('node:fs')
  const dir = process.env['REX_DIR']!
  return {
    REX_DIR: dir,
    JOURNAL_DB_PATH: join(dir, 'event-journal.sqlite'),
    ensureRexDirs: () => mkdirSync(dir, { recursive: true }),
    DAEMON_LOG_PATH: join(dir, 'daemon.log'),
    MEMORY_DB_PATH: join(dir, 'rex.sqlite'),
    SYNC_QUEUE_DB_PATH: join(dir, 'sync-queue.sqlite'),
  }
})

import {
  appendEvent,
  ackEvent,
  getUnacked,
  getJournalStats,
  replayUnacked,
  purgeOldJournalEvents,
  type JournalEvent,
} from '../../src/event-journal.js'

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── appendEvent ───────────────────────────────────────────────────────────────

describe('appendEvent', () => {
  it('returns a positive ID on success', () => {
    const id = appendEvent('gateway_message', 'test', { text: 'hello' })
    expect(id).toBeGreaterThan(0)
  })

  it('returns incremental IDs for successive appends', () => {
    const id1 = appendEvent('daemon_action', 'daemon', { action: 'start' })
    const id2 = appendEvent('daemon_action', 'daemon', { action: 'stop' })
    expect(id2).toBeGreaterThan(id1)
  })

  it('accepts all journal event types', () => {
    const types = [
      'gateway_message', 'memory_observation', 'task_delegation',
      'sync_event', 'guard_trigger', 'daemon_action',
    ] as const
    for (const type of types) {
      expect(appendEvent(type, 'test', {})).toBeGreaterThan(0)
    }
  })

  it('serializes complex payload as JSON', () => {
    const payload = { nested: { key: 'val' }, arr: [1, 2] }
    const id = appendEvent('sync_event', 'test-sync', payload)
    const events = getUnacked(200).filter(e => e.id === id)
    expect(events.length).toBe(1)
    const parsed = JSON.parse(events[0].payload)
    expect(parsed.nested.key).toBe('val')
    expect(parsed.arr).toEqual([1, 2])
  })
})

// ── ackEvent ──────────────────────────────────────────────────────────────────

describe('ackEvent', () => {
  it('returns true when event is acked successfully', () => {
    const id = appendEvent('task_delegation', 'fleet', { job: 'run' })
    expect(ackEvent(id)).toBe(true)
  })

  it('returns false for unknown ID', () => {
    expect(ackEvent(999999)).toBe(false)
  })

  it('acked event is no longer in unacked list', () => {
    const id = appendEvent('guard_trigger', 'security', { guard: 'force-push' })
    ackEvent(id)
    const unacked = getUnacked().map(e => e.id)
    expect(unacked).not.toContain(id)
  })

  it('acked event remains in journal stats total', () => {
    const before = getJournalStats().total
    const id = appendEvent('memory_observation', 'ingest', { chunk: 1 })
    ackEvent(id)
    const after = getJournalStats().total
    expect(after).toBeGreaterThan(before)
  })
})

// ── getUnacked ────────────────────────────────────────────────────────────────

describe('getUnacked', () => {
  it('returns an array', () => {
    expect(Array.isArray(getUnacked())).toBe(true)
  })

  it('newly appended event appears in unacked', () => {
    const id = appendEvent('gateway_message', 'telegram', { msg: 'ping' })
    expect(getUnacked().some(e => e.id === id)).toBe(true)
  })

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) appendEvent('daemon_action', 'loop', { i })
    const limited = getUnacked(2)
    expect(limited.length).toBeLessThanOrEqual(2)
  })

  it('returned events have correct shape', () => {
    const id = appendEvent('sync_event', 'hub', { direction: 'push' })
    const events = getUnacked().filter(e => e.id === id)
    if (events.length > 0) {
      const e: JournalEvent = events[0]
      expect(e).toHaveProperty('id')
      expect(e).toHaveProperty('event_type')
      expect(e).toHaveProperty('source')
      expect(e).toHaveProperty('payload')
      expect(e).toHaveProperty('node_id')
      expect(e).toHaveProperty('created_at')
      expect(e.acked).toBe(false)
    }
  })
})

// ── getJournalStats ───────────────────────────────────────────────────────────

describe('getJournalStats', () => {
  it('returns stats object with required fields', () => {
    const stats = getJournalStats()
    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('unacked')
    expect(stats).toHaveProperty('byType')
    expect(stats).toHaveProperty('bySource')
    expect(stats).toHaveProperty('oldest')
    expect(stats).toHaveProperty('newest')
  })

  it('total >= unacked', () => {
    const stats = getJournalStats()
    expect(stats.total).toBeGreaterThanOrEqual(stats.unacked)
  })

  it('byType is an object with event types', () => {
    appendEvent('guard_trigger', 'guard', { rule: 'no-force-push' })
    const stats = getJournalStats()
    expect(typeof stats.byType).toBe('object')
    expect(stats.byType['guard_trigger']).toBeGreaterThan(0)
  })

  it('bySource reflects sources used', () => {
    appendEvent('daemon_action', 'unique-src-xyz', { x: 1 })
    const stats = getJournalStats()
    expect(stats.bySource['unique-src-xyz']).toBeGreaterThan(0)
  })

  it('oldest and newest are ISO strings or null', () => {
    const stats = getJournalStats()
    if (stats.oldest !== null) expect(() => new Date(stats.oldest!)).not.toThrow()
    if (stats.newest !== null) expect(() => new Date(stats.newest!)).not.toThrow()
  })
})

// ── replayUnacked ─────────────────────────────────────────────────────────────

describe('replayUnacked', () => {
  it('returns object with replayed and total fields', () => {
    appendEvent('gateway_message', 'relay', { msg: 'replay me' })
    const result = replayUnacked()
    expect(result).toHaveProperty('replayed')
    expect(result).toHaveProperty('total')
    expect(typeof result.replayed).toBe('number')
    expect(typeof result.total).toBe('number')
  })

  it('replayed === total (all events acked after replay)', () => {
    appendEvent('sync_event', 'replay-test', { batch: 1 })
    appendEvent('sync_event', 'replay-test', { batch: 2 })
    const result = replayUnacked()
    expect(result.replayed).toBe(result.total)
  })

  it('after replay, unacked list shrinks', () => {
    appendEvent('daemon_action', 'replay-shrink', { tick: 1 })
    const before = getUnacked().length
    replayUnacked()
    const after = getUnacked().length
    expect(after).toBeLessThanOrEqual(before)
  })
})

// ── purgeOldJournalEvents ─────────────────────────────────────────────────────

describe('purgeOldJournalEvents', () => {
  it('returns number of purged events', () => {
    const purged = purgeOldJournalEvents(365)
    expect(typeof purged).toBe('number')
    expect(purged).toBeGreaterThanOrEqual(0)
  })

  it('purges 0 events when cutoff is far in future (no old acked events)', () => {
    // All events in this test were just created — none are 1 year old
    const purged = purgeOldJournalEvents(365)
    expect(purged).toBe(0)
  })
})
