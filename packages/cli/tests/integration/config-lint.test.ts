/**
 * Integration tests for config-lint.ts — runConfigLint with real temp files.
 * Creates temporary CLAUDE.md files to verify lint rules fire correctly.
 * @module TOOLS
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  runConfigLint,
  type LintResult,
} from '../../src/config-lint.js'

// ── Temp directory setup ─────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `rex-config-lint-test-${Date.now()}`)
mkdirSync(TEST_DIR, { recursive: true })

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

function writeClaudeMd(subdir: string, content: string): string {
  const dir = join(TEST_DIR, subdir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'CLAUDE.md'), content)
  return dir
}

// ── LintResult structure ─────────────────────────────────────────────────────

describe('runConfigLint — result structure', () => {
  it('returns object with required fields', () => {
    const dir = join(TEST_DIR, 'empty-dir')
    mkdirSync(dir, { recursive: true })
    const result = runConfigLint(dir)
    expect(result).toHaveProperty('issues')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('infos')
    expect(result).toHaveProperty('passed')
  })

  it('issues is an array', () => {
    const dir = join(TEST_DIR, 'empty-dir2')
    mkdirSync(dir, { recursive: true })
    expect(Array.isArray(runConfigLint(dir).issues)).toBe(true)
  })

  it('errors + warnings + infos match counts in issues array', () => {
    const dir = writeClaudeMd('structure-check', 'x'.repeat(200) + '\nbuild\nstack')
    const result = runConfigLint(dir)
    const counted = {
      errors: result.issues.filter(i => i.severity === 'error').length,
      warnings: result.issues.filter(i => i.severity === 'warn').length,
      infos: result.issues.filter(i => i.severity === 'info').length,
    }
    expect(result.errors).toBe(counted.errors)
    expect(result.warnings).toBe(counted.warnings)
    expect(result.infos).toBe(counted.infos)
  })

  it('passed is true when errors === 0', () => {
    const dir = writeClaudeMd('no-errors', 'x'.repeat(200) + '\nbuild\nstack\narchitecture')
    const result = runConfigLint(dir)
    expect(result.passed).toBe(result.errors === 0)
  })

  it('each issue has required fields', () => {
    const dir = writeClaudeMd('issue-fields', 'short')  // triggers has-context error
    const result = runConfigLint(dir)
    for (const issue of result.issues) {
      expect(issue).toHaveProperty('file')
      expect(issue).toHaveProperty('rule')
      expect(issue).toHaveProperty('severity')
      expect(issue).toHaveProperty('message')
      expect(['error', 'warn', 'info']).toContain(issue.severity)
    }
  })
})

// ── CLAUDE.md rules ──────────────────────────────────────────────────────────

describe('runConfigLint — claude-md/has-context', () => {
  it('reports error when CLAUDE.md is too short (< 100 chars)', () => {
    const dir = writeClaudeMd('short-md', 'Too short')
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/has-context')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('error')
  })

  it('no has-context error when CLAUDE.md is >= 100 chars', () => {
    const dir = writeClaudeMd('long-md', 'build\nstack\n' + 'x'.repeat(200))
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/has-context')
    expect(issue).toBeUndefined()
  })
})

describe('runConfigLint — claude-md/no-secrets', () => {
  it('reports error when CLAUDE.md contains hardcoded API key', () => {
    const content = 'x'.repeat(200) + '\nbuild\nstack\napi_key = sk-abcdef123456789012'
    const dir = writeClaudeMd('secret-md', content)
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/no-secrets')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('error')
  })

  it('no secrets error for clean CLAUDE.md', () => {
    const dir = writeClaudeMd('clean-md', 'x'.repeat(200) + '\nbuild\nstack')
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/no-secrets')
    expect(issue).toBeUndefined()
  })
})

describe('runConfigLint — claude-md/has-commands', () => {
  it('reports warn when CLAUDE.md has no build/test commands', () => {
    const content = 'x'.repeat(200) + '\nSome architecture notes here'
    const dir = writeClaudeMd('no-commands', content)
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/has-commands')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warn')
  })

  it('no has-commands warning when build command is present', () => {
    const content = 'x'.repeat(200) + '\nbuild: pnpm build\ntest: pnpm test\narchitecture: ...'
    const dir = writeClaudeMd('has-commands', content)
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/has-commands')
    expect(issue).toBeUndefined()
  })
})

describe('runConfigLint — claude-md/no-co-authored', () => {
  it('reports warn when CLAUDE.md instructs Co-Authored-By commits', () => {
    const content = 'x'.repeat(200) + '\nbuild\nstack\nCo-Authored-By: someone'
    const dir = writeClaudeMd('co-authored', content)
    const result = runConfigLint(dir)
    const issue = result.issues.find(i => i.rule === 'claude-md/no-co-authored')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warn')
  })
})

// ── Empty project dir ────────────────────────────────────────────────────────

describe('runConfigLint — no lintable files', () => {
  it('returns 0 issues for project dir with no CLAUDE.md', () => {
    const dir = join(TEST_DIR, 'no-files')
    mkdirSync(dir, { recursive: true })
    const result = runConfigLint(dir)
    // Issues from project dir should be 0; ~/.claude may add issues but we only check project-specific
    const projectIssues = result.issues.filter(i => i.file.startsWith(dir))
    expect(projectIssues).toHaveLength(0)
  })
})
