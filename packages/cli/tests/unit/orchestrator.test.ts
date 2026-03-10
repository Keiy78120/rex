/**
 * Unit tests for orchestrator.ts — SPECIALIST_PROFILES catalog and checkSpecialistLimits.
 * Tests the specialist profiles data structure and limits logic without network calls.
 * @module BUDGET
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-orchestrator-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-orchestrator-test/config.json',
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), spawnSync: vi.fn(() => ({ stdout: '' })) }
})

vi.mock('../../src/budget.js', () => ({
  trackUsage: vi.fn(),
  getDailyUsage: vi.fn(() => []),
}))

vi.mock('../../src/sync-queue.js', () => ({
  appendEvent: vi.fn(),
}))

vi.mock('../../src/free-tiers.js', () => ({
  callWithAutoFallback: vi.fn(async () => ({ content: 'ok', provider: 'test', tokensIn: 0, tokensOut: 0 })),
}))

vi.mock('../../src/account-pool.js', () => ({
  selectAccount: vi.fn(() => null),
  acquireAccount: vi.fn(),
  releaseAccount: vi.fn(),
  getAccountEnv: vi.fn(() => ({})),
}))

import {
  SPECIALIST_PROFILES,
  checkSpecialistLimits,
} from '../../src/orchestrator.js'

const ALL_SPECIALISTS = Object.keys(SPECIALIST_PROFILES)

// ── SPECIALIST_PROFILES catalog ───────────────────────────────────────────────

describe('SPECIALIST_PROFILES', () => {
  it('is an object', () => {
    expect(typeof SPECIALIST_PROFILES).toBe('object')
  })

  it('has at least 5 specialist entries', () => {
    expect(ALL_SPECIALISTS.length).toBeGreaterThanOrEqual(5)
  })

  it('includes script, ollama, groq, claude-code entries', () => {
    expect(SPECIALIST_PROFILES).toHaveProperty('script')
    expect(SPECIALIST_PROFILES).toHaveProperty('ollama')
    expect(SPECIALIST_PROFILES).toHaveProperty('groq')
    expect(SPECIALIST_PROFILES).toHaveProperty('claude-code')
  })

  it('each profile has required fields', () => {
    for (const key of ALL_SPECIALISTS) {
      const p = SPECIALIST_PROFILES[key]
      expect(p).toHaveProperty('contextWindow')
      expect(p).toHaveProperty('strengths')
      expect(p).toHaveProperty('weaknesses')
      expect(p).toHaveProperty('avgLatencyMs')
      expect(p).toHaveProperty('costPerToken')
      expect(p).toHaveProperty('staggerMs')
    }
  })

  it('script has contextWindow Infinity and costPerToken 0', () => {
    expect(SPECIALIST_PROFILES.script.contextWindow).toBe(Infinity)
    expect(SPECIALIST_PROFILES.script.costPerToken).toBe(0)
  })

  it('ollama has costPerToken 0 (local)', () => {
    expect(SPECIALIST_PROFILES.ollama.costPerToken).toBe(0)
  })

  it('strengths and weaknesses are arrays', () => {
    for (const key of ALL_SPECIALISTS) {
      const p = SPECIALIST_PROFILES[key]
      expect(Array.isArray(p.strengths)).toBe(true)
      expect(Array.isArray(p.weaknesses)).toBe(true)
    }
  })

  it('numeric fields are non-negative', () => {
    for (const key of ALL_SPECIALISTS) {
      const p = SPECIALIST_PROFILES[key]
      if (isFinite(p.contextWindow)) {
        expect(p.contextWindow).toBeGreaterThan(0)
      }
      expect(p.avgLatencyMs).toBeGreaterThanOrEqual(0)
      expect(p.costPerToken).toBeGreaterThanOrEqual(0)
      expect(p.staggerMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('paid providers (claude-code, claude-api) have staggerMs of 800', () => {
    expect(SPECIALIST_PROFILES['claude-code'].staggerMs).toBe(800)
    expect(SPECIALIST_PROFILES['claude-api'].staggerMs).toBe(800)
  })
})

// ── checkSpecialistLimits ─────────────────────────────────────────────────────

describe('checkSpecialistLimits', () => {
  it('returns canHandle: true for unknown provider', () => {
    const result = checkSpecialistLimits('unknown-provider', 'hello', {})
    expect(result.canHandle).toBe(true)
  })

  it('returns canHandle: true for short prompt within context window', () => {
    const result = checkSpecialistLimits('ollama', 'short prompt', {})
    expect(result.canHandle).toBe(true)
  })

  it('returns canHandle: false when prompt exceeds 90% of context window', () => {
    // ollama has contextWindow=8192, 90% = 7372 tokens, ~4 chars/token → 29488 chars
    const hugePrompt = 'a'.repeat(30000)
    const result = checkSpecialistLimits('ollama', hugePrompt, {})
    expect(result.canHandle).toBe(false)
    expect(result.handoffNote).toBeDefined()
    expect(result.handoffNote).toContain('ollama')
  })

  it('handoffNote includes token estimate and limit info', () => {
    const hugePrompt = 'a'.repeat(30000)
    const result = checkSpecialistLimits('ollama', hugePrompt, {})
    expect(result.handoffNote).toMatch(/tokens/)
  })

  it('script has Infinity context window — never rejects for prompt length', () => {
    const hugePrompt = 'a'.repeat(1_000_000)
    const result = checkSpecialistLimits('script', hugePrompt, {})
    // Infinity context → prompt length check skipped
    expect(result.canHandle).toBe(true)
  })

  it('returns canHandle: false when capability is in weaknesses', () => {
    // script has weaknesses: ['reasoning', 'creative']
    const result = checkSpecialistLimits('script', 'short prompt', { capability: 'reasoning' })
    expect(result.canHandle).toBe(false)
    expect(result.handoffNote).toContain('reasoning')
  })

  it('returns canHandle: true when capability is NOT in weaknesses', () => {
    // script has strengths: ['shell', 'file', 'system', 'deterministic', 'fast']
    const result = checkSpecialistLimits('script', 'short prompt', { capability: 'shell' })
    expect(result.canHandle).toBe(true)
  })

  it('returns canHandle: true when no capability specified', () => {
    const result = checkSpecialistLimits('ollama', 'short prompt', {})
    expect(result.canHandle).toBe(true)
  })

  it('claude-code can handle very large prompts (200k context)', () => {
    // 200000 * 0.9 * 4 chars = 720000 chars — use 500k which is under 90%
    const bigPrompt = 'a'.repeat(500_000)
    const result = checkSpecialistLimits('claude-code', bigPrompt, {})
    expect(result.canHandle).toBe(true)
  })
})
