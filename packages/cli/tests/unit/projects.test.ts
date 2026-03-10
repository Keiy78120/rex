/**
 * Unit tests for projects.ts — scanProjects, loadProjectIndex, findProject.
 * All FS and shell calls mocked.
 * @module PROJETS
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-projects-test',
  PROJECTS_DIR: '/tmp/rex-projects-test/projects',
  SUMMARIES_DIR: '/tmp/rex-projects-test/summaries',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({ ingest: { scanPaths: [] } })),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: Date.now(), isDirectory: () => true })),
    mkdirSync: vi.fn(),
  }
})

import { scanProjects, loadProjectIndex, findProject, saveProjectIndex } from '../../src/projects.js'

// ── scanProjects ──────────────────────────────────────────────────────────────

describe('scanProjects', () => {
  it('returns an array', () => {
    expect(Array.isArray(scanProjects())).toBe(true)
  })

  it('returns empty array when no DEV dirs configured', () => {
    expect(scanProjects()).toHaveLength(0)
  })
})

// ── loadProjectIndex ──────────────────────────────────────────────────────────

describe('loadProjectIndex', () => {
  it('returns an array', () => {
    expect(Array.isArray(loadProjectIndex())).toBe(true)
  })

  it('returns empty array when index file does not exist', () => {
    expect(loadProjectIndex()).toHaveLength(0)
  })
})

// ── findProject ───────────────────────────────────────────────────────────────

describe('findProject', () => {
  it('returns undefined when index is empty', () => {
    expect(findProject('/some/path')).toBeUndefined()
  })

  it('does not throw for any cwd', () => {
    expect(() => findProject('/home/user/myproject')).not.toThrow()
  })
})

// ── saveProjectIndex ──────────────────────────────────────────────────────────

describe('saveProjectIndex', () => {
  it('does not throw with empty array', () => {
    expect(() => saveProjectIndex([])).not.toThrow()
  })
})
