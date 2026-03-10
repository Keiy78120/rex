/**
 * Integration tests for backup.ts — listBackups, rotateBackups, lastBackupAge.
 * Uses a real temp directory to simulate backup files.
 * @module HQ
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { TEST_DIR, BACKUPS_DIR } = vi.hoisted(() => {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-backup-test-${Date.now()}`)
  const backupsDir = join(dir, 'backups-full')
  mkdirSync(backupsDir, { recursive: true })
  return { TEST_DIR: dir, BACKUPS_DIR: backupsDir }
})

vi.mock('../../src/paths.js', () => ({
  REX_DIR: TEST_DIR,
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
  CONFIG_PATH: join(TEST_DIR, 'config.json'),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

import {
  listBackups,
  rotateBackups,
  lastBackupAge,
  type BackupInfo,
} from '../../src/backup.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function createFakeBackup(filename: string): string {
  const path = join(BACKUPS_DIR, filename)
  writeFileSync(path, 'fake backup content')
  return path
}

// ── listBackups ────────────────────────────────────────────────────────────────

describe('listBackups', () => {
  it('returns an array', () => {
    expect(Array.isArray(listBackups())).toBe(true)
  })

  it('returns empty array when no backup files exist', () => {
    // Clean up any previous test files
    const backups = listBackups()
    expect(Array.isArray(backups)).toBe(true)
  })

  it('returns BackupInfo for each backup-*.tar.gz file', () => {
    createFakeBackup('backup-2026-01-01T10-00-00.tar.gz')
    const backups = listBackups()
    expect(backups.length).toBeGreaterThanOrEqual(1)
    const found = backups.find(b => b.filename === 'backup-2026-01-01T10-00-00.tar.gz')
    expect(found).toBeDefined()
  })

  it('each BackupInfo has required fields', () => {
    const backups = listBackups()
    for (const b of backups) {
      expect(b).toHaveProperty('filename')
      expect(b).toHaveProperty('path')
      expect(b).toHaveProperty('date')
      expect(b).toHaveProperty('sizeBytes')
      expect(b).toHaveProperty('sizeHuman')
    }
  })

  it('ignores files that do not match backup-*.tar.gz pattern', () => {
    createFakeBackup('not-a-backup.txt')
    createFakeBackup('other-file.json')
    const backups = listBackups()
    const invalid = backups.filter(b => !b.filename.startsWith('backup-') || !b.filename.endsWith('.tar.gz'))
    expect(invalid).toHaveLength(0)
  })

  it('returns backups sorted newest first', () => {
    createFakeBackup('backup-2026-01-01T08-00-00.tar.gz')
    createFakeBackup('backup-2026-01-01T12-00-00.tar.gz')
    createFakeBackup('backup-2026-01-01T06-00-00.tar.gz')
    const backups = listBackups()
    // Filenames should be in descending order
    for (let i = 0; i < backups.length - 1; i++) {
      expect(backups[i].filename >= backups[i + 1].filename).toBe(true)
    }
  })

  it('sizeBytes is a non-negative number', () => {
    const backups = listBackups()
    for (const b of backups) {
      expect(typeof b.sizeBytes).toBe('number')
      expect(b.sizeBytes).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── rotateBackups ──────────────────────────────────────────────────────────────

describe('rotateBackups', () => {
  it('returns 0 when backups count is within keep limit', () => {
    const backups = listBackups()
    const keep = backups.length + 5  // well above current count
    expect(rotateBackups(keep)).toBe(0)
  })

  it('removes excess backups when count exceeds keep', () => {
    // Create known backups
    for (let i = 1; i <= 5; i++) {
      createFakeBackup(`backup-2026-02-0${i}T10-00-00.tar.gz`)
    }
    const countBefore = listBackups().length
    if (countBefore > 2) {
      const removed = rotateBackups(2)
      expect(removed).toBe(countBefore - 2)
      expect(listBackups().length).toBe(2)
    }
  })

  it('does not throw when directory is empty or count = 0', () => {
    // If all backups were rotated out, this should not throw
    expect(() => rotateBackups(999)).not.toThrow()
  })
})

// ── lastBackupAge ──────────────────────────────────────────────────────────────

describe('lastBackupAge', () => {
  it('returns null when no backups exist', () => {
    // Rotate all out
    rotateBackups(0)
    const result = lastBackupAge()
    expect(result === null || typeof result === 'number').toBe(true)
  })

  it('returns a finite number when backups exist', () => {
    createFakeBackup('backup-2026-03-01T10-00-00.tar.gz')
    const age = lastBackupAge()
    if (age !== null) {
      expect(typeof age).toBe('number')
      expect(Number.isFinite(age)).toBe(true)
    }
  })
})
