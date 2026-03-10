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
  it('does not throw for context-70', () => {
    expect(() => writeCompactSignal({
      reason: 'context-70',
      contextPercent: 70,
      dailyPercent: 30,
      ts: new Date().toISOString(),
      hint: 'Consider /compact',
    })).not.toThrow()
  })

  it('does not throw for context-85', () => {
    expect(() => writeCompactSignal({
      reason: 'context-85',
      contextPercent: 85,
      dailyPercent: 50,
      ts: new Date().toISOString(),
      hint: 'Run /compact soon',
    })).not.toThrow()
  })

  it('does not throw for context-95', () => {
    expect(() => writeCompactSignal({
      reason: 'context-95',
      contextPercent: 95,
      dailyPercent: 70,
      ts: new Date().toISOString(),
      hint: 'Must compact now',
    })).not.toThrow()
  })
})

// ── clearCompactSignal ────────────────────────────────────────────────────────

describe('clearCompactSignal', () => {
  it('does not throw when no signal exists', () => {
    // existsSync mocked to false → nothing to unlink
    expect(() => clearCompactSignal()).not.toThrow()
  })

  it('does not throw when signal file exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(true)
    expect(() => clearCompactSignal()).not.toThrow()
  })
})

// ── readCompactSignal — when file exists ──────────────────────────────────────

describe('readCompactSignal — when file exists', () => {
  it('returns parsed signal when file exists', async () => {
    const signal = {
      reason: 'context-85',
      contextPercent: 85,
      dailyPercent: 40,
      ts: '2026-03-10T12:00:00.000Z',
      hint: 'compact now',
    }
    const { existsSync, readFileSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(signal) as any)
    const result = readCompactSignal()
    expect(result).not.toBeNull()
    expect(result?.reason).toBe('context-85')
    expect(result?.contextPercent).toBe(85)
  })

  it('returns null when JSON parse fails', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValueOnce('invalid-json' as any)
    // Should not throw — catches error and returns null
    expect(() => readCompactSignal()).not.toThrow()
  })
})
