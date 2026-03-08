/**
 * REX Orchestrator
 * Selects the best backend provider and executes prompts with fallback chain.
 */

import { execSync } from 'node:child_process'
import { createDefaultRegistry, type Provider } from './providers.js'
import { trackUsage, getDailyUsage } from './budget.js'
import { appendEvent } from './sync-queue.js'
import { pickModel } from './router.js'
import { callWithAutoFallback } from './free-tiers.js'
import { createLogger } from './logger.js'

const log = createLogger('orchestrator')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export interface BackendResult {
  provider: string
  response: string
  tokensIn?: number
  tokensOut?: number
  durationMs: number
  fallbackUsed: boolean
}

export interface OrchestrateOptions {
  capability?: string
  preferProvider?: string
  maxTokens?: number
  timeout?: number
}

// ── Provider Executors ─────────────────────────────────

async function executeOllama(prompt: string, timeout: number): Promise<Omit<BackendResult, 'fallbackUsed'>> {
  const model = await pickModel('gateway')
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
  const start = Date.now()
  const result = execSync(`claude --print ${JSON.stringify(prompt)}`, {
    encoding: 'utf-8',
    timeout,
    env: { ...process.env, CLAUDE_NO_TELEMETRY: '1' },
  })
  return {
    provider: 'claude-code',
    response: result.trim(),
    durationMs: Date.now() - start,
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

// ── Fallback chain order ───────────────────────────────
// ollama (local, free) → free-tier APIs (Groq/Cerebras/Together/etc) → claude-code → claude-api

const FALLBACK_ORDER = ['ollama', 'groq', 'cerebras', 'together-ai', 'mistral', 'openrouter', 'deepseek', 'claude-code', 'claude-api']

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
    throw new Error('No provider available')
  }

  let lastError: Error | null = null

  for (let i = 0; i < toTry.length; i++) {
    const provider = toTry[i]
    const providerKey = provider.name.toLowerCase().replace(/\s+/g, '-')
    try {
      log.info(`trying provider: ${providerKey}`)
      const result = await executeProvider(provider, prompt, opts)
      const fallbackUsed = i > 0

      trackUsage(providerKey, undefined, capability, result.tokensIn ?? 0, result.tokensOut ?? 0)
      appendEvent('task.delegated', {
        provider: providerKey,
        prompt: prompt.slice(0, 200),
        durationMs: result.durationMs,
        fallbackUsed,
      })

      if (fallbackUsed) {
        log.warn(`primary failed, used fallback: ${providerKey}`)
      }

      return { ...result, fallbackUsed }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      log.warn(`provider ${providerKey} failed: ${lastError.message}`)
    }
  }

  throw lastError ?? new Error('All providers failed')
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

  // Build fallback chain (available providers in order)
  const chain: string[] = []
  for (const name of FALLBACK_ORDER) {
    const p = allProviders.find(x => x.name.toLowerCase().replace(/\s+/g, '-') === name)
    if (p && p.status !== 'unavailable' && p.capabilities.includes(capability)) {
      chain.push(`${name} (${p.costTier})`)
    }
  }

  const activeProvider = selected
    ? `${selected.name.toLowerCase().replace(/\s+/g, '-')} (${selected.costTier})`
    : 'none'

  let modelLine = ''
  if (selected && selected.name === 'Ollama') {
    try {
      const model = await pickModel('gateway')
      modelLine = `  Model: ${model}`
    } catch {
      modelLine = '  Model: unknown'
    }
  }

  console.log(`\n${C.bold}REX Orchestrator${C.reset}`)
  console.log(LINE)
  console.log(`  Active provider: ${activeProvider}`)
  if (modelLine) console.log(modelLine)
  console.log(`  Fallback chain: ${chain.join(' \u2192 ') || 'none'}`)

  const todayUsage = getDailyUsage()
  if (todayUsage.length > 0) {
    console.log()
    console.log("  Today's usage:")
    for (const e of todayUsage) {
      const cost = e.estimatedCost > 0 ? `$${e.estimatedCost.toFixed(2)}` : '$0.00'
      console.log(`    ${e.provider.padEnd(14)} ${String(e.calls).padStart(3)} calls   ${cost}`)
    }
  }

  console.log(LINE)
  console.log()
}
