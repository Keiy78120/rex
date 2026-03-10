/**
 * Unit tests for curious.ts — getRelevantSignals.
 * Tests the pure SQL-based signal lookup, mocked to avoid real DB access.
 * @module CURIOUS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-curious-test',
  MEMORY_DB_PATH: '/tmp/rex-curious-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-curious-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/signal-detector.js', () => ({
  detectSignals: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(),
      get: vi.fn(),
    })),
    exec: vi.fn(),
    close: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { getRelevantSignals } from '../../src/curious.js'

// ── getRelevantSignals ────────────────────────────────────────────────────────

describe('getRelevantSignals', () => {
  it('returns an array', () => {
    expect(Array.isArray(getRelevantSignals('some message'))).toBe(true)
  })

  it('returns empty array when MEMORY_DB_PATH does not exist', () => {
    // existsSync is mocked to return false
    const result = getRelevantSignals('check the deploy status')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty message', () => {
    const result = getRelevantSignals('')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for very short words only', () => {
    // Words ≤3 chars are filtered — "hi" "to" "do" → no keywords
    const result = getRelevantSignals('hi to do it ok')
    expect(result).toHaveLength(0)
  })

  it('returns empty array when message has only short words', () => {
    const result = getRelevantSignals('fix bug now try go run')
    expect(result).toHaveLength(0)
  })
})
