/**
 * Unit tests for llm.ts — detectModel, llm.
 * Backend and litellm mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

const { mockBackend, mockLitellm } = vi.hoisted(() => ({
  mockBackend: {
    getBackend: vi.fn(() => ({
      listModels: vi.fn(async () => ['qwen2.5:7b', 'nomic-embed-text']),
      generate: vi.fn(async () => 'mocked llm response'),
      isAvailable: vi.fn(async () => true),
      name: 'ollama',
    })),
    resetBackendCache: vi.fn(),
    createBackend: vi.fn(),
    BACKEND_INFO: {},
  },
  mockLitellm: {
    callWithFallback: vi.fn(async () => ({
      text: 'mocked response',
      provider: 'ollama',
      tokensIn: 5,
      tokensOut: 10,
      durationMs: 50,
    })),
  },
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/llm-backend.js', () => mockBackend)
vi.mock('../../src/providers/llm-backend.js', () => mockBackend)

vi.mock('../../src/litellm.js', () => mockLitellm)
vi.mock('../../src/providers/litellm.js', () => mockLitellm)

import { detectModel, llm } from '../../src/llm.js'

// ── detectModel ───────────────────────────────────────────────────────────────

describe('detectModel', () => {
  it('returns a string', async () => {
    const model = await detectModel()
    expect(typeof model).toBe('string')
  })

  it('returns a non-empty string', async () => {
    const model = await detectModel()
    expect(model.length).toBeGreaterThan(0)
  })

  it('returns env var when REX_LLM_MODEL is set', async () => {
    process.env.REX_LLM_MODEL = 'custom-model:latest'
    const model = await detectModel()
    expect(model).toBe('custom-model:latest')
    delete process.env.REX_LLM_MODEL
  })

  it('returns a model from available list when no env var', async () => {
    delete process.env.REX_LLM_MODEL
    const model = await detectModel()
    // listModels returns ['qwen2.5:7b', 'nomic-embed-text'] → qwen2.5:7b preferred
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })
})

// ── llm ───────────────────────────────────────────────────────────────────────

describe('llm', () => {
  it('returns a string', async () => {
    const result = await llm('hello world')
    expect(typeof result).toBe('string')
  })

  it('returns non-empty string', async () => {
    const result = await llm('test prompt')
    expect(result.length).toBeGreaterThan(0)
  })

  it('accepts optional system prompt', async () => {
    const result = await llm('hello', 'you are helpful')
    expect(typeof result).toBe('string')
  })

  it('accepts optional model parameter', async () => {
    const result = await llm('hello', undefined, 'qwen2.5:7b')
    expect(typeof result).toBe('string')
  })
})
