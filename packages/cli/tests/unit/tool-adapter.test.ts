/**
 * Unit tests for tool-adapter.ts — getRexTools, getToolsSummary, executeToolCall (safe subset).
 * Tests the tool catalog shape, format, and blocked command guard.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

// Mock paths to avoid ensureRexDirs() I/O
vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-tool-adapter-test',
  ensureRexDirs: vi.fn(),
  MEMORY_DB_PATH: '/tmp/rex-tool-adapter-test/memory.sqlite',
  CONFIG_PATH: '/tmp/rex-tool-adapter-test/config.json',
}))

// Mock fs to avoid reading settings.json
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: (_p: string) => false,
    readFileSync: actual.readFileSync,
  }
})

import {
  getRexTools,
  getToolsSummary,
  executeToolCall,
  type OllamaTool,
} from '../../src/tool-adapter.js'

// ── getRexTools ───────────────────────────────────────────────────────────────

describe('getRexTools', () => {
  it('returns a non-empty array', () => {
    const tools = getRexTools()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('each tool has type "function"', () => {
    for (const t of getRexTools()) {
      expect(t.type).toBe('function')
    }
  })

  it('each tool.function has name, description, parameters', () => {
    for (const t of getRexTools()) {
      expect(typeof t.function.name).toBe('string')
      expect(t.function.name.length).toBeGreaterThan(0)
      expect(typeof t.function.description).toBe('string')
      expect(t.function.description.length).toBeGreaterThan(0)
      expect(typeof t.function.parameters).toBe('object')
    }
  })

  it('each tool.function.parameters has type "object"', () => {
    for (const t of getRexTools()) {
      expect(t.function.parameters.type).toBe('object')
    }
  })

  it('each tool.function.parameters has properties object', () => {
    for (const t of getRexTools()) {
      expect(typeof t.function.parameters.properties).toBe('object')
    }
  })

  it('each tool.function.parameters has required array', () => {
    for (const t of getRexTools()) {
      expect(Array.isArray(t.function.parameters.required)).toBe(true)
    }
  })

  it('includes rex_memory_search tool', () => {
    const names = getRexTools().map(t => t.function.name)
    expect(names).toContain('rex_memory_search')
  })

  it('includes rex_read_file tool', () => {
    const names = getRexTools().map(t => t.function.name)
    expect(names).toContain('rex_read_file')
  })

  it('all tool names start with rex_', () => {
    for (const t of getRexTools()) {
      expect(t.function.name.startsWith('rex_')).toBe(true)
    }
  })

  it('required fields exist in properties', () => {
    for (const t of getRexTools()) {
      for (const req of t.function.parameters.required) {
        expect(t.function.parameters.properties).toHaveProperty(req)
      }
    }
  })
})

// ── getToolsSummary ───────────────────────────────────────────────────────────

describe('getToolsSummary', () => {
  it('returns a non-empty string', () => {
    const summary = getToolsSummary()
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(0)
  })

  it('has one line per tool', () => {
    const lines = getToolsSummary().split('\n').filter(Boolean)
    expect(lines.length).toBe(getRexTools().length)
  })

  it('each line contains the tool name', () => {
    const tools = getRexTools()
    const lines = getToolsSummary().split('\n').filter(Boolean)
    for (let i = 0; i < tools.length; i++) {
      expect(lines[i]).toContain(tools[i].function.name)
    }
  })

  it('each line uses "name: description" format', () => {
    for (const line of getToolsSummary().split('\n').filter(Boolean)) {
      expect(line).toMatch(/^rex_\w+: .+/)
    }
  })
})

// ── executeToolCall — blocked commands ────────────────────────────────────────

describe('executeToolCall — blocked destructive commands', () => {
  it('blocks rex_run_command with rm -rf /', async () => {
    const result = await executeToolCall('rex_run_command', { command: 'rm -rf /' })
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toMatch(/block|dangerous|not allowed/i)
  })

  it('blocks rex_run_command with sudo command', async () => {
    const result = await executeToolCall('rex_run_command', { command: 'sudo apt install something' })
    expect(result.ok).toBe(false)
  })

  it('returns ok:false for unknown tool name', async () => {
    const result = await executeToolCall('unknown_tool_xyz', {})
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('Unknown tool')
  })
})
