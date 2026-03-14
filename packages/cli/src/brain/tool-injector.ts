/**
 * REX Dynamic Tool Injector
 *
 * Decides WHICH tools to inject based on:
 *   1. Intent — "search memory" → only memory tools, not web search
 *   2. Model capacity — small models get fewer tools (context budget)
 *   3. System health — if Ollama is down, don't inject memory_search
 *   4. Task type — code tasks get file/command tools, chat gets memory/web
 *
 * Zero wasted tokens. Each request gets exactly the tools it needs.
 *
 * @module AGENTS
 */

import { createLogger } from '../logger.js'
import type { RexTool, OllamaTool } from '../tool-adapter.js'

const log = createLogger('AGENTS:tool-injector')

// ── Tool Registry ──────────────────────────────────────────────

/** Every tool REX knows about, tagged with categories and cost */
export interface ToolEntry {
  tool: RexTool
  /** Which intents this tool is relevant for */
  intents: string[]
  /** Token cost estimate for the tool definition in context */
  tokenCost: number
  /** Health check — returns false if tool is unavailable right now */
  healthCheck?: () => Promise<boolean>
  /** Priority within its category (higher = injected first) */
  priority: number
}

// All 9 tools from tool-adapter, now with metadata
const TOOL_REGISTRY: ToolEntry[] = [
  {
    tool: {
      name: 'rex_memory_search',
      description: 'Search REX semantic memory for relevant past context, decisions, and patterns.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, limit: { type: 'number', description: 'Max results (default 5)' } }, required: ['query'] },
    },
    intents: ['search', 'memory', 'general', 'code', 'review', 'fix'],
    tokenCost: 60,
    priority: 10,
    healthCheck: async () => {
      try {
        const { execFileSync } = await import('node:child_process')
        execFileSync('rex', ['search', 'test', '--limit=1', '--json'], { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
        return true
      } catch { return false }
    },
  },
  {
    tool: {
      name: 'rex_read_file',
      description: "Read a file's content from the filesystem.",
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'File path' } }, required: ['path'] },
    },
    intents: ['code', 'fix', 'review', 'create', 'deploy', 'general'],
    tokenCost: 40,
    priority: 9,
  },
  {
    tool: {
      name: 'rex_run_command',
      description: 'Run a safe shell command. Destructive operations blocked.',
      parameters: { type: 'object', properties: { command: { type: 'string', description: 'Shell command' }, cwd: { type: 'string', description: 'Working directory' } }, required: ['command'] },
    },
    intents: ['code', 'fix', 'deploy', 'status'],
    tokenCost: 50,
    priority: 8,
  },
  {
    tool: {
      name: 'rex_get_status',
      description: 'Get REX system status and health checks.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    intents: ['status', 'fleet', 'general'],
    tokenCost: 30,
    priority: 7,
  },
  {
    tool: {
      name: 'rex_list_projects',
      description: 'List all known REX projects with stack and last activity.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    intents: ['code', 'status', 'general'],
    tokenCost: 30,
    priority: 5,
  },
  {
    tool: {
      name: 'rex_observe',
      description: 'Save an observation, fact, or habit to REX memory.',
      parameters: { type: 'object', properties: { subject: { type: 'string', description: 'Subject' }, observation: { type: 'string', description: 'Content' }, type: { type: 'string', description: 'Type', enum: ['fact', 'habit', 'runbook'] } }, required: ['subject', 'observation'] },
    },
    intents: ['memory', 'general'],
    tokenCost: 50,
    priority: 4,
  },
  {
    tool: {
      name: 'rex_get_context',
      description: 'Get project context analysis (stack, tools, intent).',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Project path' } }, required: [] },
    },
    intents: ['code', 'review', 'create'],
    tokenCost: 35,
    priority: 6,
  },
  {
    tool: {
      name: 'rex_search_web',
      description: 'Search the web via DuckDuckGo instant answers.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
    },
    intents: ['search', 'general', 'create'],
    tokenCost: 35,
    priority: 3,
  },
  {
    tool: {
      name: 'rex_get_memory_stats',
      description: 'Get memory system stats: embeddings, pending, duplicates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    intents: ['memory', 'status'],
    tokenCost: 25,
    priority: 2,
  },
]

// ── Model Capacity Map ──────────────────────────────────────────

interface ModelBudget {
  maxTools: number
  maxContextTokens: number
  /** Max tokens for tool definitions in the system prompt */
  toolTokenBudget: number
}

const MODEL_BUDGETS: Record<string, ModelBudget> = {
  // Tiny local models — 2-3 tools max, tight context
  'qwen2.5:1.5b':     { maxTools: 2, maxContextTokens: 4096,  toolTokenBudget: 150 },
  'qwen2.5:3b':       { maxTools: 3, maxContextTokens: 4096,  toolTokenBudget: 200 },
  // Medium local — 4-5 tools
  'qwen2.5:7b':       { maxTools: 5, maxContextTokens: 8192,  toolTokenBudget: 350 },
  'qwen3.5:4b':       { maxTools: 4, maxContextTokens: 8192,  toolTokenBudget: 300 },
  'qwen3.5:9b':       { maxTools: 6, maxContextTokens: 16384, toolTokenBudget: 400 },
  // Free tier APIs — generous but respect rate limits
  'llama-3.3-70b-versatile': { maxTools: 8, maxContextTokens: 32768, toolTokenBudget: 600 },
  // Claude — full toolset
  'claude-haiku':      { maxTools: 9, maxContextTokens: 200000, toolTokenBudget: 800 },
  'claude-sonnet':     { maxTools: 9, maxContextTokens: 200000, toolTokenBudget: 800 },
  'claude-opus':       { maxTools: 9, maxContextTokens: 200000, toolTokenBudget: 800 },
}

function getModelBudget(model: string): ModelBudget {
  // Exact match first
  if (MODEL_BUDGETS[model]) return MODEL_BUDGETS[model]

  // Fuzzy match on model family
  const lower = model.toLowerCase()
  for (const [key, budget] of Object.entries(MODEL_BUDGETS)) {
    if (lower.includes(key.split(':')[0]) || lower.includes(key.split('-')[0])) {
      return budget
    }
  }

  // Default: medium budget
  return { maxTools: 5, maxContextTokens: 8192, toolTokenBudget: 350 }
}

// ── System Health Cache ─────────────────────────────────────────

interface HealthState {
  ollamaUp: boolean
  lastCheck: number
}

let healthCache: HealthState = { ollamaUp: true, lastCheck: 0 }
const HEALTH_TTL = 30_000 // 30s cache

async function checkSystemHealth(): Promise<HealthState> {
  const now = Date.now()
  if (now - healthCache.lastCheck < HEALTH_TTL) return healthCache

  let ollamaUp = false
  try {
    const res = await fetch(
      (process.env.OLLAMA_URL || 'http://localhost:11434') + '/api/tags',
      { signal: AbortSignal.timeout(3000) },
    )
    ollamaUp = res.ok
  } catch { /* offline */ }

  healthCache = { ollamaUp, lastCheck: now }
  return healthCache
}

// ── Main Export: selectTools ────────────────────────────────────

export interface ToolSelection {
  tools: OllamaTool[]
  summary: string
  injectedCount: number
  skippedReasons: Record<string, string>
}

/**
 * Select the optimal set of tools for this specific request.
 *
 * @param intent - Detected intent (from rex-identity or orchestration-policy)
 * @param model - The model that will receive these tools
 * @param opts - Additional filters
 */
export async function selectTools(
  intent: string,
  model: string,
  opts: { forceAll?: boolean; exclude?: string[] } = {},
): Promise<ToolSelection> {
  if (opts.forceAll) {
    // Bypass filtering — used for testing or power-user mode
    const all = TOOL_REGISTRY.map(e => toOllamaTool(e.tool))
    return {
      tools: all,
      summary: TOOL_REGISTRY.map(e => `${e.tool.name}: ${e.tool.description.split('.')[0]}`).join('\n'),
      injectedCount: all.length,
      skippedReasons: {},
    }
  }

  const budget = getModelBudget(model)
  const health = await checkSystemHealth()
  const skipped: Record<string, string> = {}
  const excluded = new Set(opts.exclude ?? [])

  // Filter: intent match + health + budget
  let candidates = TOOL_REGISTRY
    .filter(entry => {
      const { tool } = entry

      // Explicit exclusion
      if (excluded.has(tool.name)) {
        skipped[tool.name] = 'explicitly excluded'
        return false
      }

      // Intent relevance — tool must match current intent OR be 'general'
      if (!entry.intents.includes(intent) && !entry.intents.includes('general')) {
        skipped[tool.name] = `not relevant for intent '${intent}'`
        return false
      }

      // Health check: if Ollama is down, skip memory tools that depend on it
      if (!health.ollamaUp && tool.name === 'rex_memory_search') {
        skipped[tool.name] = 'Ollama offline — memory search unavailable'
        return false
      }

      return true
    })
    .sort((a, b) => b.priority - a.priority) // highest priority first

  // Budget: limit by maxTools and token budget
  let tokenSum = 0
  const selected: ToolEntry[] = []

  for (const entry of candidates) {
    if (selected.length >= budget.maxTools) {
      skipped[entry.tool.name] = `model budget: max ${budget.maxTools} tools`
      continue
    }
    if (tokenSum + entry.tokenCost > budget.toolTokenBudget) {
      skipped[entry.tool.name] = `token budget exceeded (${tokenSum}/${budget.toolTokenBudget})`
      continue
    }
    selected.push(entry)
    tokenSum += entry.tokenCost
  }

  const tools = selected.map(e => toOllamaTool(e.tool))
  const summary = selected.map(e => `${e.tool.name}: ${e.tool.description.split('.')[0]}`).join('\n')

  log.info(`tool-injector: ${selected.length}/${TOOL_REGISTRY.length} tools for intent='${intent}' model='${model}' (${tokenSum} tokens)`)
  if (Object.keys(skipped).length > 0) {
    log.debug(`tool-injector: skipped: ${Object.entries(skipped).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }

  return { tools, summary, injectedCount: selected.length, skippedReasons: skipped }
}

// ── Helpers ─────────────────────────────────────────────────────

function toOllamaTool(t: RexTool): OllamaTool {
  return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }
}

/** Get current tool registry for inspection / debugging */
export function getToolRegistry(): ToolEntry[] {
  return [...TOOL_REGISTRY]
}

/** Add a tool at runtime (e.g., from MCP discovery, plugin load) */
export function registerTool(entry: ToolEntry): void {
  // Deduplicate by name
  const idx = TOOL_REGISTRY.findIndex(e => e.tool.name === entry.tool.name)
  if (idx >= 0) {
    TOOL_REGISTRY[idx] = entry
    log.info(`tool-injector: updated tool '${entry.tool.name}'`)
  } else {
    TOOL_REGISTRY.push(entry)
    log.info(`tool-injector: registered new tool '${entry.tool.name}'`)
  }
}

/** Remove a tool at runtime */
export function unregisterTool(name: string): boolean {
  const idx = TOOL_REGISTRY.findIndex(e => e.tool.name === name)
  if (idx >= 0) {
    TOOL_REGISTRY.splice(idx, 1)
    log.info(`tool-injector: unregistered tool '${name}'`)
    return true
  }
  return false
}

/** Invalidate health cache (call after config change or provider recovery) */
export function invalidateHealthCache(): void {
  healthCache.lastCheck = 0
}
