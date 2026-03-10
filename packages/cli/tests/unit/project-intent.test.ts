/**
 * Unit tests for project-intent.ts — intentToPreloadLine (pure function).
 * detectIntent requires a real git repo; only intentToPreloadLine is unit tested.
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

// Mock fs so that detectIntent's checkMissing/hasTestSetup don't hit disk
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (_p: string) => false,
    readFileSync: actual.readFileSync,
  }
})

// Mock child_process to make git helpers return empty/0
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import {
  intentToPreloadLine,
  printIntent,
  detectIntent,
  type IntentContext,
  type ProjectIntent,
} from '../../src/project-intent.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(
  intent: ProjectIntent = 'bug-fix',
  overrides: Partial<Omit<IntentContext, 'intent'>> = {},
): IntentContext {
  return {
    intent,
    confidence: 'high',
    missing: {},
    actions: [],
    signals: [],
    ...overrides,
  }
}

// ── intentToPreloadLine ───────────────────────────────────────────────────────

describe('intentToPreloadLine', () => {
  it('returns a string', () => {
    expect(typeof intentToPreloadLine(makeCtx())).toBe('string')
  })

  it('starts with "Intent:"', () => {
    const line = intentToPreloadLine(makeCtx('feature'))
    expect(line.startsWith('Intent:')).toBe(true)
  })

  it('includes the intent', () => {
    expect(intentToPreloadLine(makeCtx('refactor'))).toContain('refactor')
    expect(intentToPreloadLine(makeCtx('bug-fix'))).toContain('bug-fix')
    expect(intentToPreloadLine(makeCtx('docs'))).toContain('docs')
    expect(intentToPreloadLine(makeCtx('infra'))).toContain('infra')
  })

  it('includes the confidence level', () => {
    expect(intentToPreloadLine(makeCtx('feature', { confidence: 'medium' }))).toContain('medium')
    expect(intentToPreloadLine(makeCtx('feature', { confidence: 'low' }))).toContain('low')
    expect(intentToPreloadLine(makeCtx('feature', { confidence: 'high' }))).toContain('high')
  })

  it('omits Missing section when nothing is missing', () => {
    const line = intentToPreloadLine(makeCtx('feature', { missing: {} }))
    expect(line).not.toContain('Missing:')
  })

  it('includes Missing section when items are missing', () => {
    const line = intentToPreloadLine(makeCtx('new-project', { missing: { ci: true, tests: true } }))
    expect(line).toContain('Missing:')
    expect(line).toContain('ci')
    expect(line).toContain('tests')
  })

  it('omits Next section when actions is empty', () => {
    const line = intentToPreloadLine(makeCtx('explore', { actions: [] }))
    expect(line).not.toContain('Next:')
  })

  it('includes only the first action in Next:', () => {
    const line = intentToPreloadLine(makeCtx('feature', {
      actions: ['/debug-assist', '/api-design', '/ux-flow'],
    }))
    expect(line).toContain('Next: /debug-assist')
    expect(line).not.toContain('/api-design')
  })

  it('uses " | " as section separator', () => {
    const line = intentToPreloadLine(makeCtx('bug-fix', {
      missing: { ci: true },
      actions: ['/debug-assist'],
    }))
    expect(line).toContain(' | ')
  })

  it('output length is <= 200 chars', () => {
    const line = intentToPreloadLine(makeCtx('new-project', {
      missing: { ci: true, lint: true, tests: true, readme: true, gitignore: true, hooks: true },
      actions: ['action-1', 'action-2', 'action-3'],
      confidence: 'low',
    }))
    expect(line.length).toBeLessThanOrEqual(200)
  })

  it('all ProjectIntent values produce a non-empty string', () => {
    const intents: ProjectIntent[] = ['new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore']
    for (const intent of intents) {
      const line = intentToPreloadLine(makeCtx(intent))
      expect(line.length).toBeGreaterThan(0)
    }
  })
})

// ── printIntent ───────────────────────────────────────────────────────────────

describe('printIntent', () => {
  it('does not throw for a basic context', () => {
    expect(() => printIntent(makeCtx())).not.toThrow()
  })

  it('does not throw with debug=true', () => {
    const ctx = makeCtx('bug-fix', { signals: ['has-tests', 'dirty-git'] })
    expect(() => printIntent(ctx, true)).not.toThrow()
  })

  it('does not throw with missing setup items', () => {
    const ctx = makeCtx('new-project', { missing: { ci: true, tests: true, lint: true } })
    expect(() => printIntent(ctx)).not.toThrow()
  })

  it('does not throw with actions list', () => {
    const ctx = makeCtx('feature', { actions: ['/debug-assist', '/api-design'] })
    expect(() => printIntent(ctx)).not.toThrow()
  })

  it('does not throw for all intent types', () => {
    const intents: ProjectIntent[] = ['new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore']
    for (const intent of intents) {
      expect(() => printIntent(makeCtx(intent))).not.toThrow()
    }
  })
})

// ── detectIntent ──────────────────────────────────────────────────────────────

describe('detectIntent', () => {
  it('returns an IntentContext with required fields', () => {
    const ctx = detectIntent('/tmp/no-project')
    expect(ctx).toHaveProperty('intent')
    expect(ctx).toHaveProperty('confidence')
    expect(ctx).toHaveProperty('missing')
    expect(ctx).toHaveProperty('actions')
    expect(ctx).toHaveProperty('signals')
  })

  it('intent is one of the valid ProjectIntent values', () => {
    const VALID = ['new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore']
    const ctx = detectIntent('/tmp/no-project')
    expect(VALID).toContain(ctx.intent)
  })

  it('confidence is one of: high, medium, low', () => {
    const ctx = detectIntent('/tmp/no-project')
    expect(['high', 'medium', 'low']).toContain(ctx.confidence)
  })

  it('actions is an array of strings', () => {
    const ctx = detectIntent('/tmp/no-project')
    expect(Array.isArray(ctx.actions)).toBe(true)
    for (const a of ctx.actions) {
      expect(typeof a).toBe('string')
    }
  })

  it('does not throw', () => {
    expect(() => detectIntent('/tmp/empty-dir')).not.toThrow()
  })
})
