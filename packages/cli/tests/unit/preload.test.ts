/**
 * Unit tests for preload.ts — preload function.
 * SQLite and FS mocked — no real DB or filesystem access.
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-preload-test',
  MEMORY_DB_PATH: '/tmp/rex-preload-test/memory.sqlite',
  SNAPSHOTS_DIR: '/tmp/rex-preload-test/snapshots',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/projects.js', () => ({
  findProject: vi.fn(() => undefined),
}))

vi.mock('../../src/project-intent.js', () => ({
  detectIntent: vi.fn(async () => ({ intent: 'feature', confidence: 0.5, signals: [], actions: [], missing: {} })),
}))

vi.mock('../../src/context-loader.js', () => ({
  buildContextProfile: vi.fn(async () => ({ facts: [], rules: [], patterns: [] })),
  profileToPreloadLine: vi.fn(() => ''),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(),
      get: vi.fn(() => undefined),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('sqlite-vec', () => ({
  load: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    readdirSync: vi.fn(() => []),
    mkdirSync: vi.fn(),
  }
})

import { preload } from '../../src/preload.js'

// ── preload ───────────────────────────────────────────────────────────────────

describe('preload', () => {
  it('returns a string', async () => {
    const result = await preload('/tmp/test-project')
    expect(typeof result).toBe('string')
  })

  it('does not throw for an unknown project path', async () => {
    await expect(preload('/nonexistent/path')).resolves.not.toThrow()
  })

  it('returns a string even when DB does not exist', async () => {
    const result = await preload('/some/project')
    expect(typeof result).toBe('string')
  })
})
