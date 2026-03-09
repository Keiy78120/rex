/**
 * REX Mini-Modes Engine
 *
 * Each task type = a pre-configured mode with:
 *   - Regex triggers (0ms intent detection)
 *   - Context loaders (parallel scripts, 50-200ms)
 *   - Handlebars-style template ({{variable}} slots)
 *   - Only the llm_fields go to the LLM (50-300 tokens max)
 *   - Security level (SAFE → CRITICAL)
 *
 * Principle: LLM is the last piece, never the first.
 * Script-first — if scripts can fill all fields, LLM = 0 calls.
 *
 * @module IDENTITY
 */

import { createLogger } from '../logger.js'

const log = createLogger('IDENTITY:mini-modes')

// ── Types ─────────────────────────────────────────────────────────────────────

export type SecurityLevel = 'SAFE' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface ModeContext {
  message: string
  // Auto-injected
  user?: { name: string; timezone: string }
  budget?: { remainingDaily: number }
  // Loaded by mode loaders
  [key: string]: unknown
}

export type ContextLoader = (ctx: ModeContext) => Promise<Record<string, unknown>>

export interface MiniMode {
  id: string
  description: string
  triggers: RegExp[]
  security: SecurityLevel
  estimatedTokens: number          // budget hint
  loaders: ContextLoader[]         // parallel context fetchers
  template: string                 // {{variable}} slots
  llmFields: string[]              // fields LLM must fill (empty = 0 LLM)
  outputFormatter?: (ctx: ModeContext) => string
}

export interface ModeResult {
  modeId: string
  response: string
  usedLlm: boolean
  tokensEstimate: number
  durationMs: number
  context: ModeContext
}

// ── Template renderer ─────────────────────────────────────────────────────────

export function renderTemplate(template: string, ctx: ModeContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = ctx[key]
    if (val === undefined || val === null) return ''
    if (typeof val === 'string') return val
    return JSON.stringify(val)
  })
}

// ── Security classifier ───────────────────────────────────────────────────────

/**
 * Classify the security level of a command/action.
 * Context-aware: "delete old_test.md" = MEDIUM, "delete database.sqlite" = CRITICAL
 */
export function classifySecurityLevel(action: string, target?: string): SecurityLevel {
  const a = action.toLowerCase()
  const t = (target ?? '').toLowerCase()

  // CRITICAL patterns — irreversible or high-impact
  const criticalActions = /delete|drop|truncate|wipe|format|rm -rf|deploy.*prod|push.*main|force.?push|rotate.*key|vault/i
  const criticalTargets = /database|\.sqlite|\.db|production|\.env|master\.key|secrets?\.(enc|json)|backup/i
  if (criticalActions.test(a) || (criticalTargets.test(t) && /delete|drop|remove/i.test(a))) return 'CRITICAL'

  // HIGH — write to external systems, money, publishing
  const highActions = /publish|send.*email|post.*twitter|tweet|purchase|buy|charge|invoice|deploy|restart.*service|pm2 restart/i
  if (highActions.test(a)) return 'HIGH'

  // MEDIUM — local writes, messages within controlled systems
  const mediumActions = /write|overwrite|update|modify|edit|save|create.*file|send.*message|telegram|slack/i
  if (mediumActions.test(a)) return 'MEDIUM'

  // SAFE — read-only, search, status
  return 'SAFE'
}

// ── Mode registry ─────────────────────────────────────────────────────────────

const _registry = new Map<string, MiniMode>()

export function registerMode(mode: MiniMode): void {
  _registry.set(mode.id, mode)
  log.debug(`Mode registered: ${mode.id}`)
}

export function getMode(id: string): MiniMode | undefined {
  return _registry.get(id)
}

export function listModes(): MiniMode[] {
  return [..._registry.values()]
}

/**
 * Find the best matching mode for a message.
 * Returns undefined if no mode matches (fall through to LLM).
 */
export function matchMode(message: string): MiniMode | undefined {
  for (const mode of _registry.values()) {
    if (mode.triggers.some(re => re.test(message))) return mode
  }
  return undefined
}

// ── Mode executor ─────────────────────────────────────────────────────────────

/**
 * Run a mini-mode:
 * 1. Run all context loaders in parallel
 * 2. Render template with loaded context
 * 3. If all llmFields filled by loaders → skip LLM
 * 4. Otherwise call LLM with rendered template (minimal tokens)
 */
export async function executeMode(
  mode: MiniMode,
  message: string,
  llmCall?: (prompt: string) => Promise<string>,
): Promise<ModeResult> {
  const start = Date.now()
  const ctx: ModeContext = { message }

  // 1. Run loaders in parallel
  if (mode.loaders.length > 0) {
    const results = await Promise.allSettled(mode.loaders.map(l => l(ctx)))
    for (const r of results) {
      if (r.status === 'fulfilled') Object.assign(ctx, r.value)
      else log.warn(`Loader failed: ${r.reason}`)
    }
  }

  // 2. Render template
  const rendered = renderTemplate(mode.template, ctx)

  // 3. Check if LLM needed
  const missingFields = mode.llmFields.filter(f => !ctx[f])
  let usedLlm = false

  if (missingFields.length > 0 && llmCall) {
    log.debug(`Mode ${mode.id}: calling LLM for fields [${missingFields.join(', ')}]`)
    try {
      const llmResponse = await llmCall(rendered)
      // Try to parse field values from LLM response
      ctx['_llm_response'] = llmResponse
      // If only one field needed, assign directly
      if (missingFields.length === 1) {
        ctx[missingFields[0]] = llmResponse.trim()
      }
      usedLlm = true
    } catch (e: any) {
      log.warn(`LLM call failed in mode ${mode.id}: ${e.message}`)
    }
  }

  // 4. Format output
  let response: string
  if (mode.outputFormatter) {
    response = mode.outputFormatter(ctx)
  } else if (ctx['_llm_response']) {
    response = ctx['_llm_response'] as string
  } else {
    // Script-only response: render final template
    response = renderTemplate(mode.template, ctx).trim()
  }

  return {
    modeId: mode.id,
    response,
    usedLlm,
    tokensEstimate: mode.estimatedTokens,
    durationMs: Date.now() - start,
    context: ctx,
  }
}
