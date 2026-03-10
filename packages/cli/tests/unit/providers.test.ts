/**
 * Unit tests for providers.ts — ProviderRegistry class (register, select, listAll, getByName).
 * Tests the registry logic without network calls.
 * @module CORE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-providers-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-providers-test/config.json',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync }
})

import {
  ProviderRegistry,
  type Provider,
} from '../../src/providers.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRegistry(): ProviderRegistry {
  return new ProviderRegistry()
}

function registerProvider(
  registry: ProviderRegistry,
  name: string,
  overrides: Partial<Omit<Provider, 'status'>> = {},
  checkResult = true,
): void {
  registry.register(name, {
    name,
    type: 'llm',
    costTier: 'free',
    capabilities: ['chat'],
    check: async () => checkResult,
    ...overrides,
  })
}

// ── ProviderRegistry — registration ───────────────────────────────────────────

describe('ProviderRegistry.register + listAll', () => {
  it('starts with empty list', () => {
    const r = makeRegistry()
    expect(r.listAll()).toHaveLength(0)
  })

  it('listAll returns registered provider', () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama')
    expect(r.listAll()).toHaveLength(1)
  })

  it('listAll returns all registered providers', () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama')
    registerProvider(r, 'groq')
    registerProvider(r, 'claude')
    expect(r.listAll()).toHaveLength(3)
  })

  it('each listed provider has required fields', () => {
    const r = makeRegistry()
    registerProvider(r, 'test-llm')
    const providers = r.listAll()
    for (const p of providers) {
      expect(p).toHaveProperty('name')
      expect(p).toHaveProperty('type')
      expect(p).toHaveProperty('costTier')
      expect(p).toHaveProperty('capabilities')
      expect(p).toHaveProperty('status')
    }
  })

  it('newly registered provider has status unavailable', () => {
    const r = makeRegistry()
    registerProvider(r, 'new-provider')
    const [p] = r.listAll()
    expect(p.status).toBe('unavailable')
  })

  it('overwriting a provider name replaces it', () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama', { capabilities: ['chat'] })
    registerProvider(r, 'ollama', { capabilities: ['embed'] })
    expect(r.listAll()).toHaveLength(1)
    expect(r.listAll()[0].capabilities).toContain('embed')
  })
})

// ── ProviderRegistry — getByName ───────────────────────────────────────────────

describe('ProviderRegistry.getByName', () => {
  it('returns undefined for unknown name', () => {
    const r = makeRegistry()
    expect(r.getByName('nonexistent')).toBeUndefined()
  })

  it('returns provider for known name', () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama')
    const p = r.getByName('ollama')
    expect(p).toBeDefined()
    expect(p?.name).toBe('ollama')
  })

  it('returned provider does not expose check function', () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama')
    const p = r.getByName('ollama')
    expect(p).not.toHaveProperty('check')
  })
})

// ── ProviderRegistry — select ─────────────────────────────────────────────────

describe('ProviderRegistry.select', () => {
  it('returns null when no providers registered', async () => {
    const r = makeRegistry()
    expect(await r.select('chat')).toBeNull()
  })

  it('returns null when no provider has the required capability', async () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama', { capabilities: ['chat'] })
    expect(await r.select('embed')).toBeNull()
  })

  it('returns null when all providers are unavailable', async () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama', { capabilities: ['chat'] })
    // Status is 'unavailable' by default (not checked)
    expect(await r.select('chat')).toBeNull()
  })

  it('returns provider after checkAll marks it available', async () => {
    const r = makeRegistry()
    registerProvider(r, 'ollama', { capabilities: ['chat'] }, true)
    await r.checkAll({ silent: true })
    const p = await r.select('chat')
    expect(p).not.toBeNull()
    expect(p?.name).toBe('ollama')
  })

  it('prefers free tier over subscription', async () => {
    const r = makeRegistry()
    registerProvider(r, 'free-llm', { capabilities: ['chat'], costTier: 'free' }, true)
    registerProvider(r, 'paid-llm', { capabilities: ['chat'], costTier: 'subscription' }, true)
    await r.checkAll({ silent: true })
    const p = await r.select('chat')
    expect(p?.name).toBe('free-llm')
  })
})

// ── ProviderRegistry — checkAll ────────────────────────────────────────────────

describe('ProviderRegistry.checkAll', () => {
  it('does not throw with empty registry', async () => {
    const r = makeRegistry()
    await expect(r.checkAll({ silent: true })).resolves.not.toThrow()
  })

  it('marks provider as available when check returns true', async () => {
    const r = makeRegistry()
    registerProvider(r, 'good-provider', {}, true)
    await r.checkAll({ silent: true })
    expect(r.getByName('good-provider')?.status).toBe('available')
  })

  it('marks provider as unavailable when check returns false', async () => {
    const r = makeRegistry()
    registerProvider(r, 'bad-provider', {}, false)
    await r.checkAll({ silent: true })
    expect(r.getByName('bad-provider')?.status).toBe('unavailable')
  })

  it('marks provider as unavailable when check throws', async () => {
    const r = makeRegistry()
    r.register('throwing-provider', {
      name: 'throwing-provider',
      type: 'llm',
      costTier: 'free',
      capabilities: ['chat'],
      check: async () => { throw new Error('network error') },
    })
    await r.checkAll({ silent: true })
    expect(r.getByName('throwing-provider')?.status).toBe('unavailable')
  })
})
