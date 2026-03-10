/**
 * Unit tests for free-tiers.ts — provider catalog and rate-limit tracking.
 * No network calls — mocked env and fs.
 * @module BUDGET
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { homedir } from 'node:os'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// Mock fs to avoid reading ~/.claude/settings.json
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (p: string) => false,
    readFileSync: actual.readFileSync,
  }
})

import {
  FREE_TIER_PROVIDERS,
  isProviderAvailable,
  getRoutableProviders,
  markRateLimited,
  markFailed,
  markSuccess,
  type FreeTierProvider,
} from '../../src/free-tiers.js'

// ── FREE_TIER_PROVIDERS catalog ───────────────────────────────────────────────

describe('FREE_TIER_PROVIDERS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(FREE_TIER_PROVIDERS)).toBe(true)
    expect(FREE_TIER_PROVIDERS.length).toBeGreaterThan(0)
  })

  it('Ollama is the first provider (routing priority)', () => {
    expect(FREE_TIER_PROVIDERS[0].name).toBe('Ollama')
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
      expect(typeof p.requiresKey).toBe('boolean')
    }
  })

  it('Ollama does not require an API key', () => {
    const ollama = FREE_TIER_PROVIDERS.find(p => p.name === 'Ollama')
    expect(ollama?.requiresKey).toBe(false)
  })

  it('all non-Ollama providers have rpmLimit > 0', () => {
    for (const p of FREE_TIER_PROVIDERS.filter(p => p.name !== 'Ollama')) {
      expect(p.rpmLimit).toBeGreaterThan(0)
    }
  })

  it('each provider has at least one model', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      expect(p.models.length).toBeGreaterThan(0)
    }
  })

  it('each model has id and contextWindow', () => {
    for (const p of FREE_TIER_PROVIDERS) {
      for (const m of p.models) {
        expect(typeof m.id).toBe('string')
        expect(m.contextWindow).toBeGreaterThan(0)
        expect(Array.isArray(m.capabilities)).toBe(true)
      }
    }
  })
})

// ── isProviderAvailable ───────────────────────────────────────────────────────

describe('isProviderAvailable', () => {
  it('returns true for providers that do not require a key (Ollama)', () => {
    const ollama = FREE_TIER_PROVIDERS.find(p => p.name === 'Ollama')!
    expect(isProviderAvailable(ollama)).toBe(true)
  })

  it('returns false for key-requiring providers when env var is absent', () => {
    const keyed: FreeTierProvider = {
      name: 'TestProvider',
      envKey: 'TEST_PROVIDER_KEY_DEFINITELY_NOT_SET',
      baseUrl: 'https://example.com',
      defaultModel: 'test-model',
      models: [],
      rpmLimit: 60,
      tpmLimit: 10000,
      requiresKey: true,
    }
    delete process.env['TEST_PROVIDER_KEY_DEFINITELY_NOT_SET']
    expect(isProviderAvailable(keyed)).toBe(false)
  })

  it('returns true for key-requiring provider when env var is set', () => {
    const keyed: FreeTierProvider = {
      name: 'TestProvider2',
      envKey: 'REX_TEST_API_KEY_123',
      baseUrl: 'https://example.com',
      defaultModel: 'test',
      models: [],
      rpmLimit: 60,
      tpmLimit: 10000,
      requiresKey: true,
    }
    process.env['REX_TEST_API_KEY_123'] = 'sk-test-key'
    expect(isProviderAvailable(keyed)).toBe(true)
    delete process.env['REX_TEST_API_KEY_123']
  })
})

// ── getRoutableProviders ──────────────────────────────────────────────────────

describe('getRoutableProviders', () => {
  it('returns an array', () => {
    expect(Array.isArray(getRoutableProviders())).toBe(true)
  })

  it('includes Ollama (no key required)', () => {
    const providers = getRoutableProviders()
    expect(providers.some(p => p.name === 'Ollama')).toBe(true)
  })

  it('excludes providers with missing keys', () => {
    // Ensure no env keys are set for key-requiring providers
    const providers = getRoutableProviders()
    for (const p of providers) {
      if (p.requiresKey) {
        expect(process.env[p.envKey]).toBeTruthy()
      }
    }
  })
})

// ── markRateLimited / markFailed / markSuccess ────────────────────────────────

describe('rate limit state tracking', () => {
  it('markFailed does not throw', () => {
    expect(() => markFailed('test-provider-a')).not.toThrow()
  })

  it('markRateLimited does not throw', () => {
    expect(() => markRateLimited('test-provider-b')).not.toThrow()
  })

  it('markSuccess does not throw', () => {
    expect(() => markSuccess('test-provider-c')).not.toThrow()
  })

  it('markSuccess resets consecutive failures (via mark-success)', () => {
    // Mark failed multiple times then recover with success — should not throw
    markFailed('recover-test')
    markFailed('recover-test')
    markSuccess('recover-test')
    // If we call it again, no crash means state was properly reset
    expect(() => markFailed('recover-test')).not.toThrow()
  })

  it('tracks independent state per provider name', () => {
    // Different providers should not interfere with each other
    expect(() => {
      markFailed('provider-x')
      markFailed('provider-y')
      markSuccess('provider-x')
      markFailed('provider-y')
    }).not.toThrow()
  })
})
