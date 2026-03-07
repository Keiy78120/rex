/**
 * REX Task-Aware Model Router
 * Picks the best available local Ollama model for each task type.
 * Mirrors the claude-code-router logic but for internal REX tasks.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

export type TaskType =
  | 'background'       // fast reads, summaries, quick ops
  | 'categorize'       // classify dev session chunks
  | 'consolidate'      // merge/summarize memory clusters
  | 'reason'           // deep reasoning, architecture analysis
  | 'code'             // code generation, review
  | 'gateway'          // Telegram bot responses (balanced)
  | 'optimize'         // CLAUDE.md analysis
  | 'script-simple'    // simple scripting, one-off automation
  | 'web-search-summary' // summarize web search results
  | 'pr-description'   // write PR descriptions
  | 'code-review-simple' // basic code review comments
  | 'architecture'     // high-level architecture decisions (always Claude)
  | 'debug-complex'    // deep debugging, root cause analysis (always Claude)
  | 'ui-design'        // creative UI + technical (always Claude)
  | 'security-audit'   // security review, CVE analysis (always Claude)

// Ordered by preference — first available wins
// 'claude' sentinel = no local model; caller should use Claude API instead
const TASK_PREFERENCES: Record<TaskType, string[]> = {
  background:          ['qwen2.5:1.5b', 'qwen3.5:latest', 'qwen3.5:9b'],
  consolidate:         ['qwen2.5:1.5b', 'qwen3.5:latest', 'qwen3.5:9b'],
  categorize:          ['qwen3.5:9b', 'qwen3.5:latest', 'qwen2.5:1.5b', 'deepseek-r1:8b'],
  gateway:             ['qwen3.5:9b', 'qwen3.5:latest', 'deepseek-r1:8b', 'qwen2.5:1.5b'],
  optimize:            ['qwen3.5:9b', 'qwen3.5:latest', 'deepseek-r1:8b'],
  reason:              ['deepseek-r1:8b', 'qwen3.5:9b', 'qwen3.5:latest'],
  code:                ['qwen3-coder:30b', 'qwen2.5-coder:32b-instruct-q4_K_M', 'qwen3.5:9b'],
  // Simple tasks — small local models sufficient
  'script-simple':     ['qwen2.5:1.5b', 'qwen3.5:latest'],
  'web-search-summary':['qwen2.5:1.5b', 'qwen3.5:latest'],
  'pr-description':    ['qwen2.5:7b', 'qwen3.5:9b', 'qwen3.5:latest'],
  'code-review-simple':['qwen2.5:7b', 'qwen3.5:9b', 'deepseek-r1:8b'],
  // Complex tasks — always route to Claude (no local fallback)
  architecture:        ['claude'],
  'debug-complex':     ['claude'],
  'ui-design':         ['claude'],
  'security-audit':    ['claude'],
}

/**
 * Returns true if the given task should always use Claude (no local model).
 */
export function requiresClaude(task: TaskType): boolean {
  return TASK_PREFERENCES[task][0] === 'claude'
}

let _cachedModels: string[] | null = null
let _cacheTime = 0
const CACHE_TTL = 60_000 // 1 min

async function getAvailableModels(): Promise<string[]> {
  const now = Date.now()
  if (_cachedModels && now - _cacheTime < CACHE_TTL) return _cachedModels

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json() as { models: Array<{ name: string }> }
    _cachedModels = data.models.map(m => m.name)
    _cacheTime = now
    return _cachedModels
  } catch {
    return []
  }
}

/**
 * Pick the best available Ollama model for a given task.
 * If REX_LLM_MODEL env is set, it overrides everything.
 * Falls back to first available non-embed model if no preference matches.
 */
export async function pickModel(task: TaskType): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL

  const available = await getAvailableModels()
  const prefs = TASK_PREFERENCES[task]

  for (const pref of prefs) {
    // Exact match
    if (available.includes(pref)) return pref
    // Prefix match: 'qwen3.5:9b' matches 'qwen3.5:9b-q4_K_M' but NOT 'qwen3.5-coder'
    const base = pref.split(':')[0]
    const match = available.find(a => (a === base || a.startsWith(base + ':')) && !a.includes('embed'))
    if (match) return match
  }

  // Fallback: any non-embed model
  const fallback = available.find(a => !a.includes('embed') && !a.includes('nomic'))
  return fallback ?? 'qwen3.5:latest'
}

/**
 * Show recommended routing table based on installed models.
 */
export async function showModelRouter(): Promise<void> {
  const available = await getAvailableModels()
  const embed = available.filter(m => m.includes('embed') || m.includes('nomic'))
  const gen = available.filter(m => !m.includes('embed') && !m.includes('nomic'))

  const line = '─'.repeat(52)
  const coreTasks: TaskType[] = ['background', 'categorize', 'consolidate', 'gateway', 'optimize', 'reason', 'code']
  const routedTasks: TaskType[] = ['script-simple', 'web-search-summary', 'pr-description', 'code-review-simple']
  const claudeTasks: TaskType[] = ['architecture', 'debug-complex', 'ui-design', 'security-audit']

  console.log(`\n\x1b[1mREX Model Router\x1b[0m`)
  console.log(line)
  console.log(`\x1b[2mInstalled: ${gen.length} generation, ${embed.length} embedding\x1b[0m\n`)

  console.log(`\x1b[2m  — Local tasks —\x1b[0m`)
  for (const task of [...coreTasks, ...routedTasks]) {
    const chosen = await pickModel(task)
    const prefs = TASK_PREFERENCES[task]
    const isOptimal = prefs[0] === chosen || available.includes(prefs[0])
    const dot = isOptimal ? '\x1b[32m●\x1b[0m' : '\x1b[33m●\x1b[0m'
    console.log(`  ${dot}  \x1b[1m${task.padEnd(22)}\x1b[0m → ${chosen}`)
  }

  console.log(`\n\x1b[2m  — Always Claude —\x1b[0m`)
  for (const task of claudeTasks) {
    console.log(`  \x1b[36m●\x1b[0m  \x1b[1m${task.padEnd(22)}\x1b[0m → claude`)
  }

  console.log(`\n  \x1b[2membeddings  → ${embed[0] ?? 'nomic-embed-text (not found)'}\x1b[0m`)
  console.log(line)

  if (gen.length === 0) {
    console.log(`\n  \x1b[33m!\x1b[0m No Ollama models found — run: ollama pull qwen3.5:latest`)
  } else {
    const missingOptimal = [...coreTasks, ...routedTasks].filter(t => {
      const pref = TASK_PREFERENCES[t][0]
      const base = pref.split(':')[0]
      return !available.some(a => a.startsWith(base))
    })
    if (missingOptimal.length > 0) {
      console.log(`\n  \x1b[33m!\x1b[0m Optimal models missing for: ${missingOptimal.join(', ')}`)
      console.log(`  \x1b[2mRecommended to pull:\x1b[0m`)
      const toRecommend = new Set<string>()
      for (const t of missingOptimal) {
        const pref = TASK_PREFERENCES[t][0]
        const base = pref.split(':')[0]
        if (!available.some(a => a.startsWith(base))) toRecommend.add(pref)
      }
      for (const m of toRecommend) {
        console.log(`    ollama pull ${m}`)
      }
    }
  }
  console.log()
}

/**
 * Get a JSON snapshot of the current routing for the Flutter app.
 */
export async function getRouterSnapshot(): Promise<Record<string, string>> {
  const tasks: TaskType[] = [
    'background', 'categorize', 'consolidate', 'gateway', 'optimize', 'reason', 'code',
    'script-simple', 'web-search-summary', 'pr-description', 'code-review-simple',
    'architecture', 'debug-complex', 'ui-design', 'security-audit',
  ]
  const snap: Record<string, string> = {}
  for (const t of tasks) {
    snap[t] = requiresClaude(t) ? 'claude' : await pickModel(t)
  }
  return snap
}
