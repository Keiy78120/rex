/**
 * Unit tests for observer.ts — saveRunbook, findRunbooks, addObservation, recordHabit.
 * SQLite mocked.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-observer-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  class MockDB {
    pragma = vi.fn()
    exec = vi.fn()
    prepare = vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 42, changes: 1 })),
      all: vi.fn(() => []),
      get: vi.fn(() => undefined),
    }))
    close = vi.fn()
  }
  return { default: MockDB }
})

import {
  saveRunbook,
  findRunbooks,
  listRunbooks,
  addObservation,
  getObservationStats,
  recordHabit,
  getHabits,
} from '../../src/observer.js'

// ── saveRunbook ───────────────────────────────────────────────────────────────

describe('saveRunbook', () => {
  it('returns a number', () => {
    const id = saveRunbook('test-runbook', 'build fails', ['step1', 'step2'])
    expect(typeof id).toBe('number')
  })

  it('does not throw', () => {
    expect(() => saveRunbook('test', 'trigger', ['step'])).not.toThrow()
  })
})

// ── findRunbooks ──────────────────────────────────────────────────────────────

describe('findRunbooks', () => {
  it('returns an array', () => {
    expect(Array.isArray(findRunbooks('build error'))).toBe(true)
  })

  it('returns empty when no runbooks exist', () => {
    expect(findRunbooks('test context')).toHaveLength(0)
  })
})

// ── listRunbooks ──────────────────────────────────────────────────────────────

describe('listRunbooks', () => {
  it('returns an array', () => {
    expect(Array.isArray(listRunbooks())).toBe(true)
  })

  it('does not throw', () => {
    expect(() => listRunbooks()).not.toThrow()
  })
})

// ── addObservation ────────────────────────────────────────────────────────────

describe('addObservation', () => {
  it('returns a number', () => {
    const id = addObservation('session-1', 'my-project', 'decision', 'used pnpm')
    expect(typeof id).toBe('number')
  })

  it('does not throw', () => {
    expect(() => addObservation('s1', 'proj', 'blocker', 'content')).not.toThrow()
  })
})

// ── getObservationStats ───────────────────────────────────────────────────────

describe('getObservationStats', () => {
  it('returns object with byType', () => {
    const stats = getObservationStats()
    expect(stats).toHaveProperty('byType')
  })

  it('returns object with total', () => {
    const stats = getObservationStats()
    expect(stats).toHaveProperty('total')
  })

  it('does not throw', () => {
    expect(() => getObservationStats()).not.toThrow()
  })
})

// ── recordHabit / getHabits ───────────────────────────────────────────────────

describe('recordHabit', () => {
  it('returns a number', () => {
    expect(typeof recordHabit('use pnpm')).toBe('number')
  })

  it('does not throw', () => {
    expect(() => recordHabit('pattern')).not.toThrow()
  })
})

describe('getHabits', () => {
  it('returns an array', () => {
    expect(Array.isArray(getHabits())).toBe(true)
  })

  it('does not throw', () => {
    expect(() => getHabits()).not.toThrow()
  })
})
