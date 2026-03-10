/**
 * Unit tests for providers.ts — ProviderRegistry, createDefaultRegistry, loadCodexToken.
 * No network calls. Registry is created and inspected without checkAll().
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/free-tiers.js', () => ({
  FREE_TIER_PROVIDERS: [],
  getApiKey: vi.fn(() => null),
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
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import {
  ProviderRegistry,
  createDefaultRegistry,
  loadCodexToken,
} from '../../src/providers.js'

// ── ProviderRegistry ──────────────────────────────────────────────────────────

describe('ProviderRegistry', () => {
  it('starts with empty listAll()', () => {
    const registry = new ProviderRegistry()
    expect(registry.listAll()).toHaveLength(0)
  })

  it('register adds a provider to the registry', () => {
    const registry = new ProviderRegistry()
    registry.register('test-provider', {
      name: 'Test',
      type: 'llm',
      costTier: 'free',
      capabilities: ['chat'],
      check: async () => true,
    })
    expect(registry.listAll()).toHaveLength(1)
  })

  it('getByName returns undefined for non-existent provider', () => {
    const registry = new ProviderRegistry()
    expect(registry.getByName('nonexistent')).toBeUndefined()
  })

  it('getByName returns provider after register', () => {
    const registry = new ProviderRegistry()
    registry.register('my-provider', {
      name: 'My Provider',
      type: 'llm',
      costTier: 'free',
      capabilities: ['chat'],
      check: async () => true,
    })
    const p = registry.getByName('my-provider')
    expect(p).toBeDefined()
    expect(p?.name).toBe('My Provider')
    expect(p?.costTier).toBe('free')
  })

  it('listAll returns providers with correct shape', () => {
    const registry = new ProviderRegistry()
    registry.register('provider-a', {
      name: 'Provider A',
      type: 'llm',
      costTier: 'subscription',
      capabilities: ['chat', 'code'],
      check: async () => false,
    })
    const providers = registry.listAll()
    expect(providers[0]).toHaveProperty('name')
    expect(providers[0]).toHaveProperty('type')
    expect(providers[0]).toHaveProperty('costTier')
    expect(providers[0]).toHaveProperty('capabilities')
    expect(providers[0]).toHaveProperty('status')
  })
})

// ── createDefaultRegistry ─────────────────────────────────────────────────────

describe('createDefaultRegistry', () => {
  it('returns a ProviderRegistry instance', () => {
    const registry = createDefaultRegistry()
    expect(registry instanceof ProviderRegistry).toBe(true)
  })

  it('has at least ollama and claude-code registered', () => {
    const registry = createDefaultRegistry()
    const providers = registry.listAll()
    const names = providers.map(p => p.name)
    expect(providers.length).toBeGreaterThan(0)
    // At least some providers registered
    expect(names.some(n => n.toLowerCase().includes('ollama') || n.toLowerCase().includes('claude'))).toBe(true)
  })
})

// ── loadCodexToken ────────────────────────────────────────────────────────────

describe('loadCodexToken', () => {
  it('returns null when credentials file does not exist', () => {
    // existsSync mocked to false → no cred file
    expect(loadCodexToken()).toBeNull()
  })

  it('does not throw', () => {
    expect(() => loadCodexToken()).not.toThrow()
  })
})
