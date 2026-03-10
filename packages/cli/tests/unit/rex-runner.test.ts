/**
 * Unit tests for rex-runner.ts — parseRexFile, printRexResult.
 * FS and subprocess mocked.
 * @module REX-RUNNER
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

const REX_FILE_CONTENT = `# My Rex File

## Build project

\`\`\`bash #!exec
echo "building"
\`\`\`

## Non-executable block

\`\`\`typescript
const x = 1
\`\`\`
`

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => REX_FILE_CONTENT),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (e: null, out: string, err: string) => void) => {
      cb(null, 'output', '')
      return { on: vi.fn() }
    }),
  }
})

import { parseRexFile, printRexResult } from '../../src/rex-runner.js'

// ── parseRexFile ──────────────────────────────────────────────────────────────

describe('parseRexFile', () => {
  it('returns an array of blocks', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    expect(Array.isArray(blocks)).toBe(true)
  })

  it('finds the executable bash block', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    const execBlocks = blocks.filter(b => b.executable)
    expect(execBlocks.length).toBeGreaterThanOrEqual(1)
  })

  it('finds the non-executable typescript block', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    const tsBlocks = blocks.filter(b => b.language === 'typescript' && !b.executable)
    expect(tsBlocks.length).toBeGreaterThanOrEqual(1)
  })

  it('each block has a language field', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    for (const b of blocks) {
      expect(['typescript', 'bash', 'python', 'sh']).toContain(b.language)
    }
  })

  it('each block has a source string', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    for (const b of blocks) {
      expect(typeof b.source).toBe('string')
    }
  })

  it('executable block has heading from ## section', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    const execBlock = blocks.find(b => b.executable)
    expect(execBlock?.heading).toContain('Build project')
  })
})

// ── printRexResult ────────────────────────────────────────────────────────────

describe('printRexResult', () => {
  it('does not throw with empty result', () => {
    const result = {
      filePath: '/tmp/test.rex',
      totalBlocks: 0,
      executableBlocks: 0,
      results: [],
      durationMs: 0,
      errors: 0,
    }
    expect(() => printRexResult(result)).not.toThrow()
  })

  it('does not throw with populated results', () => {
    const result = {
      filePath: '/tmp/test.rex',
      totalBlocks: 2,
      executableBlocks: 1,
      results: [{
        blockIndex: 0,
        heading: 'Build project',
        language: 'bash',
        stdout: 'building',
        stderr: '',
        exitCode: 0,
        durationMs: 45,
      }],
      durationMs: 50,
      errors: 0,
    }
    expect(() => printRexResult(result)).not.toThrow()
  })

  it('does not throw with error results', () => {
    const result = {
      filePath: '/tmp/test.rex',
      totalBlocks: 1,
      executableBlocks: 1,
      results: [{
        blockIndex: 0,
        language: 'bash',
        stdout: '',
        stderr: 'command not found',
        exitCode: 127,
        durationMs: 10,
        error: 'Process exited with code 127',
      }],
      durationMs: 15,
      errors: 1,
    }
    expect(() => printRexResult(result)).not.toThrow()
  })
})

// ── parseRexFile — edge cases ─────────────────────────────────────────────────

describe('parseRexFile — edge cases', () => {
  it('returns empty array when readFileSync returns empty string', async () => {
    const { readFileSync } = await import('node:fs')
    vi.mocked(readFileSync).mockReturnValueOnce('')
    const blocks = parseRexFile('/tmp/empty.rex')
    expect(blocks).toHaveLength(0)
  })

  it('block language is one of: typescript, bash, python, sh', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    const valid = ['typescript', 'bash', 'python', 'sh']
    for (const b of blocks) {
      expect(valid).toContain(b.language)
    }
  })

  it('executable is boolean', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    for (const b of blocks) {
      expect(typeof b.executable).toBe('boolean')
    }
  })

  it('lineNumber is a non-negative integer', () => {
    const blocks = parseRexFile('/tmp/test.rex')
    for (const b of blocks) {
      expect(Number.isInteger(b.lineNumber)).toBe(true)
      expect(b.lineNumber).toBeGreaterThanOrEqual(0)
    }
  })
})
