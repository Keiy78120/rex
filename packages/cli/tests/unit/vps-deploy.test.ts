/**
 * Unit tests for vps-deploy.ts — deployVps, checkVpsStatus.
 * Shell calls mocked — no real SSH/rsync.
 * @module HUB
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      cb(new Error('ssh: connection refused'), '', '')
      return { on: vi.fn() }
    }),
  }
})

import { deployVps } from '../../src/vps-deploy.js'

// ── deployVps ─────────────────────────────────────────────────────────────────

describe('deployVps', () => {
  it('returns a boolean', async () => {
    const result = await deployVps({ host: 'test.example.com', user: 'root' })
    expect(typeof result).toBe('boolean')
  })

  it('returns false when ssh connection fails', async () => {
    const result = await deployVps({ host: 'nonexistent.host', user: 'root' })
    expect(result).toBe(false)
  })

  it('does not throw when connection fails', async () => {
    await expect(deployVps({ host: 'bad-host', user: 'root' })).resolves.not.toThrow()
  })
})

// ── deployVps — additional options ───────────────────────────────────────────

describe('deployVps — additional', () => {
  it('returns boolean with sshKey option', async () => {
    const result = await deployVps({ host: 'test.host', user: 'deploy', sshKey: '/tmp/key' })
    expect(typeof result).toBe('boolean')
  })

  it('returns boolean with port option', async () => {
    const result = await deployVps({ host: 'test.host', user: 'deploy', port: 2222 })
    expect(typeof result).toBe('boolean')
  })

  it('does not throw with dryRun=true', async () => {
    await expect(deployVps({ host: 'test.host', user: 'root', dryRun: true })).resolves.not.toThrow()
  })

  it('result is false when SSH fails for all retry attempts', async () => {
    const result = await deployVps({ host: 'unreachable.host', user: 'admin' })
    expect(result).toBe(false)
  })
})
