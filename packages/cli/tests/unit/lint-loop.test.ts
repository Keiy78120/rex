/**
 * Unit tests for lint-loop.ts — tscAnalyzer, eslintAnalyzer, secretScanAnalyzer.
 * Tests factory functions return analyzers that resolve to strings.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  }
})

import { tscAnalyzer, eslintAnalyzer, secretScanAnalyzer } from '../../src/lint-loop.js'

// ── tscAnalyzer ───────────────────────────────────────────────────────────────

describe('tscAnalyzer', () => {
  it('returns a function', () => {
    const analyzer = tscAnalyzer('/tmp/project')
    expect(typeof analyzer).toBe('function')
  })

  it('analyzer resolves to a string', async () => {
    const analyzer = tscAnalyzer('/tmp/project')
    const result = await analyzer()
    expect(typeof result).toBe('string')
  })

  it('returns empty string when tsc succeeds', async () => {
    const analyzer = tscAnalyzer('/tmp/project')
    const result = await analyzer()
    expect(result).toBe('')
  })
})

// ── eslintAnalyzer ────────────────────────────────────────────────────────────

describe('eslintAnalyzer', () => {
  it('returns a function', () => {
    const analyzer = eslintAnalyzer('/tmp/project/src')
    expect(typeof analyzer).toBe('function')
  })

  it('analyzer resolves to a string', async () => {
    const analyzer = eslintAnalyzer('/tmp/project/src')
    const result = await analyzer()
    expect(typeof result).toBe('string')
  })
})

// ── secretScanAnalyzer ────────────────────────────────────────────────────────

describe('secretScanAnalyzer', () => {
  it('returns a function', () => {
    const analyzer = secretScanAnalyzer('/tmp/project')
    expect(typeof analyzer).toBe('function')
  })

  it('returns empty string when target does not exist', async () => {
    // existsSync mocked to false
    const analyzer = secretScanAnalyzer('/tmp/nonexistent-file.ts')
    const result = await analyzer()
    expect(result).toBe('')
  })

  it('analyzer resolves to a string', async () => {
    const analyzer = secretScanAnalyzer('/tmp/project')
    const result = await analyzer()
    expect(typeof result).toBe('string')
  })
})
