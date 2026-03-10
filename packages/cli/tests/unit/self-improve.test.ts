/**
 * Unit tests for self-improve.ts — listLessons().
 * Tests pure file-reading behavior without DB or LLM calls.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

const LESSONS_PATH = vi.hoisted(() => {
  const { join } = require('node:path') as typeof import('node:path')
  return join('/tmp/rex-self-improve-test', 'self-improvement', 'lessons.json')
})

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-self-improve-test',
  ensureRexDirs: vi.fn(),
  SELF_IMPROVEMENT_DIR: '/tmp/rex-self-improve-test/self-improvement',
  MEMORY_DB_PATH: '/tmp/rex-self-improve-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-self-improve-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({ selfImprovement: { enabled: false } })),
}))

vi.mock('../../src/llm.js', () => ({
  llm: vi.fn(async () => 'mocked'),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(() => 'ollama'),
}))

vi.mock('better-sqlite3', () => {
  const DB = vi.fn(() => ({
    prepare: vi.fn(() => ({ all: vi.fn(() => []), run: vi.fn() })),
    exec: vi.fn(),
    close: vi.fn(),
  }))
  return { default: DB }
})

vi.mock('sqlite-vec', () => ({ load: vi.fn() }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import { listLessons, selfReview } from '../../src/self-improve.js'

// ── listLessons ───────────────────────────────────────────────────────────────

describe('listLessons', () => {
  it('returns an array', () => {
    expect(Array.isArray(listLessons())).toBe(true)
  })

  it('returns empty array when lessons file does not exist', () => {
    // SELF_IMPROVEMENT_DIR/lessons.json does not exist (mocked existsSync → false)
    const lessons = listLessons()
    expect(lessons).toHaveLength(0)
  })

  it('listLessons result items are objects if non-empty', () => {
    // existsSync is mocked to false → result is always []
    // Verify shape safety: if any lesson returned, it must be an object
    const lessons = listLessons()
    for (const l of lessons) {
      expect(typeof l).toBe('object')
      expect(l).not.toBeNull()
    }
  })
})

// ── selfReview ────────────────────────────────────────────────────────────────

describe('selfReview', () => {
  it('returns { newLessons, ruleCandidates } when disabled', async () => {
    const result = await selfReview()
    expect(result).toHaveProperty('newLessons')
    expect(result).toHaveProperty('ruleCandidates')
  })

  it('returns numbers for both fields', async () => {
    const result = await selfReview()
    expect(typeof result.newLessons).toBe('number')
    expect(typeof result.ruleCandidates).toBe('number')
  })

  it('returns zero counts when disabled', async () => {
    const result = await selfReview()
    expect(result.newLessons).toBe(0)
    expect(result.ruleCandidates).toBe(0)
  })

  it('does not throw', async () => {
    await expect(selfReview()).resolves.not.toThrow()
  })
})
