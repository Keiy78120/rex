/**
 * Unit tests for secrets.ts — getSecret, listSecrets.
 * FS and crypto mocked (no real vault files).
 * @module CORE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-secrets-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ env: {} })),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
  }
})

import { getSecret, listSecrets } from '../../src/secrets.js'

// ── getSecret ─────────────────────────────────────────────────────────────────

describe('getSecret', () => {
  it('returns undefined when vault does not exist', () => {
    const result = getSecret('SOME_KEY')
    expect(result).toBeUndefined()
  })

  it('does not throw when vault is absent', () => {
    expect(() => getSecret('NONEXISTENT_KEY')).not.toThrow()
  })

  it('returns string or undefined', () => {
    const result = getSecret('TEST')
    expect(result === undefined || typeof result === 'string').toBe(true)
  })
})

// ── listSecrets ───────────────────────────────────────────────────────────────

describe('listSecrets', () => {
  it('returns an array', () => {
    expect(Array.isArray(listSecrets())).toBe(true)
  })

  it('returns empty when vault does not exist', () => {
    expect(listSecrets()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => listSecrets()).not.toThrow()
  })
})
