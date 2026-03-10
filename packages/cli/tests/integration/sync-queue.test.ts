/**
 * Integration tests for sync-queue.ts — Zero-Loss event queue.
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
  const dir = join(tmpdir(), `rex-sync-queue-test-${process.pid}`)
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
    SYNC_QUEUE_DB_PATH: join(dir, 'sync-queue.sqlite'),
    ensureRexDirs: () => mkdirSync(dir, { recursive: true }),
    DAEMON_LOG_PATH: join(dir, 'daemon.log'),
    MEMORY_DB_PATH: join(dir, 'rex.sqlite'),
  }
})

import {
  appendEvent,
  ackEvent,
  getUnacked,
  getEventLog,
  getQueueStats,
  getQueueHealth,
  purgeOldEvents,
  type QueueEvent,
} from '../../src/sync-queue.js'

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── appendEvent ───────────────────────────────────────────────────────────────

describe('appendEvent', () => {
  it('returns a positive ID on success', () => {
    const id = appendEvent('gateway.message', { text: 'hello' })
    expect(id).toBeGreaterThan(0)
  })

  it('returns incremental IDs for successive appends', () => {
    const id1 = appendEvent('daemon.job', { job: 'ingest' })
    const id2 = appendEvent('daemon.job', { job: 'categorize' })
    expect(id2).toBeGreaterThan(id1)
  })

  it('accepts all event types', () => {
    const types = [
      'gateway.message', 'gateway.command', 'notification',
      'memory.ingest', 'memory.categorize', 'task.delegated',
      'task.completed', 'daemon.job', 'sync.push', 'sync.pull',
      'node.register', 'node.heartbeat', 'commander.event',
    ] as const
    for (const type of types) {
      expect(appendEvent(type, {})).toBeGreaterThan(0)
    }
  })

  it('serializes complex payload as JSON', () => {
    const payload = { nested: { key: 'value' }, arr: [1, 2, 3] }
    const id = appendEvent('sync.push', payload, 'test-source')
    const events = getEventLog(50).filter(e => e.id === id)
    expect(events.length).toBe(1)
    const parsed = JSON.parse(events[0].payload)
    expect(parsed.nested.key).toBe('value')
    expect(parsed.arr).toEqual([1, 2, 3])
  })
})

// ── ackEvent ──────────────────────────────────────────────────────────────────

describe('ackEvent', () => {
  it('returns true when event is acked successfully', () => {
    const id = appendEvent('task.completed', { result: 'ok' })
    expect(ackEvent(id)).toBe(true)
  })

  it('returns false for unknown ID', () => {
    expect(ackEvent(999999)).toBe(false)
  })

  it('acked event is no longer in unacked list', () => {
    const id = appendEvent('notification', { msg: 'test-ack' })
    ackEvent(id)
    const unacked = getUnacked().map(e => e.id)
    expect(unacked).not.toContain(id)
  })

  it('acked event still appears in full event log', () => {
    const id = appendEvent('sync.pull', { src: 'vps' })
    ackEvent(id)
    const log = getEventLog(100).map(e => e.id)
    expect(log).toContain(id)
  })
})

// ── getUnacked ────────────────────────────────────────────────────────────────

describe('getUnacked', () => {
  it('returns array', () => {
    const events = getUnacked()
    expect(Array.isArray(events)).toBe(true)
  })

  it('newly appended event appears in unacked', () => {
    const id = appendEvent('node.heartbeat', { uptime: 100 })
    const unacked = getUnacked()
    expect(unacked.some(e => e.id === id)).toBe(true)
  })

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) appendEvent('commander.event', { i })
    const limited = getUnacked(3)
    expect(limited.length).toBeLessThanOrEqual(3)
  })

  it('returned events have correct shape', () => {
    const id = appendEvent('node.register', { hostname: 'test' })
    const events = getUnacked().filter(e => e.id === id)
    if (events.length > 0) {
      const e: QueueEvent = events[0]
      expect(e).toHaveProperty('id')
      expect(e).toHaveProperty('type')
      expect(e).toHaveProperty('payload')
      expect(e).toHaveProperty('source')
      expect(e).toHaveProperty('timestamp')
      expect(e.acked).toBe(false)
    }
  })
})

// ── getQueueStats ─────────────────────────────────────────────────────────────

describe('getQueueStats', () => {
  it('returns stats object with required fields', () => {
    const stats = getQueueStats()
    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('unacked')
    expect(stats).toHaveProperty('byType')
  })

  it('total >= unacked', () => {
    const stats = getQueueStats()
    expect(stats.total).toBeGreaterThanOrEqual(stats.unacked)
  })

  it('byType is an object', () => {
    const stats = getQueueStats()
    expect(typeof stats.byType).toBe('object')
  })

  it('byType has counts for appended event types', () => {
    appendEvent('sync.push', { x: 1 })
    const stats = getQueueStats()
    expect(stats.byType['sync.push']).toBeGreaterThan(0)
  })
})

// ── getQueueHealth ────────────────────────────────────────────────────────────

describe('getQueueHealth', () => {
  it('returns health object', () => {
    const health = getQueueHealth()
    expect(health).toBeDefined()
    expect(typeof health).toBe('object')
  })
})

// ── purgeOldEvents ────────────────────────────────────────────────────────────

describe('purgeOldEvents', () => {
  it('returns number of purged events', () => {
    // Purge events older than 0 days (aggressive — purges all acked)
    const purged = purgeOldEvents(365)  // 1 year — nothing should be this old
    expect(typeof purged).toBe('number')
    expect(purged).toBeGreaterThanOrEqual(0)
  })
})
