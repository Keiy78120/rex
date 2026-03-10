/**
 * Unit tests for litellm-config.ts — buildLiteLLMConfig, generateLiteLLMConfig.
 * Network and FS deps mocked.
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-litellm-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/free-tiers.js', () => ({
  FREE_TIER_PROVIDERS: [],
  getApiKey: vi.fn(() => null),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    mkdirSync: vi.fn(),
  }
})

// Mock fetch for Ollama discovery (no local Ollama in test env)
global.fetch = vi.fn(async () => {
  throw new Error('connection refused')
}) as typeof fetch

import { buildLiteLLMConfig, generateLiteLLMConfig } from '../../src/litellm-config.js'

// ── buildLiteLLMConfig ────────────────────────────────────────────────────────

describe('buildLiteLLMConfig', () => {
  it('returns an object', async () => {
    const result = await buildLiteLLMConfig()
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('result has model_list array', async () => {
    const result = await buildLiteLLMConfig()
    expect(result).toHaveProperty('model_list')
    expect(Array.isArray(result.model_list)).toBe(true)
  })

  it('result has router_settings', async () => {
    const result = await buildLiteLLMConfig()
    expect(result).toHaveProperty('router_settings')
  })

  it('model_list entries have model_name and litellm_params', async () => {
    const result = await buildLiteLLMConfig()
    for (const m of result.model_list) {
      expect(m).toHaveProperty('model_name')
      expect(m).toHaveProperty('litellm_params')
    }
  })
})

// ── generateLiteLLMConfig ─────────────────────────────────────────────────────

describe('generateLiteLLMConfig', () => {
  it('does not throw with print=true', async () => {
    await expect(generateLiteLLMConfig({ print: true })).resolves.not.toThrow()
  })

  it('does not throw with default options', async () => {
    await expect(generateLiteLLMConfig({})).resolves.not.toThrow()
  })
})
