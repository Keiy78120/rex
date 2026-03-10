/**
 * Integration tests for rex-runner.ts — .rex literate file parser.
 * Tests parseRexFile with real temp .rex files. No network or daemon.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

// ── Hoisted setup ─────────────────────────────────────────────────────────────

const { TEST_DIR } = vi.hoisted(() => {
  const { join } = require('node:path')
  const { tmpdir } = require('node:os')
  const { mkdirSync } = require('node:fs')
  const dir = join(tmpdir(), `rex-runner-test-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
})

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { parseRexFile, type RexBlock } from '../../src/rex-runner.js'

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeRex(name: string, content: string): string {
  const filePath = join(TEST_DIR, `${name}.rex`)
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

// ── parseRexFile ──────────────────────────────────────────────────────────────

describe('parseRexFile', () => {
  it('returns empty array for file with no code blocks', () => {
    const f = writeRex('empty', '# Just markdown\n\nSome text.\n')
    expect(parseRexFile(f)).toEqual([])
  })

  it('parses a single executable typescript block', () => {
    const f = writeRex('single-exec', [
      '# Title',
      '## My Section',
      '```typescript #!exec',
      'const x = 1',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks.length).toBe(1)
    expect(blocks[0].language).toBe('typescript')
    expect(blocks[0].executable).toBe(true)
    expect(blocks[0].source).toContain('const x = 1')
  })

  it('parses a non-executable block (no #!exec)', () => {
    const f = writeRex('non-exec', [
      '```bash',
      'echo hello',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks.length).toBe(1)
    expect(blocks[0].executable).toBe(false)
    expect(blocks[0].language).toBe('bash')
  })

  it('captures heading associated with block', () => {
    const f = writeRex('heading', [
      '## Deploy step',
      '```bash #!exec',
      'rex deploy',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks[0].heading).toBe('Deploy step')
  })

  it('captures lineNumber of block content start (0-based index + 1)', () => {
    const f = writeRex('lineno', [
      'line 1',         // index 0
      'line 2',         // index 1
      '```typescript #!exec',  // index 2 — fence
      'const a = 1',    // index 3 — block starts here (blockStart = i+1 = 3)
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks[0].lineNumber).toBe(3)
  })

  it('parses multiple blocks in one file', () => {
    const f = writeRex('multi', [
      '## Section 1',
      '```bash #!exec',
      'echo one',
      '```',
      '## Section 2',
      '```typescript #!exec',
      'console.log("two")',
      '```',
      '```python',
      'print("three")',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks.length).toBe(3)
    expect(blocks[0].language).toBe('bash')
    expect(blocks[1].language).toBe('typescript')
    expect(blocks[2].language).toBe('python')
    expect(blocks[0].executable).toBe(true)
    expect(blocks[1].executable).toBe(true)
    expect(blocks[2].executable).toBe(false)
  })

  it('handles multi-line block source', () => {
    const f = writeRex('multiline', [
      '```bash #!exec',
      'line1',
      'line2',
      'line3',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks[0].source).toBe('line1\nline2\nline3')
  })

  it('supports all 4 language types', () => {
    const langs = ['typescript', 'bash', 'python', 'sh'] as const
    for (const lang of langs) {
      const f = writeRex(`lang-${lang}`, [
        `\`\`\`${lang} #!exec`,
        `# ${lang}`,
        '```',
      ].join('\n'))
      const blocks = parseRexFile(f)
      expect(blocks[0].language).toBe(lang)
    }
  })

  it('is case-insensitive for #!exec flag', () => {
    const f = writeRex('case-exec', [
      '```TypeScript #!EXEC',
      'const x = 1',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks[0].executable).toBe(true)
  })

  it('heading is undefined when no ## heading precedes block', () => {
    const f = writeRex('no-heading', [
      '```bash',
      'echo hi',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    expect(blocks[0].heading).toBeUndefined()
  })

  it('returns RexBlock with all expected fields', () => {
    const f = writeRex('shape', [
      '## Test Block',
      '```typescript #!exec',
      'const ok = true',
      '```',
    ].join('\n'))
    const blocks = parseRexFile(f)
    const block: RexBlock = blocks[0]
    expect(block).toHaveProperty('language')
    expect(block).toHaveProperty('source')
    expect(block).toHaveProperty('lineNumber')
    expect(block).toHaveProperty('executable')
  })
})
