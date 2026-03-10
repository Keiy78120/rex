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

import { getSecret, listSecrets, setSecret, deleteSecret, rotateSecrets, importFromSettings } from '../../src/secrets.js'

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

// ── setSecret ─────────────────────────────────────────────────────────────────

describe('setSecret', () => {
  it('does not throw when vault is absent (creates new)', () => {
    expect(() => setSecret('MY_KEY', 'my-value')).not.toThrow()
  })
})

// ── deleteSecret ──────────────────────────────────────────────────────────────

describe('deleteSecret', () => {
  it('returns a boolean', () => {
    expect(typeof deleteSecret('ANY_KEY')).toBe('boolean')
  })

  it('returns false when vault does not exist', () => {
    // existsSync is mocked to return false
    expect(deleteSecret('NONEXISTENT')).toBe(false)
  })

  it('does not throw', () => {
    expect(() => deleteSecret('KEY')).not.toThrow()
  })
})

// ── rotateSecrets ─────────────────────────────────────────────────────────────

describe('rotateSecrets', () => {
  it('returns object with rotated and newKeyPath', () => {
    const result = rotateSecrets()
    expect(result).toHaveProperty('rotated')
    expect(result).toHaveProperty('newKeyPath')
  })

  it('rotated is a number', () => {
    expect(typeof rotateSecrets().rotated).toBe('number')
  })

  it('newKeyPath is a string', () => {
    expect(typeof rotateSecrets().newKeyPath).toBe('string')
  })

  it('does not throw', () => {
    expect(() => rotateSecrets()).not.toThrow()
  })
})

// ── importFromSettings ────────────────────────────────────────────────────────

describe('importFromSettings', () => {
  it('returns object with imported and skipped', () => {
    const result = importFromSettings()
    expect(result).toHaveProperty('imported')
    expect(result).toHaveProperty('skipped')
  })

  it('imported is a number', () => {
    expect(typeof importFromSettings().imported).toBe('number')
  })

  it('skipped is a number', () => {
    expect(typeof importFromSettings().skipped).toBe('number')
  })

  it('does not throw', () => {
    expect(() => importFromSettings()).not.toThrow()
  })
})
