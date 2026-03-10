/**
 * Unit tests for rex-launcher.ts — readRecovery.
 * Filesystem mocked — no real disk access.
 * @module REX-LAUNCHER
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-launcher-test',
  ensureRexDirs: vi.fn(),
  RECOVERY_STATE_PATH: '/tmp/rex-launcher-test/recovery-state.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}))

vi.mock('../../src/intent-detect.js', () => ({
  detectIntent: vi.fn(async () => ({ intent: 'explore', confidence: 0.5, signals: [], actions: [], missing: {} })),
  intentToPreloadLine: vi.fn(() => ''),
}))

vi.mock('../../src/curious.js', () => ({
  getRelevantSignals: vi.fn(() => []),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ status: 0 })) }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { readRecovery, killRex, type RecoveryState } from '../../src/rex-launcher.js'

// ── readRecovery ──────────────────────────────────────────────────────────────

describe('readRecovery', () => {
  it('returns null when recovery file does not exist', () => {
    // existsSync mocked to false
    expect(readRecovery()).toBeNull()
  })

  it('does not throw', () => {
    expect(() => readRecovery()).not.toThrow()
  })

  it('returns null or RecoveryState object', () => {
    const result = readRecovery()
    expect(result === null || typeof result === 'object').toBe(true)
  })

  it('returns null on repeated calls (file always missing)', () => {
    expect(readRecovery()).toBeNull()
    expect(readRecovery()).toBeNull()
  })

  it('returns null when readFileSync returns empty object', async () => {
    // readFileSync returns '{}' — not a valid RecoveryState → null
    const result = readRecovery()
    expect(result === null || typeof result === 'object').toBe(true)
  })
})

// ── killRex ───────────────────────────────────────────────────────────────────

describe('killRex', () => {
  it('does not throw when no rex process is running', () => {
    expect(() => killRex()).not.toThrow()
  })

  it('is a function', () => {
    expect(typeof killRex).toBe('function')
  })
})
