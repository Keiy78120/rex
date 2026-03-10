/**
 * Unit tests for voice.ts — voice() command dispatcher.
 * FS and subprocess mocked.
 * @module GATEWAY
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ optimizeEnabled: false, optimizeModel: 'qwen3.5:4b' })),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: Date.now(), size: 1000 })),
    writeFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawnSync: vi.fn(() => ({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') })),
  }
})

import { voice } from '../../src/voice.js'

// ── voice ─────────────────────────────────────────────────────────────────────

describe('voice', () => {
  it('does not throw with "status" subcommand', async () => {
    await expect(voice(['status'])).resolves.not.toThrow()
  })

  it('does not throw with "list" subcommand', async () => {
    await expect(voice(['list'])).resolves.not.toThrow()
  })

  it('does not throw with no args', async () => {
    await expect(voice([])).resolves.not.toThrow()
  })

  it('does not throw with unknown subcommand', async () => {
    await expect(voice(['unknown'])).resolves.not.toThrow()
  })
})
