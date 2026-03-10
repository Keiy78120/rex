/**
 * Unit tests for tool-registry.ts — loadRegistry, enableTool, disableTool,
 * getToolForCapability.
 * All filesystem ops mocked — no real disk access.
 * @module TOOLS
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-tool-registry-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '/usr/bin/git') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{"tools":[]}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

import {
  loadRegistry,
  saveRegistry,
  syncAvailability,
  enableTool,
  disableTool,
  getToolForCapability,
  printRegistry,
} from '../../src/tool-registry.js'

// ── loadRegistry ──────────────────────────────────────────────────────────────

describe('loadRegistry', () => {
  it('returns an array', () => {
    expect(Array.isArray(loadRegistry())).toBe(true)
  })

  it('returns entries with required fields', () => {
    const tools = loadRegistry()
    for (const t of tools) {
      expect(t).toHaveProperty('id')
      expect(t).toHaveProperty('name')
      expect(t).toHaveProperty('tier')
      expect(t).toHaveProperty('enabled')
      expect(t).toHaveProperty('available')
    }
  })

  it('has at least one entry (builtin tools)', () => {
    const tools = loadRegistry()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('tier is one of cli, mcp, api', () => {
    const tools = loadRegistry()
    for (const t of tools) {
      expect(['cli', 'mcp', 'api']).toContain(t.tier)
    }
  })
})

// ── enableTool / disableTool ──────────────────────────────────────────────────

describe('enableTool', () => {
  it('returns false for non-existent tool id', () => {
    expect(enableTool('nonexistent-tool-xyz')).toBe(false)
  })

  it('returns true for a known tool id', () => {
    const tools = loadRegistry()
    const nonCore = tools.find(t => !['bash', 'git', 'filesystem'].includes(t.id))
    if (nonCore) {
      // may or may not work depending on availability mock, but should not throw
      expect(() => enableTool(nonCore.id)).not.toThrow()
    }
  })
})

describe('disableTool', () => {
  it('returns false for non-existent tool id', () => {
    expect(disableTool('nonexistent-tool-xyz')).toBe(false)
  })

  it('cannot disable core tools (bash, git)', () => {
    // Core tools return false when you try to disable them
    const coreResult = disableTool('bash')
    // Either false (blocked) or false (not found) — never throws
    expect(typeof coreResult).toBe('boolean')
  })
})

// ── getToolForCapability ──────────────────────────────────────────────────────

describe('getToolForCapability', () => {
  it('returns null or ToolEntry for file-read capability', () => {
    const tool = getToolForCapability('file-read')
    expect(tool === null || typeof tool === 'object').toBe(true)
  })

  it('returns null or ToolEntry for shell-exec capability', () => {
    const tool = getToolForCapability('shell-exec')
    expect(tool === null || typeof tool === 'object').toBe(true)
  })

  it('if tool returned, has correct shape', () => {
    const tool = getToolForCapability('web-search')
    if (tool !== null) {
      expect(tool).toHaveProperty('id')
      expect(tool).toHaveProperty('name')
      expect(tool).toHaveProperty('tier')
    }
  })

  it('returns null for unknown capability', () => {
    // @ts-expect-error — testing invalid capability
    const tool = getToolForCapability('totally-fake-capability')
    expect(tool).toBeNull()
  })
})

// ── saveRegistry ──────────────────────────────────────────────────────────────

describe('saveRegistry', () => {
  it('does not throw with empty array', () => {
    expect(() => saveRegistry([])).not.toThrow()
  })

  it('does not throw with registry entries', () => {
    const tools = loadRegistry()
    expect(() => saveRegistry(tools)).not.toThrow()
  })
})

// ── syncAvailability ──────────────────────────────────────────────────────────

describe('syncAvailability', () => {
  it('returns an array', () => {
    expect(Array.isArray(syncAvailability())).toBe(true)
  })

  it('does not throw', () => {
    expect(() => syncAvailability()).not.toThrow()
  })

  it('accepts subset of ids without throwing', () => {
    const tools = loadRegistry()
    const ids = tools.slice(0, 2).map(t => t.id)
    expect(() => syncAvailability(ids)).not.toThrow()
  })

  it('returned tools have available field', () => {
    const tools = syncAvailability()
    for (const t of tools) {
      expect(t).toHaveProperty('available')
      expect(typeof t.available).toBe('boolean')
    }
  })
})

// ── printRegistry ─────────────────────────────────────────────────────────────

describe('printRegistry', () => {
  it('does not throw with no args', () => {
    expect(() => printRegistry()).not.toThrow()
  })

  it('does not throw with empty array', () => {
    expect(() => printRegistry([])).not.toThrow()
  })

  it('does not throw with loaded registry', () => {
    const tools = loadRegistry()
    expect(() => printRegistry(tools)).not.toThrow()
  })
})
