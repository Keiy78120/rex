/**
 * Unit tests for audit.ts — audit function.
 * All spawnSync calls mocked — no real CLI execution.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-audit-test',
  CONFIG_PATH: '/tmp/rex-audit-test/config.json',
  ensureRexDirs: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawnSync: vi.fn(() => ({
      status: 1,
      stdout: '',
      stderr: 'not found',
    })),
  }
})

import { audit } from '../../src/audit.js'

// ── audit ──────────────────────────────────────────────────────────────────────

describe('audit', () => {
  it('does not throw with default options', async () => {
    await expect(audit()).resolves.not.toThrow()
  })

  it('does not throw with json=true', async () => {
    await expect(audit({ json: true })).resolves.not.toThrow()
  })

  it('does not throw with fix=true', async () => {
    await expect(audit({ fix: true })).resolves.not.toThrow()
  })

  it('does not throw with quiet=true', async () => {
    await expect(audit({ quiet: true })).resolves.not.toThrow()
  })
})

// ── audit — additional option combinations ────────────────────────────────────

describe('audit — option combinations', () => {
  it('does not throw with all options combined', async () => {
    await expect(audit({ json: true, fix: true, quiet: true })).resolves.not.toThrow()
  })

  it('resolves to undefined', async () => {
    const result = await audit()
    expect(result).toBeUndefined()
  })

  it('does not throw when spawnSync returns status=0', async () => {
    const { spawnSync } = await import('node:child_process')
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 0, stdout: 'ok', stderr: '' } as any)
    await expect(audit()).resolves.not.toThrow()
  })

  it('does not throw when spawnSync returns null status', async () => {
    const { spawnSync } = await import('node:child_process')
    vi.mocked(spawnSync).mockReturnValueOnce({ status: null, stdout: '', stderr: 'killed' } as any)
    await expect(audit()).resolves.not.toThrow()
  })
})
