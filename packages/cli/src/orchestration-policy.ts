/**
 * REX Orchestration Policy
 *
 * Decision tree for routing any request through the right model tier.
 * Zero LLM calls for routing itself — pure heuristics + signal detection.
 *
 * ─── Tiers (preference order) ────────────────────────────────────────────────
 *
 *  0. SCRIPT      — instant, 0 tokens, 0 cost
 *                   Triggers: git ops, file reads, CLI commands, memory search,
 *                             health checks, status, doctor, build, tests
 *
 *  1. LOCAL       — Ollama, fast (<3s), 0 cost, privacy-safe
 *                   Triggers: summaries, categorize, gateway chat, code review,
 *                             quick Q&A, translate, explain
 *                   Models: qwen2.5:1.5b (bg) → qwen3.5:9b (general) → qwen3-coder:30b (code)
 *
 *  2. FREE_TIER   — Groq/Cerebras/Together, ~same as LOCAL, 0 cost
 *                   Triggers: Ollama offline / overloaded
 *
 *  3. SONNET      — Claude subscription, <10s, capable
 *                   Triggers: complex code, cross-file refactoring, nuanced answers,
 *                             orchestration of standard tasks, PR reviews
 *
 *  4. OPUS        — Claude subscription, ~30s, expensive — use sparingly
 *                   Triggers: architecture decisions, multi-step planning,
 *                             entire codebase analysis, agent orchestration,
 *                             any task with "design|architect|strategy|refactor entire"
 *                   Budget guard: max 3 calls/day (configurable)
 *
 *  5. CODEX       — background worker, non-interactive, file modifications
 *                   Triggers: any non-interactive code task, context >80%,
 *                             parallel tasks in worktrees, batch file edits
 *
 * ─── Interconnection (without token waste) ───────────────────────────────────
 *
 *  REX (Tier 0 scripts) → detects intent (0 LLM) → picks tier
 *  Local model (Tier 1) → can call REX tools (memory, git, files)
 *  Sonnet (Tier 3)      → orchestrates LOCAL tasks, never re-reads context
 *  Opus (Tier 4)        → produces a PLAN → Sonnet executes the plan
 *  Codex (Tier 5)       → receives specific file+task spec from Sonnet/Opus
 *
 *  Memory is shared via REX (SQLite + embeddings), not re-sent to each model.
 *  Tools are injected by REX, not explained in system prompts.
 *
 * @module AGENTS
 */

import { detectIntent } from './project-intent.js'
import { pickModel } from './router.js'
import { createLogger } from './logger.js'

const log = createLogger('AGENTS:policy')

// ── Types ──────────────────────────────────────────────────────────────────

export type OrchestrationTier = 'script' | 'local' | 'free-tier' | 'sonnet' | 'opus' | 'codex'

export interface RoutingDecision {
  tier: OrchestrationTier
  model: string
  reason: string
  estimatedCost: 'free' | 'subscription-low' | 'subscription-high'
  confidence: number // 0-1
}

// ── Trigger keyword sets ───────────────────────────────────────────────────

const SCRIPT_TRIGGERS = /\b(git|status|doctor|health|build|test|run|start|stop|restart|install|check|logs?|list|show)\b/i
const MEMORY_TRIGGERS = /\b(search|find|recall|remember|lookup|memory|what did)\b/i

const OPUS_TRIGGERS = /\b(architect|architecture|design|redesign|strategy|strategic|refactor entire|rewrite|plan|roadmap|audit entire|analyze all|complex agent|orchestrat)\b/i
const CODEX_TRIGGERS = /\b(modify files?|edit files?|batch|parallel|background|non.interactive|worktree|auto.fix|generate .* files?)\b/i

const LOCAL_MAX_TOKENS = 2000  // if message > this, skip local (context window)
const OPUS_DAILY_LIMIT = 3     // max Opus calls per day

// ── Daily Opus budget ─────────────────────────────────────────────────────

const _opusCalls: Map<string, number> = new Map()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function canCallOpus(): boolean {
  const today = todayKey()
  return (_opusCalls.get(today) ?? 0) < OPUS_DAILY_LIMIT
}

function recordOpusCall(): void {
  const today = todayKey()
  _opusCalls.set(today, (_opusCalls.get(today) ?? 0) + 1)
}

// ── Routing ────────────────────────────────────────────────────────────────

/**
 * Main routing function. Pure heuristics, 0 LLM calls.
 *
 * @param message  The user message / task description
 * @param opts.ollamaAvailable  Pre-checked Ollama reachability (optional)
 * @param opts.contextPercent   Current context window usage (0-100)
 * @param opts.forceModel       Override (e.g. 'claude-opus-4-6')
 */
export async function routeRequest(
  message: string,
  opts: {
    ollamaAvailable?: boolean
    contextPercent?: number
    forceModel?: string
  } = {}
): Promise<RoutingDecision> {

  // ── Force override ───────────────────────────────────────────────────────
  if (opts.forceModel) {
    return {
      tier: forceModelToTier(opts.forceModel),
      model: opts.forceModel,
      reason: `forced: ${opts.forceModel}`,
      estimatedCost: opts.forceModel.includes('opus') ? 'subscription-high' : 'subscription-low',
      confidence: 1,
    }
  }

  const msg = message.toLowerCase()
  const msgLen = message.length

  // ── Tier 0: Script / CLI op ──────────────────────────────────────────────
  if (SCRIPT_TRIGGERS.test(msg) && msgLen < 200) {
    return { tier: 'script', model: 'none', reason: 'script/CLI op', estimatedCost: 'free', confidence: 0.9 }
  }
  if (MEMORY_TRIGGERS.test(msg)) {
    return { tier: 'script', model: 'none', reason: 'memory search (SQL)', estimatedCost: 'free', confidence: 0.85 }
  }

  // ── Tier 5: Codex (background / context overflow) ───────────────────────
  if (CODEX_TRIGGERS.test(msg)) {
    return { tier: 'codex', model: 'codex', reason: 'file modification / parallel task', estimatedCost: 'free', confidence: 0.85 }
  }
  if ((opts.contextPercent ?? 0) > 80) {
    return { tier: 'codex', model: 'codex', reason: 'context >80%, offload to Codex', estimatedCost: 'free', confidence: 0.9 }
  }

  // ── Tier 4: Opus (architecture / orchestration) ──────────────────────────
  if (OPUS_TRIGGERS.test(msg)) {
    if (canCallOpus()) {
      recordOpusCall()
      return { tier: 'opus', model: 'claude-opus-4-6', reason: 'architecture/strategy keyword', estimatedCost: 'subscription-high', confidence: 0.9 }
    } else {
      log.warn('Opus daily limit reached, falling back to Sonnet')
      return { tier: 'sonnet', model: 'claude-sonnet-4-6', reason: 'Opus daily limit hit, Sonnet fallback', estimatedCost: 'subscription-low', confidence: 0.7 }
    }
  }

  // ── Tier 3: Sonnet (complex / cross-file / nuanced) ──────────────────────
  const intent = await detectIntent(process.cwd()).catch(() => null)
  const isComplex = msgLen > 800 || (intent?.intent === 'review' || intent?.intent === 'architect')
  if (isComplex) {
    return { tier: 'sonnet', model: 'claude-sonnet-4-6', reason: 'complex/nuanced task', estimatedCost: 'subscription-low', confidence: 0.8 }
  }

  // ── Tier 1: Local (Ollama) ────────────────────────────────────────────────
  const ollamaUp = opts.ollamaAvailable ?? await checkOllamaAlive()
  if (ollamaUp && msgLen < LOCAL_MAX_TOKENS) {
    const task = inferTaskType(msg)
    const model = await pickModel(task as Parameters<typeof pickModel>[0])
    return { tier: 'local', model, reason: `local model for ${task}`, estimatedCost: 'free', confidence: 0.85 }
  }

  // ── Tier 2: Free tier (Ollama offline) ────────────────────────────────────
  if (!ollamaUp) {
    return { tier: 'free-tier', model: 'groq/llama-3.1-70b', reason: 'Ollama offline → free tier API', estimatedCost: 'free', confidence: 0.75 }
  }

  // ── Fallback: Sonnet ──────────────────────────────────────────────────────
  return { tier: 'sonnet', model: 'claude-sonnet-4-6', reason: 'default fallback', estimatedCost: 'subscription-low', confidence: 0.6 }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function checkOllamaAlive(): Promise<boolean> {
  try {
    const url = process.env.OLLAMA_URL ?? 'http://localhost:11434'
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

function inferTaskType(msg: string): string {
  if (/\b(code|function|class|implement|fix bug|debug)\b/i.test(msg)) return 'code'
  if (/\b(review|check|lint|audit)\b/i.test(msg)) return 'optimize'
  if (/\b(think|reason|why|how does|explain complex)\b/i.test(msg)) return 'reason'
  if (/\b(summarize|categorize|classify|tag)\b/i.test(msg)) return 'categorize'
  return 'gateway'
}

function forceModelToTier(model: string): OrchestrationTier {
  if (model.includes('opus')) return 'opus'
  if (model.includes('sonnet') || model.includes('claude')) return 'sonnet'
  if (model === 'codex') return 'codex'
  return 'local'
}

/**
 * Human-readable description of the routing policy.
 * Shown in `rex route --explain`.
 */
export function explainPolicy(): void {
  const lines = [
    '',
    '\x1b[1m REX Orchestration Policy\x1b[0m',
    '─'.repeat(58),
    '',
    '  \x1b[32m●\x1b[0m Tier 0 · SCRIPT     git, file ops, memory SQL, health     → \x1b[2minstant, 0 tokens\x1b[0m',
    '  \x1b[32m●\x1b[0m Tier 1 · LOCAL      Ollama (qwen, deepseek, qwen3-coder)  → \x1b[2m<3s, 0 cost\x1b[0m',
    '  \x1b[32m●\x1b[0m Tier 2 · FREE TIER  Groq/Cerebras (Ollama offline)        → \x1b[2m<5s, 0 cost\x1b[0m',
    '  \x1b[33m●\x1b[0m Tier 3 · SONNET     Complex code, cross-file, nuanced     → \x1b[2msubscription, fast\x1b[0m',
    '  \x1b[31m●\x1b[0m Tier 4 · OPUS       Architecture, strategy, orchestration → \x1b[2msubscription, expensive (max 3/day)\x1b[0m',
    '  \x1b[34m●\x1b[0m Tier 5 · CODEX      Background, file mods, context >80%   → \x1b[2mnon-interactive, parallel-safe\x1b[0m',
    '',
    '  \x1b[2mInterconnection:\x1b[0m',
    '  Opus → produces PLAN → Sonnet executes → Local handles subtasks',
    '  All tiers share REX memory (SQLite) and tools via tool-adapter',
    '  Tools injected by REX, not explained in each model\'s system prompt',
    '',
    '  \x1b[2mZero-token routing: heuristics only, no LLM call to pick tier\x1b[0m',
    '',
  ]
  console.log(lines.join('\n'))
}

/**
 * Route and explain the decision for a specific message.
 * Used by `rex route "<message>"`.
 */
export async function routeAndExplain(message: string, opts: Parameters<typeof routeRequest>[1] = {}): Promise<void> {
  const decision = await routeRequest(message, opts)
  const tierColor: Record<OrchestrationTier, string> = {
    script: '\x1b[32m',
    local: '\x1b[32m',
    'free-tier': '\x1b[32m',
    sonnet: '\x1b[33m',
    opus: '\x1b[31m',
    codex: '\x1b[34m',
  }
  const c = tierColor[decision.tier]
  console.log(`\n  ${c}●\x1b[0m  \x1b[1m${decision.tier.toUpperCase()}\x1b[0m  →  ${decision.model}`)
  console.log(`     Reason: ${decision.reason}`)
  console.log(`     Cost: ${decision.estimatedCost}   Confidence: ${Math.round(decision.confidence * 100)}%\n`)
}
