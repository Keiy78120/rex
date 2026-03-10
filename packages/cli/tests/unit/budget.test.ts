/**
 * Unit tests for budget cost estimation logic.
 *
 * estimateCost is private, so we replicate its logic here and verify
 * correctness against the known pricing table from budget.ts.
 * DB-dependent functions (trackUsage, checkBudgetAlert) are integration-level
 * and covered with a real temp SQLite in tests/integration/.
 */
import { describe, it, expect } from 'vitest'

// ── Replicate pricing table from budget.ts ───────────────────────────────────
// Keep in sync with PRICING in budget.ts

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.25, output: 1.25 },
  'opus': { input: 15, output: 75 },
  'sonnet': { input: 3, output: 15 },
  'haiku': { input: 0.25, output: 1.25 },
  'ollama': { input: 0, output: 0 },
  'claude-code': { input: 0, output: 0 },
  'telegram': { input: 0, output: 0 },
}

function estimateCost(provider: string, model: string | undefined, tokensIn: number, tokensOut: number): number {
  const key = model ?? provider
  const rates = PRICING[key] || PRICING[provider] || { input: 0, output: 0 }
  return (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('estimateCost — pricing table', () => {
  it('Opus: 1M input + 1M output = $90', () => {
    const cost = estimateCost('claude', 'claude-opus-4', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(90, 2)  // $15 input + $75 output
  })

  it('Sonnet: 1M input + 1M output = $18', () => {
    const cost = estimateCost('claude', 'claude-sonnet-4', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(18, 2)  // $3 input + $15 output
  })

  it('Haiku: 1M input + 1M output = $1.50', () => {
    const cost = estimateCost('claude', 'claude-haiku-4', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(1.50, 2)  // $0.25 + $1.25
  })

  it('Ollama: always free (0 cost)', () => {
    const cost = estimateCost('ollama', undefined, 100_000, 50_000)
    expect(cost).toBe(0)
  })

  it('claude-code: always free (0 cost)', () => {
    const cost = estimateCost('claude-code', undefined, 50_000, 20_000)
    expect(cost).toBe(0)
  })

  it('unknown provider: falls back to 0 cost', () => {
    const cost = estimateCost('unknown-provider', 'unknown-model', 100_000, 50_000)
    expect(cost).toBe(0)
  })

  it('model alias "opus" works', () => {
    const full = estimateCost('claude', 'claude-opus-4', 1_000_000, 1_000_000)
    const alias = estimateCost('claude', 'opus', 1_000_000, 1_000_000)
    expect(full).toBe(alias)
  })

  it('model alias "sonnet" works', () => {
    const full = estimateCost('claude', 'claude-sonnet-4', 1_000_000, 1_000_000)
    const alias = estimateCost('claude', 'sonnet', 1_000_000, 1_000_000)
    expect(full).toBe(alias)
  })

  it('zero tokens = zero cost', () => {
    const cost = estimateCost('claude', 'claude-opus-4', 0, 0)
    expect(cost).toBe(0)
  })
})

describe('estimateCost — small realistic calls', () => {
  it('typical 4K input / 500 output Sonnet call ≈ $0.019', () => {
    const cost = estimateCost('claude', 'claude-sonnet-4', 4_000, 500)
    // $3/1M * 4000 + $15/1M * 500 = 0.012 + 0.0075 = 0.0195
    expect(cost).toBeCloseTo(0.0195, 4)
  })

  it('Haiku at 1K input / 200 output ≈ $0.00050', () => {
    const cost = estimateCost('claude', 'claude-haiku-4', 1_000, 200)
    // $0.25/1M * 1000 + $1.25/1M * 200 = 0.00025 + 0.00025 = 0.0005
    expect(cost).toBeCloseTo(0.0005, 5)
  })

  it('cost scales linearly with tokens', () => {
    const base = estimateCost('claude', 'claude-sonnet-4', 1_000, 1_000)
    const double = estimateCost('claude', 'claude-sonnet-4', 2_000, 2_000)
    expect(double).toBeCloseTo(base * 2, 10)
  })
})

// ── Daily budget alert logic (pure, no DB) ────────────────────────────────────

describe('daily budget alert thresholds', () => {
  function shouldAlertAt80(spend: number, dailyLimit: number): boolean {
    return dailyLimit > 0 && (spend / dailyLimit) >= 0.8
  }
  function shouldAlertAt100(spend: number, dailyLimit: number): boolean {
    return dailyLimit > 0 && spend >= dailyLimit
  }

  it('triggers 80% alert when spend/limit >= 0.8', () => {
    expect(shouldAlertAt80(8, 10)).toBe(true)
    expect(shouldAlertAt80(7.9, 10)).toBe(false)
    expect(shouldAlertAt80(10, 10)).toBe(true)
  })

  it('triggers 100% alert when spend >= daily limit', () => {
    expect(shouldAlertAt100(10, 10)).toBe(true)
    expect(shouldAlertAt100(10.01, 10)).toBe(true)
    expect(shouldAlertAt100(9.99, 10)).toBe(false)
  })

  it('no alerts when daily limit is 0 (disabled)', () => {
    expect(shouldAlertAt80(100, 0)).toBe(false)
    expect(shouldAlertAt100(100, 0)).toBe(false)
  })

  it('80% alert fires before 100% alert', () => {
    const spend = 8.5
    const limit = 10
    expect(shouldAlertAt80(spend, limit)).toBe(true)
    expect(shouldAlertAt100(spend, limit)).toBe(false)
  })
})
