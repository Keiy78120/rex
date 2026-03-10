/**
 * Unit tests for rex-mcp-server.ts — getMcpServerConfig.
 * child_process mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-mcp-test',
  MEMORY_DB_PATH: '/tmp/rex-mcp-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => '/usr/local/bin/rex'),
  }
})

vi.mock('better-sqlite3', () => {
  class MockDB {
    pragma = vi.fn()
    exec = vi.fn()
    prepare = vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      all: vi.fn(() => []),
      get: vi.fn(() => undefined),
    }))
    close = vi.fn()
  }
  return { default: MockDB }
})

vi.mock('sqlite-vec', () => ({ load: vi.fn() }))

import { getMcpServerConfig } from '../../src/rex-mcp-server.js'

// ── getMcpServerConfig ────────────────────────────────────────────────────────

describe('getMcpServerConfig', () => {
  it('returns an object', () => {
    expect(typeof getMcpServerConfig()).toBe('object')
  })

  it('has a "rex" key', () => {
    const config = getMcpServerConfig()
    expect(config).toHaveProperty('rex')
  })

  it('rex entry has type and command', () => {
    const config = getMcpServerConfig()
    const rex = config.rex as Record<string, unknown>
    expect(rex).toHaveProperty('type')
    expect(rex).toHaveProperty('command')
  })

  it('does not throw', () => {
    expect(() => getMcpServerConfig()).not.toThrow()
  })
})
