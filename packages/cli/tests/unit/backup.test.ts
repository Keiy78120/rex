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
  CONFIG_PATH: '/tmp/rex-backup-test/config.json',
  ensureRexDirs: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

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

import { listBackups, lastBackupAge, rotateBackups, backupNow, restoreBackup } from '../../src/backup.js'

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

// ── backupNow ─────────────────────────────────────────────────────────────────

describe('backupNow', () => {
  it('returns null when no files to backup (existsSync = false)', () => {
    // existsSync is mocked to false → no candidates found → returns null
    expect(backupNow()).toBeNull()
  })

  it('does not throw', () => {
    expect(() => backupNow()).not.toThrow()
  })

  it('returns string or null', () => {
    const result = backupNow()
    expect(result === null || typeof result === 'string').toBe(true)
  })
})

// ── restoreBackup ─────────────────────────────────────────────────────────────

describe('restoreBackup', () => {
  it('returns false when backup file does not exist', () => {
    // existsSync returns false → backup not found
    expect(restoreBackup('/nonexistent/backup.tar.gz')).toBe(false)
  })

  it('returns false without confirm flag', () => {
    expect(restoreBackup('/some/backup.tar.gz', false)).toBe(false)
  })

  it('does not throw', () => {
    expect(() => restoreBackup('/bad/path.tar.gz')).not.toThrow()
  })
})
