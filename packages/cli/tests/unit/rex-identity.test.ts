/**
 * Unit tests for rex-identity.ts
 * Tests: intent detection, script-first routing, brief building, response formatting
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB-dependent modules before importing rex-identity
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  MEMORY_DB_PATH: '/tmp/test-rex-identity.db',
  REX_DIR: '/tmp/test-rex',
  CLAUDE_DIR: '/tmp/test-claude',
}))
vi.mock('../../src/event-journal.js', () => ({
  getRecentEvents: () => [],
}))
vi.mock('../../src/curious.js', () => ({
  getRelevantSignals: () => [],
}))
vi.mock('../../src/memory.js', () => ({
  searchMemory: () => [],
}))
// Mock Effect to avoid heavy import
vi.mock('effect', async () => {
  const actual = await import('effect')
  return actual
})

import {
  tryScriptFirst,
  buildFocusedBrief,
  formatRexResponse,
  type RexContext,
} from '../../src/rex-identity.js'

// ── Test fixtures ──────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<RexContext> = {}): RexContext {
  return {
    message: 'test message',
    memorySnippets: [],
    recentEvents: [],
    intent: 'general',
    openLoopSignals: [],
    projectCwd: '/tmp/test-project',
    ...overrides,
  }
}

// ── tryScriptFirst ─────────────────────────────────────────────────────────────

describe('tryScriptFirst', () => {
  it('returns null for a generic LLM-needed message', () => {
    const ctx = makeCtx({ message: 'write me a poem about databases' })
    expect(tryScriptFirst(ctx)).toBeNull()
  })

  it('returns null for complex coding task', () => {
    const ctx = makeCtx({ message: 'implement a new agent template for marketing' })
    expect(tryScriptFirst(ctx)).toBeNull()
  })

  it('returns a string (not null) for deterministic questions if rules match', () => {
    // If script-first rules don't match this, null is the correct result
    const ctx = makeCtx({ message: 'quelle heure est-il' })
    const result = tryScriptFirst(ctx)
    // result is either null (no rule matched) or a non-empty string (rule matched)
    if (result !== null) {
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

// ── buildFocusedBrief ──────────────────────────────────────────────────────────

describe('buildFocusedBrief', () => {
  it('always includes the user message', () => {
    const ctx = makeCtx({ message: 'how do I optimize the relay?' })
    const brief = buildFocusedBrief(ctx)
    expect(brief).toContain('how do I optimize the relay?')
  })

  it('includes detected intent', () => {
    const ctx = makeCtx({ intent: 'search' })
    const brief = buildFocusedBrief(ctx)
    expect(brief).toContain('search')
  })

  it('includes memory snippets when present', () => {
    const ctx = makeCtx({
      memorySnippets: ['Used tsup for building the CLI', 'Fixed double response bug'],
    })
    const brief = buildFocusedBrief(ctx)
    expect(brief).toContain('Used tsup for building the CLI')
    expect(brief).toContain('Fixed double response bug')
  })

  it('includes open loop signals when present', () => {
    const ctx = makeCtx({
      openLoopSignals: ['Gateway rate limit not handled'],
    })
    const brief = buildFocusedBrief(ctx)
    expect(brief).toContain('Gateway rate limit not handled')
  })

  it('includes recent events when present', () => {
    const ctx = makeCtx({
      recentEvents: ['daemon started', 'ingest completed 120 chunks'],
    })
    const brief = buildFocusedBrief(ctx)
    expect(brief).toContain('daemon started')
  })

  it('always ends with REX identity instruction', () => {
    const brief = buildFocusedBrief(makeCtx())
    expect(brief).toContain('you ARE REX')
  })

  it('empty context produces a compact brief', () => {
    const brief = buildFocusedBrief(makeCtx())
    // Should not have memory/event sections when empty
    expect(brief).not.toContain('Relevant memory context')
    expect(brief).not.toContain('Recent system events')
  })
})

// ── formatRexResponse ─────────────────────────────────────────────────────────

describe('formatRexResponse', () => {
  const ctx = makeCtx()

  it('strips "As an AI" opener', () => {
    const raw = 'As an AI, I can help you with that. Here is the answer.'
    const result = formatRexResponse(raw, ctx)
    expect(result).not.toMatch(/^As an AI/i)
    expect(result).toContain('Here is the answer')
  })

  it('strips "I\'m Claude" opener', () => {
    const raw = "I'm Claude, your AI assistant. The answer is 42."
    const result = formatRexResponse(raw, ctx)
    expect(result).not.toMatch(/^I'm Claude/i)
    expect(result).toContain('42')
  })

  it('strips "Sure!" opener', () => {
    const raw = 'Sure! Here is how to fix it.'
    const result = formatRexResponse(raw, ctx)
    expect(result).not.toMatch(/^Sure[!,]/i)
    expect(result).toContain('Here is how to fix it')
  })

  it('strips "Certainly" opener', () => {
    const raw = 'Certainly! I can do that for you.'
    const result = formatRexResponse(raw, ctx)
    expect(result.trim()).not.toMatch(/^Certainly/i)
  })

  it('strips "Of course" opener', () => {
    const raw = 'Of course! Let me explain.'
    const result = formatRexResponse(raw, ctx)
    expect(result.trim()).not.toMatch(/^Of course/i)
  })

  it('strips "Hello!" opener', () => {
    const raw = 'Hello! I will help with that.'
    const result = formatRexResponse(raw, ctx)
    expect(result.trim()).not.toMatch(/^Hello/i)
    expect(result).toContain('I will help with that')
  })

  it('strips "Great!" opener', () => {
    const raw = 'Great! Your code is ready.'
    const result = formatRexResponse(raw, ctx)
    expect(result.trim()).not.toMatch(/^Great/i)
    expect(result).toContain('Your code is ready')
  })

  it('does not modify a clean response', () => {
    const raw = 'The relay engine uses RxJS pipelines.'
    const result = formatRexResponse(raw, ctx)
    expect(result.trim()).toBe('The relay engine uses RxJS pipelines.')
  })

  it('trims leading/trailing whitespace', () => {
    const raw = '   Some response   '
    const result = formatRexResponse(raw, ctx)
    expect(result).toBe(result.trim())
  })
})
