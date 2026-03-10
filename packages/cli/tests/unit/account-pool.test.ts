/**
 * Unit tests for account-pool.ts — discoverAccounts, selectAccount, getAccountEnv.
 * FS mocked — no real filesystem traversal.
 * @module AGENTS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => JSON.stringify({ accounts: [], updatedAt: new Date().toISOString() })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
  }
})

import { discoverAccounts, selectAccount, getAccountEnv, acquireAccount, releaseAccount, markRateLimited } from '../../src/account-pool.js'

// ── discoverAccounts ──────────────────────────────────────────────────────────

describe('discoverAccounts', () => {
  it('returns an array', () => {
    expect(Array.isArray(discoverAccounts())).toBe(true)
  })

  it('does not throw when no secondary accounts exist', () => {
    expect(() => discoverAccounts()).not.toThrow()
  })
})

// ── selectAccount ─────────────────────────────────────────────────────────────

describe('selectAccount', () => {
  it('returns null or an AccountEntry', () => {
    const result = selectAccount()
    expect(result === null || typeof result === 'object').toBe(true)
  })

  it('does not throw when pool is empty', () => {
    expect(() => selectAccount()).not.toThrow()
  })
})

// ── getAccountEnv ─────────────────────────────────────────────────────────────

describe('getAccountEnv', () => {
  it('returns an object', () => {
    const account = {
      id: 1,
      configDir: '/tmp/test-claude',
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    }
    const env = getAccountEnv(account)
    expect(typeof env).toBe('object')
  })

  it('includes CLAUDE_CONFIG_DIR key', () => {
    const account = {
      id: 2,
      configDir: '/tmp/claude-account-2',
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    }
    const env = getAccountEnv(account)
    expect(env).toHaveProperty('CLAUDE_CONFIG_DIR')
  })

  it('does not throw', () => {
    const account = {
      id: 1,
      configDir: '/tmp/test',
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    }
    expect(() => getAccountEnv(account)).not.toThrow()
  })

  it('CLAUDE_CONFIG_DIR matches configDir', () => {
    const account = {
      id: 3,
      configDir: '/home/user/.claude-account-3',
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    }
    const env = getAccountEnv(account)
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/user/.claude-account-3')
  })

  it('REX_ACCOUNT_ID is a string of the account id', () => {
    const account = {
      id: 5,
      configDir: '/tmp/acc5',
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    }
    const env = getAccountEnv(account)
    expect(env.REX_ACCOUNT_ID).toBe('5')
  })
})

// ── acquireAccount ────────────────────────────────────────────────────────────

describe('acquireAccount', () => {
  it('does not throw for missing account id', () => {
    expect(() => acquireAccount(9999)).not.toThrow()
  })

  it('does not throw for id 1', () => {
    expect(() => acquireAccount(1)).not.toThrow()
  })
})

// ── releaseAccount ────────────────────────────────────────────────────────────

describe('releaseAccount', () => {
  it('does not throw for missing account id', () => {
    expect(() => releaseAccount(9999)).not.toThrow()
  })

  it('does not throw with error flag', () => {
    expect(() => releaseAccount(9999, { error: true })).not.toThrow()
  })

  it('does not throw with rateLimited flag', () => {
    expect(() => releaseAccount(9999, { rateLimited: true })).not.toThrow()
  })
})

// ── markRateLimited ───────────────────────────────────────────────────────────

describe('markRateLimited', () => {
  it('does not throw for missing account id', () => {
    expect(() => markRateLimited(9999)).not.toThrow()
  })

  it('does not throw with custom cooldown', () => {
    expect(() => markRateLimited(9999, 30_000)).not.toThrow()
  })
})
