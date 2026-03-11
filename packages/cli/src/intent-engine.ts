/**
 * REX Intent Engine — Point d'entrée central
 *
 * Boucle principale :
 * 1. Classify intent (USER ou AI)
 * 2. Cache lookup sémantique
 * 3. CACHE HIT → execute script → retourne résultat (0 token)
 * 4. CACHE MISS → LLM résout → génère script → stocke en cache
 *
 * CLI: rex ingest "<text>" [--source user|ai]
 *
 * @module INTENTS
 */

import { classifyIntent, type RexIntent, type IntentSource } from './intent-classifier.js'
import { IntentRegistry } from './intent-registry.js'
import { LivingCache } from './living-cache.js'
import { createLogger } from './logger.js'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const log = createLogger('INTENTS:engine')

const registry = new IntentRegistry()
const cache = new LivingCache()

export interface IngestResult {
  intent: RexIntent
  result: string
  cacheHit: boolean
  scriptUsed?: string
  durationMs: number
  tokensUsed: number   // 0 si cache hit ou script
}

// ── Execute un script vivant ───────────────────────────────────────────

async function executeScript(scriptPath: string, params: Record<string, string>): Promise<string> {
  if (!existsSync(scriptPath)) throw new Error(`Script not found: ${scriptPath}`)

  const env = { ...process.env, ...params }
  const result = execSync(`bash "${scriptPath}"`, {
    env, encoding: 'utf-8', timeout: 30000
  })
  return result.trim()
}

// ── Générer un script depuis le résultat LLM ───────────────────────────

async function generateScriptFromLLM(intent: RexIntent, llmResult: string): Promise<string | null> {
  // Templates par catégorie
  const templates: Record<string, string> = {
    WEB_SEARCH: `QUERY="${intent.params.query ?? ''}"
curl -sG "https://api.search.brave.com/res/v1/web/search" \\
  --data-urlencode "q=$QUERY" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" | \\
  jq -r '.web.results[:3] | .[] | "- \\(.title): \\(.url)"'`,

    READ_FILE: `cat "${intent.params.path ?? '$1'}"`,

    RUN_COMMAND: intent.params.command ?? '',

    FETCH_DOCS: `QUERY="${intent.params.query ?? ''}"
# Fetch via context7 ou fallback web
curl -sG "https://api.search.brave.com/res/v1/web/search" \\
  --data-urlencode "q=docs $QUERY site:docs.* OR site:developer.*" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" | \\
  jq -r '.web.results[:2] | .[] | "\\(.title)\\n\\(.url)\\n\\(.description)"'`,

    QUERY_MEMORY: `grep -i "${intent.params.content?.split(' ')[0] ?? ''}" \\
  ~/.openclaw/workspace/MEMORY.md \\
  ~/.openclaw/workspace/memory/observations/*.yaml 2>/dev/null | head -20`,
  }

  return templates[intent.category] ?? null
}

// ── Main: rex ingest ───────────────────────────────────────────────────

export async function ingest(
  text: string,
  options: {
    source?: IntentSource
    llmResolver?: (intent: RexIntent) => Promise<string>
    verbose?: boolean
  } = {}
): Promise<IngestResult> {
  const start = Date.now()

  // 1. Classify
  const intent = classifyIntent(text, options.source)
  if (options.verbose) log.info(`Intent: ${intent.source}:${intent.category} (${(intent.confidence * 100).toFixed(0)}%)`)

  // 2. Cache lookup
  const cached = await cache.lookup(text, intent.category)
  if (cached) {
    intent.cacheHit = true
    registry.logIntent(intent, cached.scriptId, true, Date.now() - start)

    if (options.verbose) log.info(`CACHE HIT (score: ${cached.score}, source: ${cached.source})`)

    // Essayer d'exécuter le script associé si présent
    if (cached.scriptId) {
      const script = registry.findScript(intent.category)
      if (script) {
        try {
          const scriptResult = await executeScript(script.scriptPath, intent.params)
          registry.scoreScript(script.id, true)
          return { intent, result: scriptResult, cacheHit: true, scriptUsed: script.id, durationMs: Date.now() - start, tokensUsed: 0 }
        } catch {}
      }
    }

    return { intent, result: cached.result, cacheHit: true, durationMs: Date.now() - start, tokensUsed: 0 }
  }

  // 3. Script registry lookup (sans cache sémantique)
  const existingScript = registry.findByPattern(text, intent.category)
  if (existingScript && existingScript.confidence > 0.7) {
    try {
      const scriptResult = await executeScript(existingScript.scriptPath, intent.params)
      registry.scoreScript(existingScript.id, true)

      // Stocker dans le cache pour les prochaines fois
      await cache.store(text, intent.category, scriptResult, {
        intentId: intent.id, scriptId: existingScript.id, source: 'SCRIPT'
      })

      registry.logIntent(intent, existingScript.id, true, Date.now() - start)
      return { intent, result: scriptResult, cacheHit: false, scriptUsed: existingScript.id, durationMs: Date.now() - start, tokensUsed: 0 }
    } catch {
      registry.scoreScript(existingScript.id, false)
    }
  }

  // 4. LLM fallback (CACHE MISS + pas de script fiable)
  if (!options.llmResolver) {
    registry.logIntent(intent, undefined, false, Date.now() - start)
    return { intent, result: `[CACHE MISS] Category: ${intent.category}, no resolver`, cacheHit: false, durationMs: Date.now() - start, tokensUsed: 0 }
  }

  if (options.verbose) log.info(`CACHE MISS — calling LLM for ${intent.category}`)

  const llmResult = await options.llmResolver(intent)
  const llmTokens = Math.ceil(llmResult.length / 4)  // estimation

  // 5. Générer script vivant depuis résultat LLM
  const scriptCode = await generateScriptFromLLM(intent, llmResult)
  let livingScript = null

  if (scriptCode && scriptCode.length > 10) {
    try {
      livingScript = registry.registerScript(
        intent.category,
        intent.raw.slice(0, 100).replace(/[^a-zA-Z0-9 ]/g, '.'),
        scriptCode,
        'bash',
        'LLM'
      )
      if (options.verbose) log.info(`New living script created: ${livingScript.id}`)
    } catch (e: any) {
      log.warn(`Script generation failed: ${e.message}`)
    }
  }

  // 6. Stocker dans le cache sémantique
  await cache.store(text, intent.category, llmResult, {
    intentId: intent.id,
    scriptId: livingScript?.id,
    source: 'LLM',
  })

  registry.logIntent(intent, livingScript?.id, true, Date.now() - start)

  return {
    intent,
    result: llmResult,
    cacheHit: false,
    scriptUsed: livingScript?.id,
    durationMs: Date.now() - start,
    tokensUsed: llmTokens,
  }
}

// ── CLI: rex ingest / rex cache stats ─────────────────────────────────

export async function printStats(): Promise<void> {
  const cacheStats = cache.stats()
  const regStats = registry.stats()

  console.log('\n📊 REX Intent Engine Stats')
  console.log('─'.repeat(40))
  console.log(`Living scripts : ${regStats.totalScripts}`)
  console.log(`Intents logged : ${regStats.totalIntents}`)
  console.log(`Cache hit rate : ${(regStats.cacheHitRate * 100).toFixed(1)}%`)
  console.log(`Cache entries  : ${cacheStats.total}`)
  console.log('\nTop categories:')
  regStats.topCategories.forEach((c: any) => {
    console.log(`  ${c.category}: ${c.count} intents`)
  })
  console.log('\nTop cache entries:')
  cacheStats.topEntries.forEach((e: any) => {
    console.log(`  [${e.category}] "${e.text.slice(0, 50)}" (hits: ${e.score})`)
  })
}

// ── Boot: ingest memory au démarrage ──────────────────────────────────

export async function bootIngestMemory(): Promise<void> {
  const memPath = `${process.env.HOME}/.openclaw/workspace/MEMORY.md`
  const obsDir = `${process.env.HOME}/.openclaw/workspace/memory/observations`

  const [memCount, obsCount] = await Promise.all([
    cache.ingestMemoryFile(memPath),
    cache.ingestObservations(obsDir),
  ])

  if (memCount > 0 || obsCount > 0) {
    log.info(`Memory indexed: ${memCount} facts + ${obsCount} observations`)
  }
}
