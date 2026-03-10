/**
 * Unit tests for recategorize.ts — recategorize function.
 * SQLite, LLM, FS all mocked.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  MEMORY_DB_PATH: '/tmp/rex-recategorize-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(async () => 'qwen2.5:7b'),
}))

vi.mock('../../src/llm.js', () => ({
  llm: vi.fn(async () => 'code'),
}))

vi.mock('better-sqlite3', () => {
  class MockDB {
    prepare = vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 })),
      get: vi.fn(() => undefined),
    }))
    exec = vi.fn()
    close = vi.fn()
    pragma = vi.fn()
  }
  return { default: MockDB }
})

vi.mock('sqlite-vec', () => ({ load: vi.fn() }))

import { recategorize } from '../../src/recategorize.js'

// ── recategorize ──────────────────────────────────────────────────────────────

describe('recategorize', () => {
  it('does not throw with default options', async () => {
    await expect(recategorize()).resolves.not.toThrow()
  })

  it('does not throw with dryRun=true', async () => {
    await expect(recategorize({ dryRun: true })).resolves.not.toThrow()
  })

  it('does not throw with batch limit', async () => {
    await expect(recategorize({ batch: 10 })).resolves.not.toThrow()
  })

  it('resolves when DB returns empty memories list', async () => {
    const result = await recategorize()
    expect(result).toBeUndefined()
  })

  it('resolves with both batch and dryRun options', async () => {
    await expect(recategorize({ batch: 5, dryRun: true })).resolves.not.toThrow()
  })

  it('does not throw with batch=1', async () => {
    await expect(recategorize({ batch: 1 })).resolves.not.toThrow()
  })

  it('does not throw with batch=100', async () => {
    await expect(recategorize({ batch: 100 })).resolves.not.toThrow()
  })

  it('returns void (undefined)', async () => {
    const result = await recategorize({ dryRun: true })
    expect(result).toBeUndefined()
  })
})
