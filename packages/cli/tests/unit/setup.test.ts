/**
 * Unit tests for setup.ts — setup() with nonInteractive mode.
 * FS, subprocess, fetch, and readline mocked.
 * @module OPTIMIZE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({})),
    writeFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  }
})

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (ans: string) => void) => cb('n')),
    close: vi.fn(),
    on: vi.fn(),
  })),
}))

// Ollama is down → setup skips all Ollama-related prompts
global.fetch = vi.fn().mockRejectedValue(new Error('Ollama unavailable'))

import { setup } from '../../src/setup.js'

// ── setup ─────────────────────────────────────────────────────────────────────

describe('setup', () => {
  it('does not throw with nonInteractive=true and skipTelegram=true', async () => {
    await expect(setup({ nonInteractive: true, skipTelegram: true })).resolves.not.toThrow()
  }, 10000)

  it('resolves (no return value)', async () => {
    const result = await setup({ nonInteractive: true, skipTelegram: true })
    expect(result).toBeUndefined()
  }, 10000)
})
