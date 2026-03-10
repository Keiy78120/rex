/**
 * Unit tests for memory-check.ts — checkMemoryHealth.
 * Filesystem + SQLite mocked — no real DB access.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  MEMORY_DB_PATH: '/tmp/rex-memory-check-test/memory.sqlite',
  PENDING_DIR: '/tmp/rex-memory-check-test/memory/pending',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => ({ integrity_check: 'ok' })),
      run: vi.fn(),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('sqlite-vec', () => ({ load: vi.fn() }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
  }
})

import { checkMemoryHealth } from '../../src/memory-check.js'

// ── checkMemoryHealth ─────────────────────────────────────────────────────────

describe('checkMemoryHealth', () => {
  it('returns an object with required fields', () => {
    const result = checkMemoryHealth()
    expect(result).toHaveProperty('dbExists')
    expect(result).toHaveProperty('dbIntegrity')
    expect(result).toHaveProperty('stats')
    expect(result).toHaveProperty('pending')
    expect(result).toHaveProperty('duplicates')
  })

  it('dbExists is false when DB path does not exist', () => {
    // existsSync mocked to false
    expect(checkMemoryHealth().dbExists).toBe(false)
  })

  it('pending.count is 0 when pending dir does not exist', () => {
    expect(checkMemoryHealth().pending.count).toBe(0)
  })

  it('stats.total is 0 when DB does not exist', () => {
    expect(checkMemoryHealth().stats.total).toBe(0)
  })

  it('does not throw', () => {
    expect(() => checkMemoryHealth()).not.toThrow()
  })

  it('dbIntegrity message is set when DB not found', () => {
    const { dbIntegrity } = checkMemoryHealth()
    expect(typeof dbIntegrity.message).toBe('string')
  })
})
