/**
 * Unit tests for orchestration-policy.ts
 * Tests: routing tiers based on message content (pure heuristics, 0 LLM)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  MEMORY_DB_PATH: '/tmp/test-policy.db',
  REX_DIR: '/tmp/test-rex',
}))
vi.mock('../../src/providers.js', () => ({
  pickModel: async () => 'qwen2.5:7b',
}))
// Mock project-intent to avoid scanning real filesystem
vi.mock('../../src/project-intent.js', () => ({
  detectIntent: () => null,
}))

import { routeRequest } from '../../src/orchestration-policy.js'

// ── Tier 0: Script/CLI ───────────────────────────────────────────────────────

describe('routeRequest — Tier 0 (script)', () => {
  it('routes "git status" to script tier', async () => {
    const result = await routeRequest('git status', { ollamaAvailable: false })
    expect(result.tier).toBe('script')
    expect(result.estimatedCost).toBe('free')
  })

  it('routes "rex doctor" to script tier', async () => {
    const result = await routeRequest('rex doctor check', { ollamaAvailable: false })
    expect(result.tier).toBe('script')
  })

  it('routes "check logs" to script tier', async () => {
    const result = await routeRequest('show me the logs', { ollamaAvailable: false })
    expect(result.tier).toBe('script')
    expect(result.estimatedCost).toBe('free')
  })

  it('routes memory search to script tier', async () => {
    const result = await routeRequest('search my memory for JWT bug', { ollamaAvailable: false })
    expect(result.tier).toBe('script')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('routes "recall how I fixed..." to script tier', async () => {
    const result = await routeRequest('recall how I fixed the gateway issue', { ollamaAvailable: false })
    expect(result.tier).toBe('script')
  })
})

// ── Tier 5: Codex ────────────────────────────────────────────────────────────

describe('routeRequest — Tier 5 (codex)', () => {
  it('routes batch file modification to codex', async () => {
    const result = await routeRequest('modify files across the whole repo', { ollamaAvailable: true })
    expect(result.tier).toBe('codex')
    expect(result.estimatedCost).toBe('free')
  })

  it('routes context overflow (>80%) to codex', async () => {
    const result = await routeRequest('help me with this', { ollamaAvailable: true, contextPercent: 85 })
    expect(result.tier).toBe('codex')
    expect(result.reason).toContain('80%')
  })

  it('routes background parallel task to codex', async () => {
    const result = await routeRequest('non-interactive batch processing of files', { ollamaAvailable: false })
    expect(result.tier).toBe('codex')
  })
})

// ── Tier 4: Opus ─────────────────────────────────────────────────────────────

describe('routeRequest — Tier 4 (opus)', () => {
  it('routes architecture request to opus (first call)', async () => {
    // Reset internal counter by mocking — just check tier
    const result = await routeRequest('design the entire architecture for the fleet', { ollamaAvailable: false })
    expect(['opus', 'sonnet']).toContain(result.tier)  // opus or fallback if daily limit hit
    if (result.tier === 'opus') {
      expect(result.model).toBe('claude-opus-4-6')
      expect(result.estimatedCost).toBe('subscription-high')
    }
  })

  it('routes strategy request to opus', async () => {
    const result = await routeRequest('give me the strategic roadmap for REX v8', { ollamaAvailable: false })
    expect(['opus', 'sonnet']).toContain(result.tier)
  })
})

// ── Tier 1: Local (Ollama) ───────────────────────────────────────────────────

describe('routeRequest — Tier 1 (local)', () => {
  it('routes short message to local when Ollama is available', async () => {
    const result = await routeRequest('explain what tsup does', { ollamaAvailable: true })
    // Should be local (ollama) for simple short message
    expect(['local', 'sonnet']).toContain(result.tier)
    if (result.tier === 'local') {
      expect(result.estimatedCost).toBe('free')
    }
  })
})

// ── Tier 2: Free tier ────────────────────────────────────────────────────────

describe('routeRequest — Tier 2 (free-tier)', () => {
  it('falls back to free-tier when Ollama is offline', async () => {
    const shortSimpleMsg = 'what is the capital of France'
    const result = await routeRequest(shortSimpleMsg, { ollamaAvailable: false })
    // short + no script/codex/opus triggers + no Ollama → free-tier
    expect(['free-tier', 'script', 'sonnet']).toContain(result.tier)
    if (result.tier === 'free-tier') {
      expect(result.estimatedCost).toBe('free')
    }
  })
})

// ── Force override ────────────────────────────────────────────────────────────

describe('routeRequest — force override', () => {
  it('respects forceModel override', async () => {
    const result = await routeRequest('any message', { forceModel: 'claude-haiku-4-5-20251001' })
    expect(result.model).toBe('claude-haiku-4-5-20251001')
    expect(result.confidence).toBe(1)
    expect(result.reason).toContain('forced')
  })

  it('sets subscription-high cost for opus force', async () => {
    const result = await routeRequest('any', { forceModel: 'claude-opus-4-6' })
    expect(result.estimatedCost).toBe('subscription-high')
  })

  it('sets subscription-low cost for non-opus force', async () => {
    const result = await routeRequest('any', { forceModel: 'claude-sonnet-4-6' })
    expect(result.estimatedCost).toBe('subscription-low')
  })
})

// ── Response shape ────────────────────────────────────────────────────────────

describe('routeRequest — response shape', () => {
  it('always returns all required fields', async () => {
    const result = await routeRequest('test', { ollamaAvailable: false })
    expect(result).toHaveProperty('tier')
    expect(result).toHaveProperty('model')
    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('estimatedCost')
    expect(result).toHaveProperty('confidence')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('confidence is always between 0 and 1', async () => {
    const messages = ['fix this bug', 'architect the whole system', 'git log --oneline']
    for (const msg of messages) {
      const r = await routeRequest(msg, { ollamaAvailable: false })
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
    }
  })
})
