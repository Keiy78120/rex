/**
 * Unit tests for guard-manager.ts — listGuards, listRegistry, enableGuard, disableGuard.
 * Tests guard file detection and enable/disable operations with mocked fs.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-guard-test',
  DAEMON_LOG_PATH: '/tmp/rex-guard-test/daemon.log',
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
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    renameSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 0, mtime: new Date() })),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { listGuards, listRegistry, enableGuard, disableGuard, addGuard, createGuard, getGuardLogs } from '../../src/guard-manager.js'

// ── listGuards ─────────────────────────────────────────────────────────────────

describe('listGuards', () => {
  it('returns an array', () => {
    expect(Array.isArray(listGuards())).toBe(true)
  })

  it('returns empty array when guards directory does not exist', () => {
    // existsSync is mocked to return false
    expect(listGuards()).toHaveLength(0)
  })
})

// ── listRegistry ───────────────────────────────────────────────────────────────

describe('listRegistry', () => {
  it('returns an array', () => {
    expect(Array.isArray(listRegistry())).toBe(true)
  })

  it('returns empty array when registry dir does not exist', () => {
    expect(listRegistry()).toHaveLength(0)
  })
})

// ── enableGuard ────────────────────────────────────────────────────────────────

describe('enableGuard', () => {
  it('returns false when guard does not exist', () => {
    // existsSync → false means no .disabled file found
    const result = enableGuard('nonexistent-guard')
    expect(result).toBe(false)
  })
})

// ── disableGuard ───────────────────────────────────────────────────────────────

describe('disableGuard', () => {
  it('returns false when guard file does not exist', () => {
    const result = disableGuard('nonexistent-guard')
    expect(result).toBe(false)
  })
})

// ── addGuard ───────────────────────────────────────────────────────────────────

describe('addGuard', () => {
  it('returns an object with ok and message', () => {
    const result = addGuard('some-guard')
    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('message')
  })

  it('ok is a boolean', () => {
    expect(typeof addGuard('test-guard').ok).toBe('boolean')
  })

  it('message is a string', () => {
    expect(typeof addGuard('test-guard').message).toBe('string')
  })

  it('returns ok=false when guard file not found in registry', () => {
    // existsSync → false means guard not in registry
    expect(addGuard('nonexistent-guard').ok).toBe(false)
  })
})

// ── createGuard ────────────────────────────────────────────────────────────────

describe('createGuard', () => {
  it('returns an object with ok and message', () => {
    const result = createGuard('new-guard')
    expect(result).toHaveProperty('ok')
    expect(result).toHaveProperty('message')
  })

  it('ok is a boolean', () => {
    expect(typeof createGuard('new-guard').ok).toBe('boolean')
  })

  it('does not throw', () => {
    expect(() => createGuard('test-guard')).not.toThrow()
  })
})

// ── getGuardLogs ───────────────────────────────────────────────────────────────

describe('getGuardLogs', () => {
  it('returns an array', () => {
    expect(Array.isArray(getGuardLogs())).toBe(true)
  })

  it('accepts name filter without throwing', () => {
    expect(() => getGuardLogs('force-push-guard')).not.toThrow()
  })

  it('accepts limit param', () => {
    expect(() => getGuardLogs(undefined, 5)).not.toThrow()
  })

  it('does not throw', () => {
    expect(() => getGuardLogs()).not.toThrow()
  })
})
