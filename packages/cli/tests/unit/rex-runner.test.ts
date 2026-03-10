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
})
