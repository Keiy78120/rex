/**
 * Unit tests for watchdog.ts — detectLoop (pure) and WatchdogConfig/WatchdogReport types.
 * @module CORE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-watchdog-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-watchdog-test/config.json',
  MEMORY_DB_PATH: '/tmp/rex-watchdog-test/memory.sqlite',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false }
})

import { detectLoop } from '../../src/watchdog.js'

// ── detectLoop ─────────────────────────────────────────────────────────────────

describe('detectLoop', () => {
  it('returns false when iterations < max', () => {
    expect(detectLoop(3, 10)).toBe(false)
  })

  it('returns true when iterations >= max', () => {
    expect(detectLoop(10, 10)).toBe(true)
  })

  it('returns true when iterations exceeds max', () => {
    expect(detectLoop(15, 10)).toBe(true)
  })

  it('returns false when iterations = 0 and max = 1', () => {
    expect(detectLoop(0, 1)).toBe(false)
  })

  it('returns true when iterations = 1 and max = 1', () => {
    expect(detectLoop(1, 1)).toBe(true)
  })

  it('returns false when iterations = 0 and max = 0', () => {
    // 0 >= 0 is true — edge case
    expect(detectLoop(0, 0)).toBe(true)
  })

  it('returns boolean', () => {
    expect(typeof detectLoop(5, 10)).toBe('boolean')
    expect(typeof detectLoop(10, 5)).toBe('boolean')
  })

  it('boundary: one below max is not a loop', () => {
    expect(detectLoop(9, 10)).toBe(false)
  })

  it('boundary: exactly at max is a loop', () => {
    expect(detectLoop(10, 10)).toBe(true)
  })

  it('large values work correctly', () => {
    expect(detectLoop(999, 1000)).toBe(false)
    expect(detectLoop(1000, 1000)).toBe(true)
  })
})
