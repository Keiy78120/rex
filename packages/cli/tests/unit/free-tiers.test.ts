/**
 * Unit tests for free-tiers.ts — FREE_TIER_PROVIDERS catalog structure
 * and isProviderAvailable logic (no network calls).
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-free-tiers-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-free-tiers-test/config.json',
}))

import {
  FREE_TIER_PROVIDERS,
  isProviderAvailable,
  type FreeTierProvider,
} from '../../src/free-tiers.js'

// ── FREE_TIER_PROVIDERS catalog ───────────────────────────────────────────────

describe('FREE_TIER_PROVIDERS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(FREE_TIER_PROVIDERS)).toBe(true)
    expect(FREE_TIER_PROVIDERS.length).toBeGreaterThan(0)
  })

  it('includes Ollama as the first provider (local, no key required)', () => {
    const ollama = FREE_TIER_PROVIDERS[0]
    expect(ollama.name).toBe('Ollama')
    expect(ollama.requiresKey).toBe(false)
  })

  it('each provider has required fields', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('envKey')
      expect(p).toHaveProperty('baseUrl')
      expect(p).toHaveProperty('defaultModel')
      expect(p).toHaveProperty('models')
      expect(p).toHaveProperty('rpmLimit')
      expect(p).toHaveProperty('tpmLimit')
      expect(p).toHaveProperty('requiresKey')
    }
  })

  it('all provider names are non-empty strings', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(typeof p.name).toBe('string')
      expect(p.name.length).toBeGreaterThan(0)
    }
  })

  it('all providers have at least one model', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(Array.isArray(p.models)).toBe(true)
      expect(p.models.length).toBeGreaterThan(0)
    }
  })

  it('each model has id and contextWindow', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      for (const m of p.models) {
        expect(typeof m.id).toBe('string')
        expect(m.id.length).toBeGreaterThan(0)
        expect(typeof m.contextWindow).toBe('number')
        expect(m.contextWindow).toBeGreaterThan(0)
      }
    }
  })

  it('rpmLimit and tpmLimit are positive numbers', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(p.rpmLimit).toBeGreaterThan(0)
      expect(p.tpmLimit).toBeGreaterThan(0)
    }
  })

  it('providers requiring a key have a non-empty envKey', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      if (p.requiresKey) {
        expect(p.envKey.length).toBeGreaterThan(0)
      }
    }
  })

  it('includes Groq provider', () => {
    const groq = FREE_TIER_PROVIDERS.find(p => p.name === 'Groq')
    expect(groq).toBeDefined()
    expect(groq?.requiresKey).toBe(true)
  })

  it('all base URLs start with http', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(p.baseUrl).toMatch(/^https?:\/\//)
    }
  })
})

// ── isProviderAvailable ───────────────────────────────────────────────────────

describe('isProviderAvailable', () => {
  it('returns true for provider that does not require a key', () => {
    const ollama = FREE_TIER_PROVIDERS.find(p => !p.requiresKey)!
    expect(isProviderAvailable(ollama)).toBe(true)
  })

  it('returns false for key-required provider when env key is missing', () => {
    const keyRequired: FreeTierProvider = {
      name: 'TestProvider',
      envKey: 'NONEXISTENT_KEY_XYZ_9999',
      baseUrl: 'https://api.test.com',
      defaultModel: 'test:latest',
      models: [{ id: 'test:latest', contextWindow: 4096, capabilities: ['chat'] }],
      rpmLimit: 60,
      tpmLimit: 10000,
      requiresKey: true,
    }
    expect(isProviderAvailable(keyRequired)).toBe(false)
  })

  it('returns true for key-required provider when env key is set', () => {
    const envKey = 'REX_TEST_PROVIDER_KEY_UNIQUE_9999'
    process.env[envKey] = 'sk-test-key-value'
    const keyRequired: FreeTierProvider = {
      name: 'TestProvider',
      envKey,
      baseUrl: 'https://api.test.com',
      defaultModel: 'test:latest',
      models: [{ id: 'test:latest', contextWindow: 4096, capabilities: ['chat'] }],
      rpmLimit: 60,
      tpmLimit: 10000,
      requiresKey: true,
    }
    const result = isProviderAvailable(keyRequired)
    delete process.env[envKey]
    expect(result).toBe(true)
  })
})
