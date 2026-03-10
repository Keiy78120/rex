/**
 * Unit tests for reflector.ts — archiveOld, getPromotedRules, suggestRunbooks.
 * SQLite mocked via better-sqlite3 mock to avoid disk I/O.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-reflector-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-reflector-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-reflector-test/config.json',
  SELF_IMPROVEMENT_DIR: '/tmp/rex-reflector-test/self-improvement',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}))

vi.mock('../../src/llm.js', () => ({
  llm: vi.fn(async () => '[]'),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(() => 'ollama'),
}))

// Mock better-sqlite3 to return empty observations and empty promoted_rules
vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 0 })),
      get: vi.fn(() => undefined),
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
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import {
  archiveOld,
  getPromotedRules,
  suggestRunbooks,
} from '../../src/reflector.js'

// ── archiveOld ────────────────────────────────────────────────────────────────

describe('archiveOld', () => {
  it('returns an ArchiveResult object', () => {
    const result = archiveOld()
    expect(result).toHaveProperty('compressed')
    expect(result).toHaveProperty('archived')
    expect(result).toHaveProperty('unchanged')
  })

  it('all counts are non-negative numbers', () => {
    const { compressed, archived, unchanged } = archiveOld()
    expect(typeof compressed).toBe('number')
    expect(typeof archived).toBe('number')
    expect(typeof unchanged).toBe('number')
    expect(compressed).toBeGreaterThanOrEqual(0)
    expect(archived).toBeGreaterThanOrEqual(0)
    expect(unchanged).toBeGreaterThanOrEqual(0)
  })

  it('with empty DB returns all zeros', () => {
    const { compressed, archived, unchanged } = archiveOld()
    expect(compressed).toBe(0)
    expect(archived).toBe(0)
    expect(unchanged).toBe(0)
  })

  it('does not throw with default args', () => {
    expect(() => archiveOld()).not.toThrow()
  })

  it('does not throw with explicit day ranges', () => {
    expect(() => archiveOld(7, 30, 90)).not.toThrow()
  })
})

// ── getPromotedRules ──────────────────────────────────────────────────────────

describe('getPromotedRules', () => {
  it('returns an array', () => {
    expect(Array.isArray(getPromotedRules())).toBe(true)
  })

  it('returns empty array when DB is empty', () => {
    expect(getPromotedRules()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => getPromotedRules()).not.toThrow()
  })
})

// ── suggestRunbooks ───────────────────────────────────────────────────────────

describe('suggestRunbooks', () => {
  it('returns an array', () => {
    expect(Array.isArray(suggestRunbooks('deploy to production'))).toBe(true)
  })

  it('returns empty array when no runbooks match', () => {
    expect(suggestRunbooks('some obscure context xyz')).toHaveLength(0)
  })

  it('does not throw for empty string', () => {
    expect(() => suggestRunbooks('')).not.toThrow()
  })
})
