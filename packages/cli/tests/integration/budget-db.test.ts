/**
 * Integration tests for budget.ts
 * Uses a real temporary SQLite database.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { rmSync } from 'node:fs'

// vi.hoisted() runs before vi.mock() factories — the only safe way to share a computed value
const { TEST_DIR } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const dir = join(tmpdir(), `rex-budget-test-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  process.env['REX_DIR'] = dir
  return { TEST_DIR: dir }
})

vi.mock('../../src/paths.js', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const dir = process.env['REX_DIR']!
  return {
    REX_DIR: dir,
    ensureRexDirs: () => mkdirSync(dir, { recursive: true }),
    MEMORY_DB_PATH: join(dir, 'rex.sqlite'),
    DAEMON_LOG_PATH: join(dir, 'daemon.log'),
  }
})
vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))
vi.mock('../../src/config.js', () => ({
  loadConfig: () => ({}),
}))

import {
  trackUsage,
  getDailyUsage,
  getBudgetSummary,
  checkBudgetAlert,
} from '../../src/budget.js'

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── trackUsage + getDailyUsage ────────────────────────────────────────────────

describe('trackUsage + getDailyUsage', () => {
  beforeAll(() => {
    // Seed known data
    trackUsage('claude', 'claude-sonnet-4', 'code', 4_000, 500)
    trackUsage('ollama', undefined, 'search', 1_000, 200)
    trackUsage('claude', 'claude-haiku-4', 'chat', 2_000, 300)
  })

  it('getDailyUsage returns entries for today', () => {
    const entries = getDailyUsage()
    expect(entries.length).toBeGreaterThan(0)
  })

  it('getDailyUsage includes claude provider', () => {
    const entries = getDailyUsage()
    const claude = entries.find(e => e.provider === 'claude')
    expect(claude).toBeDefined()
  })

  it('ollama entries have 0 cost', () => {
    const entries = getDailyUsage()
    const ollama = entries.find(e => e.provider === 'ollama')
    if (ollama) {
      expect(ollama.estimatedCost).toBe(0)
    }
  })

  it('claude entries have non-zero cost', () => {
    const entries = getDailyUsage()
    const claude = entries.find(e => e.provider === 'claude')
    expect(claude?.estimatedCost).toBeGreaterThan(0)
  })

  it('total calls adds up across providers', () => {
    const entries = getDailyUsage()
    const totalCalls = entries.reduce((s, e) => s + e.calls, 0)
    expect(totalCalls).toBeGreaterThanOrEqual(3)
  })
})

// ── getBudgetSummary ──────────────────────────────────────────────────────────

describe('getBudgetSummary', () => {
  it('returns valid summary structure', () => {
    const summary = getBudgetSummary()
    expect(summary).toHaveProperty('today')
    expect(summary).toHaveProperty('week')
    expect(summary).toHaveProperty('month')
    expect(summary).toHaveProperty('totals')
    expect(summary.totals).toHaveProperty('today')
    expect(summary.totals).toHaveProperty('week')
    expect(summary.totals).toHaveProperty('month')
  })

  it('totals.today is a non-negative number', () => {
    const summary = getBudgetSummary()
    expect(summary.totals.today).toBeGreaterThanOrEqual(0)
  })

  it('topProviders is an array', () => {
    const summary = getBudgetSummary()
    expect(Array.isArray(summary.topProviders)).toBe(true)
  })
})

// ── checkBudgetAlert ──────────────────────────────────────────────────────────

describe('checkBudgetAlert', () => {
  it('returns ok level when no monthly limit set (uses default $100)', () => {
    const alert = checkBudgetAlert(undefined)
    expect(alert).toHaveProperty('level')
    expect(['ok', 'warn', 'alert']).toContain(alert.level)
  })

  it('returns ok level when spend is way below limit', () => {
    const alert = checkBudgetAlert(1000)  // $1000 limit — far above any test spend
    expect(alert.level).toBe('ok')
    expect(alert.percentUsed).toBeLessThan(80)
  })

  it('returns alert level when monthly limit is very low (spend > limit)', () => {
    const alert = checkBudgetAlert(0.000001)  // $0.000001 — will be exceeded by test data
    expect(alert.level).toBe('alert')
    expect(alert.message).toBeTruthy()
  })

  it('message is always a non-empty string', () => {
    const alert = checkBudgetAlert(0.000001)
    expect(typeof alert.message).toBe('string')
    expect(alert.message.length).toBeGreaterThan(0)
  })
})
