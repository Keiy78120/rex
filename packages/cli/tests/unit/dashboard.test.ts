/**
 * Unit tests for dashboard.ts — getHQSnapshot.
 * All spawnSync calls mocked — no real rex invocations.
 * @module HQ
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-dashboard-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

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
  // spawnSync returns status=1 (rex not found) → runRex() returns null
  return {
    ...actual,
    spawnSync: vi.fn(() => ({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') })),
  }
})

import { getHQSnapshot } from '../../src/dashboard.js'

// ── getHQSnapshot ──────────────────────────────────────────────────────────────

describe('getHQSnapshot', () => {
  it('returns an object', async () => {
    const snap = await getHQSnapshot()
    expect(typeof snap).toBe('object')
    expect(snap).not.toBeNull()
  })

  it('has capturedAt ISO timestamp', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('capturedAt')
    expect(typeof snap.capturedAt).toBe('string')
    expect(() => new Date(snap.capturedAt)).not.toThrow()
  })

  it('has fleet summary', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('fleet')
    expect(snap.fleet).toHaveProperty('totalNodes')
    expect(snap.fleet).toHaveProperty('healthy')
  })

  it('has budget summary', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('budget')
    expect(snap.budget).toHaveProperty('dailyTokens')
    expect(snap.budget).toHaveProperty('burnRatePerHour')
  })

  it('has memory summary', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('memory')
    expect(snap.memory).toHaveProperty('totalMemories')
    expect(snap.memory).toHaveProperty('pendingChunks')
  })

  it('has agents summary', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('agents')
    expect(snap.agents).toHaveProperty('activeSessions')
    expect(snap.agents).toHaveProperty('profiles')
  })

  it('has curious summary', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('curious')
    expect(snap.curious).toHaveProperty('lastRunAt')
    expect(snap.curious).toHaveProperty('newDiscoveries')
  })

  it('has alerts array', async () => {
    const snap = await getHQSnapshot()
    expect(snap).toHaveProperty('alerts')
    expect(Array.isArray(snap.alerts)).toBe(true)
  })

  it('fleet totalNodes is 0 when rex not found', async () => {
    const snap = await getHQSnapshot()
    expect(snap.fleet.totalNodes).toBe(0)
  })

  it('budget dailyTokens is 0 when rex not found', async () => {
    const snap = await getHQSnapshot()
    expect(snap.budget.dailyTokens).toBe(0)
  })
})
