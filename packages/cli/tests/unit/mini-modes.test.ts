/**
 * Unit tests for mini-modes engine.
 * Tests pure functions: renderTemplate, classifySecurityLevel, matchMode, executeMode.
 * No network, no LLM, no FS dependencies.
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
  matchMode,
  listModes,
  executeMode,
  type ModeContext,
  type MiniMode,
} from '../../src/mini-modes/engine.js'

// ── renderTemplate ────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('replaces a single {{variable}}', () => {
    const out = renderTemplate('Hello {{name}}!', { message: '', name: 'REX' })
    expect(out).toBe('Hello REX!')
  })

  it('replaces multiple variables', () => {
    const out = renderTemplate('{{a}} + {{b}} = {{c}}', { message: '', a: '1', b: '2', c: '3' })
    expect(out).toBe('1 + 2 = 3')
  })

  it('replaces undefined/null with empty string', () => {
    const out = renderTemplate('{{missing}} end', { message: '' })
    expect(out).toBe(' end')
  })

  it('JSON-stringifies non-string values', () => {
    const out = renderTemplate('{{val}}', { message: '', val: { x: 1 } })
    expect(out).toContain('"x"')
  })

  it('leaves un-matched {{tags}} that are undefined as empty', () => {
    const out = renderTemplate('{{a}}{{b}}', { message: '', a: 'x' })
    expect(out).toBe('x')
  })

  it('returns the template unchanged if no {{}} tags', () => {
    const tpl = 'No tags here.'
    expect(renderTemplate(tpl, { message: '' })).toBe(tpl)
  })
})

// ── classifySecurityLevel ─────────────────────────────────────────────────────

describe('classifySecurityLevel', () => {
  it('returns CRITICAL for delete action on database target', () => {
    expect(classifySecurityLevel('delete', 'database.sqlite')).toBe('CRITICAL')
  })

  it('returns CRITICAL for rm -rf action', () => {
    expect(classifySecurityLevel('rm -rf /tmp', '')).toBe('CRITICAL')
  })

  it('returns CRITICAL for force-push action', () => {
    expect(classifySecurityLevel('force push to main', '')).toBe('CRITICAL')
  })

  it('returns CRITICAL for rotate key action', () => {
    expect(classifySecurityLevel('rotate key vault', '')).toBe('CRITICAL')
  })

  it('returns HIGH for publish action', () => {
    expect(classifySecurityLevel('publish npm package', '')).toBe('HIGH')
  })

  it('returns HIGH for tweet action', () => {
    expect(classifySecurityLevel('tweet about the release', '')).toBe('HIGH')
  })

  it('returns HIGH for deploy action', () => {
    expect(classifySecurityLevel('deploy to server', '')).toBe('HIGH')
  })

  it('returns MEDIUM for write action', () => {
    expect(classifySecurityLevel('write file to disk', '')).toBe('MEDIUM')
  })

  it('returns MEDIUM for send telegram action', () => {
    expect(classifySecurityLevel('send telegram message', '')).toBe('MEDIUM')
  })

  it('returns SAFE for read-only action', () => {
    expect(classifySecurityLevel('check fleet status', '')).toBe('SAFE')
  })

  it('returns SAFE for search action', () => {
    expect(classifySecurityLevel('search memory for project X', '')).toBe('SAFE')
  })

  it('is case-insensitive', () => {
    expect(classifySecurityLevel('DELETE', 'DATABASE')).toBe('CRITICAL')
    expect(classifySecurityLevel('PUBLISH', '')).toBe('HIGH')
  })
})

// ── matchMode + registerMode ──────────────────────────────────────────────────

const TEST_MODE_ID = 'test-greet-mode'

describe('registerMode + matchMode', () => {
  beforeEach(() => {
    // Register a test mode once (registration is idempotent since map.set overwrites)
    registerMode({
      id: TEST_MODE_ID,
      description: 'Test greet mode',
      triggers: [/bonjour|hello|hi rex/i],
      security: 'SAFE',
      estimatedTokens: 0,
      loaders: [],
      template: 'Bonjour {{name}}!',
      llmFields: [],
    })
  })

  it('matchMode returns the mode when trigger matches', () => {
    const mode = matchMode('bonjour rex')
    expect(mode).toBeDefined()
    expect(mode?.id).toBe(TEST_MODE_ID)
  })

  it('matchMode returns undefined for no match', () => {
    const mode = matchMode('what is the weather today? totally unrelated.')
    expect(mode).toBeUndefined()
  })

  it('matching is case-insensitive via regex flag', () => {
    const mode = matchMode('HELLO there')
    expect(mode?.id).toBe(TEST_MODE_ID)
  })

  it('listModes includes the registered test mode', () => {
    const modes = listModes()
    expect(modes.some(m => m.id === TEST_MODE_ID)).toBe(true)
  })
})

// ── executeMode ───────────────────────────────────────────────────────────────

describe('executeMode', () => {
  const staticMode: MiniMode = {
    id: 'exec-test-static',
    description: 'Static mode — no LLM, no loaders',
    triggers: [/exec-test/],
    security: 'SAFE',
    estimatedTokens: 0,
    loaders: [],
    template: 'Result: {{data}}',
    llmFields: [],
  }

  it('returns a ModeResult with all required fields', async () => {
    const result = await executeMode(staticMode, 'exec-test')
    expect(result).toHaveProperty('modeId', 'exec-test-static')
    expect(result).toHaveProperty('response')
    expect(result).toHaveProperty('usedLlm')
    expect(result).toHaveProperty('tokensEstimate')
    expect(result).toHaveProperty('durationMs')
    expect(result).toHaveProperty('context')
  })

  it('does not call LLM when llmFields is empty', async () => {
    const llm = vi.fn()
    await executeMode(staticMode, 'exec-test', llm)
    expect(llm).not.toHaveBeenCalled()
  })

  it('usedLlm is false for script-only mode', async () => {
    const result = await executeMode(staticMode, 'exec-test')
    expect(result.usedLlm).toBe(false)
  })

  it('runs loaders and merges context', async () => {
    const loaderMode: MiniMode = {
      ...staticMode,
      id: 'exec-test-loader',
      loaders: [async () => ({ data: 'loaded-value' })],
    }
    const result = await executeMode(loaderMode, 'hello')
    expect(result.context['data']).toBe('loaded-value')
    expect(result.response).toContain('loaded-value')
  })

  it('calls LLM when llmFields has a missing field', async () => {
    const llmMode: MiniMode = {
      ...staticMode,
      id: 'exec-test-llm',
      template: 'Summary: {{summary}}',
      llmFields: ['summary'],
    }
    const llm = vi.fn().mockResolvedValue('AI-generated summary')
    const result = await executeMode(llmMode, 'analyze this', llm)
    expect(llm).toHaveBeenCalledOnce()
    expect(result.usedLlm).toBe(true)
    expect(result.context['summary']).toBe('AI-generated summary')
  })

  it('uses outputFormatter when provided', async () => {
    const formatterMode: MiniMode = {
      ...staticMode,
      id: 'exec-test-formatter',
      outputFormatter: (ctx: ModeContext) => `FORMATTED: ${ctx.message}`,
    }
    const result = await executeMode(formatterMode, 'my message')
    expect(result.response).toBe('FORMATTED: my message')
  })

  it('durationMs is a non-negative number', async () => {
    const result = await executeMode(staticMode, 'test')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
