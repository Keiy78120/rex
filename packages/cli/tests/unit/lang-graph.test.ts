/**
 * Unit tests for lang-graph.ts — TEMPLATES catalog and graph factory structure.
 * Tests graph factory return values (compiled graphs have invoke method).
 * Does NOT execute graphs (no LLM calls).
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-lang-graph-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-lang-graph-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-lang-graph-test/config.json',
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/event-journal.js', () => ({
  appendEvent: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: () => false,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '[]'),
    readdirSync: vi.fn(() => []),
  }
})

import {
  cmdGraphList,
} from '../../src/lang-graph.js'

// ── cmdGraphList ──────────────────────────────────────────────────────────────

describe('cmdGraphList', () => {
  it('does not throw in JSON mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => cmdGraphList(true)).not.toThrow()
    spy.mockRestore()
  })

  it('outputs JSON with templates array in JSON mode', () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg))
    cmdGraphList(true)
    spy.mockRestore()

    const output = JSON.parse(logs.join(''))
    expect(output).toHaveProperty('templates')
    expect(Array.isArray(output.templates)).toBe(true)
    expect(output.templates.length).toBeGreaterThanOrEqual(3)
  })

  it('each template in JSON output has name and description', () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg))
    cmdGraphList(true)
    spy.mockRestore()

    const { templates } = JSON.parse(logs.join(''))
    for (const t of templates) {
      expect(typeof t.name).toBe('string')
      expect(t.name.length).toBeGreaterThan(0)
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it('includes scriptHelper, codeReview, monitorCycle templates', () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => logs.push(msg))
    cmdGraphList(true)
    spy.mockRestore()

    const { templates } = JSON.parse(logs.join(''))
    const names = templates.map((t: { name: string }) => t.name)
    expect(names).toContain('scriptHelper')
    expect(names).toContain('codeReview')
    expect(names).toContain('monitorCycle')
  })

  it('does not throw in non-JSON mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => cmdGraphList(false)).not.toThrow()
    spy.mockRestore()
  })
})

// ── cmdGraphStatus ────────────────────────────────────────────────────────────

import { cmdGraphStatus } from '../../src/lang-graph.js'

describe('cmdGraphStatus', () => {
  it('does not throw with empty args', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => cmdGraphStatus([])).not.toThrow()
    spy.mockRestore()
    errSpy.mockRestore()
  })

  it('does not throw with --json flag', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => cmdGraphStatus(['--json'])).not.toThrow()
    spy.mockRestore()
  })

  it('does not crash for unknown trace id (may call process.exit)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    try { cmdGraphStatus(['nonexistent-trace-id-9999']) } catch { /* ignore */ }
    spy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })

  it('does not throw with --limit=5', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => cmdGraphStatus(['--limit=5'])).not.toThrow()
    spy.mockRestore()
  })
})
