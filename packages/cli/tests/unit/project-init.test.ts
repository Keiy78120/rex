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

  it('deduplicates skills across overlapping keys', () => {
    const stack = { name: 'Next.js', keys: ['next', 'react'], language: 'typescript' as const, packageManager: 'pnpm' as const }
    const skills = resolveSkills(stack)
    const unique = new Set(skills)
    expect(skills.length).toBe(unique.size)
  })

  it('next stack includes ux-flow and ui-craft', () => {
    const stack = { name: 'Next.js', keys: ['next'], language: 'typescript' as const, packageManager: 'pnpm' as const }
    const skills = resolveSkills(stack)
    expect(skills).toContain('ux-flow')
    expect(skills).toContain('ui-craft')
  })

  it('go stack includes test-strategy and api-design', () => {
    const stack = { name: 'Go', keys: ['go'], language: 'go' as const, packageManager: 'go' as const }
    const skills = resolveSkills(stack)
    expect(skills).toContain('test-strategy')
    expect(skills).toContain('api-design')
  })

  it('express stack includes api-design', () => {
    const stack = { name: 'Express', keys: ['express'], language: 'javascript' as const, packageManager: 'npm' as const }
    const skills = resolveSkills(stack)
    expect(skills).toContain('api-design')
  })
})

// ── detectStack — stack variants ──────────────────────────────────────────────

describe('detectStack — Go project', () => {
  it('detects Go when go.mod exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && p.endsWith('go.mod')
    )
    const info = detectStack('/tmp/go-project')
    expect(info.language).toBe('go')
    expect(info.packageManager).toBe('go')
    expect(info.keys).toContain('go')
  })
})

describe('detectStack — Flutter project', () => {
  it('detects Flutter when pubspec.yaml exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && p.endsWith('pubspec.yaml')
    )
    const info = detectStack('/tmp/flutter-project')
    expect(info.language).toBe('dart')
    expect(info.packageManager).toBe('pub')
    expect(info.keys).toContain('flutter')
  })
})

describe('detectStack — Python project', () => {
  it('detects Python when requirements.txt exists', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && p.endsWith('requirements.txt')
    )
    const info = detectStack('/tmp/python-project')
    expect(info.language).toBe('python')
    expect(info.packageManager).toBe('pip')
  })
})

describe('detectStack — Next.js project', () => {
  it('detects Next.js from package.json with next dep', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    vi.mocked(existsSync).mockImplementation((p: string | Buffer | URL) =>
      typeof p === 'string' && (
        p.endsWith('package.json') ||
        p.endsWith('tsconfig.json') ||
        p.endsWith('pnpm-lock.yaml')
      )
    )
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      name: 'my-app',
      dependencies: { next: '14.0.0', react: '18.0.0' },
      scripts: { build: 'next build', dev: 'next dev', test: 'vitest' },
    }))
    const info = detectStack('/tmp/nextjs-project')
    expect(info.name).toContain('Next.js')
    expect(info.language).toBe('typescript')
    expect(info.packageManager).toBe('pnpm')
    expect(info.keys).toContain('next')
    expect(info.buildCmd).toBe('pnpm run build')
    expect(info.devCmd).toBe('pnpm run dev')
    expect(info.testRunner).toBe('pnpm test')
  })
})

describe('detectStack — unknown project', () => {
  it('returns language=unknown and packageManager=none', async () => {
    const { existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(false)
    const info = detectStack('/tmp/empty')
    expect(info.language).toBe('unknown')
    expect(info.packageManager).toBe('none')
    expect(info.keys).toHaveLength(0)
  })
})
