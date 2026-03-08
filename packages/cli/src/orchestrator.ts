/**
 * REX Orchestrator — async handoff pattern
 *
 * When a specialist (LLM/script) is slow or overloaded:
 * 1. It documents its progress so far
 * 2. Passes the baton to the next available specialist
 * 3. Fleet Commander picks up from the documented state
 * 4. Nothing is lost — everything is synced + compressed
 *
 * This is NOT a race condition. It's a relay race.
 *
 * Priority chain (staggered, not simultaneous):
 *   Script (0ms) → Local Ollama (0ms) → Free tier (after 300ms) → Subscription (after 800ms)
 * 
 * If a specialist is slow → it sleeps, documents, passes baton.
 * Fleet Commander always knows current state.
 */

import { createLogger } from './logger.js'
import { appendEvent } from './sync-queue.js'
import { semanticCache } from './semantic-cache.js'

const log = createLogger('orchestrator')

// ── Types ──────────────────────────────────────────────

export type SpecialistKind = 'script' | 'ollama' | 'free-tier' | 'subscription' | 'pay'

export interface OrchestrateRequest {
  task: string              // task type: 'categorize' | 'summarize' | 'embed' | 'code' | 'lint' | 'review'
  prompt: string
  context?: string
  maxTokens?: number
  timeoutMs?: number        // per-specialist timeout before handoff (default: 5000)
  skipCache?: boolean
  requireCapability?: string // 'code' | 'embed' | 'vision' etc
}

export interface OrchestrateResult {
  ok: boolean
  content: string
  specialist: SpecialistKind
  durationMs: number
  fromCache: boolean
  handoffs: number          // how many times baton was passed
  progressLog?: string      // what was documented during handoffs
}

// Specialist progress state — what each specialist documents before handing off
interface SpecialistProgress {
  specialist: SpecialistKind
  startedAt: number
  partialResult?: string
  reasonForHandoff: 'timeout' | 'error' | 'unavailable'
  handoffNote: string       // what the next specialist needs to know
}

// ── Model catalog ──────────────────────────────────────

const TASK_TO_MODEL: Record<string, { ollama?: string; freeTier?: string; subscription: string }> = {
  categorize:  { ollama: 'qwen2.5:1.5b',     freeTier: 'groq/llama-3.1-8b-instant', subscription: 'claude-haiku-4-5' },
  summarize:   { ollama: 'qwen2.5:3b',        freeTier: 'groq/llama-3.1-8b-instant', subscription: 'claude-haiku-4-5' },
  embed:       { ollama: 'nomic-embed-text',  freeTier: 'together/m2-bert-80M-8k',   subscription: 'claude-haiku-4-5' },
  lint:        { ollama: 'qwen2.5:1.5b',      freeTier: 'groq/llama-3.1-8b-instant', subscription: 'claude-haiku-4-5' },
  review:      { ollama: 'qwen2.5:7b',        freeTier: 'groq/llama-3.1-70b',        subscription: 'claude-sonnet-4-6' },
  code:        { ollama: 'qwen2.5-coder:7b',  freeTier: 'groq/llama-3.1-70b',        subscription: 'claude-sonnet-4-6' },
  'self-improve': {                            freeTier: 'groq/llama-3.1-70b',        subscription: 'claude-haiku-4-5' },
}

// ── Script specialists ─────────────────────────────────

/**
 * Try to resolve the task with a script before touching any LLM.
 * Returns null if the task can't be handled by script.
 */
async function tryScript(req: OrchestrateRequest): Promise<string | null> {
  // Tasks that scripts can handle entirely
  if (req.task === 'lint') {
    // Run ESLint/TSC and return structured output — no LLM needed
    const { execSync } = await import('node:child_process')
    try {
      const result = execSync('npx tsc --noEmit 2>&1 || true', { encoding: 'utf-8', timeout: 10_000 })
      if (!result.trim()) return '✓ No TypeScript errors'
      return result.slice(0, 2000) // give clean report to LLM if needed
    } catch { return null }
  }

  if (req.task === 'categorize' && req.prompt.length < 200) {
    // Simple pattern matching for short texts — 0 tokens
    const lower = req.prompt.toLowerCase()
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) return 'bug-fix'
    if (lower.includes('feat') || lower.includes('add') || lower.includes('new')) return 'feature'
    if (lower.includes('refactor') || lower.includes('clean') || lower.includes('move')) return 'refactor'
    if (lower.includes('doc') || lower.includes('readme') || lower.includes('comment')) return 'docs'
    // Can't decide → fall through to LLM
  }

  return null
}

// ── Ollama specialist ──────────────────────────────────

async function tryOllama(req: OrchestrateRequest, model: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: req.context ? `Context:\n${req.context}\n\nTask:\n${req.prompt}` : req.prompt,
        stream: false,
        options: { num_predict: req.maxTokens ?? 512 },
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)
    if (!res.ok) return null

    const data = await res.json() as { response: string }
    return data.response
  } catch (err) {
    const msg = String(err)
    if (msg.includes('abort') || msg.includes('timeout')) {
      log.warn(`Ollama timeout for task: ${req.task}`)
    }
    return null
  }
}

// ── Free tier specialist ───────────────────────────────

async function tryFreeTier(req: OrchestrateRequest, model: string, timeoutMs: number): Promise<string | null> {
  // Parse provider/model
  const [provider, modelName] = model.split('/')
  
  const endpoints: Record<string, { url: string; envKey: string }> = {
    groq:     { url: 'https://api.groq.com/openai/v1/chat/completions',     envKey: 'GROQ_API_KEY' },
    together: { url: 'https://api.together.xyz/v1/chat/completions',         envKey: 'TOGETHER_API_KEY' },
    cerebras: { url: 'https://api.cerebras.ai/v1/chat/completions',          envKey: 'CEREBRAS_API_KEY' },
    gemini:   { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', envKey: 'GEMINI_API_KEY' },
  }

  const ep = endpoints[provider]
  if (!ep || !process.env[ep.envKey]) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env[ep.envKey]}` },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: req.context ? `${req.context}\n\n${req.prompt}` : req.prompt }],
        max_tokens: req.maxTokens ?? 512,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)
    if (!res.ok) return null

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? null
  } catch {
    return null
  }
}

// ── Subscription specialist ────────────────────────────

async function trySubscription(req: OrchestrateRequest, model: string, timeoutMs: number): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const [, modelName] = model.split('-')
    const anthropicModel = model.startsWith('claude-') ? model : 'claude-haiku-4-5'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: req.maxTokens ?? 512,
        messages: [{ role: 'user', content: req.context ? `${req.context}\n\n${req.prompt}` : req.prompt }],
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)
    if (!res.ok) return null

    const data = await res.json() as { content: Array<{ text: string }> }
    return data.content[0]?.text ?? null
  } catch {
    return null
  }
}

// ── Main orchestrator ──────────────────────────────────

/**
 * Orchestrate a task across the fleet with handoff pattern.
 * 
 * Each specialist gets a time window. If it doesn't respond in time:
 * - It documents its progress
 * - Passes the baton to the next specialist
 * - Nothing is lost — progress log accumulates
 */
export async function orchestrate(req: OrchestrateRequest): Promise<OrchestrateResult> {
  const start = Date.now()
  const timeoutMs = req.timeoutMs ?? 5_000
  const progressLog: SpecialistProgress[] = []
  let handoffs = 0

  // 1. Semantic cache — 0 tokens, 0 cost
  if (!req.skipCache) {
    const cached = await semanticCache.get(req.prompt)
    if (cached) {
      return { ok: true, content: cached, specialist: 'script', durationMs: Date.now() - start, fromCache: true, handoffs: 0 }
    }
  }

  const models = TASK_TO_MODEL[req.task] ?? TASK_TO_MODEL.categorize
  let result: string | null = null
  let usedSpecialist: SpecialistKind = 'script'

  // 2. Script — always first, 0 tokens
  result = await tryScript(req)
  if (result) {
    usedSpecialist = 'script'
  }

  // 3. Ollama local — free, fast
  if (!result && models.ollama) {
    result = await tryOllama(req, models.ollama, timeoutMs)
    if (!result) {
      // Document handoff — Ollama was unavailable or timed out
      progressLog.push({
        specialist: 'ollama',
        startedAt: Date.now(),
        reasonForHandoff: 'unavailable',
        handoffNote: `Ollama model ${models.ollama} not available — passing to free tier`,
      })
      handoffs++
    } else {
      usedSpecialist = 'ollama'
    }
  }

  // 4. Free tier — staggered 300ms after start
  if (!result && models.freeTier) {
    const elapsed = Date.now() - start
    if (elapsed < 300) await new Promise(r => setTimeout(r, 300 - elapsed))

    result = await tryFreeTier(req, models.freeTier, timeoutMs)
    if (!result) {
      progressLog.push({
        specialist: 'free-tier',
        startedAt: Date.now(),
        reasonForHandoff: 'error',
        handoffNote: `Free tier ${models.freeTier} failed — context preserved, passing to subscription`,
      })
      handoffs++
    } else {
      usedSpecialist = 'free-tier'
    }
  }

  // 5. Subscription — staggered 800ms after start
  if (!result) {
    const elapsed = Date.now() - start
    if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed))

    result = await trySubscription(req, models.subscription, timeoutMs * 2)
    if (result) usedSpecialist = 'subscription'
  }

  if (!result) {
    log.error(`All specialists failed for task: ${req.task}`)
    await appendEvent({ type: 'orchestrate_failed', data: { task: req.task, handoffs } })
    return { ok: false, content: '', specialist: 'pay', durationMs: Date.now() - start, fromCache: false, handoffs }
  }

  // Cache the result
  if (!req.skipCache) {
    await semanticCache.set(req.prompt, result)
  }

  await appendEvent({ type: 'orchestrate_done', data: { task: req.task, specialist: usedSpecialist, handoffs } })

  return {
    ok: true,
    content: result,
    specialist: usedSpecialist,
    durationMs: Date.now() - start,
    fromCache: false,
    handoffs,
    progressLog: progressLog.length ? progressLog.map(p => p.handoffNote).join(' → ') : undefined,
  }
}
