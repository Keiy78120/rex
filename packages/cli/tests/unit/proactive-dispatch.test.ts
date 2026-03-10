/**
 * Unit tests for proactive-dispatch.ts — getPendingSignals, confirmSignal,
 * dismissSignal, purgeOldSignals, sendMacNotification.
 * All filesystem + child_process mocked.
 * @module CURIOUS
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-dispatch-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => '/tmp/rex-dispatch-test' }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
    spawnSync: vi.fn(() => ({ status: 0, stdout: '' })),
  }
})

// Mock fs with empty pending signals list
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
  }
})

import {
  getPendingSignals,
  confirmSignal,
  dismissSignal,
  purgeOldSignals,
  sendMacNotification,
} from '../../src/proactive-dispatch.js'

// ── getPendingSignals ─────────────────────────────────────────────────────────

describe('getPendingSignals', () => {
  it('returns an array', () => {
    expect(Array.isArray(getPendingSignals())).toBe(true)
  })

  it('returns empty array when no signals file exists', () => {
    expect(getPendingSignals()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => getPendingSignals()).not.toThrow()
  })
})

// ── confirmSignal ─────────────────────────────────────────────────────────────

describe('confirmSignal', () => {
  it('returns false for non-existent signal id', () => {
    expect(confirmSignal('nonexistent-id-xyz')).toBe(false)
  })

  it('does not throw', () => {
    expect(() => confirmSignal('any-id')).not.toThrow()
  })
})

// ── dismissSignal ─────────────────────────────────────────────────────────────

describe('dismissSignal', () => {
  it('returns false for non-existent signal id', () => {
    expect(dismissSignal('nonexistent-id-xyz')).toBe(false)
  })

  it('does not throw', () => {
    expect(() => dismissSignal('any-id')).not.toThrow()
  })
})

// ── purgeOldSignals ───────────────────────────────────────────────────────────

describe('purgeOldSignals', () => {
  it('does not throw with empty store', () => {
    expect(() => purgeOldSignals()).not.toThrow()
  })
})

// ── sendMacNotification ───────────────────────────────────────────────────────

describe('sendMacNotification', () => {
  it('returns a boolean', () => {
    const result = sendMacNotification('Test Title', 'Test body')
    expect(typeof result).toBe('boolean')
  })

  it('does not throw', () => {
    expect(() => sendMacNotification('Test', 'Body', 'Subtitle')).not.toThrow()
  })
})
