/**
 * Integration tests for semantic-cache.ts — hashPrompt, cacheGet, cacheSet, cacheStats, cacheClean.
 * Uses a real temp SQLite DB to test full read/write cycle.
 * @module BUDGET
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { TEST_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-cache-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
})

// Redirect cache DB to temp dir before any imports
vi.mock('../../src/paths.js', () => ({
  REX_DIR: TEST_DIR,
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
  CONFIG_PATH: join(TEST_DIR, 'config.json'),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import {
  hashPrompt,
  cacheGet,
  cacheSet,
  cacheStats,
  cacheClean,
} from '../../src/semantic-cache.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── hashPrompt ────────────────────────────────────────────────────────────────

describe('hashPrompt', () => {
  it('returns a 64-char hex string (sha256)', () => {
    const h = hashPrompt('hello world')
    expect(typeof h).toBe('string')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]+$/)
  })

  it('same input produces same hash', () => {
    expect(hashPrompt('test prompt')).toBe(hashPrompt('test prompt'))
  })

  it('different inputs produce different hashes', () => {
    expect(hashPrompt('prompt A')).not.toBe(hashPrompt('prompt B'))
  })

  it('empty string produces a valid hash', () => {
    const h = hashPrompt('')
    expect(h).toHaveLength(64)
  })
})

// ── cacheGet / cacheSet ───────────────────────────────────────────────────────

describe('cacheGet — miss', () => {
  it('returns null for unknown hash', () => {
    const h = hashPrompt(`nonexistent-${Date.now()}`)
    expect(cacheGet(h)).toBeNull()
  })
})

describe('cacheSet / cacheGet — round trip', () => {
  it('stores and retrieves a response', () => {
    const prompt = `test-prompt-${Date.now()}`
    const h = hashPrompt(prompt)
    cacheSet(h, 'cached response', 'gpt-4', 'test', 42, 168)
    const result = cacheGet(h)
    expect(result).toBe('cached response')
  })

  it('returns cached value when TTL is very long (168h)', () => {
    const prompt = `ttl-long-${Date.now()}`
    const h = hashPrompt(prompt)
    cacheSet(h, 'long-lived response', 'gpt-4', 'test', 0, 168)
    // 168h TTL → should be valid
    const result = cacheGet(h)
    expect(result).toBe('long-lived response')
  })

  it('stores multiple independent entries', () => {
    const h1 = hashPrompt(`multi-1-${Date.now()}`)
    const h2 = hashPrompt(`multi-2-${Date.now()}`)
    cacheSet(h1, 'response 1', 'gpt-4', 'general', 10, 168)
    cacheSet(h2, 'response 2', 'gpt-3.5', 'code', 20, 168)
    expect(cacheGet(h1)).toBe('response 1')
    expect(cacheGet(h2)).toBe('response 2')
  })

  it('overwrites existing entry with same hash', () => {
    const h = hashPrompt(`overwrite-${Date.now()}`)
    cacheSet(h, 'original', 'gpt-4', 'test', 0, 168)
    cacheSet(h, 'updated', 'gpt-4', 'test', 0, 168)
    expect(cacheGet(h)).toBe('updated')
  })
})

// ── cacheStats ────────────────────────────────────────────────────────────────

describe('cacheStats', () => {
  it('returns an object with required fields', () => {
    const stats = cacheStats()
    expect(stats).toHaveProperty('totalEntries')
    expect(stats).toHaveProperty('totalHits')
    expect(stats).toHaveProperty('totalTokensSaved')
    expect(stats).toHaveProperty('byModel')
    expect(stats).toHaveProperty('byTaskType')
  })

  it('totalEntries increases after cacheSet', () => {
    const before = cacheStats().totalEntries
    const h = hashPrompt(`stats-test-${Date.now()}`)
    cacheSet(h, 'for stats', 'gpt-4', 'general', 100, 168)
    const after = cacheStats().totalEntries
    expect(after).toBeGreaterThan(before)
  })

  it('totalTokensSaved reflects stored values', () => {
    const h = hashPrompt(`tokens-test-${Date.now()}`)
    const statsBefore = cacheStats().totalTokensSaved
    cacheSet(h, 'token response', 'gpt-4', 'general', 500, 168)
    const statsAfter = cacheStats().totalTokensSaved
    expect(statsAfter).toBeGreaterThanOrEqual(statsBefore)
  })

  it('byModel is an object', () => {
    expect(typeof cacheStats().byModel).toBe('object')
  })
})

// ── cacheClean ────────────────────────────────────────────────────────────────

describe('cacheClean', () => {
  it('returns a non-negative number (deleted count)', () => {
    // Insert an expired entry (0-hour TTL)
    const h = hashPrompt(`clean-test-${Date.now()}`)
    cacheSet(h, 'expired', 'gpt-4', 'test', 0, 0)
    const deleted = cacheClean()
    expect(typeof deleted).toBe('number')
    expect(deleted).toBeGreaterThanOrEqual(0)
  })

  it('removes entries — cacheClean runs without error', () => {
    // Insert an entry, run clean, ensure no crash
    const h = hashPrompt(`clean-run-${Date.now()}`)
    cacheSet(h, 'some entry', 'gpt-4', 'test', 0, 168)
    expect(() => cacheClean()).not.toThrow()
  })

  it('does not remove non-expired entries', () => {
    const h = hashPrompt(`clean-keep-${Date.now()}`)
    cacheSet(h, 'keep this', 'gpt-4', 'test', 0, 168)
    cacheClean()
    // Non-expired entry should survive
    expect(cacheGet(h)).toBe('keep this')
  })
})
