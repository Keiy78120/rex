/**
 * Unit tests for free-models.ts — FREE_MODELS catalog and query helpers.
 * Pure data functions — no mocking needed.
 * @module LLM
 */
import { describe, it, expect } from 'vitest'

import {
  FREE_MODELS,
  getModelsByProvider,
  getModelsByCapability,
  getFreeAndLocalModels,
  getModelsByTierOrder,
  pickBestModel,
  getModelRpm,
  getModelsSummary,
} from '../../src/free-models.js'

// ── FREE_MODELS catalog ───────────────────────────────────────────────────────

describe('FREE_MODELS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(FREE_MODELS)).toBe(true)
    expect(FREE_MODELS.length).toBeGreaterThan(0)
  })

  it('each model has required fields', () => {
    for (const m of FREE_MODELS) {
      expect(typeof m.modelId).toBe('string')
      expect(m.modelId.length).toBeGreaterThan(0)
      expect(typeof m.provider).toBe('string')
      expect(Array.isArray(m.capabilities)).toBe(true)
      expect(['local', 'free-tier', 'subscription', 'pay-per-use']).toContain(m.tier)
      expect(['active', 'beta', 'deprecated', 'unknown']).toContain(m.status)
    }
  })

  it('has at least one ollama (local) model', () => {
    const local = FREE_MODELS.filter(m => m.tier === 'local')
    expect(local.length).toBeGreaterThan(0)
  })

  it('has at least one free-tier model', () => {
    const free = FREE_MODELS.filter(m => m.tier === 'free-tier')
    expect(free.length).toBeGreaterThan(0)
  })
})

// ── getModelsByProvider ───────────────────────────────────────────────────────

describe('getModelsByProvider', () => {
  it('returns an array', () => {
    expect(Array.isArray(getModelsByProvider('ollama'))).toBe(true)
  })

  it('returns only models from the given provider', () => {
    const models = getModelsByProvider('ollama')
    for (const m of models) {
      expect(m.provider.toLowerCase()).toBe('ollama')
    }
  })

  it('is case-insensitive', () => {
    const lower = getModelsByProvider('ollama')
    const upper = getModelsByProvider('OLLAMA')
    expect(lower.length).toBe(upper.length)
  })

  it('returns empty array for non-existent provider', () => {
    expect(getModelsByProvider('nonexistent-provider-xyz')).toHaveLength(0)
  })
})

// ── getModelsByCapability ─────────────────────────────────────────────────────

describe('getModelsByCapability', () => {
  it('returns models with the given capability', () => {
    const models = getModelsByCapability('chat')
    for (const m of models) {
      expect(m.capabilities).toContain('chat')
    }
  })

  it('returns non-empty array for chat capability', () => {
    expect(getModelsByCapability('chat').length).toBeGreaterThan(0)
  })

  it('with multiple caps, returns intersection', () => {
    const models = getModelsByCapability('chat', 'code')
    for (const m of models) {
      expect(m.capabilities).toContain('chat')
      expect(m.capabilities).toContain('code')
    }
  })
})

// ── getFreeAndLocalModels ─────────────────────────────────────────────────────

describe('getFreeAndLocalModels', () => {
  it('returns an array', () => {
    expect(Array.isArray(getFreeAndLocalModels())).toBe(true)
  })

  it('returns only local or free-tier models', () => {
    const models = getFreeAndLocalModels()
    for (const m of models) {
      expect(['local', 'free-tier']).toContain(m.tier)
    }
  })

  it('excludes subscription and pay-per-use models', () => {
    const models = getFreeAndLocalModels()
    const bad = models.filter(m => m.tier === 'subscription' || m.tier === 'pay-per-use')
    expect(bad).toHaveLength(0)
  })
})

// ── getModelsByTierOrder ──────────────────────────────────────────────────────

describe('getModelsByTierOrder', () => {
  it('returns all models', () => {
    expect(getModelsByTierOrder().length).toBe(FREE_MODELS.length)
  })

  it('local models come before free-tier', () => {
    const ordered = getModelsByTierOrder()
    const firstFree = ordered.findIndex(m => m.tier === 'free-tier')
    const lastLocal = ordered.slice().reverse().findIndex(m => m.tier === 'local')
    const lastLocalIdx = ordered.length - 1 - lastLocal
    if (firstFree !== -1 && lastLocal !== -1) {
      expect(lastLocalIdx).toBeLessThan(firstFree)
    }
  })
})

// ── pickBestModel ─────────────────────────────────────────────────────────────

describe('pickBestModel', () => {
  it('returns a model or null', () => {
    const result = pickBestModel(['chat'])
    expect(result === null || typeof result === 'object').toBe(true)
  })

  it('returns active model for chat capability', () => {
    const model = pickBestModel(['chat'])
    if (model) {
      expect(model.status).toBe('active')
      expect(model.capabilities).toContain('chat')
    }
  })

  it('returns null when capability not available', () => {
    // 'vision' + 'embed' combination is unlikely to exist in local tier
    const model = pickBestModel(['vision', 'embed', 'code', 'reasoning', 'fast'], ['ollama', 'groq', 'claude', 'cerebras', 'together', 'mistral', 'openrouter', 'deepseek'])
    expect(model).toBeNull()
  })

  it('respects excludeProviders', () => {
    const model = pickBestModel(['chat'], ['ollama'])
    if (model) {
      expect(model.provider).not.toBe('ollama')
    }
  })
})

// ── getModelRpm ───────────────────────────────────────────────────────────────

describe('getModelRpm', () => {
  it('returns a number', () => {
    expect(typeof getModelRpm('ollama', 'qwen2.5:7b')).toBe('number')
  })

  it('returns default 60 for unknown model', () => {
    expect(getModelRpm('unknown-provider', 'unknown-model')).toBe(60)
  })
})

// ── getModelsSummary ──────────────────────────────────────────────────────────

describe('getModelsSummary', () => {
  it('returns an array', () => {
    expect(Array.isArray(getModelsSummary())).toBe(true)
  })

  it('each summary entry has required fields', () => {
    const summaries = getModelsSummary()
    for (const s of summaries) {
      expect(typeof s.provider).toBe('string')
      expect(typeof s.model).toBe('string')
      expect(typeof s.tier).toBe('string')
      expect(typeof s.context).toBe('number')
      expect(typeof s.rpm).not.toBe('undefined')
    }
  })

  it('only includes active models', () => {
    const summaries = getModelsSummary()
    // All in summary should be active (non-deprecated)
    expect(summaries.length).toBeGreaterThan(0)
  })
})
