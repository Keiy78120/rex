/**
 * REX Unified LLM Router
 * Chain: Ollama (local) → free tier APIs → subscription
 * Uses free-tiers.ts for provider management via Vercel AI SDK.
 */

import { callProvider, getRoutableProviders } from './free-tiers.js'
import { createLogger } from './logger.js'

const log = createLogger('llm')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// detectModel kept for backward compat (used by router.ts pickModel)
const PREFERRED_MODELS = ['qwen2.5:1.5b', 'qwen3.5:4b', 'llama3.2', 'mistral']

export async function detectModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map((m: any) => m.name)
    for (const pref of PREFERRED_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find((a: string) => a.includes(base))
      if (match) return match
    }
    return available.find((a: string) => !a.includes('embed')) || available[0]
  } catch {
    return 'qwen3.5:4b'
  }
}

/**
 * Unified LLM call — routing chain:
 * 1. Ollama local (zero cost, instant)
 * 2. Configured free tier APIs (Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek)
 * 3. Throws if all fail
 *
 * REX knows what you own. Routes to the cheapest capable option automatically.
 */
export async function llm(prompt: string, system?: string, model?: string): Promise<string> {
  const providers = getRoutableProviders()

  if (providers.length === 0) {
    throw new Error('No LLM providers available: Ollama offline, no free tier keys configured')
  }

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, prompt, system, model)
      log.debug(`llm: routed via ${provider.name}`)
      return result
    } catch (err) {
      const msg = String(err)
      if (msg.startsWith('RATE_LIMIT:') || msg.startsWith('NO_KEY:')) {
        log.debug(`llm: skip ${provider.name} — ${msg}`)
        continue
      }
      // Connectivity errors: log warn, try next
      log.warn(`llm: ${provider.name} failed — ${msg}`)
    }
  }

  throw new Error('All LLM providers exhausted')
}
