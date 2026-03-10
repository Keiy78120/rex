/**
 * Unit tests for backup.ts — listBackups, lastBackupAge, backupNow.
 * FS mocked — no real files.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-backup-test',
  MEMORY_DB_PATH: '/tmp/rex-backup-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    copyFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024, mtimeMs: Date.now() })),
    unlinkSync: vi.fn(),
  }
})

import { listBackups, lastBackupAge, rotateBackups } from '../../src/backup.js'

// ── listBackups ───────────────────────────────────────────────────────────────

describe('listBackups', () => {
  it('returns an array', () => {
    expect(Array.isArray(listBackups())).toBe(true)
  })

  it('returns empty array when no backups exist', () => {
    expect(listBackups()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => listBackups()).not.toThrow()
  })
})

// ── lastBackupAge ─────────────────────────────────────────────────────────────

describe('lastBackupAge', () => {
  it('returns null when no backups exist', () => {
    expect(lastBackupAge()).toBeNull()
  })

  it('does not throw', () => {
    expect(() => lastBackupAge()).not.toThrow()
  })
})

// ── rotateBackups ─────────────────────────────────────────────────────────────

describe('rotateBackups', () => {
  it('returns a number', () => {
    expect(typeof rotateBackups()).toBe('number')
  })

  it('returns 0 when no backups to delete', () => {
    expect(rotateBackups()).toBe(0)
  })
})
