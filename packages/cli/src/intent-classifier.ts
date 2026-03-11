/**
 * REX Intent Classifier
 *
 * Classifie chaque intent entrant : USER ou AI.
 * USER = message direct de l'humain
 * AI = pattern détecté dans l'output d'un LLM
 *
 * @module INTENTS
 */

export type IntentSource = 'USER' | 'AI'
export type IntentCategory =
  | 'WEB_SEARCH'
  | 'FETCH_DOCS'
  | 'READ_FILE'
  | 'WRITE_FILE'
  | 'RUN_COMMAND'
  | 'QUERY_MEMORY'
  | 'SEND_MESSAGE'
  | 'CODE_TASK'
  | 'LLM_RELAY'
  | 'UNKNOWN'

export interface RexIntent {
  id: string
  raw: string           // texte original
  source: IntentSource
  category: IntentCategory
  confidence: number    // 0-1
  params: Record<string, string>  // ex: { query: "typescript docs" }
  ts: string
  scriptId?: string     // script généré/associé
  cacheHit: boolean
}

// ── Patterns USER_INTENT (commandes directes Kevin) ────────────────────

const USER_INTENT_PATTERNS: Array<{
  pattern: RegExp
  category: IntentCategory
  extract: (m: RegExpMatchArray) => Record<string, string>
}> = [
  {
    pattern: /(?:cherche|search|trouve|find|google)\s+(.+)/i,
    category: 'WEB_SEARCH',
    extract: m => ({ query: m[1] }),
  },
  {
    pattern: /(?:lis|lire|read|ouvre|open)\s+(.+\.(ts|js|md|json|yaml|txt))/i,
    category: 'READ_FILE',
    extract: m => ({ path: m[1] }),
  },
  {
    pattern: /(?:run|execute|lance|bash|exec)\s+(.+)/i,
    category: 'RUN_COMMAND',
    extract: m => ({ command: m[1] }),
  },
  {
    pattern: /(?:mémorise|remember|note|save)\s+(.+)/i,
    category: 'QUERY_MEMORY',
    extract: m => ({ content: m[1] }),
  },
  {
    pattern: /(?:envoie|send|message|msg)\s+(.+)/i,
    category: 'SEND_MESSAGE',
    extract: m => ({ content: m[1] }),
  },
  {
    pattern: /(?:code|implémente|create|crée|build|write)\s+(.+)/i,
    category: 'CODE_TASK',
    extract: m => ({ task: m[1] }),
  },
]

// ── Patterns AI_INTENT (détectés dans output LLM) ─────────────────────

const AI_INTENT_PATTERNS: Array<{
  pattern: RegExp
  category: IntentCategory
  extract: (m: RegExpMatchArray) => Record<string, string>
}> = [
  {
    pattern: /I need to (?:find|search|look up|check)\s+(.+?)(?:\.|$)/im,
    category: 'WEB_SEARCH',
    extract: m => ({ query: m[1].trim() }),
  },
  {
    pattern: /I need (?:docs?|documentation|examples?)\s+(?:for|about|on)\s+(.+?)(?:\.|$)/im,
    category: 'FETCH_DOCS',
    extract: m => ({ query: m[1].trim() }),
  },
  {
    pattern: /(?:let me|I should|I need to)\s+(?:check|read|look at)\s+(.+?)(?:\.|$)/im,
    category: 'READ_FILE',
    extract: m => ({ path: m[1].trim() }),
  },
  {
    pattern: /(?:I should|let me)\s+(?:run|test|verify|validate)\s+(.+?)(?:\.|$)/im,
    category: 'RUN_COMMAND',
    extract: m => ({ command: m[1].trim() }),
  },
  {
    pattern: /(?:I'll|I will|let me)\s+(?:write|create|generate)\s+(.+?)(?:\.|$)/im,
    category: 'CODE_TASK',
    extract: m => ({ task: m[1].trim() }),
  },
  {
    pattern: /Need (?:a second opinion|another model|more context)\s*(?:on\s+)?(.+?)(?:\.|$)/im,
    category: 'LLM_RELAY',
    extract: m => ({ topic: m[1].trim() }),
  },
]

// ── Classify ───────────────────────────────────────────────────────────

export function classifyIntent(text: string, source?: IntentSource): RexIntent {
  const id = `intent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const ts = new Date().toISOString()

  // Essai USER_INTENT en premier si source = 'USER' ou pas précisé
  const userPatterns = source !== 'AI' ? USER_INTENT_PATTERNS : []
  for (const { pattern, category, extract } of userPatterns) {
    const m = text.match(pattern)
    if (m) {
      return {
        id, raw: text, source: 'USER', category,
        confidence: 0.9, params: extract(m), ts, cacheHit: false,
      }
    }
  }

  // Essai AI_INTENT
  const aiPatterns = source !== 'USER' ? AI_INTENT_PATTERNS : []
  for (const { pattern, category, extract } of aiPatterns) {
    const m = text.match(pattern)
    if (m) {
      return {
        id, raw: text, source: source ?? 'AI', category,
        confidence: 0.85, params: extract(m), ts, cacheHit: false,
      }
    }
  }

  // UNKNOWN
  return {
    id, raw: text, source: source ?? 'USER', category: 'UNKNOWN',
    confidence: 0.1, params: {}, ts, cacheHit: false,
  }
}
