/**
 * Unit tests for setup-wizard.ts — isFirstRun.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-setup-wizard-test',
  CONFIG_PATH: '/tmp/rex-setup-wizard-test/config.json',
  MEMORY_DIR: '/tmp/rex-setup-wizard-test/memory',
  MEMORY_DB_PATH: '/tmp/rex-setup-wizard-test/memory/memory.sqlite',
  VAULT_PATH: '/tmp/rex-setup-wizard-test/vault.md',
  DAEMON_LOG_PATH: '/tmp/rex-setup-wizard-test/daemon.log',
  PENDING_DIR: '/tmp/rex-setup-wizard-test/memory/pending',
  BACKUPS_DIR: '/tmp/rex-setup-wizard-test/memory/backups',
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
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), execFile: vi.fn() }
})

import { isFirstRun } from '../../src/setup-wizard.js'

// ── isFirstRun ─────────────────────────────────────────────────────────────────

describe('isFirstRun', () => {
  it('returns true when config file does not exist (existsSync = false)', () => {
    expect(isFirstRun()).toBe(true)
  })

  it('returns false when config file exists (existsSync = true)', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(true)
    expect(isFirstRun()).toBe(false)
  })

  it('returns a boolean', () => {
    expect(typeof isFirstRun()).toBe('boolean')
  })

  it('does not throw when called repeatedly', () => {
    expect(() => {
      isFirstRun()
      isFirstRun()
      isFirstRun()
    }).not.toThrow()
  })

  it('returns true by default (file missing)', () => {
    // existsSync default mock is () => false
    const result = isFirstRun()
    expect(result).toBe(true)
  })
})
