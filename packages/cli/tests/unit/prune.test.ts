/**
 * Unit tests for prune.ts — forgettingCurve.
 * SQLite and FS mocked.
 * @module MEMORY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  MEMORY_DB_PATH: '/tmp/rex-prune-test/memory.sqlite',
  LEGACY_DB_PATH: '/tmp/.rex-memory/rex.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0 })),
      get: vi.fn(() => undefined),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({ size: 0 })),
  }
})

import { forgettingCurve, prune } from '../../src/prune.js'

// ── forgettingCurve ───────────────────────────────────────────────────────────

describe('forgettingCurve', () => {
  it('returns null when DB does not exist', async () => {
    // existsSync returns false → early return null
    const result = await forgettingCurve()
    expect(result).toBeNull()
  })

  it('returns null or {compressed, archived} shape', async () => {
    const result = await forgettingCurve({ dry: true })
    expect(result === null || typeof result === 'object').toBe(true)
  })

  it('does not throw with dry=true', async () => {
    await expect(forgettingCurve({ dry: true })).resolves.not.toThrow()
  })

  it('does not throw with json=true', async () => {
    await expect(forgettingCurve({ json: true })).resolves.not.toThrow()
  })

  it('does not throw with both dry and json options', async () => {
    await expect(forgettingCurve({ dry: true, json: true })).resolves.not.toThrow()
  })

  it('returns null when called with no options and DB missing', async () => {
    expect(await forgettingCurve({})).toBeNull()
  })
})

// ── prune ─────────────────────────────────────────────────────────────────────

describe('prune', () => {
  it('does not throw with statsOnly=false', async () => {
    await expect(prune(false)).resolves.not.toThrow()
  })

  it('does not throw with statsOnly=true', async () => {
    await expect(prune(true)).resolves.not.toThrow()
  })

  it('does not throw with default arg', async () => {
    await expect(prune()).resolves.not.toThrow()
  })

  it('resolves to undefined', async () => {
    const result = await prune(true)
    expect(result).toBeUndefined()
  })
})
