/**
 * Integration tests for proactive-dispatch.ts — getPendingSignals, confirmSignal,
 * dismissSignal, purgeOldSignals. Uses a real temp file for the pending store.
 * @module CURIOUS
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { TEST_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-dispatch-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
})

vi.mock('../../src/paths.js', () => ({
  REX_DIR: TEST_DIR,
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
  CONFIG_PATH: join(TEST_DIR, 'config.json'),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// Prevent actual Telegram calls
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

import {
  getPendingSignals,
  confirmSignal,
  dismissSignal,
  purgeOldSignals,
  type PendingSignal,
} from '../../src/proactive-dispatch.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

let idCounter = 1

function makePendingSignal(overrides: Partial<PendingSignal> = {}): PendingSignal {
  return {
    id: `test-signal-${idCounter++}-${Date.now()}`,
    title: 'Test Signal',
    detail: 'Details here',
    source: 'test-source',
    signalType: 'DISCOVERY',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// We need to write signals to the store directly — use writeFileSync to pre-populate
function writeSignals(signals: PendingSignal[]): void {
  const { writeFileSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  writeFileSync(join(TEST_DIR, 'pending-signals.json'), JSON.stringify(signals, null, 2))
}

// ── getPendingSignals ─────────────────────────────────────────────────────────

describe('getPendingSignals', () => {
  it('returns an array', () => {
    writeSignals([])
    expect(Array.isArray(getPendingSignals())).toBe(true)
  })

  it('returns only pending signals (not confirmed/dismissed)', () => {
    const signals: PendingSignal[] = [
      makePendingSignal({ status: 'pending' }),
      makePendingSignal({ status: 'confirmed' }),
      makePendingSignal({ status: 'dismissed' }),
    ]
    writeSignals(signals)
    const pending = getPendingSignals()
    expect(pending.every(s => s.status === 'pending')).toBe(true)
    expect(pending).toHaveLength(1)
  })

  it('returns empty array when no pending signals', () => {
    writeSignals([makePendingSignal({ status: 'confirmed' })])
    expect(getPendingSignals()).toHaveLength(0)
  })
})

// ── confirmSignal ─────────────────────────────────────────────────────────────

describe('confirmSignal', () => {
  it('returns true for existing signal', () => {
    const sig = makePendingSignal()
    writeSignals([sig])
    expect(confirmSignal(sig.id)).toBe(true)
  })

  it('returns false for unknown id', () => {
    writeSignals([])
    expect(confirmSignal('nonexistent-id-xyz')).toBe(false)
  })

  it('confirmed signal is no longer pending', () => {
    const sig = makePendingSignal()
    writeSignals([sig])
    confirmSignal(sig.id)
    // After confirm, it should be gone from getPendingSignals
    const pending = getPendingSignals()
    expect(pending.some(s => s.id === sig.id)).toBe(false)
  })

  it('sets resolvedAt when confirmed', () => {
    const sig = makePendingSignal()
    writeSignals([sig])
    confirmSignal(sig.id)
    // Read raw file to check resolvedAt
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const raw = JSON.parse(readFileSync(join(TEST_DIR, 'pending-signals.json'), 'utf-8')) as PendingSignal[]
    const found = raw.find(s => s.id === sig.id)
    expect(found?.resolvedAt).toBeDefined()
  })
})

// ── dismissSignal ─────────────────────────────────────────────────────────────

describe('dismissSignal', () => {
  it('returns true for existing signal', () => {
    const sig = makePendingSignal()
    writeSignals([sig])
    expect(dismissSignal(sig.id)).toBe(true)
  })

  it('returns false for unknown id', () => {
    writeSignals([])
    expect(dismissSignal('nonexistent-id-abc')).toBe(false)
  })

  it('dismissed signal is no longer pending', () => {
    const sig = makePendingSignal()
    writeSignals([sig])
    dismissSignal(sig.id)
    expect(getPendingSignals().some(s => s.id === sig.id)).toBe(false)
  })
})

// ── purgeOldSignals ───────────────────────────────────────────────────────────

describe('purgeOldSignals', () => {
  it('does not throw when store is empty', () => {
    writeSignals([])
    expect(() => purgeOldSignals()).not.toThrow()
  })

  it('keeps pending signals', () => {
    const pending = makePendingSignal({ status: 'pending' })
    writeSignals([pending])
    purgeOldSignals()
    expect(getPendingSignals().some(s => s.id === pending.id)).toBe(true)
  })

  it('removes old resolved signals (> 7 days)', () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const oldResolved = makePendingSignal({ status: 'confirmed', resolvedAt: oldDate })
    const pending = makePendingSignal({ status: 'pending' })
    writeSignals([oldResolved, pending])
    purgeOldSignals()
    // Old resolved should be gone, pending should remain
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const raw = JSON.parse(readFileSync(join(TEST_DIR, 'pending-signals.json'), 'utf-8')) as PendingSignal[]
    expect(raw.some(s => s.id === oldResolved.id)).toBe(false)
    expect(raw.some(s => s.id === pending.id)).toBe(true)
  })
})
