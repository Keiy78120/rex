/**
 * Unit tests for session-guard.ts — readCompactSignal, writeCompactSignal, clearCompactSignal.
 * Filesystem mocked — no real disk access.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-session-guard-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

import {
  readCompactSignal,
  writeCompactSignal,
  clearCompactSignal,
} from '../../src/session-guard.js'

// ── readCompactSignal ─────────────────────────────────────────────────────────

describe('readCompactSignal', () => {
  it('returns null when no signal file exists', () => {
    // existsSync mocked to false
    expect(readCompactSignal()).toBeNull()
  })

  it('does not throw', () => {
    expect(() => readCompactSignal()).not.toThrow()
  })
})

// ── writeCompactSignal ────────────────────────────────────────────────────────

describe('writeCompactSignal', () => {
  it('does not throw', () => {
    expect(() => writeCompactSignal({
      reason: 'test compact',
      contextPercent: 75,
      timestamp: new Date().toISOString(),
    })).not.toThrow()
  })
})

// ── clearCompactSignal ────────────────────────────────────────────────────────

describe('clearCompactSignal', () => {
  it('does not throw when no signal exists', () => {
    // existsSync mocked to false → nothing to unlink
    expect(() => clearCompactSignal()).not.toThrow()
  })
})
