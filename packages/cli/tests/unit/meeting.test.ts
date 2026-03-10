/**
 * Unit tests for meeting.ts — listMeetings, getMeeting, searchMeetings.
 * SQLite and FS mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-meeting-test',
  MEMORY_DB_PATH: '/tmp/rex-meeting-test/memory.sqlite',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/llm.js', () => ({
  llm: vi.fn(async () => 'mocked summary'),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(async () => 'qwen2.5:7b'),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      run: vi.fn(() => ({ lastInsertRowid: 1 })),
      get: vi.fn(() => undefined),
    })),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('sqlite-vec', () => ({ load: vi.fn() }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  }
})

import { listMeetings, getMeeting, searchMeetings } from '../../src/meeting.js'

// ── listMeetings ──────────────────────────────────────────────────────────────

describe('listMeetings', () => {
  it('returns an array', () => {
    expect(Array.isArray(listMeetings())).toBe(true)
  })

  it('returns empty array when DB is empty', () => {
    expect(listMeetings()).toHaveLength(0)
  })

  it('accepts a limit parameter', () => {
    const result = listMeetings(5)
    expect(Array.isArray(result)).toBe(true)
  })
})

// ── getMeeting ────────────────────────────────────────────────────────────────

describe('getMeeting', () => {
  it('returns null for unknown id', () => {
    expect(getMeeting('nonexistent-id')).toBeNull()
  })

  it('does not throw for any id', () => {
    expect(() => getMeeting('some-id')).not.toThrow()
  })
})

// ── searchMeetings ────────────────────────────────────────────────────────────

describe('searchMeetings', () => {
  it('returns an array', async () => {
    const results = await searchMeetings('deploy')
    expect(Array.isArray(results)).toBe(true)
  })

  it('returns empty array when DB is empty', async () => {
    const results = await searchMeetings('test query')
    expect(results).toHaveLength(0)
  })
})
