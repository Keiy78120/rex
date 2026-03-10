/**
 * Unit tests for client-factory.ts — listClients, getClient.
 * All filesystem ops mocked — no real disk access.
 * @module CLIENT
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-client-factory-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), execFile: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

import { listClients, getClient } from '../../src/client-factory.js'

// ── listClients ───────────────────────────────────────────────────────────────

describe('listClients', () => {
  it('returns an array', () => {
    expect(Array.isArray(listClients())).toBe(true)
  })

  it('returns empty array when index does not exist', () => {
    // existsSync mocked to false → loadIndex returns []
    expect(listClients()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => listClients()).not.toThrow()
  })
})

// ── getClient ─────────────────────────────────────────────────────────────────

describe('getClient', () => {
  it('returns null for non-existent client id', () => {
    expect(getClient('nonexistent-client-id')).toBeNull()
  })

  it('does not throw', () => {
    expect(() => getClient('any-id')).not.toThrow()
  })
})
