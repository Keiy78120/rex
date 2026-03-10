/**
 * Unit tests for semantic-cache.ts — hashPrompt, cacheGet, cacheSet, cacheStats.
 * SQLite mocked.
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-cache-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  class MockDB {
    pragma = vi.fn()
    exec = vi.fn()
    prepare = vi.fn(() => ({
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 1 })),
      all: vi.fn(() => []),
    }))
    close = vi.fn()
  }
  return { default: MockDB }
})

import { hashPrompt, cacheGet, cacheStats } from '../../src/semantic-cache.js'

// ── hashPrompt ────────────────────────────────────────────────────────────────

describe('hashPrompt', () => {
  it('returns a string', () => {
    expect(typeof hashPrompt('hello')).toBe('string')
  })

  it('returns 64-char hex for sha256', () => {
    expect(hashPrompt('hello')).toHaveLength(64)
  })

  it('is deterministic', () => {
    expect(hashPrompt('test prompt')).toBe(hashPrompt('test prompt'))
  })

  it('different inputs produce different hashes', () => {
    expect(hashPrompt('a')).not.toBe(hashPrompt('b'))
  })
})

// ── cacheGet ──────────────────────────────────────────────────────────────────

describe('cacheGet', () => {
  it('returns null for unknown hash (mocked DB returns undefined)', () => {
    const result = cacheGet('nonexistent-hash')
    expect(result).toBeNull()
  })

  it('does not throw', () => {
    expect(() => cacheGet('some-hash')).not.toThrow()
  })
})

// ── cacheStats ────────────────────────────────────────────────────────────────

describe('cacheStats', () => {
  it('returns an object with totalEntries field', () => {
    const stats = cacheStats()
    expect(stats).toHaveProperty('totalEntries')
  })

  it('totalEntries is a number', () => {
    const stats = cacheStats()
    expect(typeof stats.totalEntries).toBe('number')
  })

  it('does not throw', () => {
    expect(() => cacheStats()).not.toThrow()
  })
})
