/**
 * Unit tests for config.ts — loadConfig, saveConfig.
 * FS mocked — no real file reads.
 * @module CORE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => JSON.stringify({ llm: { routing: 'claude-only' } })),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
  }
})

vi.mock('../../src/paths.js', () => ({
  CONFIG_PATH: '/tmp/rex-config-test/config.json',
  REX_DIR: '/tmp/rex-config-test',
  ensureRexDirs: vi.fn(),
}))

import { loadConfig, saveConfig } from '../../src/config.js'

// ── loadConfig ────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns defaults when config file does not exist', () => {
    const config = loadConfig()
    expect(config).toHaveProperty('llm')
    expect(config).toHaveProperty('ingest')
    expect(config).toHaveProperty('daemon')
    expect(config).toHaveProperty('notifications')
  })

  it('returns object with llm.embedModel', () => {
    const config = loadConfig()
    expect(typeof config.llm.embedModel).toBe('string')
    expect(config.llm.embedModel.length).toBeGreaterThan(0)
  })

  it('returns object with valid routing value', () => {
    const config = loadConfig()
    expect(['ollama-first', 'claude-only', 'ollama-only']).toContain(config.llm.routing)
  })

  it('merges file values when config exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(true)
    const config = loadConfig()
    expect(config.llm.routing).toBe('claude-only')
    vi.mocked(existsSync).mockReturnValue(false)
  })

  it('returns defaults array for ingest.excludePaths', () => {
    const config = loadConfig()
    expect(Array.isArray(config.ingest.excludePaths)).toBe(true)
  })

  it('returns numeric healthCheckInterval', () => {
    const config = loadConfig()
    expect(typeof config.daemon.healthCheckInterval).toBe('number')
  })
})

// ── saveConfig ────────────────────────────────────────────────────────────────

describe('saveConfig', () => {
  it('does not throw', async () => {
    const config = loadConfig()
    expect(() => saveConfig(config)).not.toThrow()
  })

  it('calls writeFileSync', async () => {
    const { writeFileSync } = await import('node:fs')
    vi.mocked(writeFileSync).mockClear()
    const config = loadConfig()
    saveConfig(config)
    expect(vi.mocked(writeFileSync)).toHaveBeenCalled()
  })
})
