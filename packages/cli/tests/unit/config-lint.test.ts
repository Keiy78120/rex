/**
 * Unit tests for config-lint.ts — runConfigLint.
 * FS mocked — no real file reads.
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
    readFileSync: vi.fn(() => ''),
    readdirSync: vi.fn(() => []),
  }
})

import { runConfigLint } from '../../src/config-lint.js'

// ── runConfigLint ─────────────────────────────────────────────────────────────

describe('runConfigLint', () => {
  it('returns a LintResult object', () => {
    const result = runConfigLint('/tmp/no-project')
    expect(result).toHaveProperty('issues')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('infos')
    expect(result).toHaveProperty('passed')
  })

  it('issues is an array', () => {
    const result = runConfigLint('/tmp/no-project')
    expect(Array.isArray(result.issues)).toBe(true)
  })

  it('passed is a boolean', () => {
    const result = runConfigLint('/tmp/no-project')
    expect(typeof result.passed).toBe('boolean')
  })

  it('errors/warnings/infos are numbers', () => {
    const result = runConfigLint('/tmp/no-project')
    expect(typeof result.errors).toBe('number')
    expect(typeof result.warnings).toBe('number')
    expect(typeof result.infos).toBe('number')
  })

  it('does not throw with default cwd', () => {
    expect(() => runConfigLint()).not.toThrow()
  })
})
