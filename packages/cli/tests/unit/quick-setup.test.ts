/**
 * Unit tests for quick-setup.ts — quickSetup().
 * Network fetch, FS, and subprocess mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-quick-setup-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({
    llm: { embedModel: 'nomic-embed-text', classifyModel: 'auto', routing: 'ollama-first', claudeFallback: 'haiku' },
    ingest: { scanPaths: [], excludePaths: [], autoIngestInterval: 1800 },
    selfImprovement: { enabled: true, ruleThreshold: 3, reviewInterval: 86400 },
    daemon: { healthCheckInterval: 300, ingestInterval: 1800, maintenanceInterval: 3600, selfReviewInterval: 86400 },
    notifications: { silent: [], warn: [], daily: true, weekly: true },
  })),
  saveConfig: vi.fn(),
}))

vi.mock('../../src/free-tiers.js', () => ({
  FREE_TIER_PROVIDERS: [],
  getApiKey: vi.fn(() => null),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({})),
    writeFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  }
})

// Mock fetch to avoid network calls
global.fetch = vi.fn().mockRejectedValue(new Error('network unavailable'))

import { quickSetup } from '../../src/quick-setup.js'

// ── quickSetup ────────────────────────────────────────────────────────────────

describe('quickSetup', () => {
  it('does not throw when all detectors fail', async () => {
    await expect(quickSetup()).resolves.not.toThrow()
  })

  it('resolves (returns undefined)', async () => {
    const result = await quickSetup()
    expect(result).toBeUndefined()
  })

  it('resolves on second call', async () => {
    await expect(quickSetup()).resolves.not.toThrow()
  })

  it('is a function', () => {
    expect(typeof quickSetup).toBe('function')
  })

  it('resolves quickly without network', async () => {
    const start = Date.now()
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    await quickSetup()
    exitSpy.mockRestore()
    expect(Date.now() - start).toBeLessThan(10000)
  })
})
