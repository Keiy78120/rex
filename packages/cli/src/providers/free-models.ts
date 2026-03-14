/**
 * REX Free Model Catalog
 * @module BUDGET
 *
 * Authoritative catalog of all known free/local LLM models and their limits.
 * Updated periodically — entries sourced from provider docs + WebSearch.
 *
 * Used by:
 *  - router.ts  — picks the best available model for a task
 *  - providers.ts — exposes limits to the UI
 *  - free-tiers.ts — validates rotation targets
 *
 * Last updated: 2026-03-08
 */

// ── Types ──────────────────────────────────────────────────────────

export type ModelCapability = 'chat' | 'code' | 'fast' | 'reasoning' | 'embed' | 'vision'
export type ModelStatus = 'active' | 'beta' | 'deprecated' | 'unknown'
export type ProviderTier = 'local' | 'free-tier' | 'subscription' | 'pay-per-use'

export interface ModelLimits {
  rpmLimit: number       // requests per minute (0 = unlimited)
  tpmLimit: number       // tokens per minute  (0 = unlimited)
  dailyQuota: number     // requests per day   (0 = unlimited)
  monthlyTokens: number  // tokens per month   (0 = unlimited)
}

export interface FreeModel {
  provider: string
  modelId: string
  displayName: string
  contextWindow: number
  maxOutputTokens: number
  capabilities: ModelCapability[]
  limits: ModelLimits
  tier: ProviderTier
  status: ModelStatus
  costPerMToken: number  // USD per million output tokens (0 = free)
  notes?: string
}

// ── Local models (Ollama) — unlimited, free ────────────────────────

const OLLAMA_MODELS: FreeModel[] = [
  {
    provider: 'Ollama',
    modelId: 'qwen3.5:latest',
    displayName: 'Qwen 3.5 (latest)',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Ollama',
    modelId: 'qwen3.5:9b',
    displayName: 'Qwen 3.5 9B',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code', 'reasoning'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Ollama',
    modelId: 'qwen2.5:1.5b',
    displayName: 'Qwen 2.5 1.5B (fast)',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
    notes: 'Best for quick classification/categorization tasks',
  },
  {
    provider: 'Ollama',
    modelId: 'qwen2.5-coder:7b',
    displayName: 'Qwen 2.5 Coder 7B',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: ['code'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Ollama',
    modelId: 'deepseek-r1:8b',
    displayName: 'DeepSeek R1 8B',
    contextWindow: 32768,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'reasoning'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
    notes: 'Best for reasoning/planning tasks',
  },
  {
    provider: 'Ollama',
    modelId: 'llama3.2:3b',
    displayName: 'Llama 3.2 3B (fast)',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Ollama',
    modelId: 'nomic-embed-text',
    displayName: 'Nomic Embed Text',
    contextWindow: 8192,
    maxOutputTokens: 0,
    capabilities: ['embed'],
    limits: { rpmLimit: 0, tpmLimit: 0, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'local',
    status: 'active',
    costPerMToken: 0,
    notes: 'Used for memory semantic search',
  },
]

// ── Groq — free tier with hard rate limits ─────────────────────────

const GROQ_MODELS: FreeModel[] = [
  {
    provider: 'Groq',
    modelId: 'llama-3.1-8b-instant',
    displayName: 'Llama 3.1 8B Instant',
    contextWindow: 131072,
    maxOutputTokens: 8000,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 30, tpmLimit: 6000, dailyQuota: 14400, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Fastest free option for quick tasks',
  },
  {
    provider: 'Groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B Versatile',
    contextWindow: 128000,
    maxOutputTokens: 32768,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 30, tpmLimit: 6000, dailyQuota: 14400, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Best free model for complex coding tasks on Groq',
  },
  {
    provider: 'Groq',
    modelId: 'qwen-qwq-32b',
    displayName: 'Qwen QwQ 32B',
    contextWindow: 131072,
    maxOutputTokens: 16000,
    capabilities: ['chat', 'reasoning'],
    limits: { rpmLimit: 30, tpmLimit: 6000, dailyQuota: 14400, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Strong reasoning model available on Groq free tier',
  },
  {
    provider: 'Groq',
    modelId: 'gemma2-9b-it',
    displayName: 'Gemma 2 9B',
    contextWindow: 8192,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 30, tpmLimit: 15000, dailyQuota: 14400, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
]

// ── Cerebras — very fast inference, free tier ──────────────────────

const CEREBRAS_MODELS: FreeModel[] = [
  {
    provider: 'Cerebras',
    modelId: 'llama3.1-8b',
    displayName: 'Llama 3.1 8B (Cerebras)',
    contextWindow: 8192,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 30, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 1000000 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Ultra-fast inference, great for latency-sensitive tasks',
  },
  {
    provider: 'Cerebras',
    modelId: 'llama3.3-70b',
    displayName: 'Llama 3.3 70B (Cerebras)',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 30, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 1000000 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Cerebras',
    modelId: 'qwen-3-32b',
    displayName: 'Qwen 3 32B (Cerebras)',
    contextWindow: 32768,
    maxOutputTokens: 16000,
    capabilities: ['chat', 'code', 'reasoning'],
    limits: { rpmLimit: 30, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 1000000 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
]

// ── Together AI — generous free tier ──────────────────────────────

const TOGETHER_MODELS: FreeModel[] = [
  {
    provider: 'Together AI',
    modelId: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
    displayName: 'Llama 3.2 11B Vision',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    capabilities: ['chat', 'vision', 'fast'],
    limits: { rpmLimit: 60, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Free for limited usage; vision capable',
  },
  {
    provider: 'Together AI',
    modelId: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    displayName: 'Qwen 2.5 72B Instruct Turbo',
    contextWindow: 32768,
    maxOutputTokens: 4096,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 60, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'Together AI',
    modelId: 'deepseek-ai/DeepSeek-V3',
    displayName: 'DeepSeek V3 (Together)',
    contextWindow: 131072,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 60, tpmLimit: 60000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
]

// ── Mistral — free tier (conservative limits) ──────────────────────

const MISTRAL_MODELS: FreeModel[] = [
  {
    provider: 'Mistral',
    modelId: 'mistral-small-latest',
    displayName: 'Mistral Small',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 2, tpmLimit: 50000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Very low RPM limit — use sparingly',
  },
  {
    provider: 'Mistral',
    modelId: 'codestral-latest',
    displayName: 'Codestral',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    capabilities: ['code'],
    limits: { rpmLimit: 2, tpmLimit: 50000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Code-specialized, very low RPM — use for high-value code tasks only',
  },
]

// ── OpenRouter — free models (marked :free) ────────────────────────

const OPENROUTER_MODELS: FreeModel[] = [
  {
    provider: 'OpenRouter',
    modelId: 'meta-llama/llama-3.3-70b-instruct:free',
    displayName: 'Llama 3.3 70B (OpenRouter Free)',
    contextWindow: 131072,
    maxOutputTokens: 4096,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 20, tpmLimit: 40000, dailyQuota: 50, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Limited daily quota; fallback use only',
  },
  {
    provider: 'OpenRouter',
    modelId: 'google/gemma-3-27b-it:free',
    displayName: 'Gemma 3 27B (OpenRouter Free)',
    contextWindow: 96000,
    maxOutputTokens: 4096,
    capabilities: ['chat'],
    limits: { rpmLimit: 20, tpmLimit: 40000, dailyQuota: 50, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
  },
  {
    provider: 'OpenRouter',
    modelId: 'deepseek/deepseek-r1:free',
    displayName: 'DeepSeek R1 (OpenRouter Free)',
    contextWindow: 163840,
    maxOutputTokens: 8192,
    capabilities: ['reasoning'],
    limits: { rpmLimit: 20, tpmLimit: 40000, dailyQuota: 50, monthlyTokens: 0 },
    tier: 'free-tier',
    status: 'active',
    costPerMToken: 0,
    notes: 'Best free reasoning model on OpenRouter',
  },
]

// ── DeepSeek — subscription but very cheap ────────────────────────

const DEEPSEEK_MODELS: FreeModel[] = [
  {
    provider: 'DeepSeek',
    modelId: 'deepseek-chat',
    displayName: 'DeepSeek Chat (V3)',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 60, tpmLimit: 100000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'pay-per-use',
    status: 'active',
    costPerMToken: 1.1,
    notes: 'Very cheap — ~$1.1/M output tokens. Good pay-per-use option.',
  },
  {
    provider: 'DeepSeek',
    modelId: 'deepseek-reasoner',
    displayName: 'DeepSeek Reasoner (R1)',
    contextWindow: 64000,
    maxOutputTokens: 8192,
    capabilities: ['reasoning'],
    limits: { rpmLimit: 60, tpmLimit: 100000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'pay-per-use',
    status: 'active',
    costPerMToken: 2.19,
    notes: 'Cheap reasoning model — ~$2.19/M output tokens.',
  },
]

// ── Subscription models (Claude Max, ChatGPT Plus) ─────────────────

const SUBSCRIPTION_MODELS: FreeModel[] = [
  {
    provider: 'Anthropic',
    modelId: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    contextWindow: 200000,
    maxOutputTokens: 32768,
    capabilities: ['chat', 'code', 'reasoning'],
    limits: { rpmLimit: 5, tpmLimit: 40000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'subscription',
    status: 'active',
    costPerMToken: 0,
    notes: 'Claude Max subscription — use for architecture and review only',
  },
  {
    provider: 'Anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    maxOutputTokens: 16384,
    capabilities: ['chat', 'code'],
    limits: { rpmLimit: 10, tpmLimit: 80000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'subscription',
    status: 'active',
    costPerMToken: 0,
    notes: 'Claude Max subscription — primary coding model',
  },
  {
    provider: 'Anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    capabilities: ['chat', 'fast'],
    limits: { rpmLimit: 25, tpmLimit: 100000, dailyQuota: 0, monthlyTokens: 0 },
    tier: 'subscription',
    status: 'active',
    costPerMToken: 0,
    notes: 'Claude Max subscription — fast tasks, classification, reading',
  },
]

// ── Full catalog ───────────────────────────────────────────────────

export const FREE_MODELS: FreeModel[] = [
  ...OLLAMA_MODELS,
  ...GROQ_MODELS,
  ...CEREBRAS_MODELS,
  ...TOGETHER_MODELS,
  ...MISTRAL_MODELS,
  ...OPENROUTER_MODELS,
  ...DEEPSEEK_MODELS,
  ...SUBSCRIPTION_MODELS,
]

// ── Query helpers ──────────────────────────────────────────────────

/** Return all models from a specific provider */
export function getModelsByProvider(provider: string): FreeModel[] {
  return FREE_MODELS.filter(m => m.provider.toLowerCase() === provider.toLowerCase())
}

/** Return models matching all given capabilities */
export function getModelsByCapability(...caps: ModelCapability[]): FreeModel[] {
  return FREE_MODELS.filter(m =>
    caps.every(c => m.capabilities.includes(c))
  )
}

/** Return all free or local models (excludes subscription and pay-per-use) */
export function getFreeAndLocalModels(): FreeModel[] {
  return FREE_MODELS.filter(m => m.tier === 'local' || m.tier === 'free-tier')
}

/** Return models by tier in routing order */
export function getModelsByTierOrder(): FreeModel[] {
  const tierOrder: ProviderTier[] = ['local', 'free-tier', 'subscription', 'pay-per-use']
  return [...FREE_MODELS].sort(
    (a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier)
  )
}

/**
 * Pick the best model for a task.
 * Priority: local → free → subscription → paid.
 * Filtered by required capabilities.
 */
export function pickBestModel(
  caps: ModelCapability[],
  excludeProviders: string[] = [],
): FreeModel | null {
  const ordered = getModelsByTierOrder()
  return ordered.find(m =>
    m.status === 'active' &&
    !excludeProviders.includes(m.provider) &&
    caps.every(c => m.capabilities.includes(c))
  ) ?? null
}

/** Get RPM limit for a model (0 = unlimited) */
export function getModelRpm(provider: string, modelId: string): number {
  const m = FREE_MODELS.find(m => m.provider === provider && m.modelId === modelId)
  return m?.limits.rpmLimit ?? 60
}

/** Summary table for CLI display */
export function getModelsSummary(): Array<{
  provider: string
  model: string
  tier: ProviderTier
  context: number
  caps: string
  rpm: number | string
  costPerMToken: number
}> {
  return FREE_MODELS
    .filter(m => m.status === 'active')
    .map(m => ({
      provider: m.provider,
      model: m.displayName,
      tier: m.tier,
      context: m.contextWindow,
      caps: m.capabilities.join(', '),
      rpm: m.limits.rpmLimit === 0 ? '∞' : m.limits.rpmLimit,
      costPerMToken: m.costPerMToken,
    }))
}
