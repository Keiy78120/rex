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

import { hashPrompt, cacheGet, cacheSet, cacheStats, cacheClean } from '../../src/semantic-cache.js'

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

  it('returns object with hitRate field', () => {
    expect(cacheStats()).toHaveProperty('hitRate')
  })

  it('returns object with totalTokensSaved field', () => {
    expect(cacheStats()).toHaveProperty('totalTokensSaved')
  })
})

// ── cacheSet ──────────────────────────────────────────────────────────────────

describe('cacheSet', () => {
  it('does not throw', () => {
    expect(() => cacheSet('hash-abc', 'some-response', 'ollama', 'test-prompt', 100, 50)).not.toThrow()
  })

  it('accepts minimal args', () => {
    expect(() => cacheSet(hashPrompt('hello'), 'response', 'claude', 'hello', 10, 5)).not.toThrow()
  })
})

// ── cacheClean ────────────────────────────────────────────────────────────────

describe('cacheClean', () => {
  it('returns a number', () => {
    expect(typeof cacheClean()).toBe('number')
  })

  it('does not throw', () => {
    expect(() => cacheClean()).not.toThrow()
  })

  it('accepts custom maxAge days param', () => {
    expect(() => cacheClean(7)).not.toThrow()
  })
})
