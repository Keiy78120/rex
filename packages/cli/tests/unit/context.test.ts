/**
 * Unit tests for context.ts — injectContext.
 * FS mocked — no real filesystem access.
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  }
})

import { injectContext } from '../../src/context.js'

// ── injectContext ─────────────────────────────────────────────────────────────

describe('injectContext', () => {
  it('does not throw when CLAUDE.md does not exist', () => {
    // existsSync returns false → early return
    expect(() => injectContext('/tmp/no-claude-md')).not.toThrow()
  })

  it('does not throw for current working directory', () => {
    expect(() => injectContext()).not.toThrow()
  })

  it('does not throw for nonexistent path', () => {
    expect(() => injectContext('/completely/nonexistent/path')).not.toThrow()
  })

  it('handles CLAUDE.md present but no memory files', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) => {
      // CLAUDE.md exists, nothing else
      return typeof p === 'string' && p.endsWith('CLAUDE.md')
    })
    expect(() => injectContext('/tmp/project-with-claude-md')).not.toThrow()
  })
})
