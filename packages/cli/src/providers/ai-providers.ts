/**
 * REX AI Providers — Unified SDK configuration
 *
 * Three distinct SDKs, each with its own role:
 *
 *  1. Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`)
 *     → Unified streaming, generateText, streamText — works across providers
 *     → Used for quick generations where we don't need agent loops
 *
 *  2. OpenAI Agents SDK (`@openai/agents`)
 *     → Full agent loop with tool-calling for GPT models
 *     → Used for multi-step reasoning, tool-heavy tasks
 *
 *  3. OpenAI SDK (`openai`)
 *     → Direct API access: fine-tuning, embeddings, files, batch
 *     → Also backing store for @openai/agents
 *
 * Claude Code / orchestrator relay handles Anthropic models in gateway
 * when we want Claude Code's session/tool context rather than pure API.
 *
 * API keys are read from env (set via Flutter Settings → OpenAI tab):
 *   OPENAI_API_KEY       — OpenAI
 *   ANTHROPIC_API_KEY    — Anthropic direct
 *   REX_OPENAI_MODEL     — default GPT model (gpt-4o-mini by default)
 *   REX_ANTHROPIC_MODEL  — default Anthropic model (claude-haiku-4-5 by default)
 *
 * @module PROVIDERS
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import OpenAI from 'openai'
import type { LanguageModel } from 'ai'

// ─── Constants ────────────────────────────────────────────────────────────────

export const GPT_MODELS = [
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o3',
  'o4-mini',
] as const

export const ANTHROPIC_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const

export type GptModel = typeof GPT_MODELS[number]
export type AnthropicModel = typeof ANTHROPIC_MODELS[number]

export const DEFAULT_GPT_MODEL: GptModel = 'gpt-4o-mini'
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = 'claude-haiku-4-5'

// ─── 1. Vercel AI SDK providers ───────────────────────────────────────────────

/**
 * Vercel AI SDK OpenAI provider.
 * Usage: `const model = openaiProvider('gpt-4o-mini')`
 *        then `generateText({ model, prompt: '...' })`
 */
export function makeOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return createOpenAI({ apiKey, compatibility: 'strict' })
}

/**
 * Vercel AI SDK Anthropic provider.
 * Usage: `const model = anthropicProvider('claude-haiku-4-5')`
 *        then `generateText({ model, messages })`
 */
export function makeAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return createAnthropic({ apiKey })
}

/**
 * Get the default Vercel AI SDK model for a provider.
 * Returns null if the API key is not configured.
 */
export function getVercelModel(
  provider: 'openai' | 'anthropic',
  modelId?: string,
): LanguageModel | null {
  if (provider === 'openai') {
    const p = makeOpenAIProvider()
    if (!p) return null
    return p(modelId ?? process.env.REX_OPENAI_MODEL ?? DEFAULT_GPT_MODEL) as unknown as LanguageModel
  }
  if (provider === 'anthropic') {
    const p = makeAnthropicProvider()
    if (!p) return null
    return p(modelId ?? process.env.REX_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL) as unknown as LanguageModel
  }
  return null
}

// ─── 2. OpenAI Agents SDK ─────────────────────────────────────────────────────

/**
 * Get the OpenAI client configured for the Agents SDK.
 * The `@openai/agents` Runner uses this internally when OPENAI_API_KEY is set.
 *
 * Import Agent/Runner/tool from '@openai/agents' directly in your module.
 * Set the OPENAI_API_KEY env before calling Runner.run().
 *
 * Example:
 *   import { Agent, Runner, tool } from '@openai/agents'
 *   const agent = new Agent({ name: 'REX', model: 'gpt-4o-mini', instructions: '...' })
 *   const result = await Runner.run(agent, 'What is 2+2?')
 */
export function isOpenAIAgentsReady(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

// ─── 3. Plain OpenAI SDK client ───────────────────────────────────────────────

let _openaiClient: OpenAI | null = null

/**
 * Get (or create) the singleton OpenAI SDK client.
 * Used for: fine-tuning, embeddings, file uploads, direct completions.
 * Returns null if OPENAI_API_KEY is not set.
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!_openaiClient) {
    _openaiClient = new OpenAI({ apiKey })
  }
  return _openaiClient
}

/** Reset the cached client (e.g. after API key change) */
export function resetOpenAIClient(): void {
  _openaiClient = null
}

// ─── Provider status ──────────────────────────────────────────────────────────

export interface AIProviderStatus {
  openai: { configured: boolean; model: string; agentsReady: boolean }
  anthropic: { configured: boolean; model: string }
  vercel: { openaiProvider: boolean; anthropicProvider: boolean }
}

export function getAIProviderStatus(): AIProviderStatus {
  return {
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.REX_OPENAI_MODEL ?? DEFAULT_GPT_MODEL,
      agentsReady: isOpenAIAgentsReady(),
    },
    anthropic: {
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.REX_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    },
    vercel: {
      openaiProvider: Boolean(process.env.OPENAI_API_KEY),
      anthropicProvider: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  }
}

/**
 * Print AI provider status to stdout.
 */
export function printAIProviderStatus(json = false): void {
  const status = getAIProviderStatus()
  if (json) {
    console.log(JSON.stringify(status, null, 2))
    return
  }

  const ok = (b: boolean) => b ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log('\n\x1b[1mREX AI Providers\x1b[0m')
  console.log('─'.repeat(44))
  console.log(`  ${ok(status.openai.configured)} OpenAI API          model: ${status.openai.model}`)
  console.log(`  ${ok(status.openai.agentsReady)} OpenAI Agents SDK   (same key)`)
  console.log(`  ${ok(status.anthropic.configured)} Anthropic API       model: ${status.anthropic.model}`)
  console.log(`  ${ok(status.vercel.openaiProvider)} Vercel/OpenAI       (ai SDK)`)
  console.log(`  ${ok(status.vercel.anthropicProvider)} Vercel/Anthropic    (ai SDK)`)
  console.log()

  if (!status.openai.configured) {
    console.log('  Set OPENAI_API_KEY in ~/.claude/settings.json → env')
    console.log('  or via: rex settings → Settings → OpenAI tab')
  }
  if (!status.anthropic.configured) {
    console.log('  Set ANTHROPIC_API_KEY for direct Anthropic API access')
    console.log('  (Claude Code orchestrator works without it via oauth)')
  }
  console.log()
}
