/**
 * Unit tests for resource-hub.ts — searchHub pure function and HubResource structure.
 * Tests search logic without network calls or filesystem access.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-hub-test',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-hub-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: () => false, readFileSync: actual.readFileSync }
})

import {
  searchHub,
  type HubResource,
  type ResourceType,
} from '../../src/resource-hub.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeResource(overrides: Partial<HubResource> = {}): HubResource {
  return {
    id: 'test-resource',
    name: 'test-resource',
    type: 'skill',
    description: 'A test resource for unit testing',
    source: 'local',
    tags: ['test', 'unit'],
    verified: true,
    addedAt: '2026-01-01',
    ...overrides,
  }
}

function makeCatalog(resources: HubResource[]) {
  return { version: 2 as const, updatedAt: '2026-01-01', resources }
}

// ── searchHub ─────────────────────────────────────────────────────────────────

describe('searchHub', () => {
  it('returns all resources when query matches everything', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'security-guard', description: 'security tool', tags: ['security'] }),
      makeResource({ id: 'r2', name: 'other-thing', description: 'something else', tags: ['other'] }),
    ]
    const catalog = makeCatalog(resources)
    // Empty query matches nothing (no substring of empty string)
    const results = searchHub(catalog, 'security')
    expect(results.some(r => r.id === 'r1')).toBe(true)
  })

  it('returns empty array when no resources match', () => {
    const catalog = makeCatalog([makeResource({ name: 'foo', description: 'bar', tags: ['baz'] })])
    const results = searchHub(catalog, 'completely-nonexistent-xyz')
    expect(results).toHaveLength(0)
  })

  it('returns empty array when catalog has no resources', () => {
    const catalog = makeCatalog([])
    expect(searchHub(catalog, 'anything')).toHaveLength(0)
  })

  it('matches by name (case-insensitive)', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'Security-Scanner', description: 'desc', tags: [] }),
      makeResource({ id: 'r2', name: 'other', description: 'other', tags: [] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'security')
    expect(results.some(r => r.id === 'r1')).toBe(true)
    expect(results.some(r => r.id === 'r2')).toBe(false)
  })

  it('matches by description (case-insensitive)', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'tool', description: 'Monitors disk usage', tags: [] }),
      makeResource({ id: 'r2', name: 'other', description: 'unrelated', tags: [] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'disk')
    expect(results.some(r => r.id === 'r1')).toBe(true)
    expect(results.some(r => r.id === 'r2')).toBe(false)
  })

  it('matches by tags', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'tool', description: 'a tool', tags: ['security', 'audit'] }),
      makeResource({ id: 'r2', name: 'other', description: 'other', tags: ['network'] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'audit')
    expect(results.some(r => r.id === 'r1')).toBe(true)
    expect(results.some(r => r.id === 'r2')).toBe(false)
  })

  it('filters by type when type is specified', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'test-guard', type: 'guard', description: 'test', tags: ['test'] }),
      makeResource({ id: 'r2', name: 'test-skill', type: 'skill', description: 'test', tags: ['test'] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'test', 'guard')
    expect(results.some(r => r.id === 'r1')).toBe(true)
    expect(results.some(r => r.id === 'r2')).toBe(false)
  })

  it('returns all matching types when type is not specified', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'shared-tool', type: 'guard', description: 'shared', tags: [] }),
      makeResource({ id: 'r2', name: 'shared-skill', type: 'skill', description: 'shared', tags: [] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'shared')
    expect(results.some(r => r.id === 'r1')).toBe(true)
    expect(results.some(r => r.id === 'r2')).toBe(true)
  })

  it('matches multiple resources correctly', () => {
    const resources = [
      makeResource({ id: 'r1', name: 'alpha', description: 'alpha tool', tags: ['alpha'] }),
      makeResource({ id: 'r2', name: 'beta', description: 'beta tool', tags: ['beta'] }),
      makeResource({ id: 'r3', name: 'gamma', description: 'gamma tool', tags: [] }),
    ]
    const catalog = makeCatalog(resources)
    const results = searchHub(catalog, 'tool')
    expect(results).toHaveLength(3)
  })
})
