/**
 * Unit tests for inventory.ts — generateRecommendations and rankResources.
 * Tests pure data-transformation functions without system calls or file I/O.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-inventory-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-inventory-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-inventory-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: vi.fn(() => '{}'), writeFileSync: vi.fn() }
})

vi.mock('../../src/free-tiers.js', () => ({
  FREE_TIER_PROVIDERS: [
    { name: 'Groq', requiresKey: true, envKey: 'GROQ_API_KEY' },
  ],
  getApiKey: vi.fn(() => null),
  isProviderAvailable: vi.fn(() => false),
  callProvider: vi.fn(async () => { throw new Error('no') }),
}))

import {
  generateRecommendations,
  rankResources,
  type ResourceInventory,
} from '../../src/inventory.js'

// ── Test fixture ──────────────────────────────────────────────────────────────

function makeInventory(overrides: Partial<ResourceInventory> = {}): ResourceInventory {
  return {
    capturedAt: new Date().toISOString(),
    hardware: { cpu: 'Apple M3', ram: '24 GB', gpu: 'Apple M3 GPU', diskFree: '100 GB' },
    clis: [],
    services: [],
    models: { generation: [], embedding: [] },
    providers: [],
    ...overrides,
  }
}

// ── generateRecommendations ───────────────────────────────────────────────────

describe('generateRecommendations', () => {
  it('returns an array', () => {
    expect(Array.isArray(generateRecommendations(makeInventory()))).toBe(true)
  })

  it('recommends starting Ollama when not running', () => {
    const inv = makeInventory({ services: [] })
    const recs = generateRecommendations(inv)
    const found = recs.find(r => r.action.includes('Ollama') || r.command?.includes('ollama serve'))
    expect(found).toBeDefined()
  })

  it('recommendation has required fields', () => {
    const recs = generateRecommendations(makeInventory())
    for (const r of recs) {
      expect(r).toHaveProperty('priority')
      expect(r).toHaveProperty('category')
      expect(r).toHaveProperty('action')
      expect(r).toHaveProperty('reason')
    }
  })

  it('priority values are valid', () => {
    const VALID = ['critical', 'high', 'medium', 'low']
    const recs = generateRecommendations(makeInventory())
    for (const r of recs) {
      expect(VALID).toContain(r.priority)
    }
  })

  it('recommendations are sorted critical first', () => {
    const inv = makeInventory({ services: [] }) // Ollama not running → critical
    const recs = generateRecommendations(inv)
    if (recs.length >= 2) {
      const ORDER = ['critical', 'high', 'medium', 'low']
      for (let i = 0; i < recs.length - 1; i++) {
        expect(ORDER.indexOf(recs[i].priority)).toBeLessThanOrEqual(ORDER.indexOf(recs[i + 1].priority))
      }
    }
  })

  it('does not recommend Ollama start when Ollama is already running', () => {
    const inv = makeInventory({
      services: [{ name: 'Ollama', status: 'running', url: 'http://localhost:11434' }],
      models: { generation: ['qwen2.5:7b'], embedding: ['nomic-embed-text'] },
      providers: [{ name: 'Groq', configured: true, details: undefined }],
    })
    const recs = generateRecommendations(inv)
    const ollama = recs.find(r => r.command === 'ollama serve')
    expect(ollama).toBeUndefined()
  })

  it('returns empty array when everything is configured', () => {
    const inv = makeInventory({
      services: [
        { name: 'Ollama', status: 'running', url: 'http://localhost:11434' },
        { name: 'Tailscale', status: 'running' },
      ],
      clis: [{ name: 'gh', version: '2.0.0', path: '/usr/local/bin/gh' }],
      models: { generation: ['qwen2.5:7b', 'qwen2.5:1.5b'], embedding: ['nomic-embed-text'] },
      providers: [{ name: 'Groq', configured: true, details: undefined }],
    })
    const recs = generateRecommendations(inv)
    expect(recs).toHaveLength(0)
  })
})

// ── rankResources ─────────────────────────────────────────────────────────────

describe('rankResources', () => {
  it('returns an array', () => {
    expect(Array.isArray(rankResources(makeInventory()))).toBe(true)
  })

  it('each resource has required fields', () => {
    const inv = makeInventory({
      clis: [{ name: 'git', version: '2.40.0', path: '/usr/bin/git' }],
    })
    const resources = rankResources(inv)
    for (const r of resources) {
      expect(r).toHaveProperty('name')
      expect(r).toHaveProperty('type')
      expect(r).toHaveProperty('available')
      expect(r).toHaveProperty('cost')
      expect(r).toHaveProperty('priority')
    }
  })

  it('hardware resource is always included', () => {
    const resources = rankResources(makeInventory())
    const hw = resources.find(r => r.type === 'hardware')
    expect(hw).toBeDefined()
    expect(hw?.cost).toBe('owned')
    expect(hw?.available).toBe(true)
  })

  it('CLI resources are included when clis array has entries', () => {
    const inv = makeInventory({
      clis: [
        { name: 'node', version: 'v22', path: '/usr/bin/node' },
        { name: 'git', version: '2.40', path: '/usr/bin/git' },
      ],
    })
    const resources = rankResources(inv)
    const cliResources = resources.filter(r => r.type === 'cli')
    expect(cliResources.length).toBe(2)
  })

  it('resources are sorted owned first (lowest priority number)', () => {
    const inv = makeInventory({
      clis: [{ name: 'git', version: '2.40', path: '/usr/bin/git' }],
      providers: [{ name: 'Claude', configured: true, details: undefined }], // subscription
    })
    const resources = rankResources(inv)
    // owned resources should come before subscription resources
    const ownedIdx = resources.findIndex(r => r.cost === 'owned')
    const subIdx = resources.findIndex(r => r.cost === 'subscription')
    if (ownedIdx !== -1 && subIdx !== -1) {
      expect(ownedIdx).toBeLessThan(subIdx)
    }
  })

  it('Ollama service has cost=free', () => {
    const inv = makeInventory({
      services: [{ name: 'Ollama', status: 'running', url: 'http://localhost:11434' }],
    })
    const resources = rankResources(inv)
    const ollama = resources.find(r => r.name === 'Ollama')
    expect(ollama?.cost).toBe('free')
  })

  it('running service has available=true', () => {
    const inv = makeInventory({
      services: [{ name: 'Ollama', status: 'running', url: 'http://localhost:11434' }],
    })
    const resources = rankResources(inv)
    const ollama = resources.find(r => r.name === 'Ollama')
    expect(ollama?.available).toBe(true)
  })

  it('stopped service has available=false', () => {
    const inv = makeInventory({
      services: [{ name: 'Tailscale', status: 'stopped' }],
    })
    const resources = rankResources(inv)
    const svc = resources.find(r => r.name === 'Tailscale')
    expect(svc?.available).toBe(false)
  })

  it('model resources are type=model with cost=free', () => {
    const inv = makeInventory({
      models: { generation: ['qwen2.5:7b'], embedding: ['nomic-embed-text'] },
    })
    const resources = rankResources(inv)
    const models = resources.filter(r => r.type === 'model')
    expect(models.length).toBe(2)
    for (const m of models) {
      expect(m.cost).toBe('free')
    }
  })
})
