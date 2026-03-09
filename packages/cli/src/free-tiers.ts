/**
 * REX Free Tier Catalog
 * Vercel AI SDK abstraction over all OpenAI-compatible free tier providers.
 * Routing order: Ollama → Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek
 */

import { generateText, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('free-tiers')
const HOME = process.env.HOME || '~'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export interface FreeTierModel {
  id: string
  contextWindow: number
  capabilities: ('chat' | 'code' | 'fast' | 'reasoning')[]
}

export interface FreeTierProvider {
  name: string
  envKey: string
  baseUrl: string
  defaultModel: string
  models: FreeTierModel[]
  rpmLimit: number
  tpmLimit: number
  requiresKey: boolean
}

interface RateState {
  requests: number
  windowStart: number
  blocked: boolean
  blockedUntil: number
  consecutiveFails: number
}

// ── Catalog ────────────────────────────────────────────

export const FREE_TIER_PROVIDERS: FreeTierProvider[] = [
  {
    name: 'Ollama',
    envKey: '',
    baseUrl: OLLAMA_URL,
    defaultModel: 'qwen3.5:latest',
    requiresKey: false,
    models: [
      { id: 'qwen3.5:latest', contextWindow: 32768, capabilities: ['chat', 'code'] },
      { id: 'qwen2.5:1.5b', contextWindow: 32768, capabilities: ['chat', 'fast'] },
    ],
    rpmLimit: 999,
    tpmLimit: 999999,
  },
  {
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    models: [
      { id: 'llama-3.1-8b-instant', contextWindow: 128000, capabilities: ['chat', 'fast'] },
      { id: 'llama-3.3-70b-versatile', contextWindow: 128000, capabilities: ['chat', 'code'] },
      { id: 'qwen-qwq-32b', contextWindow: 128000, capabilities: ['chat', 'reasoning'] },
    ],
    rpmLimit: 30,
    tpmLimit: 6000,
  },
  {
    name: 'Cerebras',
    envKey: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'qwen-3-32b',
    requiresKey: true,
    models: [
      { id: 'llama3.1-8b', contextWindow: 8192, capabilities: ['chat', 'fast'] },
      { id: 'llama3.3-70b', contextWindow: 128000, capabilities: ['chat', 'code'] },
      { id: 'qwen-3-32b', contextWindow: 32768, capabilities: ['chat', 'code', 'reasoning'] },
    ],
    rpmLimit: 60,
    tpmLimit: 60000,
  },
  {
    name: 'Together AI',
    envKey: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    requiresKey: true,
    models: [
      { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', contextWindow: 131072, capabilities: ['chat', 'fast'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', contextWindow: 32768, capabilities: ['chat', 'code'] },
    ],
    rpmLimit: 60,
    tpmLimit: 60000,
  },
  {
    name: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresKey: true,
    models: [
      { id: 'mistral-small-latest', contextWindow: 32000, capabilities: ['chat', 'code'] },
      { id: 'codestral-latest', contextWindow: 32000, capabilities: ['code'] },
    ],
    rpmLimit: 2,
    tpmLimit: 50000,
  },
  {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    requiresKey: true,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', contextWindow: 131072, capabilities: ['chat', 'code'] },
      { id: 'google/gemma-3-27b-it:free', contextWindow: 96000, capabilities: ['chat'] },
    ],
    rpmLimit: 20,
    tpmLimit: 40000,
  },
  {
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    models: [
      { id: 'deepseek-chat', contextWindow: 64000, capabilities: ['chat', 'code'] },
      { id: 'deepseek-reasoner', contextWindow: 64000, capabilities: ['reasoning'] },
    ],
    rpmLimit: 60,
    tpmLimit: 100000,
  },
]

// ── API Key resolution ─────────────────────────────────

export function getApiKey(envKey: string): string | null {
  if (!envKey) return null
  if (process.env[envKey]) return process.env[envKey]!
  try {
    const settingsPath = join(HOME, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.env?.[envKey] ?? null
    }
  } catch {}
  return null
}

// ── Rate limit tracking ────────────────────────────────

const _rateStates = new Map<string, RateState>()
const BLOCK_MS = 60_000
const HARD_DISABLE_MS = 30 * 60 * 1000 // 30min after 3 consecutive failures
const MAX_CONSECUTIVE_FAILS = 3

function getRateState(name: string): RateState {
  if (!_rateStates.has(name)) {
    _rateStates.set(name, { requests: 0, windowStart: Date.now(), blocked: false, blockedUntil: 0, consecutiveFails: 0 })
  }
  return _rateStates.get(name)!
}

export function markRateLimited(name: string): void {
  const state = getRateState(name)
  state.blocked = true
  state.blockedUntil = Date.now() + BLOCK_MS
  log.warn(`${name} rate-limited — blocked for ${BLOCK_MS / 1000}s`)
}

export function markFailed(name: string): void {
  const state = getRateState(name)
  state.consecutiveFails++
  if (state.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    state.blocked = true
    state.blockedUntil = Date.now() + HARD_DISABLE_MS
    log.warn(`${name} disabled for 30min after ${state.consecutiveFails} consecutive failures`)
  }
}

export function markSuccess(name: string): void {
  const state = getRateState(name)
  state.consecutiveFails = 0
}

function isBlocked(name: string, rpmLimit: number): boolean {
  const state = getRateState(name)
  const now = Date.now()
  if (state.blocked && now >= state.blockedUntil) {
    state.blocked = false
    state.requests = 0
    state.windowStart = now
    log.info(`${name} rate-limit window reset`)
  }
  if (state.blocked) return true
  if (now - state.windowStart > BLOCK_MS) {
    state.requests = 0
    state.windowStart = now
  }
  if (state.requests >= rpmLimit) {
    markRateLimited(name)
    return true
  }
  return false
}

function tick(name: string): void {
  getRateState(name).requests++
}

// ── Vercel AI SDK provider factory ────────────────────

function makeProvider(p: FreeTierProvider, apiKey?: string): ReturnType<typeof createOpenAI> {
  if (p.name === 'Ollama') {
    return createOpenAI({ baseURL: `${p.baseUrl}/v1`, apiKey: 'ollama' })
  }
  return createOpenAI({ baseURL: p.baseUrl, apiKey: apiKey ?? '' })
}

// ── Public API ─────────────────────────────────────────

export async function callProvider(
  provider: FreeTierProvider,
  prompt: string,
  system?: string,
  modelId?: string,
): Promise<string> {
  const apiKey = provider.requiresKey ? getApiKey(provider.envKey) : 'local'
  if (provider.requiresKey && !apiKey) throw new Error(`NO_KEY:${provider.name}`)
  if (isBlocked(provider.name, provider.rpmLimit)) throw new Error(`RATE_LIMIT:${provider.name}`)
  tick(provider.name)

  const openai = makeProvider(provider, apiKey ?? undefined)
  const useModelId = modelId ?? provider.defaultModel
  const model: LanguageModel = openai(useModelId)

  try {
    const { text } = await generateText({
      model,
      prompt,
      system,
      maxTokens: 2048,
      abortSignal: AbortSignal.timeout(30_000),
    })
    markSuccess(provider.name)
    return text
  } catch (err) {
    const msg = String(err)
    if (msg.includes('429') || msg.includes('rate') || msg.includes('Rate')) {
      markRateLimited(provider.name)
      throw new Error(`RATE_LIMIT:${provider.name}`)
    }
    markFailed(provider.name)
    throw err
  }
}

export function getRoutableProviders(): FreeTierProvider[] {
  return FREE_TIER_PROVIDERS.filter(p => !p.requiresKey || !!getApiKey(p.envKey))
}

export function isProviderAvailable(p: FreeTierProvider): boolean {
  return !p.requiresKey || !!getApiKey(p.envKey)
}

export async function validateProvider(provider: FreeTierProvider): Promise<boolean> {
  try {
    if (provider.name === 'Ollama') {
      const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    }
    const apiKey = getApiKey(provider.envKey)
    if (!apiKey) return false
    const res = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Call the prompt against all available providers in routing order,
 * automatically falling back to the next when one is rate-limited or unavailable.
 * Order: Ollama → Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek
 *
 * Throws only when ALL providers fail.
 */
export async function callWithAutoFallback(
  prompt: string,
  system?: string,
  opts: { modelId?: string; maxProviders?: number } = {},
): Promise<{ text: string; provider: string; model: string }> {
  const candidates = getRoutableProviders()
  if (candidates.length === 0) throw new Error('NO_PROVIDERS: no configured providers available')

  const limit = opts.maxProviders ?? candidates.length
  const tried: string[] = []
  let lastErr: Error | null = null

  for (const p of candidates.slice(0, limit)) {
    try {
      const text = await callProvider(p, prompt, system, opts.modelId)
      log.info(`Auto-fallback: success via ${p.name}`)
      return { text, provider: p.name, model: opts.modelId ?? p.defaultModel }
    } catch (err) {
      const msg = String(err)
      tried.push(p.name)
      lastErr = err instanceof Error ? err : new Error(msg)
      if (msg.startsWith('RATE_LIMIT:') || msg.startsWith('NO_KEY:')) {
        log.warn(`Auto-fallback: ${p.name} unavailable (${msg}), trying next...`)
        continue
      }
      // Non-rate-limit errors: still try next but log as warning
      log.warn(`Auto-fallback: ${p.name} failed: ${msg.slice(0, 80)}, trying next...`)
    }
  }

  throw new Error(`All providers failed [${tried.join(', ')}]: ${lastErr?.message}`)
}

export async function pingAllProviders(): Promise<Array<{ name: string; ok: boolean; latencyMs: number }>> {
  const results = await Promise.all(
    FREE_TIER_PROVIDERS.map(async (p) => {
      if (!isProviderAvailable(p)) return { name: p.name, ok: false, latencyMs: 0 }
      const start = Date.now()
      const ok = await validateProvider(p)
      const latencyMs = Date.now() - start
      if (!ok) markFailed(p.name)
      else markSuccess(p.name)
      return { name: p.name, ok, latencyMs }
    })
  )
  return results
}

export function getProvidersSnapshot(): object[] {
  return FREE_TIER_PROVIDERS.map(p => ({
    name: p.name,
    envKey: p.envKey,
    available: isProviderAvailable(p),
    blocked: p.name !== 'Ollama' ? getRateState(p.name).blocked : false,
    consecutiveFails: getRateState(p.name).consecutiveFails,
    rpmLimit: p.rpmLimit,
    defaultModel: p.defaultModel,
    modelsCount: p.models.length,
  }))
}
