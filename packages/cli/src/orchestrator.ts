/**
 * REX Orchestrator — Async relay pattern (§26)
 *
 * Relay race with documentation, not a naive cascade or Promise.race.
 * Each Specialist is self-aware: knows context limits, strengths, latency, cost.
 * Chain stagger: Script/Ollama (0ms) → Free tier (+300ms) → Subscription (+800ms)
 *
 * Spec: docs/plans/action.md §26
 * @module BUDGET
 */

import { execSync } from 'node:child_process'
import { createDefaultRegistry, type Provider } from './providers.js'
import { trackUsage, getDailyUsage } from './budget.js'
import { appendEvent } from './sync-queue.js'
import { pickModel } from './router.js'
import { callWithAutoFallback } from './free-tiers.js'
import { selectAccount, acquireAccount, releaseAccount, getAccountEnv } from './account-pool.js'
import { createLogger } from './logger.js'

const log = createLogger('BUDGET:orchestrator')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export interface BackendResult {
  provider: string
  response: string
  tokensIn?: number
  tokensOut?: number
  durationMs: number
  fallbackUsed: boolean
  handoffNotes?: string[]
}

export interface OrchestrateOptions {
  capability?: string
  preferProvider?: string
  maxTokens?: number
  timeout?: number
}

// ── Specialist Profiles (§26 — self-aware providers) ──

interface SpecialistProfile {
  /** Approximate context window in tokens */
  contextWindow: number
  /** Task types this specialist excels at */
  strengths: string[]
  /** Task types this specialist struggles with */
  weaknesses: string[]
  /** Average latency in ms (for documentation) */
  avgLatencyMs: number
  /** Cost per token USD (0 = free) */
  costPerToken: number
  /**
   * Stagger delay tier:
   * 0ms = local/free tier 0 (script, Ollama)
   * 300ms = free tier APIs (Groq, Cerebras, Together, Mistral, OpenRouter, DeepSeek)
   * 800ms = paid subscriptions (Claude Code, Claude API)
   */
  staggerMs: 0 | 300 | 800
}

export const SPECIALIST_PROFILES: Record<string, SpecialistProfile> = {
  // ── Tier 0: local + free, start immediately ─────────
  script: {
    contextWindow: Infinity,
    strengths: ['shell', 'file', 'system', 'deterministic', 'fast'],
    weaknesses: ['reasoning', 'creative'],
    avgLatencyMs: 0,
    costPerToken: 0,
    staggerMs: 0,
  },
  ollama: {
    contextWindow: 8192,
    strengths: ['code', 'classify', 'summarize', 'local', 'private'],
    weaknesses: ['long-context', 'math', 'complex-reasoning'],
    avgLatencyMs: 800,
    costPerToken: 0,
    staggerMs: 0,
  },
  // ── Tier 1: free APIs, +300ms stagger ───────────────
  groq: {
    contextWindow: 32768,
    strengths: ['fast', 'summarize', 'classify', 'short-code'],
    weaknesses: ['long-context', 'complex-reasoning'],
    avgLatencyMs: 300,
    costPerToken: 0.00001,
    staggerMs: 300,
  },
  cerebras: {
    contextWindow: 8192,
    strengths: ['ultrafast', 'classify', 'short-code'],
    weaknesses: ['long-context', 'complex-reasoning'],
    avgLatencyMs: 150,
    costPerToken: 0.00001,
    staggerMs: 300,
  },
  'together-ai': {
    contextWindow: 32768,
    strengths: ['code', 'reasoning', 'summarize'],
    weaknesses: ['very-long-context'],
    avgLatencyMs: 400,
    costPerToken: 0.00002,
    staggerMs: 300,
  },
  mistral: {
    contextWindow: 32768,
    strengths: ['multilingual', 'code', 'reasoning'],
    weaknesses: ['very-long-context'],
    avgLatencyMs: 500,
    costPerToken: 0.00001,
    staggerMs: 300,
  },
  openrouter: {
    contextWindow: 128000,
    strengths: ['routing', 'long-context', 'fallback'],
    weaknesses: [],
    avgLatencyMs: 600,
    costPerToken: 0.00005,
    staggerMs: 300,
  },
  deepseek: {
    contextWindow: 128000,
    strengths: ['code', 'math', 'reasoning', 'long-context'],
    weaknesses: [],
    avgLatencyMs: 800,
    costPerToken: 0.00001,
    staggerMs: 300,
  },
  // ── Tier 2: paid subscriptions, +800ms stagger ──────
  'claude-code': {
    contextWindow: 200000,
    strengths: ['code', 'architecture', 'long-context', 'analysis', 'reasoning', 'creative'],
    weaknesses: [],
    avgLatencyMs: 2000,
    costPerToken: 0.00015,
    staggerMs: 800,
  },
  'claude-api': {
    contextWindow: 200000,
    strengths: ['code', 'reasoning', 'long-context', 'analysis', 'creative', 'chat'],
    weaknesses: [],
    avgLatencyMs: 1500,
    costPerToken: 0.00015,
    staggerMs: 800,
  },
}

// ── Specialist limits check ────────────────────────────

export interface LimitsCheckResult {
  canHandle: boolean
  handoffNote?: string
}

/**
 * Check whether a specialist can handle a given prompt + options.
 * Returns { canHandle: false, handoffNote } if limits exceeded.
 * The Commander receives always a clean context.
 */
export function checkSpecialistLimits(
  providerKey: string,
  prompt: string,
  opts: OrchestrateOptions,
): LimitsCheckResult {
  const profile = SPECIALIST_PROFILES[providerKey]
  if (!profile) return { canHandle: true }

  // Rough token estimate: ~4 chars per token
  const estimatedTokens = Math.ceil(prompt.length / 4)
  const limit = profile.contextWindow

  if (isFinite(limit) && estimatedTokens > limit * 0.9) {
    return {
      canHandle: false,
      handoffNote: `${providerKey}: ~${estimatedTokens} tokens > ${Math.floor(limit * 0.9)} limit (90% of ${limit})`,
    }
  }

  // Check capability vs known weaknesses
  const capability = opts.capability ?? 'chat'
  if (profile.weaknesses.includes(capability)) {
    return {
      canHandle: false,
      handoffNote: `${providerKey}: capability '${capability}' is in known weaknesses`,
    }
  }

  return { canHandle: true }
}

// ── Provider Executors ─────────────────────────────────

async function executeOllama(prompt: string, timeout: number): Promise<Omit<BackendResult, 'fallbackUsed'>> {
  const model = await pickModel('background')
  const start = Date.now()
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(timeout),
  })
  const data = await res.json() as {
    message?: { content?: string }
    eval_count?: number
    prompt_eval_count?: number
  }
  return {
    provider: 'ollama',
    response: data.message?.content ?? '',
    tokensIn: data.prompt_eval_count,
    tokensOut: data.eval_count,
    durationMs: Date.now() - start,
  }
}

function executeClaudeCode(prompt: string, timeout: number): Omit<BackendResult, 'fallbackUsed'> {
  const poolAccount = selectAccount()
  if (poolAccount) acquireAccount(poolAccount.id)
  const start = Date.now()
  try {
    const accountEnv = poolAccount ? getAccountEnv(poolAccount) : {}
    const result = execSync(`claude --print ${JSON.stringify(prompt)}`, {
      encoding: 'utf-8',
      timeout,
      env: { ...process.env, ...accountEnv, CLAUDE_NO_TELEMETRY: '1' },
    })
    if (poolAccount) releaseAccount(poolAccount.id, { error: false })
    return {
      provider: 'claude-code',
      response: result.trim(),
      durationMs: Date.now() - start,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const rateLimited = msg.includes('429') || msg.toLowerCase().includes('rate limit')
    if (poolAccount) releaseAccount(poolAccount.id, { error: true, rateLimited })
    throw e
  }
}

async function executeClaudeApi(prompt: string, maxTokens: number, timeout: number): Promise<Omit<BackendResult, 'fallbackUsed'>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const start = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeout),
  })
  const data = await res.json() as {
    content?: Array<{ text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  return {
    provider: 'claude-api',
    response: data.content?.[0]?.text ?? '',
    tokensIn: data.usage?.input_tokens,
    tokensOut: data.usage?.output_tokens,
    durationMs: Date.now() - start,
  }
}

// ── Executor dispatch ──────────────────────────────────

async function executeProvider(
  provider: Provider,
  prompt: string,
  options: OrchestrateOptions,
): Promise<Omit<BackendResult, 'fallbackUsed'>> {
  const timeout = options.timeout ?? 60000
  const maxTokens = options.maxTokens ?? 1024

  switch (provider.name.toLowerCase().replace(/\s+/g, '-')) {
    case 'ollama':
      return executeOllama(prompt, timeout)
    case 'claude-code':
      return executeClaudeCode(prompt, timeout)
    case 'claude-api':
      return executeClaudeApi(prompt, maxTokens, timeout)
    default: {
      // Free-tier providers (Groq, Cerebras, Together, Mistral, OpenRouter, DeepSeek)
      // callWithAutoFallback handles provider selection + rate-limit rotation internally
      const start = Date.now()
      const result = await callWithAutoFallback(prompt)
      return {
        provider: result.provider,
        response: result.text,
        durationMs: Date.now() - start,
      }
    }
  }
}

// ── Fallback chain order (relay race tiers) ────────────
// Tier 0 (0ms):   ollama (local, free)
// Tier 1 (+300ms): free-tier APIs (Groq/Cerebras/Together/Mistral/OpenRouter/DeepSeek)
// Tier 2 (+800ms): paid subscriptions (claude-code, claude-api)

const FALLBACK_ORDER = [
  'ollama',
  'groq', 'cerebras', 'together-ai', 'mistral', 'openrouter', 'deepseek',
  'claude-code', 'claude-api',
]

// Helper: sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Relay race orchestration ───────────────────────────

/**
 * Relay race with documentation (§26):
 * - Tier 0 (script, Ollama): start immediately, 0 cost
 * - Tier 1 (free APIs): start after 300ms or when tier 0 exhausted
 * - Tier 2 (paid): start after 800ms or when tier 1 exhausted
 *
 * Each specialist checks its own limits before executing.
 * handoffNotes accumulate so the Commander always gets clean context.
 */
async function relayRace(
  toTry: Provider[],
  prompt: string,
  opts: OrchestrateOptions,
): Promise<BackendResult> {
  const handoffNotes: string[] = []
  const startTime = Date.now()

  // Group providers by stagger tier
  const tiers: Provider[][] = [[], [], []]
  for (const p of toTry) {
    const key = p.name.toLowerCase().replace(/\s+/g, '-')
    const stagger = SPECIALIST_PROFILES[key]?.staggerMs ?? 300
    if (stagger === 0) tiers[0].push(p)
    else if (stagger <= 300) tiers[1].push(p)
    else tiers[2].push(p)
  }

  const TIER_DELAYS = [0, 300, 800]
  let providerIndex = 0

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx]
    if (tier.length === 0) continue

    // Enforce minimum stagger delay between tiers
    const elapsed = Date.now() - startTime
    const targetMs = TIER_DELAYS[tierIdx]
    if (elapsed < targetMs) {
      await sleep(targetMs - elapsed)
    }

    for (const provider of tier) {
      const providerKey = provider.name.toLowerCase().replace(/\s+/g, '-')
      const isFirstProvider = providerIndex === 0
      providerIndex++

      // Self-aware limits check
      const limits = checkSpecialistLimits(providerKey, prompt, opts)
      if (!limits.canHandle) {
        log.debug(`specialist skipped: ${limits.handoffNote}`)
        if (limits.handoffNote) handoffNotes.push(limits.handoffNote)
        continue
      }

      try {
        log.info(`relay → ${providerKey}${tierIdx > 0 ? ' (fallback)' : ''}`)
        const result = await executeProvider(provider, prompt, opts)
        const fallbackUsed = !isFirstProvider

        trackUsage(providerKey, undefined, opts.capability ?? 'chat', result.tokensIn ?? 0, result.tokensOut ?? 0)
        appendEvent('task.delegated', {
          provider: providerKey,
          capability: opts.capability ?? 'chat',
          prompt: prompt.slice(0, 200),
          durationMs: result.durationMs,
          fallbackUsed,
          handoffNotes: handoffNotes.length > 0 ? handoffNotes : undefined,
        })

        if (fallbackUsed) {
          log.warn(`relay fallback used: ${providerKey}`)
        }

        return {
          ...result,
          fallbackUsed,
          handoffNotes: handoffNotes.length > 0 ? handoffNotes : undefined,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`specialist ${providerKey} failed: ${msg}`)
        handoffNotes.push(`${providerKey}: ${msg.slice(0, 120)}`)
      }
    }
  }

  throw new Error(`All specialists failed. Notes:\n${handoffNotes.join('\n')}`)
}

// ── Main entry ─────────────────────────────────────────

export async function orchestrate(prompt: string, options?: OrchestrateOptions): Promise<BackendResult> {
  const opts = options ?? {}
  const capability = opts.capability ?? 'chat'
  const registry = createDefaultRegistry()
  await registry.checkAll()

  // Build ordered list of providers to try
  const toTry: Provider[] = []

  if (opts.preferProvider) {
    const preferred = registry.getByName(opts.preferProvider)
    if (preferred && preferred.status !== 'unavailable') {
      toTry.push(preferred)
    }
  }

  // Primary selection
  if (toTry.length === 0) {
    const selected = await registry.select(capability)
    if (selected) toTry.push(selected)
  }

  // Add fallback candidates (not already in list)
  const allProviders = registry.listAll()
  for (const name of FALLBACK_ORDER) {
    const p = allProviders.find(x => x.name.toLowerCase().replace(/\s+/g, '-') === name)
    if (p && p.status !== 'unavailable' && p.capabilities.includes(capability) && !toTry.some(t => t.name === p.name)) {
      toTry.push(p)
    }
  }

  if (toTry.length === 0) {
    throw new Error('No specialist available for capability: ' + capability)
  }

  return relayRace(toTry, prompt, opts)
}

// ── Show state ─────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}
const LINE = '\u2500'.repeat(28)

export async function showOrchestrator(): Promise<void> {
  const registry = createDefaultRegistry()
  await registry.checkAll()

  const capability = 'chat'
  const selected = await registry.select(capability)
  const allProviders = registry.listAll()

  // Build relay chain (available specialists in tier order)
  const tier0: string[] = []
  const tier1: string[] = []
  const tier2: string[] = []
  for (const name of FALLBACK_ORDER) {
    const p = allProviders.find(x => x.name.toLowerCase().replace(/\s+/g, '-') === name)
    if (p && p.status !== 'unavailable' && p.capabilities.includes(capability)) {
      const profile = SPECIALIST_PROFILES[name]
      const stagger = profile?.staggerMs ?? 300
      const label = `${name}(${p.costTier})`
      if (stagger === 0) tier0.push(label)
      else if (stagger <= 300) tier1.push(label)
      else tier2.push(label)
    }
  }

  const activeSpecialist = selected
    ? `${selected.name.toLowerCase().replace(/\s+/g, '-')} (${selected.costTier})`
    : 'none'

  let modelLine = ''
  if (selected && selected.name === 'Ollama') {
    try {
      const model = await pickModel('gateway')
      modelLine = `  Inference model : ${model}`
    } catch {
      modelLine = '  Inference model : unknown'
    }
  }

  console.log(`\n${C.bold}REX Fleet — Orchestrator${C.reset}`)
  console.log(LINE)
  console.log(`  Active Specialist  : ${activeSpecialist}`)
  if (modelLine) console.log(modelLine)
  console.log()
  console.log(`  Relay chain (§26 stagger):`)
  console.log(`    Tier 0 (  0ms) : ${tier0.join(', ') || '—'}`)
  console.log(`    Tier 1 (+300ms) : ${tier1.join(', ') || '—'}`)
  console.log(`    Tier 2 (+800ms) : ${tier2.join(', ') || '—'}`)

  const todayUsage = getDailyUsage()
  if (todayUsage.length > 0) {
    console.log()
    console.log("  Mission stats (today):")
    for (const e of todayUsage) {
      const cost = e.estimatedCost > 0 ? `$${e.estimatedCost.toFixed(2)}` : '$0.00'
      console.log(`    ${e.provider.padEnd(14)} ${String(e.calls).padStart(3)} missions   ${cost}`)
    }
  }

  console.log(LINE)
  console.log()
}
