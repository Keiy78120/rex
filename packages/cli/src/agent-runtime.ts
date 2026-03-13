/** @module AGENTS */
/**
 * REX Agent Runtime
 *
 * Universal agent loop: REX picks the model, injects tools + context, runs
 * the tool-calling loop until the model returns a final text response.
 *
 * Routing:
 *   claude-* → Anthropic via orchestrator relay
 *   gpt-*    → OpenAI API
 *   *        → Ollama /api/chat (with tool-calling loop)
 *
 * Fallback: if Ollama is unreachable → callWithAutoFallback() from free-tiers
 *
 * Section 23 (action.md): all internal LLM calls route through REX routing.
 * @see tool-adapter.ts
 * @see router.ts
 */

import { createLogger } from './logger.js'
import { detectIntent } from './project-intent.js'
import { pickModel } from './router.js'
import { getRexTools, getToolsSummary, executeToolCall } from './tool-adapter.js'
import { selectTools } from './tool-injector.js'
import { REX_SYSTEM_PROMPT } from './rex-identity.js'

const log = createLogger('AGENTS:agent-runtime')

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'

// ─── Types ───────────────────────────────────────────────────

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
}

export interface AgentConfig {
  /** Hint for model routing (if not set, detects from message keywords) */
  task?: string
  /** Max tool-calling loops before returning whatever we have (default: 10) */
  maxTurns?: number
  /** Override auto-selected model */
  model?: string
  /** Sampling temperature (default: 0.7) */
  temperature?: number
  /** Called for each streaming chunk (local models only) */
  streamCallback?: (chunk: string) => void
  /** Inject REX tools into the request (default: true) */
  injectTools?: boolean
  /** Inject project/memory context as system message (default: true) */
  injectContext?: boolean
  /** Print model selection and tool call decisions to logs */
  verbose?: boolean
}

export interface AgentResult {
  response: string
  model: string
  turns: number
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>
  tokens?: number
  durationMs: number
}

// ─── Ollama types ─────────────────────────────────────────────

interface OllamaToolCall {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

interface OllamaMessage {
  role: string
  content: string
  tool_calls?: OllamaToolCall[]
}

interface OllamaChatResponse {
  message?: OllamaMessage
  done?: boolean
  eval_count?: number
  prompt_eval_count?: number
}

interface OllamaStreamChunk {
  message?: { content?: string }
  done?: boolean
  eval_count?: number
}

// ─── Intent → task type mapping ───────────────────────────────

type RouterTask = 'code' | 'gateway' | 'reason' | 'background' | 'optimize' | 'categorize' | 'consolidate'

const INTENT_TO_TASK: Record<string, RouterTask> = {
  'bug-fix':     'code',
  'feature':     'code',
  'refactor':    'code',
  'new-project': 'code',
  'infra':       'reason',
  'docs':        'background',
  'explore':     'gateway',
}

const KEYWORD_TASK_MAP: Array<{ pattern: RegExp; task: RouterTask }> = [
  { pattern: /\b(code|implement|write|fix|debug|refactor|test|build|compile)\b/i, task: 'code' },
  { pattern: /\b(review|analyze|audit|check|inspect)\b/i,                        task: 'reason' },
  { pattern: /\b(document|docs|readme|explain|describe)\b/i,                     task: 'background' },
  { pattern: /\b(optimize|improve|speed|performance|memory)\b/i,                 task: 'optimize' },
  { pattern: /\b(summarize|classify|categorize|label)\b/i,                       task: 'categorize' },
]

function detectTaskType(message: string, config: AgentConfig): RouterTask {
  // Explicit override wins
  if (config.task) return config.task as RouterTask

  // Keyword matching on message
  for (const { pattern, task } of KEYWORD_TASK_MAP) {
    if (pattern.test(message)) return task
  }

  // Signal-based project intent (zero LLM)
  try {
    const ctx = detectIntent(process.cwd())
    return INTENT_TO_TASK[ctx.intent] ?? 'gateway'
  } catch {
    return 'gateway'
  }
}

// ─── Context injection ────────────────────────────────────────

async function buildContextMessage(message: string): Promise<string | null> {
  try {
    const { execFileSync } = await import('node:child_process')
    const query = message.slice(0, 50).trim()

    // Find rex binary
    let rexBin = 'rex'
    try {
      rexBin = execFileSync('/usr/bin/which', ['rex'], {
        encoding: 'utf-8', timeout: 3000,
      }).trim()
    } catch {}

    const out = execFileSync(rexBin, ['search', query, '--limit=3', '--json'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (!out || out === '[]') return null

    // Extract text field from JSON results
    const results = JSON.parse(out) as Array<{ content?: string; text?: string }>
    const snippets = results
      .slice(0, 3)
      .map((r) => (r.content ?? r.text ?? '').slice(0, 200))
      .filter(Boolean)
    if (snippets.length === 0) return null

    return `Relevant context from REX memory:\n${snippets.join('\n---\n')}`
  } catch {
    return null
  }
}

// ─── Provider detection ───────────────────────────────────────

type ProviderKind = 'ollama' | 'claude' | 'openai'

function detectProvider(model: string): ProviderKind {
  const m = model.toLowerCase()
  if (m.includes('claude')) return 'claude'
  if (m.includes('gpt') || m.includes('openai')) return 'openai'
  return 'ollama'
}

// ─── Claude dispatch ──────────────────────────────────────────

async function runWithClaude(message: string, config: AgentConfig): Promise<AgentResult> {
  const start = Date.now()
  log.info(`agent-runtime: routing to claude (orchestrator relay)`)
  try {
    const { orchestrate } = await import('./orchestrator.js')
    const result = await orchestrate(message, { capability: config.task ?? 'chat', timeout: 120_000 })
    return {
      response: result.response,
      model: result.provider,
      turns: 1,
      toolCalls: [],
      tokens: (result.tokensIn ?? 0) + (result.tokensOut ?? 0),
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`agent-runtime: claude failed: ${msg.slice(0, 100)}`)
    return {
      response: `Error: ${msg.slice(0, 300)}`,
      model: 'claude',
      turns: 1,
      toolCalls: [],
      durationMs: Date.now() - start,
    }
  }
}

// ─── OpenAI dispatch (SDK + Agents SDK tool loop) ────────────

/**
 * Run via the plain `openai` SDK (v6) with a manual tool-calling loop.
 * Tool definitions come from tool-adapter.ts (same tools as the Ollama loop).
 *
 * For structured agent pipelines with handoffs, use @openai/agents Runner
 * directly in agent-templates/ personas — this function is for inline tasks.
 */
async function runWithOpenAI(
  messages: AgentMessage[],
  model: string,
  config: AgentConfig,
): Promise<AgentResult> {
  const start = Date.now()
  const { getOpenAIClient } = await import('./ai-providers.js')
  const client = getOpenAIClient()

  if (!client) {
    return {
      response: 'Error: OPENAI_API_KEY not configured. Set it in Settings → OpenAI.',
      model,
      turns: 1,
      toolCalls: [],
      durationMs: Date.now() - start,
    }
  }

  const injectTools = config.injectTools !== false
  const maxTurns = config.maxTurns ?? 8
  const allToolCalls: AgentResult['toolCalls'] = []

  // Build OpenAI-format messages
  type OAIRole = 'system' | 'user' | 'assistant' | 'tool'
  type OAIMessage = { role: OAIRole; content: string; tool_call_id?: string }
  const oaiMessages: OAIMessage[] = messages.map((m) => ({
    role: m.role as OAIRole,
    content: m.content,
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
  }))

  // Dynamic tool selection for OpenAI provider
  const { selectTools: selectToolsFn } = await import('./tool-injector.js')
  const oaiToolSelection = injectTools
    ? await selectToolsFn(detectTaskType(messages[messages.length - 1]?.content ?? '', config), model)
    : { tools: [], summary: '', injectedCount: 0, skippedReasons: {} }
  const openaiTools = oaiToolSelection.tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }))

  try {
    let turns = 0
    while (turns < maxTurns) {
      turns++
      const completion = await client.chat.completions.create({
        model,
        messages: oaiMessages as Parameters<typeof client.chat.completions.create>[0]['messages'],
        temperature: config.temperature ?? 0.7,
        max_tokens: 4096,
        ...(openaiTools.length > 0 ? { tools: openaiTools, tool_choice: 'auto' } : {}),
      })

      const choice = completion.choices[0]
      const msg = choice?.message
      if (!msg) break

      // No tool calls → final text response
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          response: msg.content ?? '',
          model,
          turns,
          toolCalls: allToolCalls,
          tokens: completion.usage?.total_tokens,
          durationMs: Date.now() - start,
        }
      }

      // Append assistant turn with tool calls
      oaiMessages.push({ role: 'assistant', content: msg.content ?? '' })

      // Execute each tool and append results
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function' || !('function' in tc)) continue
        const fn = (tc as { function: { name: string; arguments: string }; id: string }).function
        const fnName = fn.name
        let fnArgs: Record<string, unknown> = {}
        try { fnArgs = JSON.parse(fn.arguments) } catch { /* malformed JSON */ }

        log.info(`agent-runtime/openai: tool → ${fnName}`)
        const toolResult = await executeToolCall(fnName, fnArgs)
        const resultStr = toolResult.ok ? toolResult.output : `Error: ${toolResult.error}`
        allToolCalls.push({ name: fnName, args: fnArgs, result: resultStr })

        oaiMessages.push({ role: 'tool', content: resultStr, tool_call_id: tc.id })
      }
    }

    const last = [...oaiMessages].reverse().find((m: OAIMessage) => m.role === 'assistant')
    return {
      response: last?.content ?? '(max turns reached)',
      model,
      turns,
      toolCalls: allToolCalls,
      durationMs: Date.now() - start,
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`agent-runtime: openai SDK error: ${msg.slice(0, 120)}`)
    return {
      response: `Error: ${msg.slice(0, 300)}`,
      model,
      turns: 1,
      toolCalls: [],
      durationMs: Date.now() - start,
    }
  }
}

// ─── Vercel AI SDK dispatch (unified streaming) ───────────────

/**
 * Provider-agnostic streaming via Vercel AI SDK.
 * Works with @ai-sdk/openai and @ai-sdk/anthropic.
 * Used in gateway/hub for streaming chat responses.
 */
export async function runWithVercel(
  prompt: string,
  provider: 'openai' | 'anthropic',
  modelId?: string,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const { getVercelModel } = await import('./ai-providers.js')
  const model = getVercelModel(provider, modelId)
  if (!model) {
    throw new Error(`${provider} not configured — set API key in Settings → OpenAI`)
  }

  if (onChunk) {
    const { streamText } = await import('ai')
    const { textStream } = streamText({ model, prompt })
    let full = ''
    for await (const chunk of textStream) {
      full += chunk
      onChunk(chunk)
    }
    return full
  } else {
    const { generateText } = await import('ai')
    const { text } = await generateText({ model, prompt })
    return text
  }
}

// ─── Ollama tool-calling loop ─────────────────────────────────

async function runOllamaLoop(
  messages: AgentMessage[],
  model: string,
  config: AgentConfig,
): Promise<AgentResult> {
  const start = Date.now()
  const maxTurns = config.maxTurns ?? 10
  const injectTools = config.injectTools !== false
  const toolCalls: AgentResult['toolCalls'] = []
  let turns = 0
  let turnsWithoutToolCalls = 0
  let lastResponse = ''
  let totalTokens = 0

  const ollamaMessages: Array<{ role: string; content: string; tool_call_id?: string }> =
    messages.map((m) => ({ role: m.role, content: m.content, tool_call_id: m.tool_call_id }))

  while (turns < maxTurns) {
    turns++

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: false,
      think: false,
      options: { temperature: config.temperature ?? 0.7 },
    }
    if (injectTools) {
      body.tools = getRexTools()
    }

    let res: Response
    try {
      res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      })
    } catch (err) {
      // Ollama unreachable — fall back to free-tier APIs
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`agent-runtime: Ollama unreachable (${msg}), falling back to free-tiers`)
      return runFreeTierFallback(messages, config, start, toolCalls, turns)
    }

    if (!res.ok) {
      log.warn(`agent-runtime: Ollama HTTP ${res.status}, falling back to free-tiers`)
      return runFreeTierFallback(messages, config, start, toolCalls, turns)
    }

    const data = await res.json() as OllamaChatResponse
    totalTokens += (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0)

    const msg = data.message
    lastResponse = msg?.content ?? ''

    // Handle tool calls
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      turnsWithoutToolCalls = 0

      // Append assistant's tool-call message
      ollamaMessages.push({ role: 'assistant', content: lastResponse })

      // Execute each tool call and append results
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name
        const toolArgs = tc.function.arguments ?? {}
        if (config.verbose) log.info(`tool: ${toolName}(${JSON.stringify(toolArgs).slice(0, 100)})`)

        const result = await executeToolCall(toolName, toolArgs)
        const resultStr = result.ok ? result.output : `Error: ${result.error}`

        toolCalls.push({ name: toolName, args: toolArgs, result: resultStr.slice(0, 500) })

        // Append tool result to conversation
        ollamaMessages.push({
          role: 'tool',
          content: resultStr,
        })
      }
      // Continue loop — model needs to see tool results
      continue
    }

    // No tool calls — check if we have a real response
    if (lastResponse.trim()) {
      turnsWithoutToolCalls++
      // If model keeps responding without tool calls, it's done
      break
    }

    turnsWithoutToolCalls++
    // If 3 turns with no tool calls and no useful response, give up
    if (turnsWithoutToolCalls >= 3) break
  }

  return {
    response: lastResponse.trim() || '(No response generated)',
    model,
    turns,
    toolCalls,
    tokens: totalTokens > 0 ? totalTokens : undefined,
    durationMs: Date.now() - start,
  }
}

// ─── Free-tier fallback ───────────────────────────────────────

async function runFreeTierFallback(
  messages: AgentMessage[],
  config: AgentConfig,
  start: number,
  existingToolCalls: AgentResult['toolCalls'],
  turnsUsed: number,
): Promise<AgentResult> {
  try {
    const { callWithAutoFallback } = await import('./free-tiers.js')
    const userMsg = messages.find((m) => m.role === 'user')?.content ?? ''
    const systemMsg = messages.find((m) => m.role === 'system')?.content
    const result = await callWithAutoFallback(userMsg, systemMsg)
    return {
      response: result.text,
      model: `${result.provider}/${result.model}`,
      turns: turnsUsed + 1,
      toolCalls: existingToolCalls,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`agent-runtime: all fallbacks failed: ${msg.slice(0, 100)}`)
    return {
      response: `All LLM providers are currently unavailable. (${msg.slice(0, 200)})`,
      model: 'none',
      turns: turnsUsed,
      toolCalls: existingToolCalls,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Main exported function ───────────────────────────────────

/**
 * Run a single-turn or multi-turn agent loop.
 * REX auto-picks the model from router.ts, injects tools + memory context,
 * and runs the tool-calling loop until the model produces a final response.
 */
export async function runAgent(
  userMessage: string,
  config: AgentConfig = {},
): Promise<AgentResult> {
  const start = Date.now()
  const injectTools = config.injectTools !== false
  const injectContext = config.injectContext !== false

  // 1. Detect task type from message content / project signals
  const taskType = detectTaskType(userMessage, config)

  // 2. Pick model (override or router)
  const model = config.model ?? await pickModel(taskType)
  const provider = detectProvider(model)

  if (config.verbose) {
    log.info(`agent-runtime: task=${taskType} model=${model} provider=${provider}`)
  }

  // 3. Dynamic tool selection based on intent + model capacity + system health
  const toolSelection = injectTools
    ? await selectTools(taskType, model)
    : { tools: [], summary: '', injectedCount: 0, skippedReasons: {} }

  // 4. Build messages array
  const messages: AgentMessage[] = []

  // System prompt with dynamically selected tools
  const toolsSummary = toolSelection.injectedCount > 0
    ? `\n\nAvailable tools (${toolSelection.injectedCount}):\n${toolSelection.summary}`
    : ''
  messages.push({
    role: 'system',
    content: `${REX_SYSTEM_PROMPT}${toolsSummary}`,
  })

  // Context injection (relevant memory snippets)
  if (injectContext) {
    try {
      const contextMsg = await buildContextMessage(userMessage)
      if (contextMsg) {
        messages.push({ role: 'system', content: contextMsg })
      }
    } catch {
      // Context injection is best-effort — never block the agent
    }
  }

  // User message
  messages.push({ role: 'user', content: userMessage })

  // 5. Dispatch to the right provider
  if (provider === 'claude') {
    return runWithClaude(userMessage, config)
  }

  if (provider === 'openai') {
    return runWithOpenAI(messages, model, config)
  }

  // Ollama — tool-calling loop
  return runOllamaLoop(messages, model, config)
}

// ─── Streaming variant ────────────────────────────────────────

/**
 * Streaming variant: calls onChunk for each token chunk from the model.
 * Tools are still executed synchronously between turns.
 * Streaming only applies to the final text response turn (not tool turns).
 */
export async function streamAgent(
  userMessage: string,
  config: AgentConfig & { onChunk: (chunk: string) => void },
): Promise<AgentResult> {
  const start = Date.now()
  const injectTools = config.injectTools !== false
  const injectContext = config.injectContext !== false

  const taskType = detectTaskType(userMessage, config)
  const model = config.model ?? await pickModel(taskType)
  const provider = detectProvider(model)

  if (config.verbose) {
    log.info(`agent-runtime: stream task=${taskType} model=${model} provider=${provider}`)
  }

  // Non-Ollama providers: run normally and call onChunk with full response
  if (provider === 'claude' || provider === 'openai') {
    const result = await runAgent(userMessage, config)
    config.onChunk(result.response)
    return result
  }

  // Dynamic tool selection
  const toolSelection = injectTools
    ? await selectTools(taskType, model)
    : { tools: [], summary: '', injectedCount: 0, skippedReasons: {} }

  // Build messages
  const messages: AgentMessage[] = []
  const toolsSummary = toolSelection.injectedCount > 0
    ? `\n\nAvailable tools (${toolSelection.injectedCount}):\n${toolSelection.summary}`
    : ''
  messages.push({
    role: 'system',
    content: `${REX_SYSTEM_PROMPT}${toolsSummary}`,
  })
  if (injectContext) {
    try {
      const contextMsg = await buildContextMessage(userMessage)
      if (contextMsg) messages.push({ role: 'system', content: contextMsg })
    } catch {}
  }
  messages.push({ role: 'user', content: userMessage })

  // Run non-streaming tool turns first (handle all tool_calls), then stream final response
  const maxTurns = config.maxTurns ?? 10
  const toolCalls: AgentResult['toolCalls'] = []
  let turns = 0
  let totalTokens = 0

  const ollamaMessages: Array<{ role: string; content: string }> =
    messages.map((m) => ({ role: m.role, content: m.content }))

  // Tool-calling pre-pass (non-streaming, may have 0 turns if model doesn't use tools)
  while (turns < maxTurns - 1) {
    turns++
    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: false,
      think: false,
      options: { temperature: config.temperature ?? 0.7 },
    }
    if (injectTools) body.tools = toolSelection.tools

    let res: Response
    try {
      res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      })
    } catch {
      break // Will fall through to streaming attempt or fallback
    }

    if (!res.ok) break

    const data = await res.json() as OllamaChatResponse
    totalTokens += (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0)
    const msg = data.message

    if (!msg?.tool_calls?.length) {
      // No more tool calls — stream the final response
      break
    }

    ollamaMessages.push({ role: 'assistant', content: msg.content ?? '' })
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name
      const toolArgs = tc.function.arguments ?? {}
      const result = await executeToolCall(toolName, toolArgs)
      const resultStr = result.ok ? result.output : `Error: ${result.error}`
      toolCalls.push({ name: toolName, args: toolArgs, result: resultStr.slice(0, 500) })
      ollamaMessages.push({ role: 'tool', content: resultStr })
    }
  }

  // Final streaming turn
  turns++
  let rawFull = ''

  try {
    const streamBody: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
      think: false,
      options: { temperature: config.temperature ?? 0.7 },
    }

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(streamBody),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream failed: HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk
          if (chunk.message?.content) {
            rawFull += chunk.message.content
            config.onChunk(chunk.message.content)
          }
          if (chunk.done) {
            totalTokens += chunk.eval_count ?? 0
          }
        } catch {}
      }
    }
  } catch (err) {
    // Streaming failed — try free-tier fallback
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`agent-runtime: stream failed (${msg}), using free-tier fallback`)
    const fallback = await runFreeTierFallback(messages, config, start, toolCalls, turns)
    config.onChunk(fallback.response)
    return fallback
  }

  return {
    response: rawFull.trim() || '(No response generated)',
    model,
    turns,
    toolCalls,
    tokens: totalTokens > 0 ? totalTokens : undefined,
    durationMs: Date.now() - start,
  }
}
