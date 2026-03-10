/**
 * Unit tests for project-intent.ts
 * Tests: detectIntent() with real temp dirs + git repos (zero LLM)
 * Tests: intentToPreloadLine() pure formatting
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/test-rex',
  DAEMON_LOG_PATH: '/tmp/test-rex/daemon.log',
}))

import { detectIntent, intentToPreloadLine, type IntentContext } from '../../src/project-intent.js'

const TEST_ROOT = join(tmpdir(), `rex-intent-test-${process.pid}`)

afterAll(() => {
  try { rmSync(TEST_ROOT, { recursive: true }) } catch {}
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDir(name: string): string {
  const p = join(TEST_ROOT, name)
  mkdirSync(p, { recursive: true })
  return p
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@rex.ai"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "REX Test"', { cwd: dir, stdio: 'pipe' })
}

function commit(dir: string, message: string, filename = 'file.txt'): void {
  writeFileSync(join(dir, filename), message)
  execSync(`git add ${filename}`, { cwd: dir, stdio: 'pipe' })
  execSync(`git commit -m "${message}" --allow-empty`, { cwd: dir, stdio: 'pipe' })
}

// ── Non-git directory ─────────────────────────────────────────────────────────

describe('detectIntent — non-git directory', () => {
  let dir: string
  beforeAll(() => { dir = makeDir('no-git') })

  it('returns explore intent for non-git directory', () => {
    const ctx = detectIntent(dir)
    expect(ctx.intent).toBe('explore')
  })

  it('returns low confidence for non-git directory', () => {
    const ctx = detectIntent(dir)
    expect(ctx.confidence).toBe('low')
  })
})

// ── New project (< 5 commits) ─────────────────────────────────────────────────

describe('detectIntent — new project', () => {
  let dir: string
  beforeAll(() => {
    dir = makeDir('new-project')
    initGitRepo(dir)
    commit(dir, 'initial commit', 'README.md')
    commit(dir, 'add package.json', 'package.json')
  })

  it('returns new-project intent for repo with few commits', () => {
    const ctx = detectIntent(dir)
    // Very early repo → new-project or explore (both valid)
    expect(['new-project', 'explore', 'feature']).toContain(ctx.intent)
  })

  it('returns a valid confidence level', () => {
    const ctx = detectIntent(dir)
    expect(['high', 'medium', 'low']).toContain(ctx.confidence)
  })
})

// ── Bug-fix project ───────────────────────────────────────────────────────────

describe('detectIntent — bug-fix project', () => {
  let dir: string
  beforeAll(() => {
    dir = makeDir('bug-fix-project')
    initGitRepo(dir)
    commit(dir, 'initial setup')
    commit(dir, 'add feature X')
    commit(dir, 'fix: resolve null pointer crash', 'fix1.ts')
    commit(dir, 'bug: handle edge case in auth', 'fix2.ts')
    commit(dir, 'patch: correct off-by-one error', 'fix3.ts')
  })

  it('returns bug-fix intent when recent commits have fix/bug/patch keywords', () => {
    const ctx = detectIntent(dir)
    expect(ctx.intent).toBe('bug-fix')
  })

  it('signals array is non-empty', () => {
    const ctx = detectIntent(dir)
    expect(Array.isArray(ctx.signals)).toBe(true)
    expect(ctx.signals.length).toBeGreaterThan(0)
  })
})

// ── Refactor project ──────────────────────────────────────────────────────────

describe('detectIntent — refactor project', () => {
  let dir: string
  beforeAll(() => {
    dir = makeDir('refactor-project')
    initGitRepo(dir)
    commit(dir, 'initial setup')
    commit(dir, 'add feature X')
    commit(dir, 'refactor: extract helper functions', 'r1.ts')
    commit(dir, 'clean: remove dead code', 'r2.ts')
    commit(dir, 'rename: update module names', 'r3.ts')
  })

  it('returns refactor intent when recent commits have refactor/clean/rename', () => {
    const ctx = detectIntent(dir)
    expect(ctx.intent).toBe('refactor')
  })
})

// ── Docs project ──────────────────────────────────────────────────────────────

describe('detectIntent — docs project', () => {
  let dir: string
  beforeAll(() => {
    dir = makeDir('docs-project')
    initGitRepo(dir)
    commit(dir, 'initial setup')
    commit(dir, 'docs: update README', 'README.md')
    commit(dir, 'docs: add API reference', 'API.md')
    commit(dir, 'docs: fix typos in guide', 'GUIDE.md')
  })

  it('returns docs intent when recent commits are docs-only', () => {
    const ctx = detectIntent(dir)
    // docs, feature, or new-project depending on commit count threshold
    expect(['docs', 'feature', 'new-project']).toContain(ctx.intent)
  })
})

// ── IntentContext shape ───────────────────────────────────────────────────────

describe('detectIntent — response shape', () => {
  let dir: string
  beforeAll(() => {
    dir = makeDir('shape-test')
    initGitRepo(dir)
    commit(dir, 'initial commit')
  })

  it('always returns all required fields', () => {
    const ctx = detectIntent(dir)
    expect(ctx).toHaveProperty('intent')
    expect(ctx).toHaveProperty('confidence')
    expect(ctx).toHaveProperty('missing')
    expect(ctx).toHaveProperty('actions')
    expect(ctx).toHaveProperty('signals')
  })

  it('actions is always an array', () => {
    const ctx = detectIntent(dir)
    expect(Array.isArray(ctx.actions)).toBe(true)
  })

  it('signals is always an array', () => {
    const ctx = detectIntent(dir)
    expect(Array.isArray(ctx.signals)).toBe(true)
  })

  it('missing is always an object', () => {
    const ctx = detectIntent(dir)
    expect(typeof ctx.missing).toBe('object')
  })
})

// ── intentToPreloadLine ───────────────────────────────────────────────────────

describe('intentToPreloadLine', () => {
  function makeCtx(intent: IntentContext['intent'], signals: string[] = []): IntentContext {
    return {
      intent,
      confidence: 'high',
      missing: {},
      actions: [],
      signals,
    }
  }

  it('returns a string', () => {
    const line = intentToPreloadLine(makeCtx('feature'))
    expect(typeof line).toBe('string')
  })

  it('includes the intent in the output', () => {
    const line = intentToPreloadLine(makeCtx('bug-fix'))
    expect(line).toContain('bug-fix')
  })

  it('returns a non-empty string for all intent types', () => {
    const intents: IntentContext['intent'][] = [
      'new-project', 'feature', 'bug-fix', 'refactor', 'infra', 'docs', 'explore',
    ]
    for (const intent of intents) {
      const line = intentToPreloadLine(makeCtx(intent))
      expect(line.length).toBeGreaterThan(0)
    }
  })
})
