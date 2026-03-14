/**
 * REX Identity Layer
 *
 * Implements the 5-step pipeline before any LLM call in the gateway:
 *   1. Memory search  — semantic context from past sessions
 *   2. Event journal  — recent system events (last 5)
 *   3. Intent scripts — detect what REX can answer without LLM
 *   4. Script-first   — answer directly from CLI/data if possible (0 LLM)
 *   5. LLM via orchestrator — only when scripts cannot answer
 *
 * REX always responds in its own name. LLM is an internal tool.
 * @see docs/plans/action.md §REX IDENTITY
 * @module IDENTITY
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from '../logger.js'
import { getRelevantSignals } from '../curious.js'

const log = createLogger('IDENTITY:rex-identity')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RexContext {
  message: string
  memorySnippets: string[]
  recentEvents: string[]
  intent: string
  openLoopSignals: string[]
  projectCwd: string
}

export interface RexIdentityResult {
  response: string
  usedLLM: boolean
  scriptAnswer: string | null
  model?: string
  durationMs: number
}

// ── Script-first patterns (regex → CLI command or handler) ─────────────────────

interface ScriptRule {
  pattern: RegExp
  handler: (match: RegExpMatchArray, message: string) => string | null
}

const SCRIPT_RULES: ScriptRule[] = [
  // Status / health
  {
    pattern: /\b(status|health|doctor|how are you|état|santé)\b/i,
    handler: () => runRex(['doctor', '--json'], 'doctor'),
  },
  // Memory search
  {
    pattern: /\b(search|cherche|find|trouve|remember|souviens|memory|mémoire)\b[:\s]+(.{3,})/i,
    handler: (m) => {
      const query = m[2]?.trim()
      if (!query) return null
      return runRex(['search', query, '--limit=5', '--json'], 'search')
    },
  },
  // Budget / tokens
  {
    pattern: /\b(budget|token|burn|cost|coût|dépense)\b/i,
    handler: () => runRex(['budget', '--json'], 'budget'),
  },
  // Providers
  {
    pattern: /\b(providers?|provider|fournisseur|available models?)\b/i,
    handler: () => runRex(['providers', '--json'], 'providers'),
  },
  // Logs
  {
    pattern: /\b(logs?|log|journal|erreur|error|warning)\b/i,
    handler: () => runRex(['logs', '--lines=20'], 'logs'),
  },
  // Hub / network nodes
  {
    pattern: /\b(nodes?|fleet|hub|réseau|network|cluster)\b/i,
    handler: () => runRex(['hub', 'status', '--json'], 'hub-status'),
  },
  // Projects
  {
    pattern: /\b(projects?|projet|repos?)\b/i,
    handler: () => runRex(['projects', '--json'], 'projects'),
  },
  // Discoveries / curious
  {
    pattern: /\b(curious|discover|new models?|trending|news|actualité)\b/i,
    handler: () => runRex(['curious', '--json'], 'curious'),
  },
  // Monitor / activity
  {
    pattern: /\b(monitor|activity|activité|commits?|sessions?)\b/i,
    handler: () => runRex(['monitor', '--json'], 'monitor'),
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function findRexBin(): string {
  const candidates = [
    join(homedir(), '.nvm', 'versions', 'node', 'v22.20.0', 'bin', 'rex'),
    join(homedir(), '.local', 'bin', 'rex'),
    '/usr/local/bin/rex',
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return 'rex'
}

const REX_BIN = findRexBin()

function runRex(args: string[], label: string): string | null {
  try {
    const out = execFileSync(REX_BIN, args, {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return null
    // If JSON requested, parse and summarise top-level shape
    if (args.includes('--json')) {
      try {
        const parsed = JSON.parse(out)
        return JSON.stringify(parsed, null, 2).slice(0, 2000)
      } catch {}
    }
    return out.slice(0, 2000)
  } catch (err) {
    log.debug(`script-first(${label}) failed: ${(err as Error).message?.slice(0, 80)}`)
    return null
  }
}

function searchMemory(query: string): string[] {
  try {
    const out = execFileSync(REX_BIN, ['search', query, '--limit=3', '--json'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out || out === '[]') return []
    const results = JSON.parse(out) as Array<{ content?: string; text?: string }>
    return results
      .slice(0, 3)
      .map(r => (r.content ?? r.text ?? '').slice(0, 250))
      .filter(Boolean)
  } catch {
    return []
  }
}

function getRecentEvents(limit = 5): string[] {
  try {
    const out = execFileSync(REX_BIN, ['events', '--limit', String(limit), '--json'], {
      encoding: 'utf-8',
      timeout: 8_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return []
    const events = JSON.parse(out) as Array<{ type?: string; payload?: Record<string, unknown>; createdAt?: string }>
    return events.slice(0, limit).map(e =>
      `[${e.type ?? '?'}] ${JSON.stringify(e.payload ?? {}).slice(0, 80)} @ ${(e.createdAt ?? '').slice(0, 16)}`
    )
  } catch {
    return []
  }
}

// Canonical INTENT_MAP from REX-BRAIN.md §4 — regex only, 0 LLM, 0ms
const INTENT_MAP: Record<string, RegExp> = {
  search:   /cherch|search|trouv|find|quoi|what|qui|who|montre|show/i,
  create:   /crée|create|nouveau|new|génères?|generate|écris|write|fais/i,
  fix:      /fix|corrig|répare|bug|erreur|error|casse|broken/i,
  status:   /status|état|comment|how|avance|progress|où en|done/i,
  schedule: /planifi|schedule|rappel|reminder|demain|tomorrow|agenda|rdv/i,
  budget:   /budget|coût|prix|combien|facture|dépense|cost/i,
  deploy:   /deploy|lance|start|démarre|installe|run/i,
  memory:   /souviens|remember|rappelle|note|mémorise|oublie/i,
  fleet:    /machine|appareil|mac|vps|pc|fleet|node/i,
  // extended intents for script-first routing
  code:     /\bcode|implement|refactor|build|debug\b/i,
  review:   /\breview|analyze|audit|inspect\b/i,
}

function detectMessageIntent(message: string): string {
  for (const [intent, pattern] of Object.entries(INTENT_MAP)) {
    if (pattern.test(message)) return intent
  }
  return 'general'
}

// ── 5-step REX Identity Pipeline ──────────────────────────────────────────────

/**
 * Step 1+2+3: Build the REX context for a given message.
 * Runs in parallel: memory search + event journal + OPEN_LOOP signal lookup.
 */
export async function buildRexContext(message: string): Promise<RexContext> {
  const [memorySnippets, recentEvents, openLoopSignals] = await Promise.all([
    Promise.resolve(searchMemory(message)),
    Promise.resolve(getRecentEvents(5)),
    Promise.resolve(getRelevantSignals(message).map(s => s.title + ': ' + s.detail)),
  ])

  return {
    message,
    memorySnippets,
    recentEvents,
    intent: detectMessageIntent(message),
    openLoopSignals,
    projectCwd: process.cwd(),
  }
}

/**
 * Step 4: Try to answer directly from scripts/CLI — zero LLM.
 * Returns a formatted response string, or null if LLM is needed.
 */
export function tryScriptFirst(ctx: RexContext): string | null {
  const { message } = ctx

  for (const rule of SCRIPT_RULES) {
    const match = message.match(rule.pattern)
    if (match) {
      const result = rule.handler(match, message)
      if (result) {
        log.info(`identity: script-first matched pattern ${rule.pattern.toString().slice(0, 40)}`)
        return result
      }
    }
  }

  return null
}

/**
 * Step 5a: Build a focused brief for the LLM (avoids sending raw user message).
 * REX shapes the prompt so the model acts as an internal tool, not the interlocutor.
 */
export function buildFocusedBrief(ctx: RexContext): string {
  const parts: string[] = []

  parts.push(`User request: "${ctx.message}"`)
  parts.push(`Detected intent: ${ctx.intent}`)

  if (ctx.memorySnippets.length > 0) {
    parts.push(`\nRelevant memory context:\n${ctx.memorySnippets.map(s => `- ${s}`).join('\n')}`)
  }

  if (ctx.openLoopSignals.length > 0) {
    parts.push(`\nOpen loop signals (unresolved issues):\n${ctx.openLoopSignals.map(s => `⚠️ ${s}`).join('\n')}`)
  }

  if (ctx.recentEvents.length > 0) {
    parts.push(`\nRecent system events:\n${ctx.recentEvents.map(e => `• ${e}`).join('\n')}`)
  }

  parts.push(`\nProvide a concise, direct response as REX. Do not introduce yourself as Claude or any AI — you ARE REX.`)

  return parts.join('\n')
}

/**
 * Step 5b: Format the LLM response to sound like REX (strip AI boilerplate).
 */
export function formatRexResponse(raw: string, ctx: RexContext): string {
  let response = raw.trim()

  // Strip common AI boilerplate openers
  const boilerplate = [
    /^As an AI( assistant)?,?\s*/i,
    /^I('m| am) Claude[,.]?\s*/i,
    /^Hello!?\s*/i,
    /^Sure[!,]?\s*/i,
    /^Of course[!,]?\s*/i,
    /^Certainly[!,]?\s*/i,
    /^Great[!,]?\s*/i,
  ]
  for (const pattern of boilerplate) {
    response = response.replace(pattern, '')
  }

  // Prepend OPEN_LOOP notice if relevant signals exist and message is code-related
  if (ctx.openLoopSignals.length > 0 && ctx.intent === 'code') {
    const notice = `⚠️ *Open loops detected in memory:*\n${ctx.openLoopSignals.slice(0, 2).map(s => `• ${s}`).join('\n')}\n\n`
    response = notice + response
  }

  return response
}

/**
 * Full REX Identity Pipeline — entry point for gateway free-text handler.
 * Replaces direct askQwenStream() calls with a 5-step identity-aware flow.
 */
export async function rexIdentityPipeline(
  message: string,
  opts: {
    onChunk?: (chunk: string) => void
    model?: string
  } = {}
): Promise<RexIdentityResult> {
  const start = Date.now()

  // Steps 1–3: Build context (parallel)
  const ctx = await buildRexContext(message)

  if (ctx.openLoopSignals.length > 0) {
    log.info(`identity: ${ctx.openLoopSignals.length} open loop signal(s) detected`)
  }

  // Step 4: Script-first attempt (0 LLM)
  const scriptAnswer = tryScriptFirst(ctx)
  if (scriptAnswer) {
    const response = formatRexResponse(scriptAnswer, ctx)
    return { response, usedLLM: false, scriptAnswer, durationMs: Date.now() - start }
  }

  // Step 5: LLM via orchestrator with focused brief
  const brief = buildFocusedBrief(ctx)

  try {
    const { streamAgent } = await import('../agent-runtime.js')

    let accumulated = ''
    const result = await streamAgent(brief, {
      model: opts.model,
      injectContext: false, // Context already injected in brief
      onChunk: (chunk) => {
        accumulated += chunk
        opts.onChunk?.(chunk)
      },
    })

    const response = formatRexResponse(result.response || accumulated, ctx)
    return {
      response,
      usedLLM: true,
      scriptAnswer: null,
      model: result.model,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`identity: LLM pipeline failed: ${msg.slice(0, 100)}`)
    return {
      response: `⚠️ REX LLM pipeline failed: ${msg.slice(0, 200)}`,
      usedLLM: false,
      scriptAnswer: null,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * REX system prompt — always use this in agent-runtime.ts instead of
 * generic "You are an AI assistant" phrasing.
 */
export const REX_SYSTEM_PROMPT = `You are REX — a living intelligence OS, not a chatbot. You are the brain that orchestrates everything.

Architecture:
- Layer 1 (REX Core): intent detection, memory, signals, scripts, crons, fleet sync. 70% scripts / 30% LLM.
- Layer 2 (REX Code): dev superlayer for Claude Code + Codex. Dynamic context, REX Scan, project-aware tools.
- Layer 3 (REX Relay): multi-AI orchestration via RELAY.md shared document. LLMs collaborate, not compete.

You are NOT Claude, GPT, Qwen, or any other AI. Those are internal tools — you use them, they don't define you.
You assist Kevin (D-Studio) with code, automation, memory, system operations, and proactive discovery.

Rules:
- Respond concisely and directly — no boilerplate, no fluff
- Never identify as any LLM — you ARE REX
- Use past memory context for informed, personalized answers
- Flag open loops and unresolved issues proactively
- Prefer script/CLI answers over LLM explanations when data is available
- If a script can answer, use it (0 LLM). Script-first, always.`

// ── Effect-ts typed pipeline ───────────────────────────────────────
// Each step of the 5-step REX Identity pipeline is typed so the
// compiler prevents silently ignoring context-building failures.
// Additive — existing rexIdentityPipeline() is unchanged.

import { Effect, Data } from 'effect'

export class ContextBuildError extends Data.TaggedError('ContextBuildError')<{
  step: 'memory' | 'events' | 'signals' | 'intent'
  message: string
}> {}

export class ScriptFirstResult extends Data.TaggedClass('ScriptFirstResult')<{
  response: string
}> {}

export class LlmRequired extends Data.TaggedClass('LlmRequired')<{
  ctx: RexContext
  brief: string
}> {}

/**
 * Step 1-3 as Effect: build context with typed failure for each source.
 * Memory / events / signals failures are non-fatal — returns partial context.
 */
export function buildContextEffect(message: string): Effect.Effect<RexContext, ContextBuildError> {
  const memoryEffect = Effect.tryPromise({
    try: () => Promise.resolve(searchMemory(message)),
    catch: (e) => new ContextBuildError({ step: 'memory', message: String(e) }),
  }).pipe(Effect.orElse(() => Effect.succeed([] as string[])))

  const eventsEffect = Effect.tryPromise({
    try: () => Promise.resolve(getRecentEvents(5)),
    catch: (e) => new ContextBuildError({ step: 'events', message: String(e) }),
  }).pipe(Effect.orElse(() => Effect.succeed([] as string[])))

  const signalsEffect = Effect.tryPromise({
    try: () => Promise.resolve(getRelevantSignals(message).map(s => s.title + ': ' + s.detail)),
    catch: (e) => new ContextBuildError({ step: 'signals', message: String(e) }),
  }).pipe(Effect.orElse(() => Effect.succeed([] as string[])))

  return Effect.all([memoryEffect, eventsEffect, signalsEffect]).pipe(
    Effect.map(([memorySnippets, recentEvents, openLoopSignals]) => ({
      message,
      memorySnippets,
      recentEvents,
      intent: detectMessageIntent(message),
      openLoopSignals,
      projectCwd: process.cwd(),
    })),
  )
}

/**
 * Step 4 as Effect: returns ScriptFirstResult if a script matched, else LlmRequired.
 * The union type forces callers to handle both branches explicitly.
 */
export function tryScriptEffect(ctx: RexContext): Effect.Effect<ScriptFirstResult | LlmRequired, never> {
  const answer = tryScriptFirst(ctx)
  if (answer) {
    return Effect.succeed(new ScriptFirstResult({ response: formatRexResponse(answer, ctx) }))
  }
  return Effect.succeed(new LlmRequired({ ctx, brief: buildFocusedBrief(ctx) }))
}

/**
 * Full Effect-typed pipeline — composable version of rexIdentityPipeline().
 * Useful when callers need to intercept specific failure modes (e.g., degrade mode).
 *
 * @example
 * const result = yield* rexIdentityEffect("status de REX")
 * console.log(result.response, result.usedLLM)
 */
export function rexIdentityEffect(
  message: string,
  opts: { model?: string } = {},
): Effect.Effect<RexIdentityResult, ContextBuildError> {
  const start = Date.now()

  return buildContextEffect(message).pipe(
    Effect.flatMap(ctx =>
      tryScriptEffect(ctx).pipe(
        Effect.flatMap(outcome => {
          if (outcome._tag === 'ScriptFirstResult') {
            return Effect.succeed<RexIdentityResult>({
              response: outcome.response,
              usedLLM: false,
              scriptAnswer: outcome.response,
              durationMs: Date.now() - start,
            })
          }
          // LlmRequired — call agent runtime
          return Effect.tryPromise({
            try: async () => {
              const { streamAgent } = await import('../agent-runtime.js')
              let accumulated = ''
              const result = await streamAgent(outcome.brief, {
                model: opts.model,
                injectContext: false,
                onChunk: (chunk: string) => { accumulated += chunk },
              })
              return {
                response: formatRexResponse(result.response || accumulated, outcome.ctx),
                usedLLM: true as const,
                scriptAnswer: null,
                model: result.model,
                durationMs: Date.now() - start,
              } satisfies RexIdentityResult
            },
            catch: (e) => new ContextBuildError({ step: 'intent', message: String(e) }),
          })
        }),
      )
    ),
  )
}
