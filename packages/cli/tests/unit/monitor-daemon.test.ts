/**
 * Unit tests for monitor-daemon.ts — getMonitorStatus.
 * Filesystem mocked — no real disk or network access.
 * @module REX-MONITOR
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-monitor-daemon-test',
  ensureRexDirs: vi.fn(),
}))

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/pattern-detector.js', () => ({
  detectPatterns: vi.fn(async () => ({ signals: [], errors: [] })),
}))

vi.mock('../../src/proactive-dispatch.js', () => ({
  dispatchDiscoveries: vi.fn(async () => []),
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => '/tmp/rex-monitor-daemon-test' }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => JSON.stringify({
      lastRunAt: '',
      lastReportAt: '',
      totalSignalsDispatched: 0,
      awAvailableSince: null,
    })),
    writeFileSync: vi.fn(),
  }
})

import { getMonitorStatus } from '../../src/monitor-daemon.js'

// ── getMonitorStatus ──────────────────────────────────────────────────────────

describe('getMonitorStatus', () => {
  it('returns an object with required fields', () => {
    const status = getMonitorStatus()
    expect(status).toHaveProperty('lastRunAt')
    expect(status).toHaveProperty('lastReportAt')
    expect(status).toHaveProperty('totalSignalsDispatched')
    expect(status).toHaveProperty('awAvailable')
    expect(status).toHaveProperty('hammerAvailable')
  })

  it('awAvailable is false when no awAvailableSince', () => {
    expect(getMonitorStatus().awAvailable).toBe(false)
  })

  it('hammerAvailable is false when events.jsonl does not exist', () => {
    // existsSync mocked to false
    expect(getMonitorStatus().hammerAvailable).toBe(false)
  })

  it('totalSignalsDispatched is a non-negative number', () => {
    const { totalSignalsDispatched } = getMonitorStatus()
    expect(typeof totalSignalsDispatched).toBe('number')
    expect(totalSignalsDispatched).toBeGreaterThanOrEqual(0)
  })

  it('does not throw', () => {
    expect(() => getMonitorStatus()).not.toThrow()
  })
})
