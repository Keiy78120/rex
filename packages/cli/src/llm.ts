/**
 * REX Unified LLM Router
 * Chain: Ollama (local) → free tier APIs → subscription
 * Routes through litellm.ts for usage tracking and cooldown management.
 * Section 23 (action.md): all internal LLM calls MUST use this module.
 */

import { callWithFallback } from './litellm.js'
import { getBackend } from './llm-backend.js'
import { createLogger } from './logger.js'

const log = createLogger('llm')

// detectModel kept for backward compat (used by router.ts pickModel)
const PREFERRED_MODELS = ['qwen2.5:1.5b', 'qwen3.5:4b', 'llama3.2', 'mistral']

export async function detectModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL
  try {
    const backend = getBackend()
    const available = await backend.listModels()
    for (const pref of PREFERRED_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find((a) => a.includes(base))
      if (match) return match
    }
    return available.find((a) => !a.includes('embed')) ?? available[0] ?? 'qwen3.5:4b'
  } catch {
    return 'qwen3.5:4b'
  }
}

/**
 * Unified LLM call — routes through litellm for full usage tracking.
 * Chain: Ollama local → Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek
 */
export async function llm(prompt: string, system?: string, model?: string): Promise<string> {
  try {
    const result = await callWithFallback(prompt, system, { modelId: model })
    log.debug(`llm: routed via ${result.provider} (${result.model})`)
    return result.text
  } catch (err) {
    const msg = String(err)
    log.warn(`llm: all providers failed — ${msg.slice(0, 100)}`)
    throw new Error(`No LLM providers available: ${msg}`)
  }
}
