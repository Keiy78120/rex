/**
 * Unit tests for init.ts — installGitHooks, generateCIWorkflow.
 * FS and shell calls mocked.
 * @module TOOLS
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
    copyFileSync: vi.fn(),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => false, mtimeMs: Date.now() })),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => '') }
})

import { installGitHooks, generateCIWorkflow, generateReviewConfig } from '../../src/init.js'

// ── installGitHooks ───────────────────────────────────────────────────────────

describe('installGitHooks', () => {
  it('returns a number', () => {
    const count = installGitHooks('/tmp/no-git-here')
    expect(typeof count).toBe('number')
  })

  it('returns 0 when no .git directory found', () => {
    // existsSync mocked to false → no .git dir found
    const count = installGitHooks('/tmp/no-git-here')
    expect(count).toBe(0)
  })

  it('does not throw for any path', () => {
    expect(() => installGitHooks('/completely/nonexistent')).not.toThrow()
  })
})

// ── generateCIWorkflow ────────────────────────────────────────────────────────

describe('generateCIWorkflow', () => {
  it('does not throw', () => {
    // existsSync=false → dir doesn't exist → mkdirSync called → writeFileSync called
    expect(() => generateCIWorkflow('/tmp/test-project')).not.toThrow()
  })

  it('calls writeFileSync when CI file does not exist', async () => {
    const { writeFileSync } = await import('node:fs')
    const mockFn = vi.mocked(writeFileSync)
    mockFn.mockClear()
    generateCIWorkflow('/tmp/test-ci-project')
    expect(mockFn).toHaveBeenCalled()
  })
})

// ── generateReviewConfig ──────────────────────────────────────────────────────

describe('generateReviewConfig', () => {
  it('does not throw', () => {
    expect(() => generateReviewConfig('/tmp/test-project')).not.toThrow()
  })
})
