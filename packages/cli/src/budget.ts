/** @module BUDGET */
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'

const log = createLogger('BUDGET:tracker')

export const BUDGET_DB_PATH = join(REX_DIR, 'budget.sqlite')

// Legacy path for migration reference
export const BUDGET_PATH = join(REX_DIR, 'budget.json')

// --- Pricing per 1M tokens (USD) ---
const PRICING: Record<string, { input: number; output: number }> = {
  // Claude API
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.25, output: 1.25 },
  // Aliases
  'opus': { input: 15, output: 75 },
  'sonnet': { input: 3, output: 15 },
  'haiku': { input: 0.25, output: 1.25 },
  // Free / local
  'ollama': { input: 0, output: 0 },
  'claude-code': { input: 0, output: 0 },
  'telegram': { input: 0, output: 0 },
}

// --- DB setup ---

let db: ReturnType<typeof Database> | null = null

function ensureDb(): ReturnType<typeof Database> {
  if (db) return db
  ensureRexDirs()
  db = new Database(BUDGET_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT,
      task_type TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_created ON budget_entries(created_at)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_budget_provider ON budget_entries(provider)
  `)
  return db
}

// --- Cost estimation ---

function estimateCost(provider: string, model: string | undefined, tokensIn: number, tokensOut: number): number {
  // Try model-specific pricing first, then provider
  const key = model ?? provider
  const rates = PRICING[key] || PRICING[provider] || { input: 0, output: 0 }
  return (tokensIn / 1_000_000) * rates.input + (tokensOut / 1_000_000) * rates.output
}

// --- Public API ---

export interface UsageEntry {
  date: string
  provider: string
  calls: number
  tokensIn: number
  tokensOut: number
  estimatedCost: number
}

export interface BudgetSummary {
  today: ProviderSpend[]
  week: ProviderSpend[]
  month: ProviderSpend[]
  topProviders: ProviderSpend[]
  totals: {
    today: number
    week: number
    month: number
  }
  entries: UsageEntry[]
}

export interface ProviderSpend {
  provider: string
  calls: number
  tokensIn: number
  tokensOut: number
  estimatedCost: number
}

export interface BudgetAlert {
  level: 'ok' | 'warn' | 'alert'
  message: string
  currentSpend: number
  limit: number
  percentUsed: number
}

export function trackUsage(
  provider: string,
  model?: string,
  taskType?: string,
  tokensIn = 0,
  tokensOut = 0,
): void {
  const d = ensureDb()
  const cost = estimateCost(provider, model, tokensIn, tokensOut)
  d.prepare(`
    INSERT INTO budget_entries (provider, model, task_type, tokens_in, tokens_out, estimated_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(provider, model ?? null, taskType ?? null, tokensIn, tokensOut, cost)
  log.debug(`tracked ${provider}/${model ?? '-'}: +${tokensIn}in/${tokensOut}out ≈$${cost.toFixed(4)}`)
}

function querySpendByProvider(sinceDate: string): ProviderSpend[] {
  const d = ensureDb()
  const rows = d.prepare(`
    SELECT provider,
           COUNT(*) as calls,
           SUM(tokens_in) as tokensIn,
           SUM(tokens_out) as tokensOut,
           SUM(estimated_cost_usd) as estimatedCost
    FROM budget_entries
    WHERE created_at >= ?
    GROUP BY provider
    ORDER BY estimatedCost DESC
  `).all(sinceDate) as ProviderSpend[]
  return rows
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekAgoStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function monthStartStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function sumCost(items: ProviderSpend[]): number {
  return items.reduce((s, i) => s + i.estimatedCost, 0)
}

export function getDailyUsage(date?: string): UsageEntry[] {
  const d = date || todayStr()
  const rows = querySpendByProvider(d)
  return rows.map(r => ({
    date: d,
    provider: r.provider,
    calls: r.calls,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    estimatedCost: r.estimatedCost,
  }))
}

export function getWeeklyUsage(): UsageEntry[] {
  const cutoff = weekAgoStr()
  const rows = querySpendByProvider(cutoff)
  return rows.map(r => ({
    date: cutoff,
    provider: r.provider,
    calls: r.calls,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    estimatedCost: r.estimatedCost,
  }))
}

export function getBudgetSummary(): BudgetSummary {
  const todayData = querySpendByProvider(todayStr())
  const weekData = querySpendByProvider(weekAgoStr())
  const monthData = querySpendByProvider(monthStartStr())

  // Top providers = month data sorted by cost desc (already sorted)
  const topProviders = monthData.slice(0, 5)

  // Legacy-compatible entries for week
  const entries: UsageEntry[] = weekData.map(r => ({
    date: weekAgoStr(),
    provider: r.provider,
    calls: r.calls,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    estimatedCost: r.estimatedCost,
  }))

  return {
    today: todayData,
    week: weekData,
    month: monthData,
    topProviders,
    totals: {
      today: sumCost(todayData),
      week: sumCost(weekData),
      month: sumCost(monthData),
    },
    entries,
  }
}

export function checkBudgetAlert(monthlyLimitUsd?: number): BudgetAlert {
  const config = loadConfig()
  const limit = monthlyLimitUsd ?? (config as any).budget?.monthlyLimitUsd ?? 100
  const monthData = querySpendByProvider(monthStartStr())
  const currentSpend = sumCost(monthData)
  const percentUsed = limit > 0 ? (currentSpend / limit) * 100 : 0

  if (percentUsed > 100) {
    return {
      level: 'alert',
      message: `Monthly budget exceeded: $${currentSpend.toFixed(2)} / $${limit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
      currentSpend,
      limit,
      percentUsed,
    }
  }
  if (percentUsed > 80) {
    return {
      level: 'warn',
      message: `Budget warning: $${currentSpend.toFixed(2)} / $${limit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
      currentSpend,
      limit,
      percentUsed,
    }
  }
  return {
    level: 'ok',
    message: `Budget OK: $${currentSpend.toFixed(2)} / $${limit.toFixed(2)} (${percentUsed.toFixed(0)}%)`,
    currentSpend,
    limit,
    percentUsed,
  }
}

// --- Daily budget alert (Telegram) ---

const DAILY_ALERT_STATE_PATH = join(REX_DIR, 'budget-daily-alert.json')

interface DailyAlertState {
  date: string
  alertedAt80: boolean
  alertedAt100: boolean
}

function loadDailyAlertState(): DailyAlertState {
  try {
    if (!existsSync(DAILY_ALERT_STATE_PATH)) return { date: todayStr(), alertedAt80: false, alertedAt100: false }
    const s = JSON.parse(readFileSync(DAILY_ALERT_STATE_PATH, 'utf-8')) as DailyAlertState
    if (s.date !== todayStr()) return { date: todayStr(), alertedAt80: false, alertedAt100: false }
    return s
  } catch { return { date: todayStr(), alertedAt80: false, alertedAt100: false } }
}

function saveDailyAlertState(state: DailyAlertState): void {
  try {
    writeFileSync(DAILY_ALERT_STATE_PATH, JSON.stringify(state, null, 2))
  } catch {}
}

/**
 * Check today's spend vs daily_limit. Sends a Telegram alert at 80% and 100%.
 * Guards: only sends once per threshold per day (state file in REX_DIR).
 */
export async function checkAndSendDailyBudgetAlert(): Promise<void> {
  const config = loadConfig() as any
  const dailyLimitUsd: number | undefined = config.budget?.dailyLimitUsd
  if (!dailyLimitUsd || dailyLimitUsd <= 0) return

  const todayData = querySpendByProvider(todayStr())
  const spend = sumCost(todayData)
  const pct = (spend / dailyLimitUsd) * 100

  const state = loadDailyAlertState()
  let changed = false

  const telegramToken = process.env.REX_TELEGRAM_BOT_TOKEN
  const chatId = process.env.REX_TELEGRAM_CHAT_ID
  if (!telegramToken || !chatId) return

  async function sendAlert(msg: string): Promise<void> {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg }),
        signal: AbortSignal.timeout(5000),
      })
    } catch (e: any) {
      log.warn(`Failed to send budget alert: ${e.message}`)
    }
  }

  if (pct >= 100 && !state.alertedAt100) {
    await sendAlert(`🚨 REX Budget: daily limit EXCEEDED\n$${spend.toFixed(2)} / $${dailyLimitUsd.toFixed(2)} (${pct.toFixed(0)}%)`)
    state.alertedAt100 = true
    changed = true
  } else if (pct >= 80 && !state.alertedAt80) {
    await sendAlert(`⚠️ REX Budget: 80% daily limit reached\n$${spend.toFixed(2)} / $${dailyLimitUsd.toFixed(2)} (${pct.toFixed(0)}%)`)
    state.alertedAt80 = true
    changed = true
  }

  if (changed) saveDailyAlertState(state)
}

// --- Pretty terminal output ---

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function isFree(provider: string): boolean {
  const rates = PRICING[provider]
  return !rates || (rates.input === 0 && rates.output === 0)
}

function printProviderTable(label: string, items: ProviderSpend[]): void {
  console.log(`  ${label}`)
  if (items.length === 0) {
    console.log('    No usage')
  } else {
    for (const e of items) {
      const tokens = formatTokens(e.tokensIn + e.tokensOut)
      const cost = isFree(e.provider) ? '$0.00' : `$${e.estimatedCost.toFixed(2)}`
      console.log(`    ${e.provider.padEnd(16)} ${String(e.calls).padStart(4)} calls ${tokens.padStart(8)} tokens  ${cost}`)
    }
  }
}

export function showBudget(): void {
  const summary = getBudgetSummary()
  const alert = checkBudgetAlert()

  console.log()
  console.log('REX Budget')
  console.log('\u2500'.repeat(50))

  printProviderTable(`Today (${todayStr()})`, summary.today)
  console.log()
  printProviderTable('This Week', summary.week)
  console.log()
  printProviderTable('This Month', summary.month)

  console.log()
  console.log(`  Totals: today $${summary.totals.today.toFixed(2)} | week $${summary.totals.week.toFixed(2)} | month $${summary.totals.month.toFixed(2)}`)

  if (alert.level !== 'ok') {
    const icon = alert.level === 'alert' ? '!!' : '!'
    console.log(`  ${icon} ${alert.message}`)
  } else {
    console.log(`  ${alert.message}`)
  }

  console.log('\u2500'.repeat(50))
  console.log()
}
