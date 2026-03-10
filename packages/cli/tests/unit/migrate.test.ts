/**
 * Unit tests for migrate.ts — migrate function.
 * All FS calls mocked — no real filesystem changes.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-migrate-test',
  MEMORY_DIR: '/tmp/rex-migrate-test/memory',
  MEMORY_DB_PATH: '/tmp/rex-migrate-test/memory/memory.sqlite',
  PENDING_DIR: '/tmp/rex-migrate-test/memory/pending',
  BACKUPS_DIR: '/tmp/rex-migrate-test/memory/backups',
  LEGACY_MEMORY_DIR: '/tmp/.rex-memory',
  LEGACY_DB_PATH: '/tmp/.rex-memory/rex.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    symlinkSync: vi.fn(),
    renameSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    lstatSync: vi.fn(() => ({ isSymbolicLink: () => false, isDirectory: () => false })),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import { migrate } from '../../src/migrate.js'

// ── migrate ───────────────────────────────────────────────────────────────────

describe('migrate', () => {
  it('does not throw when no legacy files exist', async () => {
    await expect(migrate()).resolves.not.toThrow()
  })

  it('resolves without error on a clean system', async () => {
    // existsSync returns false (no legacy DB, no legacy pending/)
    const result = await migrate()
    expect(result).toBeUndefined()
  })

  it('can be called multiple times without error', async () => {
    await expect(migrate()).resolves.not.toThrow()
    await expect(migrate()).resolves.not.toThrow()
  })
})
