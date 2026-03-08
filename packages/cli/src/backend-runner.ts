/**
 * REX Backend Runner
 * Thin delegation layer: semantic cache → orchestrator (ollama → claude-code → claude-api).
 * Single entry point for all internal prompt execution.
 */

import { hashPrompt, cacheGet, cacheSet } from './semantic-cache.js'
import { orchestrate, type OrchestrateOptions } from './orchestrator.js'
import { createLogger } from './logger.js'

const log = createLogger('backend-runner')

// ── Types ──────────────────────────────────────────────

export interface RunOpts {
  taskType?: string
  model?: string
  maxTokens?: number
  skipCache?: boolean
  timeout?: number // ms, default 30000
}

export interface RunResult {
  response: string
  model: string
  source: 'cache' | 'ollama' | 'claude-cli' | 'claude-api' | 'error'
  tokensEstimated?: number
  latencyMs: number
}

// ── Map orchestrator provider names to RunResult source ──

function mapSource(provider: string): RunResult['source'] {
  switch (provider) {
    case 'ollama': return 'ollama'
    case 'claude-code': return 'claude-cli'
    case 'claude-api': return 'claude-api'
    default: return 'ollama'
  }
}

// ── Main entry ─────────────────────────────────────────

export async function runPrompt(prompt: string, opts?: RunOpts): Promise<RunResult> {
  const start = Date.now()
  const taskType = opts?.taskType ?? 'general'
  const skipCache = opts?.skipCache ?? false

  // Step 1: Check semantic cache
  if (!skipCache) {
    const hash = hashPrompt(prompt)
    const cached = cacheGet(hash)
    if (cached) {
      log.info(`cache hit for ${taskType} (${Date.now() - start}ms)`)
      return {
        response: cached,
        model: 'cache',
        source: 'cache',
        latencyMs: Date.now() - start,
      }
    }
  }

  // Step 2: Delegate to orchestrator (handles ollama → claude-code → claude-api fallback)
  try {
    const orchOpts: OrchestrateOptions = {
      capability: 'chat',
      timeout: opts?.timeout ?? 30000,
      maxTokens: opts?.maxTokens,
    }
    if (opts?.model) {
      // If a specific model is requested and it looks like an Ollama model, prefer Ollama
      orchOpts.preferProvider = opts.model.includes('/') ? undefined : 'ollama'
    }

    const result = await orchestrate(prompt, orchOpts)
    const source = mapSource(result.provider)

    // Cache the result for future use
    if (!skipCache && result.response) {
      const hash = hashPrompt(prompt)
      const tokensEstimate = Math.ceil(result.response.length / 4)
      cacheSet(hash, result.response, result.provider, taskType, tokensEstimate)
    }

    log.info(`${source} responded in ${result.durationMs}ms (task=${taskType})`)
    return {
      response: result.response,
      model: result.provider,
      source,
      tokensEstimated: (result.tokensIn ?? 0) + (result.tokensOut ?? 0) || undefined,
      latencyMs: result.durationMs,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`all backends failed: ${msg}`)
    return {
      response: '',
      model: 'none',
      source: 'error',
      latencyMs: Date.now() - start,
    }
  }
}
