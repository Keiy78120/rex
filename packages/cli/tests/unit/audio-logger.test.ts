/**
 * Unit tests for audio-logger.ts — getAudioDir, listSessions.
 * FS and subprocess mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn(),
    spawn: vi.fn(() => ({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    })),
  }
})

import { getAudioDir, listSessions } from '../../src/audio-logger.js'

// ── getAudioDir ───────────────────────────────────────────────────────────────

describe('getAudioDir', () => {
  it('returns a string', () => {
    expect(typeof getAudioDir()).toBe('string')
  })

  it('returns a non-empty path', () => {
    expect(getAudioDir().length).toBeGreaterThan(0)
  })

  it('path contains "audio"', () => {
    expect(getAudioDir().toLowerCase()).toContain('audio')
  })
})

// ── listSessions ──────────────────────────────────────────────────────────────

describe('listSessions', () => {
  it('returns an array', () => {
    expect(Array.isArray(listSessions())).toBe(true)
  })

  it('returns empty array when no session files exist', () => {
    // readdirSync returns [] (mocked)
    expect(listSessions()).toHaveLength(0)
  })

  it('does not throw when audio dir does not exist', () => {
    expect(() => listSessions()).not.toThrow()
  })
})
