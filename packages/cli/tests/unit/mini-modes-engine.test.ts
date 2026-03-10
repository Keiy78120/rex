/**
 * Unit tests for mini-modes/engine.ts — renderTemplate, classifySecurityLevel,
 * mode registry (register/get/list/match), and executeMode.
 * No network calls — all pure functions or controlled async.
 * @module IDENTITY
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import {
  renderTemplate,
  classifySecurityLevel,
  registerMode,
  getMode,
  listModes,
  matchMode,
  executeMode,
  type MiniMode,
  type ModeContext,
} from '../../src/mini-modes/engine.js'

// ── renderTemplate ────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('replaces a single {{variable}} slot', () => {
    expect(renderTemplate('Hello {{name}}!', { message: '', name: 'Kevin' })).toBe('Hello Kevin!')
  })

  it('replaces multiple slots', () => {
    const ctx: ModeContext = { message: 'hi', a: 'FOO', b: 'BAR' }
    expect(renderTemplate('{{a}} and {{b}}', ctx)).toBe('FOO and BAR')
  })

  it('replaces undefined slot with empty string', () => {
    const ctx: ModeContext = { message: 'hi' }
    expect(renderTemplate('Value: {{missing}}', ctx)).toBe('Value: ')
  })

  it('replaces null slot with empty string', () => {
    const ctx: ModeContext = { message: 'hi', val: null }
    expect(renderTemplate('{{val}}', ctx)).toBe('')
  })

  it('JSON-stringifies non-string values', () => {
    const ctx: ModeContext = { message: '', count: 42 }
    expect(renderTemplate('Count: {{count}}', ctx)).toBe('Count: 42')
  })

  it('leaves unmatched template as-is (no curly slot)', () => {
    expect(renderTemplate('No slots here.', { message: '' })).toBe('No slots here.')
  })

  it('handles empty template', () => {
    expect(renderTemplate('', { message: '' })).toBe('')
  })

  it('replaces the same slot multiple times', () => {
    const ctx: ModeContext = { message: '', name: 'REX' }
    expect(renderTemplate('{{name}}! {{name}}!', ctx)).toBe('REX! REX!')
  })
})

// ── classifySecurityLevel ─────────────────────────────────────────────────────

describe('classifySecurityLevel — CRITICAL', () => {
  it('delete with database target → CRITICAL', () => {
    expect(classifySecurityLevel('delete file', 'database.sqlite')).toBe('CRITICAL')
  })

  it('drop table → CRITICAL', () => {
    expect(classifySecurityLevel('drop table', undefined)).toBe('CRITICAL')
  })

  it('wipe → CRITICAL', () => {
    expect(classifySecurityLevel('wipe disk', undefined)).toBe('CRITICAL')
  })

  it('rm -rf → CRITICAL', () => {
    expect(classifySecurityLevel('rm -rf /tmp', undefined)).toBe('CRITICAL')
  })

  it('rotate key → CRITICAL', () => {
    expect(classifySecurityLevel('rotate secret key', undefined)).toBe('CRITICAL')
  })

  it('deploy to prod → CRITICAL', () => {
    expect(classifySecurityLevel('deploy to production', undefined)).toBe('CRITICAL')
  })
})

describe('classifySecurityLevel — HIGH', () => {
  it('publish → HIGH', () => {
    expect(classifySecurityLevel('publish package')).toBe('HIGH')
  })

  it('tweet → HIGH', () => {
    expect(classifySecurityLevel('tweet this message')).toBe('HIGH')
  })

  it('charge customer → HIGH', () => {
    expect(classifySecurityLevel('charge customer')).toBe('HIGH')
  })

  it('restart service → HIGH', () => {
    expect(classifySecurityLevel('pm2 restart daemon')).toBe('HIGH')
  })
})

describe('classifySecurityLevel — MEDIUM', () => {
  it('write file → MEDIUM', () => {
    expect(classifySecurityLevel('write config.json')).toBe('MEDIUM')
  })

  it('send telegram message → MEDIUM', () => {
    expect(classifySecurityLevel('send message via telegram')).toBe('MEDIUM')
  })

  it('edit file → MEDIUM', () => {
    expect(classifySecurityLevel('edit README')).toBe('MEDIUM')
  })

  it('overwrite file → MEDIUM', () => {
    expect(classifySecurityLevel('overwrite existing file')).toBe('MEDIUM')
  })
})

describe('classifySecurityLevel — SAFE', () => {
  it('git status → SAFE', () => {
    expect(classifySecurityLevel('git status')).toBe('SAFE')
  })

  it('search memory → SAFE', () => {
    expect(classifySecurityLevel('search memory for rex')).toBe('SAFE')
  })

  it('list providers → SAFE', () => {
    expect(classifySecurityLevel('list all providers')).toBe('SAFE')
  })

  it('empty action → SAFE', () => {
    expect(classifySecurityLevel('')).toBe('SAFE')
  })
})

// ── Mode registry ─────────────────────────────────────────────────────────────

function makeMode(id: string, triggers: RegExp[]): MiniMode {
  return {
    id,
    description: `Test mode ${id}`,
    triggers,
    security: 'SAFE',
    estimatedTokens: 50,
    loaders: [],
    template: 'Result: {{value}}',
    llmFields: [],
  }
}

describe('mode registry — register / getMode / listModes', () => {
  it('getMode returns undefined for unregistered id', () => {
    expect(getMode('nonexistent-xyz-123')).toBeUndefined()
  })

  it('registers and retrieves a mode', () => {
    registerMode(makeMode('test-mode-reg', [/^test/i]))
    expect(getMode('test-mode-reg')).toBeDefined()
    expect(getMode('test-mode-reg')?.id).toBe('test-mode-reg')
  })

  it('listModes includes registered mode', () => {
    registerMode(makeMode('test-mode-list', [/list/i]))
    const ids = listModes().map(m => m.id)
    expect(ids).toContain('test-mode-list')
  })

  it('overrides mode with same id', () => {
    registerMode(makeMode('test-mode-dup', [/alpha/i]))
    const m2 = makeMode('test-mode-dup', [/beta/i])
    m2.description = 'Updated'
    registerMode(m2)
    expect(getMode('test-mode-dup')?.description).toBe('Updated')
  })
})

describe('matchMode', () => {
  it('returns undefined when no mode matches', () => {
    expect(matchMode('no-mode-trigger-xyz-999')).toBeUndefined()
  })

  it('returns matching mode for trigger match', () => {
    registerMode(makeMode('test-match-hello', [/^hello rex/i]))
    const m = matchMode('hello rex how are you')
    expect(m).toBeDefined()
    expect(m?.id).toBe('test-match-hello')
  })

  it('case-insensitive trigger matching', () => {
    registerMode(makeMode('test-match-budget', [/budget/i]))
    expect(matchMode('Check BUDGET today')).toBeDefined()
    expect(matchMode('BUDGET overview')).toBeDefined()
  })
})

// ── executeMode ───────────────────────────────────────────────────────────────

describe('executeMode', () => {
  it('returns ModeResult with correct modeId', async () => {
    const mode = makeMode('test-exec-basic', [/exec/i])
    mode.template = 'Static output'
    const result = await executeMode(mode, 'exec test')
    expect(result.modeId).toBe('test-exec-basic')
  })

  it('usedLlm=false when no llmFields', async () => {
    const mode = makeMode('test-exec-nollm', [/nollm/i])
    const result = await executeMode(mode, 'nollm')
    expect(result.usedLlm).toBe(false)
  })

  it('renders template with loader context', async () => {
    const mode: MiniMode = {
      ...makeMode('test-exec-loader', [/loader/i]),
      loaders: [async () => ({ value: 'loaded-value' })],
      template: 'Result: {{value}}',
    }
    const result = await executeMode(mode, 'loader test')
    expect(result.response).toContain('loaded-value')
  })

  it('calls llmCall when llmFields not filled', async () => {
    const mode: MiniMode = {
      ...makeMode('test-exec-llm', [/llmtest/i]),
      llmFields: ['answer'],
      template: 'Answer: {{answer}}',
    }
    const llmCall = vi.fn(async () => 'LLM answered!')
    const result = await executeMode(mode, 'llmtest', llmCall)
    expect(llmCall).toHaveBeenCalledOnce()
    expect(result.usedLlm).toBe(true)
  })

  it('uses outputFormatter when provided', async () => {
    const mode: MiniMode = {
      ...makeMode('test-exec-formatter', [/format/i]),
      outputFormatter: (_ctx) => 'formatted-output',
    }
    const result = await executeMode(mode, 'format test')
    expect(result.response).toBe('formatted-output')
  })

  it('result has durationMs >= 0', async () => {
    const mode = makeMode('test-exec-dur', [/dur/i])
    const result = await executeMode(mode, 'dur test')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('result tokensEstimate matches mode.estimatedTokens', async () => {
    const mode = makeMode('test-exec-tokens', [/tokens/i])
    mode.estimatedTokens = 99
    const result = await executeMode(mode, 'tokens test')
    expect(result.tokensEstimate).toBe(99)
  })
})
