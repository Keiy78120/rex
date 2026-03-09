/**
 * Mini-mode: Search Memory
 * Intent: "cherche dans ma mémoire", "qu'est-ce que je sais sur X", "retrouve"
 * LLM calls: 0 for exact hits, 1 tiny call (~50 tokens) for reformulation only
 * Security: SAFE
 * @module IDENTITY
 */

import { execSync } from 'node:child_process'
import { registerMode, type ModeContext } from './engine.js'
import { createLogger } from '../logger.js'

const log = createLogger('IDENTITY:mode:search-memory')

async function loadMemorySearch(ctx: ModeContext): Promise<Record<string, unknown>> {
  const query = String(ctx.message)
  try {
    const raw = execSync(
      `rex search ${JSON.stringify(query)} --json --limit=5 --hybrid`,
      { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const parsed = JSON.parse(raw.trim())
    const results: Array<{ content?: string; summary?: string; tags?: unknown; score?: number }> = Array.isArray(parsed)
      ? parsed
      : (parsed.results ?? [])

    if (!results.length) return { memory_results: null, memory_count: 0 }

    const snippets = results.slice(0, 5).map(r =>
      `• ${(r.summary ?? r.content ?? '').slice(0, 200)}`
    )
    return {
      memory_results: snippets.join('\n'),
      memory_count: results.length,
      top_result: (results[0]?.summary ?? results[0]?.content ?? '').slice(0, 400),
    }
  } catch (e: any) {
    log.warn(`Memory search failed: ${e.message?.slice(0, 80)}`)
    return { memory_results: null, memory_count: 0 }
  }
}

function formatMemoryResult(ctx: ModeContext): string {
  const count = ctx['memory_count'] as number
  if (!count) {
    return `Rien trouvé dans ta mémoire pour "${ctx.message}".`
  }
  const results = ctx['memory_results'] as string
  if (count === 1) {
    return `Voici ce que je sais :\n\n${ctx['top_result']}`
  }
  return `J'ai trouvé ${count} résultat(s) :\n\n${results}`
}

registerMode({
  id: 'search-memory',
  description: 'Recherche sémantique dans la mémoire REX',
  triggers: [
    /souviens|remember|retrouve|rappelle.toi|qu.est.ce que je sais|dans ma mémoire|dans tes notes/i,
    /note sur|info sur|ce que tu sais|qu.est.ce que tu sais/i,
  ],
  security: 'SAFE',
  estimatedTokens: 0,
  loaders: [loadMemorySearch],
  template: '{{memory_results}}',
  llmFields: [],
  outputFormatter: formatMemoryResult,
})
