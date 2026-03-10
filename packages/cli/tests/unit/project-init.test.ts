/**
 * Unit tests for project-init.ts — detectStack, resolveSkills.
 * FS and shell calls mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import { detectStack, resolveSkills } from '../../src/project-init.js'

// ── detectStack ───────────────────────────────────────────────────────────────

describe('detectStack', () => {
  it('returns a StackInfo object', () => {
    const info = detectStack('/tmp/no-files')
    expect(typeof info).toBe('object')
    expect(info).not.toBeNull()
  })

  it('result has name, keys, language fields', () => {
    const info = detectStack('/tmp/no-files')
    expect(info).toHaveProperty('name')
    expect(info).toHaveProperty('keys')
    expect(info).toHaveProperty('language')
    expect(Array.isArray(info.keys)).toBe(true)
  })

  it('detects Node.js when package.json exists', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && p.endsWith('package.json')
    )
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ name: 'test', dependencies: {} }))
    const info = detectStack('/tmp/node-project')
    expect(['typescript', 'javascript']).toContain(info.language)
  })

  it('returns a default unknown stack when no files match', () => {
    const info = detectStack('/tmp/empty-project')
    expect(info).toHaveProperty('name')
    expect(typeof info.name).toBe('string')
  })
})

// ── resolveSkills ─────────────────────────────────────────────────────────────

describe('resolveSkills', () => {
  it('returns an array', () => {
    const stack = detectStack('/tmp/no-files')
    const skills = resolveSkills(stack)
    expect(Array.isArray(skills)).toBe(true)
  })

  it('skills are strings', () => {
    const stack = detectStack('/tmp/no-files')
    const skills = resolveSkills(stack)
    for (const s of skills) {
      expect(typeof s).toBe('string')
    }
  })

  it('resolves skills for a node stack', () => {
    const nodeStack = { name: 'Node.js', keys: ['node', 'ts'], language: 'typescript' as const, packageManager: 'npm' }
    const skills = resolveSkills(nodeStack)
    expect(Array.isArray(skills)).toBe(true)
  })

  it('returns empty array for unknown keys', () => {
    const unknownStack = { name: 'Unknown', keys: ['xyz-never-exists'], language: 'unknown' as const }
    const skills = resolveSkills(unknownStack)
    expect(skills).toHaveLength(0)
  })
})
