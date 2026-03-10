/**
 * Unit tests for relay-engine.ts
 * Tests pure helper functions: formatRelayDocument, extractConclusion
 * These require no LLM, no network, no filesystem.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/test-relay',
  DAEMON_LOG_PATH: '/tmp/test-relay/daemon.log',
}))

import { formatRelayDocument, extractConclusion, type RelayDocument } from '../../src/relay-engine.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<RelayDocument> = {}): RelayDocument {
  return {
    task: 'Explain the REX relay chain',
    context: 'Testing context',
    contributions: [],
    totalMs: 500,
    mentorUsed: false,
    ...overrides,
  }
}

function makeContribution(model: string, analysis: string, confidence = 0.7) {
  return {
    model,
    timestamp: '2026-03-15T10:00:00Z',
    analysis,
    confidence,
  }
}

// ── formatRelayDocument ───────────────────────────────────────────────────────

describe('formatRelayDocument', () => {
  it('returns a string', () => {
    const result = formatRelayDocument(makeDoc())
    expect(typeof result).toBe('string')
  })

  it('includes the task title (truncated to 120 chars)', () => {
    const task = 'Explain the relay chain'
    const result = formatRelayDocument(makeDoc({ task }))
    expect(result).toContain(task)
  })

  it('truncates task title at 120 chars in header', () => {
    const longTask = 'x'.repeat(200)
    const result = formatRelayDocument(makeDoc({ task: longTask }))
    const firstLine = result.split('\n')[0]
    // Header is "# REX Relay: " + 120 chars max
    expect(firstLine.length).toBeLessThanOrEqual('# REX Relay: '.length + 120)
  })

  it('includes context section', () => {
    const result = formatRelayDocument(makeDoc({ context: 'my-unique-context' }))
    expect(result).toContain('## Context')
    expect(result).toContain('my-unique-context')
  })

  it('includes each contribution analysis', () => {
    const doc = makeDoc({
      contributions: [
        makeContribution('qwen2.5:7b', 'First analysis here'),
        makeContribution('claude-haiku-4-5-20251001', 'Second analysis here'),
      ],
    })
    const result = formatRelayDocument(doc)
    expect(result).toContain('First analysis here')
    expect(result).toContain('Second analysis here')
  })

  it('includes confidence value for each contribution', () => {
    const doc = makeDoc({
      contributions: [makeContribution('qwen2.5:7b', 'analysis', 0.85)],
    })
    const result = formatRelayDocument(doc)
    expect(result).toContain('0.85')
  })

  it('includes conclusion when present', () => {
    const doc = makeDoc({ conclusion: 'Final answer here' })
    const result = formatRelayDocument(doc)
    expect(result).toContain('## Conclusion')
    expect(result).toContain('Final answer here')
  })

  it('omits conclusion section when absent', () => {
    const doc = makeDoc({ conclusion: undefined })
    const result = formatRelayDocument(doc)
    expect(result).not.toContain('## Conclusion')
  })

  it('includes summary stats footer', () => {
    const doc = makeDoc({ totalMs: 1234, mentorUsed: true })
    const result = formatRelayDocument(doc)
    expect(result).toContain('1234ms')
    expect(result).toContain('Mentor: true')
  })

  it('shows correct stage count in footer', () => {
    const doc = makeDoc({
      contributions: [
        makeContribution('model-a', 'a'),
        makeContribution('model-b', 'b'),
      ],
    })
    const result = formatRelayDocument(doc)
    expect(result).toContain('Stages: 2')
  })

  it('uses short model name (before colon) in section header', () => {
    const doc = makeDoc({
      contributions: [makeContribution('qwen2.5:7b', 'analysis')],
    })
    const result = formatRelayDocument(doc)
    expect(result).toContain('## qwen2.5 Analysis')
  })

  it('includes passReason when present', () => {
    const doc = makeDoc({
      contributions: [{
        model: 'qwen2.5:7b',
        timestamp: '2026-03-15T10:00:00Z',
        analysis: 'analysis text',
        confidence: 0.6,
        passReason: 'Needs more depth',
      }],
    })
    const result = formatRelayDocument(doc)
    expect(result).toContain('Needs more depth')
  })
})

// ── extractConclusion ─────────────────────────────────────────────────────────

describe('extractConclusion', () => {
  it('returns doc.conclusion when present', () => {
    const doc = makeDoc({ conclusion: 'Explicit conclusion' })
    expect(extractConclusion(doc)).toBe('Explicit conclusion')
  })

  it('returns empty string when no contributions and no conclusion', () => {
    const doc = makeDoc({ contributions: [], conclusion: undefined })
    expect(extractConclusion(doc)).toBe('')
  })

  it('falls back to last contribution analysis when conclusion is absent', () => {
    const doc = makeDoc({
      contributions: [
        makeContribution('model-a', 'First analysis'),
        makeContribution('model-b', 'Last analysis'),
      ],
      conclusion: undefined,
    })
    expect(extractConclusion(doc)).toBe('Last analysis')
  })

  it('does not return first analysis when there are multiple contributions', () => {
    const doc = makeDoc({
      contributions: [
        makeContribution('model-a', 'First analysis'),
        makeContribution('model-b', 'Last analysis'),
      ],
      conclusion: undefined,
    })
    expect(extractConclusion(doc)).not.toBe('First analysis')
  })

  it('prefers explicit conclusion over contributions fallback', () => {
    const doc = makeDoc({
      contributions: [makeContribution('model-a', 'Contribution text')],
      conclusion: 'Real conclusion',
    })
    expect(extractConclusion(doc)).toBe('Real conclusion')
  })
})
