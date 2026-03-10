/**
 * Unit tests for review.ts — runReview, printReviewResults.
 * Shell calls mocked.
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
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => ''),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  }
})

import { runReview, printReviewResults } from '../../src/review.js'

// ── runReview ─────────────────────────────────────────────────────────────────

describe('runReview', () => {
  it('returns an array', async () => {
    const results = await runReview('quick')
    expect(Array.isArray(results)).toBe(true)
  })

  it('each result has name, status, message', async () => {
    const results = await runReview('quick')
    for (const r of results) {
      expect(r).toHaveProperty('name')
      expect(r).toHaveProperty('status')
      expect(r).toHaveProperty('message')
    }
  })

  it('status is one of ok/warn/fail/skip', async () => {
    const results = await runReview('quick')
    for (const r of results) {
      expect(['ok', 'warn', 'fail', 'skip']).toContain(r.status)
    }
  })

  it('works with full mode', async () => {
    const results = await runReview('full')
    expect(Array.isArray(results)).toBe(true)
  })

  it('works with pre-push mode', async () => {
    const results = await runReview('pre-push')
    expect(Array.isArray(results)).toBe(true)
  })
})

// ── printReviewResults ────────────────────────────────────────────────────────

describe('printReviewResults', () => {
  it('does not throw with empty results', () => {
    expect(() => printReviewResults([])).not.toThrow()
  })

  it('does not throw with json=true', () => {
    expect(() => printReviewResults([], true)).not.toThrow()
  })
})
