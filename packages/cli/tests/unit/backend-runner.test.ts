/**
 * Unit tests for backend-runner.ts — runPrompt, RunOpts, RunResult types.
 * Orchestrator and cache mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/semantic-cache.js', () => ({
  hashPrompt: vi.fn(() => 'abc123'),
  cacheGet: vi.fn(() => null),
  cacheSet: vi.fn(),
}))

vi.mock('../../src/orchestrator.js', () => ({
  orchestrate: vi.fn(async () => ({
    response: 'mocked response',
    provider: 'ollama',
    tokensIn: 10,
    tokensOut: 5,
    durationMs: 100,
  })),
}))

import { runPrompt } from '../../src/backend-runner.js'

// ── runPrompt ─────────────────────────────────────────────────────────────────

describe('runPrompt', () => {
  it('returns an object', async () => {
    const result = await runPrompt('hello world')
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('result has response string', async () => {
    const result = await runPrompt('hello')
    expect(result).toHaveProperty('response')
    expect(typeof result.response).toBe('string')
  })

  it('result has model string', async () => {
    const result = await runPrompt('hello')
    expect(result).toHaveProperty('model')
    expect(typeof result.model).toBe('string')
  })

  it('result has source field', async () => {
    const result = await runPrompt('hello')
    expect(result).toHaveProperty('source')
    expect(['cache', 'ollama', 'claude-cli', 'claude-api', 'error']).toContain(result.source)
  })

  it('result has latencyMs number', async () => {
    const result = await runPrompt('hello')
    expect(result).toHaveProperty('latencyMs')
    expect(typeof result.latencyMs).toBe('number')
  })

  it('accepts RunOpts parameter', async () => {
    const result = await runPrompt('hello', { taskType: 'code', timeout: 5000 })
    expect(typeof result.response).toBe('string')
  })
})
