/**
 * REX LiteLLM — Unified LLM proxy with usage tracking
 *
 * Wraps free-tiers.ts callWithAutoFallback() and adds:
 *  - Per-provider usage counters (requests, tokens, errors)
 *  - Retry-after header support (respects 429 Retry-After if present)
 *  - Request queue when all providers are exhausted
 *  - Stats export for providers page and budget tracking
 *
 * Section 23 (action.md): all internal LLM calls MUST route through this.
 * Routing chain: semantic-cache → router → litellm → Ollama → free tier → subscription
 * @module BUDGET
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REX_DIR, ensureRexDirs } from '../paths.js'
import { createLogger } from '../logger.js'
import {
  FREE_TIER_PROVIDERS,
  getApiKey,
  isProviderAvailable,
  callProvider,
  type FreeTierProvider,
} from './free-tiers.js'

const log = createLogger('BUDGET:litellm')

const USAGE_FILE = join(REX_DIR, 'litellm-usage.json')
const QUEUE_MAX_SIZE = 50
const DEFAULT_BLOCK_MS = 60_000

// ── Usage tracking ─────────────────────────────────────────────────

export interface ProviderUsage {
  provider: string
  requests: number
  errors: number
  rateLimits: number
  estimatedTokens: number
  lastUsedAt: string | null
  lastErrorAt: string | null
}

interface UsageStore {
  providers: Record<string, ProviderUsage>
  totalRequests: number
  totalErrors: number
  lastResetAt: string
}

let _usage: UsageStore = loadUsage()

function loadUsage(): UsageStore {
  try {
    if (existsSync(USAGE_FILE)) {
      return JSON.parse(readFileSync(USAGE_FILE, 'utf-8'))
    }
  } catch {}
  return { providers: {}, totalRequests: 0, totalErrors: 0, lastResetAt: new Date().toISOString() }
}

function saveUsage(): void {
  try {
    ensureRexDirs()
    writeFileSync(USAGE_FILE, JSON.stringify(_usage, null, 2))
  } catch {}
}

function getOrCreateUsage(provider: string): ProviderUsage {
  if (!_usage.providers[provider]) {
    _usage.providers[provider] = {
      provider,
      requests: 0,
      errors: 0,
      rateLimits: 0,
      estimatedTokens: 0,
      lastUsedAt: null,
      lastErrorAt: null,
    }
  }
  return _usage.providers[provider]
}

function recordSuccess(provider: string, estimatedOutputTokens = 500): void {
  const u = getOrCreateUsage(provider)
  u.requests++
  u.estimatedTokens += estimatedOutputTokens
  u.lastUsedAt = new Date().toISOString()
  _usage.totalRequests++
  saveUsage()
}

function recordError(provider: string, isRateLimit = false): void {
  const u = getOrCreateUsage(provider)
  u.errors++
  if (isRateLimit) u.rateLimits++
  u.lastErrorAt = new Date().toISOString()
  _usage.totalErrors++
  saveUsage()
}

// ── Cooldown tracking with retry-after support ─────────────────────

interface Cooldown {
  until: number
  reason: string
}

const _cooldowns = new Map<string, Cooldown>()

function setCooldown(provider: string, ms: number, reason: string): void {
  _cooldowns.set(provider, { until: Date.now() + ms, reason })
  log.warn(`${provider} in cooldown for ${ms / 1000}s — ${reason}`)
}

function isCooledDown(provider: string): boolean {
  const c = _cooldowns.get(provider)
  if (!c) return false
  if (Date.now() >= c.until) {
    _cooldowns.delete(provider)
    log.info(`${provider} cooldown expired — available again`)
    return false
  }
  return true
}

/**
 * Parse the Retry-After header (seconds integer or HTTP-date).
 * Returns milliseconds to wait, defaulting to DEFAULT_BLOCK_MS.
 */
function parseRetryAfter(value: string | null): number {
  if (!value) return DEFAULT_BLOCK_MS
  const seconds = parseInt(value, 10)
  if (!isNaN(seconds)) return seconds * 1000
  // HTTP-date format
  const date = new Date(value)
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now()
    return ms > 0 ? ms : DEFAULT_BLOCK_MS
  }
  return DEFAULT_BLOCK_MS
}

// ── Request queue ──────────────────────────────────────────────────

interface QueuedRequest {
  prompt: string
  system?: string
  modelId?: string
  resolve: (result: LiteLLMResult) => void
  reject: (err: Error) => void
  addedAt: number
}

const _queue: QueuedRequest[] = []
let _drainTimer: ReturnType<typeof setTimeout> | null = null

function scheduleQueueDrain(delayMs: number): void {
  if (_drainTimer) return
  _drainTimer = setTimeout(async () => {
    _drainTimer = null
    if (_queue.length === 0) return
    log.info(`Draining request queue (${_queue.length} pending)`)
    while (_queue.length > 0) {
      const req = _queue.shift()!
      try {
        const result = await callWithFallback(req.prompt, req.system, { modelId: req.modelId })
        req.resolve(result)
      } catch (err) {
        req.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }, delayMs)
}

// ── Core API ───────────────────────────────────────────────────────

export interface LiteLLMResult {
  text: string
  provider: string
  model: string
  estimatedTokens: number
}

export interface LiteLLMOptions {
  modelId?: string
  system?: string
  maxProviders?: number
  queueOnExhaustion?: boolean  // queue instead of throw when all providers fail
}

/**
 * Call LLM via auto-fallback chain with usage tracking.
 * Chain: Ollama → Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek
 *
 * When a 429 is received with a Retry-After header, the cooldown respects it.
 * When all providers are exhausted:
 *   - if queueOnExhaustion=true: queue the request and retry when a cooldown expires
 *   - otherwise: throw
 */
export async function callWithFallback(
  prompt: string,
  system?: string,
  opts: LiteLLMOptions = {},
): Promise<LiteLLMResult> {
  const candidates = getRoutableProviders()
  const limit = opts.maxProviders ?? candidates.length
  const tried: string[] = []
  let lastErr: Error | null = null
  let shortestCooldown = Infinity

  for (const p of candidates.slice(0, limit)) {
    if (isCooledDown(p.name)) {
      const c = _cooldowns.get(p.name)
      if (c) shortestCooldown = Math.min(shortestCooldown, c.until - Date.now())
      tried.push(`${p.name}(cooldown)`)
      continue
    }

    try {
      const text = await callProvider(p, prompt, system, opts.modelId)
      const estimatedTokens = Math.ceil(text.length / 3.5)
      recordSuccess(p.name, estimatedTokens)
      log.info(`litellm: success via ${p.name} (${opts.modelId ?? p.defaultModel})`)
      return { text, provider: p.name, model: opts.modelId ?? p.defaultModel, estimatedTokens }
    } catch (err) {
      const msg = String(err)
      tried.push(p.name)
      lastErr = err instanceof Error ? err : new Error(msg)

      const isRateLimit = msg.includes('RATE_LIMIT:') || msg.includes('429') || msg.includes('rate limit')
      recordError(p.name, isRateLimit)

      if (isRateLimit) {
        // Respect retry-after if embedded in the error message
        const retryMatch = msg.match(/retry.?after[=:]?\s*(\d+)/i)
        const cooldownMs = retryMatch ? parseRetryAfter(retryMatch[1]) : DEFAULT_BLOCK_MS
        setCooldown(p.name, cooldownMs, '429 rate limit')
        shortestCooldown = Math.min(shortestCooldown, cooldownMs)
        continue
      }

      // Provider unavailable (no key, network error) — skip
      log.warn(`litellm: ${p.name} failed: ${msg.slice(0, 80)}`)
    }
  }

  // All providers exhausted
  const allBlocked = tried.every(t => t.includes('cooldown') || _cooldowns.has(t))
  if (opts.queueOnExhaustion && allBlocked && shortestCooldown < Infinity) {
    log.warn(`litellm: all providers exhausted — queuing request, retry in ${Math.ceil(shortestCooldown / 1000)}s`)
    if (_queue.length >= QUEUE_MAX_SIZE) {
      throw new Error('QUEUE_FULL: all providers exhausted and queue is full')
    }
    scheduleQueueDrain(shortestCooldown + 1000)
    return new Promise<LiteLLMResult>((resolve, reject) => {
      _queue.push({ prompt, system, modelId: opts.modelId, resolve, reject, addedAt: Date.now() })
    })
  }

  throw new Error(`ALL_PROVIDERS_FAILED [${tried.join(', ')}]: ${lastErr?.message ?? 'unknown'}`)
}

// ── Provider list (filtered by availability + cooldown) ────────────

function getRoutableProviders(): FreeTierProvider[] {
  return FREE_TIER_PROVIDERS.filter(p => isProviderAvailable(p))
}

export function getCooldowns(): Array<{ provider: string; cooldownUntil: string; reason: string }> {
  const now = Date.now()
  return Array.from(_cooldowns.entries())
    .filter(([, c]) => c.until > now)
    .map(([provider, c]) => ({
      provider,
      cooldownUntil: new Date(c.until).toISOString(),
      reason: c.reason,
    }))
}

// ── Stats / reporting ──────────────────────────────────────────────

export function getUsageStats(): UsageStore & { queueLength: number; cooldowns: ReturnType<typeof getCooldowns> } {
  return {
    ..._usage,
    queueLength: _queue.length,
    cooldowns: getCooldowns(),
  }
}

export function getProviderUsageSummary(): ProviderUsage[] {
  return Object.values(_usage.providers).sort((a, b) => b.requests - a.requests)
}

export function resetUsage(): void {
  _usage = { providers: {}, totalRequests: 0, totalErrors: 0, lastResetAt: new Date().toISOString() }
  saveUsage()
  log.info('Usage stats reset')
}

// ── Effect-ts typed layer ──────────────────────────────────────────
// Wraps callWithFallback with typed error channels so callers cannot
// silently ignore failures. Additive — existing code is unchanged.

import { Effect, Data } from 'effect'

/** Tagged LLM error union — the compiler forces handling each case. */
export class NetworkError extends Data.TaggedError('NetworkError')<{
  message: string
  provider: string
}> {}

export class RateLimitError extends Data.TaggedError('RateLimitError')<{
  message: string
  provider: string
  retryAfterMs: number
}> {}

export class AllProvidersExhaustedError extends Data.TaggedError('AllProvidersExhaustedError')<{
  tried: string[]
}> {}

export type LlmError = NetworkError | RateLimitError | AllProvidersExhaustedError

/**
 * Effect-typed wrapper around callWithFallback.
 * The return type makes it impossible to ignore errors:
 *
 * @example
 * const result = yield* callLlmEffect("Hello REX")
 * // result: LiteLLMResult — fully typed, error handled by compiler
 */
export function callLlmEffect(
  prompt: string,
  opts: LiteLLMOptions = {},
): Effect.Effect<LiteLLMResult, LlmError> {
  return Effect.tryPromise({
    try: () => callWithFallback(prompt, opts.system, opts),
    catch: (err) => {
      const msg = String(err instanceof Error ? err.message : err)
      if (msg.startsWith('RATE_LIMIT') || msg.includes('429')) {
        const retryMatch = msg.match(/retry.?after[=:]?\s*(\d+)/i)
        const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : DEFAULT_BLOCK_MS
        return new RateLimitError({ message: msg, provider: 'unknown', retryAfterMs })
      }
      if (msg.startsWith('ALL_PROVIDERS_FAILED')) {
        const triedMatch = msg.match(/\[([^\]]+)\]/)
        const tried = triedMatch ? triedMatch[1].split(', ') : []
        return new AllProvidersExhaustedError({ tried })
      }
      return new NetworkError({ message: msg, provider: 'unknown' })
    },
  })
}

/**
 * Run an Effect-typed LLM call, mapping errors to a plain string fallback.
 * Convenience wrapper for code that cannot use generators (non-Effect context).
 *
 * @example
 * const text = await runLlmEffect("Summarize this", { system: "You are REX" })
 */
export async function runLlmEffect(
  prompt: string,
  opts: LiteLLMOptions = {},
): Promise<LiteLLMResult | null> {
  const program = callLlmEffect(prompt, opts).pipe(
    Effect.catchTag('RateLimitError', (e) => {
      log.warn(`effect/llm: rate limit on ${e.provider} — retry in ${e.retryAfterMs}ms`)
      return Effect.fail(e)
    }),
    Effect.catchTag('AllProvidersExhaustedError', (e) => {
      log.warn(`effect/llm: all providers exhausted [${e.tried.join(', ')}]`)
      return Effect.succeed(null as unknown as LiteLLMResult)
    }),
    Effect.catchTag('NetworkError', (e) => {
      log.warn(`effect/llm: network error — ${e.message.slice(0, 80)}`)
      return Effect.succeed(null as unknown as LiteLLMResult)
    }),
  )
  return Effect.runPromise(program).catch(() => null)
}
