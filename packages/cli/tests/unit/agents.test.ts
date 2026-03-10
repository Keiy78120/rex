/**
 * Unit tests for agents.ts — agents() command dispatcher.
 * FS, child_process, and account-pool mocked.
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/account-pool.js', () => ({
  selectAccount: vi.fn(() => null),
  acquireAccount: vi.fn(),
  releaseAccount: vi.fn(),
  getAccountEnv: vi.fn(() => ({})),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({ agents: [] })),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
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
    execSync: vi.fn(() => ''),
  }
})

import { agents } from '../../src/agents.js'

// ── agents ────────────────────────────────────────────────────────────────────

describe('agents', () => {
  it('does not throw with "list" subcommand', async () => {
    await expect(agents(['list'])).resolves.not.toThrow()
  })

  it('does not throw with "list --json"', async () => {
    await expect(agents(['list', '--json'])).resolves.not.toThrow()
  })

  it('does not throw with no args', async () => {
    await expect(agents([])).resolves.not.toThrow()
  })

  it('does not throw with unknown subcommand', async () => {
    await expect(agents(['unknown-cmd'])).resolves.not.toThrow()
  })
})
