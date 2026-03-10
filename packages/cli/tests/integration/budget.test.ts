/**
 * Integration tests for budget.ts — trackUsage, getDailyUsage, getBudgetSummary,
 * checkBudgetAlert, getWeeklyUsage.
 * Uses a real SQLite DB in a temp directory.
 * @module BUDGET
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { rmSync } from 'node:fs'

const { TEST_DIR } = vi.hoisted(() => {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const { join } = require('node:path') as typeof import('node:path')
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-budget-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir }
})

vi.mock('../../src/paths.js', () => {
  const { join } = require('node:path') as typeof import('node:path')
  return {
    REX_DIR: TEST_DIR,
    ensureRexDirs: () => {},
    MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
    CONFIG_PATH: join(TEST_DIR, 'config.json'),
    BUDGET_DB_PATH: join(TEST_DIR, 'budget.sqlite'),
  }
})

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({})),
}))

import {
  trackUsage,
  getDailyUsage,
  getWeeklyUsage,
  getBudgetSummary,
  checkBudgetAlert,
} from '../../src/budget.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── trackUsage ────────────────────────────────────────────────────────────────

describe('trackUsage', () => {
  it('does not throw', () => {
    expect(() => trackUsage('ollama', 'qwen2.5:7b', 'gateway', 100, 50)).not.toThrow()
  })

  it('can be called multiple times without error', () => {
    expect(() => {
      trackUsage('claude', 'claude-sonnet-4-6', 'code', 200, 100)
      trackUsage('groq', 'llama3', 'background', 50, 25)
    }).not.toThrow()
  })
})

// ── getDailyUsage ─────────────────────────────────────────────────────────────

describe('getDailyUsage', () => {
  it('returns an array', () => {
    expect(Array.isArray(getDailyUsage())).toBe(true)
  })

  it('each entry has required fields', () => {
    const entries = getDailyUsage()
    for (const e of entries) {
      expect(e).toHaveProperty('date')
      expect(e).toHaveProperty('provider')
      expect(e).toHaveProperty('calls')
      expect(e).toHaveProperty('tokensIn')
      expect(e).toHaveProperty('tokensOut')
      expect(e).toHaveProperty('estimatedCost')
    }
  })

  it('reflects tracked usage for today', () => {
    trackUsage('test-provider', 'test-model', 'test-task', 300, 150)
    const entries = getDailyUsage()
    const found = entries.find(e => e.provider === 'test-provider')
    expect(found).toBeDefined()
    expect(found!.calls).toBeGreaterThanOrEqual(1)
  })
})

// ── getWeeklyUsage ────────────────────────────────────────────────────────────

describe('getWeeklyUsage', () => {
  it('returns an array', () => {
    expect(Array.isArray(getWeeklyUsage())).toBe(true)
  })

  it('includes providers used this week', () => {
    const entries = getWeeklyUsage()
    // test-provider was added above — should show in weekly
    const found = entries.find(e => e.provider === 'test-provider')
    expect(found).toBeDefined()
  })
})

// ── getBudgetSummary ──────────────────────────────────────────────────────────

describe('getBudgetSummary', () => {
  it('returns summary with today/week/month/topProviders/totals', () => {
    const summary = getBudgetSummary()
    expect(summary).toHaveProperty('today')
    expect(summary).toHaveProperty('week')
    expect(summary).toHaveProperty('month')
    expect(summary).toHaveProperty('topProviders')
    expect(summary).toHaveProperty('totals')
  })

  it('totals has today/week/month as numbers', () => {
    const { totals } = getBudgetSummary()
    expect(typeof totals.today).toBe('number')
    expect(typeof totals.week).toBe('number')
    expect(typeof totals.month).toBe('number')
    expect(totals.today).toBeGreaterThanOrEqual(0)
  })

  it('topProviders is an array', () => {
    const { topProviders } = getBudgetSummary()
    expect(Array.isArray(topProviders)).toBe(true)
  })
})

// ── checkBudgetAlert ──────────────────────────────────────────────────────────

describe('checkBudgetAlert', () => {
  it('returns an object with level and message', () => {
    const alert = checkBudgetAlert(100)
    expect(alert).toHaveProperty('level')
    expect(alert).toHaveProperty('message')
  })

  it('level is one of: ok, warn, alert', () => {
    const { level } = checkBudgetAlert(100)
    expect(['ok', 'warn', 'alert']).toContain(level)
  })

  it('returns alert level when limit is very low and known provider was used', () => {
    // claude-sonnet-4 costs $3/Mtok in, $15/Mtok out → 1M tokens in = $3 → exceeds $0.001 limit
    trackUsage('claude', 'claude-sonnet-4', 'reason', 1_000_000, 0)
    const { level } = checkBudgetAlert(0.001)
    expect(level).toBe('alert')
  })

  it('message is a non-empty string', () => {
    const { message } = checkBudgetAlert(100)
    expect(typeof message).toBe('string')
    expect(message.length).toBeGreaterThan(0)
  })
})
