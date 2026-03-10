/**
 * Unit tests for node.ts — getNodeId.
 * Filesystem and crypto mocked.
 * @module FLEET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-node-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: vi.fn() }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    hostname: () => 'test-host',
    platform: () => 'darwin',
    networkInterfaces: () => ({}),
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
  }
})

import { getNodeId } from '../../src/node.js'

// ── getNodeId ─────────────────────────────────────────────────────────────────

describe('getNodeId', () => {
  it('returns a string', () => {
    expect(typeof getNodeId()).toBe('string')
  })

  it('returns a non-empty string', () => {
    expect(getNodeId().length).toBeGreaterThan(0)
  })

  it('looks like a UUID', () => {
    const id = getNodeId()
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('does not throw', () => {
    expect(() => getNodeId()).not.toThrow()
  })
})

// ── getNodeId — additional tests ──────────────────────────────────────────────

describe('getNodeId — consistency', () => {
  it('returns same id on repeated calls when file exists (idempotent)', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const fakeId = '12345678-1234-1234-1234-123456789abc'
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValueOnce(fakeId)
    const id1 = getNodeId()
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValueOnce(fakeId)
    const id2 = getNodeId()
    expect(id1).toBe(fakeId)
    expect(id2).toBe(fakeId)
  })

  it('contains only valid UUID chars (hex + hyphens)', () => {
    const id = getNodeId()
    expect(id).toMatch(/^[0-9a-f-]+$/)
  })

  it('has 4 hyphens (UUID structure)', () => {
    const id = getNodeId()
    const hyphens = (id.match(/-/g) || []).length
    expect(hyphens).toBe(4)
  })

  it('36 characters total (standard UUID length)', () => {
    expect(getNodeId().length).toBe(36)
  })
})
