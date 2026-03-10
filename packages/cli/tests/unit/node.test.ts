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
