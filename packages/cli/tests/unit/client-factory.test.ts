/**
 * Unit tests for client-factory.ts — listClients, getClient.
 * All filesystem ops mocked — no real disk access.
 * @module CLIENT
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-client-factory-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn(() => ''), execFile: vi.fn() }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '[]'),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  }
})

import {
  listClients, getClient, printClients, printClientDetail,
  pauseClient, resumeClient, removeClient, getClientLogs, stopClient,
  type ClientConfig,
} from '../../src/client-factory.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(overrides: Partial<ClientConfig> = {}): ClientConfig {
  return {
    id: 'test-client-001',
    name: 'Test Client',
    trade: 'plumbing',
    plan: 'starter',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ports: { dify: 3000, n8n: 3001, twenty: 3002 },
    litellm: { monthlyBudgetUsd: 10, model: 'qwen2.5:7b' },
    docker: { composeFile: '/tmp/compose.yml', networkName: 'rex-test', dataDir: '/tmp/data' },
    metrics: { totalTokens: 0, totalCostUsd: 0, sessionsCount: 0 },
    ...overrides,
  }
}

// ── listClients ───────────────────────────────────────────────────────────────

describe('listClients', () => {
  it('returns an array', () => {
    expect(Array.isArray(listClients())).toBe(true)
  })

  it('returns empty array when index does not exist', () => {
    // existsSync mocked to false → loadIndex returns []
    expect(listClients()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => listClients()).not.toThrow()
  })
})

// ── getClient ─────────────────────────────────────────────────────────────────

describe('getClient', () => {
  it('returns null for non-existent client id', () => {
    expect(getClient('nonexistent-client-id')).toBeNull()
  })

  it('does not throw', () => {
    expect(() => getClient('any-id')).not.toThrow()
  })
})

// ── printClients ──────────────────────────────────────────────────────────────

describe('printClients', () => {
  it('does not throw with empty array', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => printClients([])).not.toThrow()
    spy.mockRestore()
  })

  it('does not throw with one client', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => printClients([makeClient()])).not.toThrow()
    spy.mockRestore()
  })

  it('does not throw with multiple clients of different plans', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clients = [
      makeClient({ id: 'c1', plan: 'starter' }),
      makeClient({ id: 'c2', plan: 'pro' }),
      makeClient({ id: 'c3', plan: 'enterprise', status: 'paused' }),
    ]
    expect(() => printClients(clients)).not.toThrow()
    spy.mockRestore()
  })
})

// ── printClientDetail ─────────────────────────────────────────────────────────

describe('printClientDetail', () => {
  it('does not throw with minimal client', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => printClientDetail(makeClient())).not.toThrow()
    spy.mockRestore()
  })

  it('does not throw with paused client', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => printClientDetail(makeClient({ status: 'paused' }))).not.toThrow()
    spy.mockRestore()
  })

  it('does not throw with error status client', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => printClientDetail(makeClient({ status: 'error' }))).not.toThrow()
    spy.mockRestore()
  })
})

// ── pauseClient ───────────────────────────────────────────────────────────────

describe('pauseClient', () => {
  it('rejects with error for non-existent client', async () => {
    await expect(pauseClient('nonexistent-id')).rejects.toThrow()
  })

  it('rejects with a message containing the id', async () => {
    await expect(pauseClient('nonexistent-id')).rejects.toThrow('nonexistent-id')
  })
})

// ── resumeClient ──────────────────────────────────────────────────────────────

describe('resumeClient', () => {
  it('rejects with error for non-existent client', async () => {
    await expect(resumeClient('nonexistent-id')).rejects.toThrow()
  })
})

// ── removeClient ──────────────────────────────────────────────────────────────

describe('removeClient', () => {
  it('rejects with error for non-existent client (no purge)', async () => {
    await expect(removeClient('nonexistent-id')).rejects.toThrow()
  })

  it('rejects with error for non-existent client (with purge)', async () => {
    await expect(removeClient('nonexistent-id', { purge: true })).rejects.toThrow()
  })
})

// ── getClientLogs ─────────────────────────────────────────────────────────────

describe('getClientLogs', () => {
  it('rejects for non-existent client', async () => {
    await expect(getClientLogs('nonexistent-id')).rejects.toThrow()
  })

  it('rejects with id in message', async () => {
    await expect(getClientLogs('nonexistent-id', 50)).rejects.toThrow('nonexistent-id')
  })
})

// ── stopClient ────────────────────────────────────────────────────────────────

describe('stopClient', () => {
  it('rejects with error for non-existent client', async () => {
    await expect(stopClient('nonexistent-id')).rejects.toThrow()
  })
})
