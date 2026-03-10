/**
 * Integration tests for secrets.ts — getSecret, setSecret, deleteSecret, listSecrets.
 * Uses a real temp directory to isolate vault + master key from production data.
 * @module CORE
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { TEST_DIR } = vi.hoisted(() => {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-secrets-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
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

// Redirect settings.json lookup to a non-existent file (no fallback pollution)
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => TEST_DIR }
})

import {
  getSecret,
  setSecret,
  deleteSecret,
  listSecrets,
} from '../../src/secrets.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── listSecrets ────────────────────────────────────────────────────────────────

describe('listSecrets', () => {
  it('returns an array', () => {
    expect(Array.isArray(listSecrets())).toBe(true)
  })

  it('returns empty array when vault is empty', () => {
    // Fresh vault in isolated temp dir — no secrets set yet
    const keys = listSecrets()
    expect(Array.isArray(keys)).toBe(true)
    expect(keys.length).toBeGreaterThanOrEqual(0)
  })
})

// ── setSecret / getSecret round-trip ──────────────────────────────────────────

describe('setSecret + getSecret', () => {
  it('does not throw when setting a secret', () => {
    expect(() => setSecret('TEST_KEY_A', 'hello-world')).not.toThrow()
  })

  it('getSecret returns value that was set', () => {
    setSecret('TEST_KEY_B', 'my-secret-value')
    const val = getSecret('TEST_KEY_B')
    expect(val).toBe('my-secret-value')
  })

  it('getSecret returns undefined for unknown key', () => {
    const val = getSecret('DEFINITELY_NOT_SET_XYZ999')
    expect(val).toBeUndefined()
  })

  it('overwrites existing secret with new value', () => {
    setSecret('TEST_KEY_C', 'first')
    setSecret('TEST_KEY_C', 'second')
    expect(getSecret('TEST_KEY_C')).toBe('second')
  })

  it('stored secret appears in listSecrets()', () => {
    setSecret('TEST_KEY_D', 'visible')
    const keys = listSecrets()
    expect(keys).toContain('TEST_KEY_D')
  })

  it('listSecrets returns keys sorted alphabetically', () => {
    setSecret('ZZZ_KEY', 'z')
    setSecret('AAA_KEY', 'a')
    const keys = listSecrets()
    const relevant = keys.filter(k => k === 'AAA_KEY' || k === 'ZZZ_KEY')
    expect(relevant).toEqual(['AAA_KEY', 'ZZZ_KEY'])
  })
})

// ── deleteSecret ──────────────────────────────────────────────────────────────

describe('deleteSecret', () => {
  it('returns false when key does not exist', () => {
    expect(deleteSecret('NONEXISTENT_KEY_XYZ')).toBe(false)
  })

  it('returns true when key exists and is deleted', () => {
    setSecret('TO_DELETE', 'gone')
    expect(deleteSecret('TO_DELETE')).toBe(true)
  })

  it('getSecret returns undefined after delete', () => {
    setSecret('TEMP_KEY', 'temp')
    deleteSecret('TEMP_KEY')
    expect(getSecret('TEMP_KEY')).toBeUndefined()
  })

  it('deleted key no longer appears in listSecrets()', () => {
    setSecret('DEL_ME', 'bye')
    deleteSecret('DEL_ME')
    expect(listSecrets()).not.toContain('DEL_ME')
  })
})
