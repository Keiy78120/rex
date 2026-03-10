/**
 * Unit tests for agent-runtime.ts — runAgent.
 * All dependencies mocked — no real LLM calls.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/project-intent.js', () => ({
  detectIntent: vi.fn(async () => ({
    intent: 'feature', confidence: 0.5, signals: [], actions: [], missing: {},
  })),
}))

vi.mock('../../src/router.js', () => ({
  pickModel: vi.fn(async () => 'qwen2.5:7b'),
}))

vi.mock('../../src/tool-adapter.js', () => ({
  getRexTools: vi.fn(() => []),
  getToolsSummary: vi.fn(() => 'No tools'),
  executeToolCall: vi.fn(async () => 'tool result'),
}))

vi.mock('../../src/rex-identity.js', () => ({
  REX_SYSTEM_PROMPT: 'You are REX.',
}))

// Mock fetch for Ollama API calls
global.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({
    message: { content: 'mocked ollama response', role: 'assistant' },
    done: true,
  }),
  body: null,
})) as typeof fetch

import { runAgent } from '../../src/agent-runtime.js'

// ── runAgent ──────────────────────────────────────────────────────────────────

describe('runAgent', () => {
  it('returns an object', async () => {
    const result = await runAgent('hello')
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('result has response string', async () => {
    const result = await runAgent('hello')
    expect(result).toHaveProperty('response')
    expect(typeof result.response).toBe('string')
  })

  it('result has model string', async () => {
    const result = await runAgent('hello')
    expect(result).toHaveProperty('model')
    expect(typeof result.model).toBe('string')
  })

  it('result has turns number', async () => {
    const result = await runAgent('hello')
    expect(result).toHaveProperty('turns')
    expect(typeof result.turns).toBe('number')
    expect(result.turns).toBeGreaterThanOrEqual(1)
  })

  it('result has toolCalls array', async () => {
    const result = await runAgent('hello')
    expect(result).toHaveProperty('toolCalls')
    expect(Array.isArray(result.toolCalls)).toBe(true)
  })

  it('result has durationMs number', async () => {
    const result = await runAgent('hello')
    expect(result).toHaveProperty('durationMs')
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('accepts AgentConfig with model override', async () => {
    const result = await runAgent('hello', { model: 'custom:model' })
    expect(result.model).toBe('custom:model')
  })
})
