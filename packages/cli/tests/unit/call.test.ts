/**
 * Unit tests for call.ts — call() command dispatcher.
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
    readFileSync: vi.fn(() => JSON.stringify({ active: false, app: '', reason: '', title: '', startedAt: 0, updatedAt: 0, iso: '' })),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawnSync: vi.fn(() => ({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') })),
  }
})

import { call } from '../../src/call.js'

// ── call ──────────────────────────────────────────────────────────────────────

describe('call', () => {
  it('does not throw with "status" subcommand', async () => {
    await expect(call(['status'])).resolves.not.toThrow()
  })

  it('does not throw with "status --json"', async () => {
    await expect(call(['status', '--json'])).resolves.not.toThrow()
  })

  it('does not throw with no args', async () => {
    await expect(call([])).resolves.not.toThrow()
  })

  it('does not throw with unknown subcommand', async () => {
    await expect(call(['unknown'])).resolves.not.toThrow()
  })

  it('does not throw with "stop" subcommand', async () => {
    await expect(call(['stop'])).resolves.not.toThrow()
  })

  it('does not throw with "start" subcommand', async () => {
    await expect(call(['start'])).resolves.not.toThrow()
  })

  it('does not throw with "list" subcommand', async () => {
    await expect(call(['list'])).resolves.not.toThrow()
  })

  it('does not throw with extra unknown flags', async () => {
    await expect(call(['--dry-run', '--verbose'])).resolves.not.toThrow()
  })

  it('resolves for multiple subcommands in sequence', async () => {
    await expect(call(['status'])).resolves.not.toThrow()
    await expect(call(['list'])).resolves.not.toThrow()
    await expect(call([])  ).resolves.not.toThrow()
  })
})
