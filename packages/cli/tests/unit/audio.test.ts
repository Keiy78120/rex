/**
 * Unit tests for audio.ts — audio() command dispatcher.
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
    readFileSync: vi.fn(() => JSON.stringify({ pid: null, startedAt: null, currentFile: null })),
    readdirSync: vi.fn(() => []),
    writeFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => ({
      on: vi.fn(),
      pid: 1234,
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    })),
    spawnSync: vi.fn(() => ({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') })),
  }
})

import { audio } from '../../src/audio.js'

// ── audio ─────────────────────────────────────────────────────────────────────

describe('audio', () => {
  it('does not throw with "status" subcommand', async () => {
    await expect(audio(['status'])).resolves.not.toThrow()
  })

  it('does not throw with "list" subcommand', async () => {
    await expect(audio(['list'])).resolves.not.toThrow()
  })

  it('does not throw with no args', async () => {
    await expect(audio([])).resolves.not.toThrow()
  })

  it('does not throw with unknown subcommand', async () => {
    await expect(audio(['unknown'])).resolves.not.toThrow()
  })

  it('does not throw with "stop" subcommand', async () => {
    await expect(audio(['stop'])).resolves.not.toThrow()
  })

  it('does not throw with "status --json"', async () => {
    await expect(audio(['status', '--json'])).resolves.not.toThrow()
  })

  it('does not throw with "config" subcommand', async () => {
    await expect(audio(['config'])).resolves.not.toThrow()
  })

  it('does not throw with "enable" subcommand', async () => {
    await expect(audio(['enable'])).resolves.not.toThrow()
  })

  it('resolves for sequential calls', async () => {
    await expect(audio(['status'])).resolves.not.toThrow()
    await expect(audio(['list'])).resolves.not.toThrow()
  })
})
