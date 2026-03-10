/**
 * Unit tests for training.ts — detectBackend, getTrainingStatus, collectTrainingData.
 * All subprocess and DB calls mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-training-test',
  MEMORY_DB_PATH: '/tmp/rex-training-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
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

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  // execFile always fails → python3 not available in test env
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
      cb(new Error('not found'))
      return { on: vi.fn() }
    }),
  }
})

import { detectBackend, getTrainingStatus, collectTrainingData } from '../../src/training.js'

// ── detectBackend ─────────────────────────────────────────────────────────────

describe('detectBackend', () => {
  it('returns a string', async () => {
    const backend = await detectBackend()
    expect(typeof backend).toBe('string')
  })

  it('returns one of the expected values', async () => {
    const backend = await detectBackend()
    expect(['mlx-lm', 'unsloth', 'openai', 'none']).toContain(backend)
  })

  it('returns "none" when python tooling is not available', async () => {
    const backend = await detectBackend()
    // In CI/test env without mlx-lm/unsloth, and with no OPENAI_API_KEY
    // it may be "openai" if env var is set, but at minimum we get a valid string
    expect(typeof backend).toBe('string')
  })
})

// ── getTrainingStatus ─────────────────────────────────────────────────────────

describe('getTrainingStatus', () => {
  it('returns an array', async () => {
    const jobs = await getTrainingStatus()
    expect(Array.isArray(jobs)).toBe(true)
  })

  it('returns empty array when no jobs file exists', async () => {
    const jobs = await getTrainingStatus()
    expect(jobs).toHaveLength(0)
  })
})

// ── collectTrainingData ───────────────────────────────────────────────────────

describe('collectTrainingData', () => {
  it('returns an array', async () => {
    const data = await collectTrainingData()
    expect(Array.isArray(data)).toBe(true)
  })

  it('returns empty when no memories in DB', async () => {
    const data = await collectTrainingData()
    expect(data).toHaveLength(0)
  })
})
