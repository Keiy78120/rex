/**
 * Unit tests for user-state.ts — getModelTierForState (pure function).
 * @module CURIOUS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-user-state-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-user-state-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-user-state-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import {
  getModelTierForState,
  updateStateHistory,
  type UserCycleState,
} from '../../src/user-state.js'

// ── getModelTierForState ──────────────────────────────────────────────────────

describe('getModelTierForState', () => {
  it('returns "auto" for AWAKE_ACTIVE', () => {
    expect(getModelTierForState('AWAKE_ACTIVE')).toBe('auto')
  })

  it('returns "free" for AWAKE_IDLE', () => {
    expect(getModelTierForState('AWAKE_IDLE')).toBe('free')
  })

  it('returns "local" for SLEEPING', () => {
    expect(getModelTierForState('SLEEPING')).toBe('local')
  })

  it('returns "auto" for WAKING_UP', () => {
    expect(getModelTierForState('WAKING_UP')).toBe('auto')
  })

  it('returns a string for all defined states', () => {
    const states: UserCycleState[] = ['AWAKE_ACTIVE', 'AWAKE_IDLE', 'SLEEPING', 'WAKING_UP']
    for (const s of states) {
      expect(typeof getModelTierForState(s)).toBe('string')
    }
  })

  it('SLEEPING returns "local" (0€ tier for Ollama only)', () => {
    expect(getModelTierForState('SLEEPING')).toBe('local')
  })

  it('AWAKE_IDLE returns "free" (free-tier providers)', () => {
    expect(getModelTierForState('AWAKE_IDLE')).toBe('free')
  })

  it('AWAKE_ACTIVE and WAKING_UP both return "auto"', () => {
    expect(getModelTierForState('AWAKE_ACTIVE')).toBe(getModelTierForState('WAKING_UP'))
  })
})

// ── updateStateHistory ────────────────────────────────────────────────────────

describe('updateStateHistory', () => {
  it('does not throw for AWAKE_ACTIVE', () => {
    expect(() => updateStateHistory('AWAKE_ACTIVE')).not.toThrow()
  })

  it('does not throw for SLEEPING', () => {
    expect(() => updateStateHistory('SLEEPING')).not.toThrow()
  })

  it('does not throw for WAKING_UP', () => {
    expect(() => updateStateHistory('WAKING_UP')).not.toThrow()
  })

  it('does not throw for AWAKE_IDLE', () => {
    expect(() => updateStateHistory('AWAKE_IDLE')).not.toThrow()
  })

  it('does not throw when called multiple times', () => {
    const states: UserCycleState[] = ['AWAKE_ACTIVE', 'SLEEPING', 'WAKING_UP', 'AWAKE_IDLE']
    for (const s of states) {
      expect(() => updateStateHistory(s)).not.toThrow()
    }
  })
})
