/**
 * Unit tests for providers.ts — ProviderRegistry class.
 * Tests select, listAll, getByName with in-memory providers.
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

// Mock fs to avoid reading settings.json
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync }
})

// Mock execSync to avoid running shell commands
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import { ProviderRegistry } from '../../src/providers.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRegistry() {
  const registry = new ProviderRegistry()

  registry.register('ollama', {
    name: 'Ollama',
    type: 'llm',
    costTier: 'free',
    capabilities: ['chat', 'code'],
    check: async () => true,
  })

  registry.register('groq', {
    name: 'Groq',
    type: 'llm',
    costTier: 'free',
    capabilities: ['chat', 'fast'],
    check: async () => true,
  })

  registry.register('claude-sonnet', {
    name: 'Claude Sonnet',
    type: 'llm',
    costTier: 'subscription',
    capabilities: ['chat', 'code', 'reasoning'],
    check: async () => true,
  })

  return registry
}

// ── ProviderRegistry — listAll ────────────────────────────────────────────────

describe('ProviderRegistry — listAll', () => {
  it('returns empty array when no providers registered', () => {
    const r = new ProviderRegistry()
    expect(r.listAll()).toEqual([])
  })

  it('returns all registered providers', () => {
    const r = makeRegistry()
    expect(r.listAll().length).toBe(3)
  })

  it('returned items have Provider shape', () => {
    const r = makeRegistry()
    for (const p of r.listAll()) {
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('type')
      expect(p).toHaveProperty('costTier')
      expect(p).toHaveProperty('status')
      expect(p).toHaveProperty('capabilities')
    }
  })

  it('does not expose check function', () => {
    const r = makeRegistry()
    for (const p of r.listAll()) {
      expect((p as Record<string, unknown>)['check']).toBeUndefined()
    }
  })

  it('initial status is unavailable (no checkAll run)', () => {
    const r = makeRegistry()
    for (const p of r.listAll()) {
      expect(p.status).toBe('unavailable')
    }
  })
})

// ── ProviderRegistry — getByName ──────────────────────────────────────────────

describe('ProviderRegistry — getByName', () => {
  it('returns provider by registered name', () => {
    const r = makeRegistry()
    const p = r.getByName('ollama')
    expect(p).toBeDefined()
    expect(p?.name).toBe('Ollama')
  })

  it('returns undefined for unknown name', () => {
    const r = makeRegistry()
    expect(r.getByName('nonexistent')).toBeUndefined()
  })

  it('returned provider does not expose check function', () => {
    const r = makeRegistry()
    const p = r.getByName('ollama')
    expect((p as Record<string, unknown> | undefined)?.['check']).toBeUndefined()
  })
})

// ── ProviderRegistry — select ─────────────────────────────────────────────────

describe('ProviderRegistry — select', () => {
  it('returns null when no providers match capability', async () => {
    const r = makeRegistry()
    expect(await r.select('transcribe')).toBeNull()
  })

  it('returns null when all matching providers are unavailable', async () => {
    const r = makeRegistry()
    // No checkAll run → all unavailable
    expect(await r.select('chat')).toBeNull()
  })

  it('returns available provider after checkAll', async () => {
    const r = makeRegistry()
    await r.checkAll({ silent: true })
    const p = await r.select('chat')
    expect(p).not.toBeNull()
    expect(p?.status).not.toBe('unavailable')
  })

  it('prefers free over subscription tier', async () => {
    const r = makeRegistry()
    await r.checkAll({ silent: true })
    const p = await r.select('code')
    // Ollama (free) and Claude Sonnet (subscription) both have 'code'
    // free should win
    expect(p?.costTier).toBe('free')
  })

  it('returns provider with required capability', async () => {
    const r = makeRegistry()
    await r.checkAll({ silent: true })
    const p = await r.select('reasoning')
    // Only Claude Sonnet has 'reasoning'
    expect(p?.name).toBe('Claude Sonnet')
  })
})

// ── ProviderRegistry — register ───────────────────────────────────────────────

describe('ProviderRegistry — register', () => {
  it('registers and retrieves a custom provider', () => {
    const r = new ProviderRegistry()
    r.register('test', {
      name: 'Test',
      type: 'tool',
      costTier: 'free',
      capabilities: ['test'],
      check: async () => true,
    })
    expect(r.getByName('test')?.name).toBe('Test')
  })

  it('overrides existing provider with same name', () => {
    const r = new ProviderRegistry()
    r.register('myp', {
      name: 'Original',
      type: 'tool',
      costTier: 'free',
      capabilities: ['a'],
      check: async () => true,
    })
    r.register('myp', {
      name: 'Overridden',
      type: 'service',
      costTier: 'subscription',
      capabilities: ['b'],
      check: async () => false,
    })
    expect(r.getByName('myp')?.name).toBe('Overridden')
    expect(r.listAll().length).toBe(1)
  })
})
