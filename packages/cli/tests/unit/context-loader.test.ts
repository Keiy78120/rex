/**
 * Unit tests for context-loader.ts — ContextProfile builder and formatter.
 * Tests buildContextProfile (with mocked FS) and profileToPreloadLine (pure).
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

// Mock fs to avoid reading ~/.claude/settings.json (returns empty MCP list)
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (_p: string) => false,
    readFileSync: actual.readFileSync,
  }
})

import {
  buildContextProfile,
  profileToPreloadLine,
  printContextProfile,
  type ContextProfile,
} from '../../src/context-loader.js'
import type { IntentContext, ProjectIntent } from '../../src/project-intent.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCtx(intent: ProjectIntent, missing: Record<string, boolean> = {}): IntentContext {
  return { intent, confidence: 'high', signals: [], missing }
}

function makeProfile(overrides: Partial<ContextProfile> = {}): ContextProfile {
  return {
    intent: 'bug-fix',
    confidence: 'high',
    guards: ['dangerous-cmd-guard'],
    mcps: ['github'],
    skills: ['debug-assist'],
    note: 'Test note',
    ...overrides,
  }
}

// ── buildContextProfile ───────────────────────────────────────────────────────

describe('buildContextProfile', () => {
  it('returns a ContextProfile with all required fields', () => {
    const profile = buildContextProfile(makeCtx('bug-fix'))
    expect(profile).toHaveProperty('intent')
    expect(profile).toHaveProperty('confidence')
    expect(profile).toHaveProperty('guards')
    expect(profile).toHaveProperty('mcps')
    expect(profile).toHaveProperty('skills')
    expect(profile).toHaveProperty('note')
  })

  it('always includes dangerous-cmd-guard', () => {
    for (const intent of ['new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore'] as ProjectIntent[]) {
      const profile = buildContextProfile(makeCtx(intent))
      expect(profile.guards).toContain('dangerous-cmd-guard')
    }
  })

  it('reflects the input intent', () => {
    expect(buildContextProfile(makeCtx('feature')).intent).toBe('feature')
    expect(buildContextProfile(makeCtx('refactor')).intent).toBe('refactor')
  })

  it('reflects the input confidence', () => {
    const ctx: IntentContext = { intent: 'bug-fix', confidence: 'medium', signals: [], missing: {} }
    expect(buildContextProfile(ctx).confidence).toBe('medium')
  })

  it('note appends missing critical items', () => {
    const profile = buildContextProfile(makeCtx('feature', { ci: true, tests: true }))
    expect(profile.note).toContain('ci')
    expect(profile.note).toContain('tests')
  })

  it('note does not mention missing when all critical items present', () => {
    const profile = buildContextProfile(makeCtx('feature', {}))
    expect(profile.note).not.toContain('Missing:')
  })

  it('bug-fix includes debug-assist skill', () => {
    const profile = buildContextProfile(makeCtx('bug-fix'))
    expect(profile.skills).toContain('debug-assist')
  })

  it('feature includes ux-flow and api-design skills', () => {
    const profile = buildContextProfile(makeCtx('feature'))
    expect(profile.skills).toContain('ux-flow')
    expect(profile.skills).toContain('api-design')
  })

  it('docs intent has minimal mcps', () => {
    const profile = buildContextProfile(makeCtx('docs'))
    expect(profile.mcps).toContain('context7')
  })

  it('explore intent has no skills (just MCPs)', () => {
    const profile = buildContextProfile(makeCtx('explore'))
    expect(profile.skills).toHaveLength(0)
  })
})

// ── profileToPreloadLine ──────────────────────────────────────────────────────

describe('profileToPreloadLine', () => {
  it('returns a string', () => {
    expect(typeof profileToPreloadLine(makeProfile())).toBe('string')
  })

  it('includes intent and confidence', () => {
    const line = profileToPreloadLine(makeProfile({ intent: 'feature', confidence: 'high' }))
    expect(line).toContain('feature')
    expect(line).toContain('high')
  })

  it('includes MCPs when present', () => {
    const line = profileToPreloadLine(makeProfile({ mcps: ['github', 'context7'] }))
    expect(line).toContain('github')
    expect(line).toContain('context7')
  })

  it('includes skills with slash prefix', () => {
    const line = profileToPreloadLine(makeProfile({ skills: ['debug-assist', 'test-strategy'] }))
    expect(line).toContain('/debug-assist')
    expect(line).toContain('/test-strategy')
  })

  it('omits MCPs section when empty', () => {
    const line = profileToPreloadLine(makeProfile({ mcps: [] }))
    expect(line).not.toContain('MCPs:')
  })

  it('omits Skills section when empty', () => {
    const line = profileToPreloadLine(makeProfile({ skills: [] }))
    expect(line).not.toContain('Skills:')
  })

  it('output length is <= 200 chars', () => {
    // Even with many items, should be capped
    const line = profileToPreloadLine(makeProfile({
      mcps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      skills: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'],
    }))
    expect(line.length).toBeLessThanOrEqual(200)
  })

  it('uses pipe | to separate sections', () => {
    const line = profileToPreloadLine(makeProfile({ mcps: ['github'], skills: ['debug-assist'] }))
    expect(line).toContain(' | ')
  })

  it('starts with "Profile:"', () => {
    const line = profileToPreloadLine(makeProfile())
    expect(line.startsWith('Profile:')).toBe(true)
  })
})

// ── printContextProfile ───────────────────────────────────────────────────────

describe('printContextProfile', () => {
  it('does not throw for a full profile', () => {
    expect(() => printContextProfile(makeProfile())).not.toThrow()
  })

  it('does not throw with empty guards, mcps, skills', () => {
    expect(() => printContextProfile(makeProfile({ guards: [], mcps: [], skills: [] }))).not.toThrow()
  })

  it('does not throw for every intent type', () => {
    const intents = ['new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore'] as const
    for (const intent of intents) {
      const profile = makeProfile({ intent })
      expect(() => printContextProfile(profile)).not.toThrow()
    }
  })

  it('does not throw with note field', () => {
    expect(() => printContextProfile(makeProfile({ note: 'Custom note here' }))).not.toThrow()
  })
})
