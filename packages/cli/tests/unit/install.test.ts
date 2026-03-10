/**
 * Unit tests for install.ts — install() in dry-run mode.
 * FS, subprocess, readline, and init/setup mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-install-test',
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

vi.mock('../../src/init.js', () => ({
  init: vi.fn(async () => {}),
  installDaemonAgent: vi.fn(async () => {}),
  installGatewayAgent: vi.fn(async () => {}),
  installApp: vi.fn(async () => {}),
}))

vi.mock('../../src/setup.js', () => ({
  setup: vi.fn(async () => {}),
}))

vi.mock('../../src/audit.js', () => ({
  audit: vi.fn(async () => {}),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  }
})

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (ans: string) => void) => cb('n')),
    close: vi.fn(),
    on: vi.fn(),
  })),
}))

global.fetch = vi.fn().mockRejectedValue(new Error('no network'))

import { install } from '../../src/install.js'

// ── install ───────────────────────────────────────────────────────────────────

describe('install', () => {
  it('does not throw with yes=true (non-interactive)', async () => {
    process.argv.push('--dry-run')
    await expect(install({ yes: true })).resolves.not.toThrow()
    process.argv.pop()
  }, 15000)

  it('does not throw with local-dev profile and yes=true', async () => {
    process.argv.push('--dry-run')
    await expect(install({ profile: 'local-dev', yes: true })).resolves.not.toThrow()
    process.argv.pop()
  }, 15000)

  it('does not throw with server profile and yes=true', async () => {
    process.argv.push('--dry-run')
    await expect(install({ profile: 'server', yes: true })).resolves.not.toThrow()
    process.argv.pop()
  }, 15000)

  it('resolves to undefined', async () => {
    process.argv.push('--dry-run')
    const result = await install({ yes: true })
    process.argv.pop()
    expect(result).toBeUndefined()
  }, 15000)

  it('is a function', () => {
    expect(typeof install).toBe('function')
  })
})
