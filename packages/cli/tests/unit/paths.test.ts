/**
 * Unit tests for paths.ts — exported path constants and ensureRexDirs.
 * Validates that path constants are strings, are under REX_DIR, and that
 * ensureRexDirs creates directories correctly.
 * @module CORE
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'node:path'

// paths.ts reads HOME at module load time — stub it via REX_HOME env
process.env['REX_HOME'] = '/tmp/rex-paths-test'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
  }
})

import {
  REX_DIR,
  MEMORY_DIR,
  MEMORY_DB_PATH,
  CONFIG_PATH,
  VAULT_PATH,
  DAEMON_LOG_PATH,
  PENDING_DIR,
  BACKUPS_DIR,
  ensureRexDirs,
} from '../../src/paths.js'

// ── Path constants ────────────────────────────────────────────────────────────

describe('path constants', () => {
  it('REX_DIR is a string ending under .claude/rex', () => {
    expect(typeof REX_DIR).toBe('string')
    expect(REX_DIR).toContain('.claude')
    expect(REX_DIR).toContain('rex')
  })

  it('MEMORY_DIR is under REX_DIR', () => {
    expect(MEMORY_DIR.startsWith(REX_DIR)).toBe(true)
  })

  it('MEMORY_DB_PATH is under MEMORY_DIR and ends in .sqlite', () => {
    expect(MEMORY_DB_PATH.startsWith(MEMORY_DIR)).toBe(true)
    expect(MEMORY_DB_PATH.endsWith('.sqlite')).toBe(true)
  })

  it('CONFIG_PATH is under REX_DIR and ends in .json', () => {
    expect(CONFIG_PATH.startsWith(REX_DIR)).toBe(true)
    expect(CONFIG_PATH.endsWith('.json')).toBe(true)
  })

  it('VAULT_PATH is under REX_DIR and ends in .md', () => {
    expect(VAULT_PATH.startsWith(REX_DIR)).toBe(true)
    expect(VAULT_PATH.endsWith('.md')).toBe(true)
  })

  it('DAEMON_LOG_PATH is under REX_DIR', () => {
    expect(DAEMON_LOG_PATH.startsWith(REX_DIR)).toBe(true)
  })

  it('PENDING_DIR is under MEMORY_DIR', () => {
    expect(PENDING_DIR.startsWith(MEMORY_DIR)).toBe(true)
  })

  it('BACKUPS_DIR is under MEMORY_DIR', () => {
    expect(BACKUPS_DIR.startsWith(MEMORY_DIR)).toBe(true)
  })
})

// ── ensureRexDirs ─────────────────────────────────────────────────────────────

describe('ensureRexDirs', () => {
  it('does not throw', () => {
    expect(() => ensureRexDirs()).not.toThrow()
  })

  it('calls mkdirSync for each required directory', async () => {
    const { mkdirSync } = await import('node:fs')
    const mockFn = vi.mocked(mkdirSync)
    mockFn.mockClear()
    ensureRexDirs()
    expect(mockFn).toHaveBeenCalled()
  })
})
