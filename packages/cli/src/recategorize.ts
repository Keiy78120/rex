// packages/cli/src/recategorize.ts
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { MEMORY_DB_PATH } from './paths.js'
import { loadConfig } from './config.js'
import { pickModel } from './router.js'
import { llm } from './llm.js'
import { createLogger } from './logger.js'

const log = createLogger('recategorize')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const VALID_CATEGORIES = ['debug', 'fix', 'pattern', 'lesson', 'architecture', 'config', 'project', 'reference', 'session'] as const

const CLASSIFY_PROMPT = (content: string) =>
  `Classify this developer memory chunk. Output ONLY valid JSON, no markdown.

Categories: debug, fix, pattern, lesson, architecture, config, project, reference, session

- debug: debugging an issue, tracing errors
- fix: applying a fix or patch, solution found
- pattern: reusable code patterns, techniques
- lesson: lessons learned, mistakes to avoid
- architecture: system design, structure decisions
- config: configuration changes, setup steps
- project: project overview, stack, status
- reference: API docs, external knowledge, lib behavior
- session: general content (default fallback)

Content:
${content.slice(0, 1500)}

JSON output: {"category": "<one of the above>", "summary": "<1-2 sentence summary>"}`

async function classifyChunk(content: string, routing: string, claudeFallback: string): Promise<{ category: string; summary: string } | null> {
  const prompt = CLASSIFY_PROMPT(content)

  // Try Ollama first
  if (routing !== 'claude-only') {
    try {
      const model = await pickModel('categorize')
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3, num_ctx: 4096 } }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json() as { response: string }
        const parsed = parseJsonResponse(data.response)
        if (parsed) return parsed
      }
    } catch {}
  }

  // Fallback to Claude
  if (routing !== 'ollama-only') {
    try {
      const result = await llm(prompt, undefined, claudeFallback)
      return parseJsonResponse(result)
    } catch {}
  }

  return null
}

function parseJsonResponse(raw: string): { category: string; summary: string } | null {
  // 3-attempt JSON parsing: raw → strip markdown fences → greedy brace match
  let parsed: any = null
  try { parsed = JSON.parse(raw) } catch {}
  if (!parsed) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) { try { parsed = JSON.parse(fence[1].trim()) } catch {} }
  }
  if (!parsed) {
    const brace = raw.match(/\{[\s\S]*\}/)
    if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
  }
  if (!parsed) return null

  const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'session'
  const summary = typeof parsed.summary === 'string' && parsed.summary.length > 5 ? parsed.summary : null
  if (!summary) return null
  return { category, summary }
}

export async function recategorize(options: { batch?: number; dryRun?: boolean } = {}): Promise<void> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' }
  const config = loadConfig()
  const batchSize = options.batch ?? 50

  const db = new Database(MEMORY_DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // Find memories that need recategorization:
  // category = 'session' OR category = 'general' OR needs_reprocess = 1
  const rows = db.prepare(
    "SELECT id, content FROM memories WHERE category IN ('session', 'general') OR needs_reprocess = 1 LIMIT ?"
  ).all(batchSize) as Array<{ id: number; content: string }>

  log.info(`Starting recategorize: ${rows.length} memories to process (batch: ${batchSize})`)
  console.log(`\n${COLORS.bold}REX Recategorize${COLORS.reset}`)
  console.log(`${COLORS.dim}Found ${rows.length} memories to process (batch: ${batchSize})${COLORS.reset}\n`)

  if (rows.length === 0) {
    console.log(`${COLORS.green}All memories are already categorized.${COLORS.reset}`)
    db.close()
    return
  }

  if (options.dryRun) {
    console.log(`${COLORS.yellow}[dry-run] Would process ${rows.length} memories. Nothing saved.${COLORS.reset}`)
    db.close()
    return
  }

  const update = db.prepare("UPDATE memories SET category = ?, summary = ?, needs_reprocess = 0 WHERE id = ?")
  let processed = 0
  let failed = 0
  const stats: Record<string, number> = {}

  for (const row of rows) {
    const result = await classifyChunk(row.content, config.llm.routing, config.llm.claudeFallback)
    if (result) {
      update.run(result.category, result.summary, row.id)
      stats[result.category] = (stats[result.category] || 0) + 1
      processed++
      process.stdout.write(`\r  ${COLORS.cyan}${processed}/${rows.length}${COLORS.reset} processed`)
    } else {
      log.warn(`Failed to classify memory id=${row.id}, flagged for retry`)
      db.prepare("UPDATE memories SET needs_reprocess = 1 WHERE id = ?").run(row.id)
      failed++
    }
  }

  log.info(`Done: ${processed} categorized, ${failed} failed`)
  console.log(`\n\n${COLORS.green}Done:${COLORS.reset} ${processed} categorized, ${failed} failed (flagged for retry)\n`)
  for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(15)} ${count}`)
  }

  db.close()
}
