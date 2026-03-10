/**
 * Unit tests for workflow.ts — checkBranchProtection.
 * Git/shell calls mocked to avoid real side effects.
 * @module HQ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: mockExecSync }
})

import { checkBranchProtection } from '../../src/workflow.js'

// ── checkBranchProtection ──────────────────────────────────────────────────────

describe('checkBranchProtection', () => {
  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns {protected, rules} shape', () => {
    // git remote fails → no repo detected → returns safe defaults
    mockExecSync.mockImplementation(() => { throw new Error('no remote') })
    const result = checkBranchProtection()
    expect(result).toHaveProperty('protected')
    expect(result).toHaveProperty('rules')
  })

  it('protected is a boolean', () => {
    mockExecSync.mockImplementation(() => { throw new Error('no remote') })
    const result = checkBranchProtection()
    expect(typeof result.protected).toBe('boolean')
  })

  it('rules is an array', () => {
    mockExecSync.mockImplementation(() => { throw new Error('no remote') })
    const result = checkBranchProtection()
    expect(Array.isArray(result.rules)).toBe(true)
  })

  it('returns false/[] when git remote throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('git error') })
    const result = checkBranchProtection()
    expect(result.protected).toBe(false)
    expect(result.rules).toHaveLength(0)
  })

  it('accepts explicit repo param and uses gh api', () => {
    // gh api returns empty {} → protection not detected
    mockExecSync.mockReturnValueOnce('{}')
    const result = checkBranchProtection('owner/repo')
    expect(result).toHaveProperty('protected')
    expect(result).toHaveProperty('rules')
  })

  it('does not throw even when execSync throws unexpectedly', () => {
    mockExecSync.mockImplementation(() => { throw new Error('unexpected') })
    expect(() => checkBranchProtection('owner/repo')).not.toThrow()
  })
})
