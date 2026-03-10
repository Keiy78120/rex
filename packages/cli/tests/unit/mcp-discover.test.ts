/**
 * Unit tests for mcp-discover.ts — REX_MCP_CATALOG, searchCatalog, listCatalog, listInstalled.
 * Filesystem mocked — tests the catalog data and search logic.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-mcp-discover-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => '/tmp/rex-mcp-discover-test' }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{"servers":[]}'),
    writeFileSync: vi.fn(),
  }
})

import {
  REX_MCP_CATALOG,
  searchCatalog,
  listCatalog,
  listInstalled,
} from '../../src/mcp-discover.js'

// ── REX_MCP_CATALOG ───────────────────────────────────────────────────────────

describe('REX_MCP_CATALOG', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(REX_MCP_CATALOG)).toBe(true)
    expect(REX_MCP_CATALOG.length).toBeGreaterThan(0)
  })

  it('each entry has required fields', () => {
    for (const s of REX_MCP_CATALOG) {
      expect(typeof s.id).toBe('string')
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.name).toBe('string')
      expect(typeof s.description).toBe('string')
      expect(Array.isArray(s.tags)).toBe(true)
    }
  })

  it('contains context7 entry', () => {
    const found = REX_MCP_CATALOG.find(s => s.id === 'context7')
    expect(found).toBeDefined()
    expect(found?.verified).toBe(true)
  })
})

// ── listCatalog ───────────────────────────────────────────────────────────────

describe('listCatalog', () => {
  it('returns an array', () => {
    expect(Array.isArray(listCatalog())).toBe(true)
  })

  it('has at least as many entries as the builtin catalog', () => {
    expect(listCatalog().length).toBeGreaterThanOrEqual(REX_MCP_CATALOG.length)
  })
})

// ── searchCatalog ─────────────────────────────────────────────────────────────

describe('searchCatalog', () => {
  it('returns an array', () => {
    expect(Array.isArray(searchCatalog('docs'))).toBe(true)
  })

  it('filters by keyword in name/description/tags', () => {
    const results = searchCatalog('context7')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('context7')
  })

  it('returns empty array for non-matching query', () => {
    const results = searchCatalog('xxxxnonexistentqwertyuiop')
    expect(results).toHaveLength(0)
  })

  it('search is case-insensitive', () => {
    const lower = searchCatalog('memory')
    const upper = searchCatalog('MEMORY')
    expect(lower.length).toBe(upper.length)
  })
})

// ── listInstalled ─────────────────────────────────────────────────────────────

describe('listInstalled', () => {
  it('returns an object (the servers map)', () => {
    const installed = listInstalled()
    expect(typeof installed).toBe('object')
    expect(installed).not.toBeNull()
  })

  it('returns empty object when nothing installed', () => {
    // readFileSync mocked to return {"servers":[]} → empty
    const installed = listInstalled()
    expect(Object.keys(installed).length).toBe(0)
  })
})
