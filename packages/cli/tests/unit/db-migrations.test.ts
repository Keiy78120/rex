/**
 * Unit tests for db-migrations.ts — getMigrationStatus and applyMigrations
 * behavior when no database file exists (no SQLite dependency needed).
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-migrations-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-migrations-test/config.json',
  MEMORY_DB_PATH: '/tmp/rex-migrations-test/nonexistent.sqlite',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false }
})

import {
  getMigrationStatus,
  applyMigrations,
  type MigrationStatus,
  type UpgradeResult,
} from '../../src/db-migrations.js'

// ── getMigrationStatus — when DB does not exist ───────────────────────────────

describe('getMigrationStatus (no db)', () => {
  it('returns an array', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    expect(Array.isArray(status)).toBe(true)
  })

  it('returns at least one migration entry', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    expect(status.length).toBeGreaterThanOrEqual(1)
  })

  it('each entry has version, description, applied fields', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    for (const s of status) {
      expect(s).toHaveProperty('version')
      expect(s).toHaveProperty('description')
      expect(s).toHaveProperty('applied')
    }
  })

  it('all migrations are unapplied when DB does not exist', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    expect(status.every(s => s.applied === false)).toBe(true)
  })

  it('version numbers are positive integers', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    for (const s of status) {
      expect(typeof s.version).toBe('number')
      expect(Number.isInteger(s.version)).toBe(true)
      expect(s.version).toBeGreaterThan(0)
    }
  })

  it('descriptions are non-empty strings', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    for (const s of status) {
      expect(typeof s.description).toBe('string')
      expect(s.description.length).toBeGreaterThan(0)
    }
  })

  it('versions are unique', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    const versions = status.map(s => s.version)
    const unique = new Set(versions)
    expect(unique.size).toBe(versions.length)
  })

  it('versions are in ascending order', () => {
    const status = getMigrationStatus('/tmp/nonexistent-test-db.sqlite')
    for (let i = 0; i < status.length - 1; i++) {
      expect(status[i].version).toBeLessThan(status[i + 1].version)
    }
  })
})

// ── applyMigrations — when DB does not exist ──────────────────────────────────

describe('applyMigrations (no db)', () => {
  it('does not throw when DB does not exist', () => {
    expect(() => applyMigrations({ dbPath: '/tmp/nonexistent-test-db.sqlite' })).not.toThrow()
  })

  it('returns UpgradeResult with applied, skipped, errors arrays', () => {
    const result = applyMigrations({ dbPath: '/tmp/nonexistent-test-db.sqlite' })
    expect(result).toHaveProperty('applied')
    expect(result).toHaveProperty('skipped')
    expect(result).toHaveProperty('errors')
    expect(Array.isArray(result.applied)).toBe(true)
    expect(Array.isArray(result.skipped)).toBe(true)
    expect(Array.isArray(result.errors)).toBe(true)
  })

  it('returns empty applied array when DB does not exist', () => {
    const result = applyMigrations({ dbPath: '/tmp/nonexistent-test-db.sqlite' })
    expect(result.applied).toHaveLength(0)
  })

  it('dryRun option does not apply migrations', () => {
    const result = applyMigrations({
      dbPath: '/tmp/nonexistent-test-db.sqlite',
      dryRun: true,
    })
    expect(result.applied).toHaveLength(0)
  })
})
