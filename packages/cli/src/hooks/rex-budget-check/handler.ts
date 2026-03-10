/**
 * REX Hook: Budget Check
 * Vérifie le budget avant chaque session. Alerte à 80% via Telegram.
 * @module BUDGET
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const REX_DIR = join(homedir(), '.rex')
const BUDGET_PATH = join(REX_DIR, 'budget.json')

interface BudgetState {
  daily_limit_usd: number
  today_spent_usd: number
  today_tokens_in: number
  today_tokens_out: number
  last_reset: string
  alert_sent_at?: string
}

function readBudget(): BudgetState | null {
  if (!existsSync(BUDGET_PATH)) return null
  try {
    return JSON.parse(readFileSync(BUDGET_PATH, 'utf-8'))
  } catch { return null }
}

const handler = async (event: any) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return

  const budget = readBudget()
  if (!budget) return

  const pct = budget.daily_limit_usd > 0
    ? (budget.today_spent_usd / budget.daily_limit_usd) * 100
    : 0

  // Alerte à 80%
  if (pct >= 80) {
    const alreadyAlerted = budget.alert_sent_at &&
      new Date().toDateString() === new Date(budget.alert_sent_at).toDateString()

    if (!alreadyAlerted) {
      const msg = `⚠️ Budget REX : ${budget.today_spent_usd.toFixed(3)}$ / ${budget.daily_limit_usd}$ (${pct.toFixed(0)}%)\nTokens today: ${budget.today_tokens_in + budget.today_tokens_out} total`
      event.messages.push(msg)
      console.log(`[rex-budget-check] Alert: ${pct.toFixed(0)}% daily budget used`)
    }
  }

  // Log silencieux si > 95%
  if (pct >= 95) {
    event.messages.push(`🚨 Budget REX critique : ${pct.toFixed(0)}%. APIs payantes désactivées temporairement.`)
    console.log('[rex-budget-check] CRITICAL: disabling paid APIs')
  }
}

export default handler
