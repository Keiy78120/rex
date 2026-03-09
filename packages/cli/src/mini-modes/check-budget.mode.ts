/**
 * Mini-mode: Check Budget
 * Intent: "budget", "combien j'ai dépensé", "coût LLM", "quota"
 * LLM calls: 0 — script-only
 * Security: SAFE
 * @module IDENTITY
 */

import { execSync } from 'node:child_process'
import { registerMode, type ModeContext } from './engine.js'
import { createLogger } from '../logger.js'

const log = createLogger('IDENTITY:mode:check-budget')

async function loadBudget(ctx: ModeContext): Promise<Record<string, unknown>> {
  try {
    const raw = execSync('rex budget --json', {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    })
    // Extract JSON from output (may have log lines before)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { budget_raw: raw.trim().slice(0, 500) }
    const data = JSON.parse(match[0])
    return {
      budget_today: data.today ?? data.daily ?? null,
      budget_month: data.month ?? data.monthly ?? null,
      budget_limit: data.limit ?? data.dailyLimit ?? null,
      budget_providers: data.providers ?? null,
      budget_raw: null,
    }
  } catch (e: any) {
    log.warn(`Budget load failed: ${e.message?.slice(0, 80)}`)
    return { budget_today: null, budget_month: null }
  }
}

function formatBudget(ctx: ModeContext): string {
  const today = ctx['budget_today']
  const month = ctx['budget_month']
  const limit = ctx['budget_limit']
  const raw = ctx['budget_raw'] as string | null

  if (raw) return `Budget REX :\n${raw}`
  if (today === null && month === null) return 'Impossible de lire le budget (rex budget non disponible).'

  const lines: string[] = ['📊 Budget REX']
  if (today !== null) lines.push(`  Aujourd'hui : $${Number(today).toFixed(4)}`)
  if (month !== null) lines.push(`  Ce mois     : $${Number(month).toFixed(4)}`)
  if (limit !== null) lines.push(`  Limite/jour : $${Number(limit).toFixed(2)}`)
  const providers = ctx['budget_providers']
  if (providers && typeof providers === 'object') {
    lines.push('  Détail :')
    for (const [k, v] of Object.entries(providers as Record<string, unknown>)) {
      lines.push(`    ${k}: $${Number(v).toFixed(4)}`)
    }
  }
  return lines.join('\n')
}

registerMode({
  id: 'check-budget',
  description: 'Affiche le budget LLM du jour/mois',
  triggers: [
    /budget|quota|combien.*dépens|coût.*llm|token.*coût|dépense.*ia|cost.*api/i,
    /combien.*j.ai.*utilisé|quelle.*facture/i,
  ],
  security: 'SAFE',
  estimatedTokens: 0,
  loaders: [loadBudget],
  template: '{{budget_today}}',
  llmFields: [],
  outputFormatter: formatBudget,
})
