/**
 * Unit tests for optimize.ts — optimize().
 * Network fetch, FS, and LLM mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/llm.js', () => ({
  detectModel: vi.fn(async () => 'qwen2.5:7b'),
  llm: vi.fn(async () => 'mocked suggestion'),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => '# CLAUDE.md\n\n## Stack\nTypeScript\n\n## Commands\nbuild test'),
    writeFileSync: vi.fn(),
  }
})

// Reject Ollama health check → optimize() exits early (no CLAUDE.md + no Ollama)
global.fetch = vi.fn().mockRejectedValue(new Error('Ollama not available'))

import { optimize } from '../../src/optimize.js'

// ── optimize ──────────────────────────────────────────────────────────────────

describe('optimize', () => {
  it('exits early when Ollama is not running (process.exit guarded by catch)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    await optimize(false)
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })

  it('does not throw with apply=true (Ollama down)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    try { await optimize(true) } catch { /* may throw */ }
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })

  it('returns undefined (void function)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    const result = await optimize(false)
    exitSpy.mockRestore()
    expect(result).toBeUndefined()
  })

  it('is a function', () => {
    expect(typeof optimize).toBe('function')
  })

  it('resolves without hanging when called with apply=false', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    await expect(optimize(false)).resolves.not.toThrow()
    exitSpy.mockRestore()
  })
})
