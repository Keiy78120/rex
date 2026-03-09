/**
 * REX Reflector — Success pattern extraction & runbook promotion
 * Extracts lessons from successful sessions and promotes high-confidence ones to runbooks.
 * @module OPTIMIZE
 */

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { createLogger } from './logger.js'
import { saveRunbook, findRunbooks, getObservations, type Runbook } from './observer.js'
import { pickModel } from './router.js'
import { REX_DIR, ensureRexDirs } from './paths.js'

const log = createLogger('OPTIMIZE:reflector')

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

const CONFIDENCE_THRESHOLD = 0.7

export interface Lesson {
  pattern: string
  trigger: string
  confidence: number
  source: string
}

export interface ReflectionResult {
  lessons: Lesson[]
  promoted: number
  skipped: number
}

const EXTRACT_PROMPT = `Extract successful patterns from this development session.
For each pattern that worked well, provide:
- pattern: what worked (concise, actionable)
- trigger: when to reuse this pattern (context/situation)
- confidence: 0-1 based on how clear the success signal is

Return ONLY a JSON array, no markdown fences, no explanation. Example:
[{"pattern":"Used pnpm build before commit to catch errors early","trigger":"before git commit","confidence":0.9}]

Session text:
`

/**
 * Try to parse a JSON array of lessons from LLM response.
 * Handles markdown fences and extra text around the JSON.
 */
function parseLessonsJson(raw: string, source: string): Lesson[] {
  let text = raw.trim()

  // Strip markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()

  // Find JSON array boundaries
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []

  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as Array<{
      pattern?: string
      trigger?: string
      confidence?: number
    }>

    return arr
      .filter(item => item.pattern && item.trigger && typeof item.confidence === 'number')
      .map(item => ({
        pattern: item.pattern!,
        trigger: item.trigger!,
        confidence: Math.max(0, Math.min(1, item.confidence!)),
        source,
      }))
  } catch {
    return []
  }
}

const SUCCESS_KEYWORDS = [
  /\u2713/,       // checkmark
  /\bsuccess/i,
  /\bpassed\b/i,
  /\bfixed\b/i,
  /\bresolved\b/i,
  /\bcompleted?\b/i,
  /\bworking\b/i,
  /\bdone\b/i,
]

/**
 * Keyword-based fallback extraction when LLM is unavailable.
 */
function extractByKeywords(text: string, source: string): Lesson[] {
  const lines = text.split('\n')
  const lessons: Lesson[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!SUCCESS_KEYWORDS.some(kw => kw.test(line))) continue

    // Gather surrounding context (2 lines before, current line)
    const contextLines = lines.slice(Math.max(0, i - 2), i + 1)
    const pattern = contextLines.join(' ').replace(/\s+/g, ' ').trim()

    if (pattern.length < 10 || pattern.length > 300) continue

    lessons.push({
      pattern: pattern.slice(0, 200),
      trigger: 'similar development context',
      confidence: 0.5,
      source,
    })
  }

  // Deduplicate by keeping only unique patterns (first 60 chars)
  const seen = new Set<string>()
  return lessons.filter(l => {
    const key = l.pattern.slice(0, 60).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 10) // Cap at 10 keyword lessons
}

/**
 * Extract lessons from a session text.
 * Tries LLM first, falls back to keyword extraction.
 */
export async function extractLessons(sessionText: string, source = 'session'): Promise<Lesson[]> {
  // Truncate very long sessions to avoid overwhelming the LLM
  const truncated = sessionText.length > 8000
    ? sessionText.slice(0, 4000) + '\n...[truncated]...\n' + sessionText.slice(-4000)
    : sessionText

  try {
    const model = await pickModel('background')
    log.info(`Extracting lessons with model=${model}`)

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: EXTRACT_PROMPT + truncated,
        stream: false,
        think: false,
        keep_alive: '30s',
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new Error(`Ollama ${res.status}`)

    const data = await res.json() as { response: string }
    const lessons = parseLessonsJson(data.response, source)

    if (lessons.length > 0) {
      log.info(`LLM extracted ${lessons.length} lessons`)
      return lessons
    }

    log.warn('LLM returned no parseable lessons, falling back to keywords')
  } catch (err) {
    log.warn(`LLM extraction failed (${err}), falling back to keywords`)
  }

  return extractByKeywords(sessionText, source)
}

/**
 * Promote a lesson to a runbook.
 * Returns the runbook ID, or -1 on failure.
 */
export function promoteToRunbook(lesson: Lesson): number {
  const name = lesson.pattern.length > 60
    ? lesson.pattern.slice(0, 57) + '...'
    : lesson.pattern

  return saveRunbook(name, lesson.trigger, [lesson.pattern], 'reflector')
}

/**
 * Suggest relevant runbooks for a given context.
 */
export function suggestRunbooks(context: string): Runbook[] {
  return findRunbooks(context)
}

/**
 * Reflect on a session log file: extract lessons, promote high-confidence ones.
 */
export async function reflectOnSession(logPath: string): Promise<ReflectionResult> {
  let content: string
  try {
    content = readFileSync(logPath, 'utf-8')
  } catch (err) {
    log.error(`Cannot read session log: ${logPath} — ${err}`)
    return { lessons: [], promoted: 0, skipped: 0 }
  }

  if (content.trim().length === 0) {
    log.warn(`Session log is empty: ${logPath}`)
    return { lessons: [], promoted: 0, skipped: 0 }
  }

  const lessons = await extractLessons(content, logPath)
  let promoted = 0
  let skipped = 0

  for (const lesson of lessons) {
    if (lesson.confidence >= CONFIDENCE_THRESHOLD) {
      const id = promoteToRunbook(lesson)
      if (id > 0) promoted++
      else skipped++
    } else {
      skipped++
    }
  }

  log.info(`Reflection: ${lessons.length} lessons, ${promoted} promoted, ${skipped} skipped`)
  return { lessons, promoted, skipped }
}

/**
 * Pretty-print a reflection result to the console.
 */
export function showReflection(result: ReflectionResult): void {
  const line = '\u2500'.repeat(28)

  console.log('\nREX Reflection')
  console.log(line)
  console.log(`  Lessons extracted: ${result.lessons.length}`)
  console.log(`  Promoted to runbooks: ${result.promoted}`)
  console.log(`  Skipped (low confidence): ${result.skipped}`)

  if (result.lessons.length > 0) {
    console.log('\n  Lessons:')
    for (const l of result.lessons) {
      const dot = l.confidence >= CONFIDENCE_THRESHOLD ? '\u25cf' : '\u25cb'
      console.log(`   ${dot} [${l.confidence.toFixed(1)}] ${l.pattern.slice(0, 80)} \u2192 trigger: ${l.trigger}`)
    }
  }

  console.log(line)
}

// ── Forgetting Curve ──────────────────────────────────────────

export interface ArchiveResult {
  compressed: number
  archived: number
  unchanged: number
}

export function archiveOld(daysActive = 30, daysCompress = 90, _daysArchive = 90): ArchiveResult {
  try {
    ensureRexDirs()
    const dbPath = join(REX_DIR, 'sync-queue.sqlite')
    const d = new Database(dbPath)
    d.pragma('journal_mode = WAL')

    // Ensure observations table has status column (it should from observer.ts)
    d.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        project TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)

    const now = Date.now()
    const msPerDay = 86400_000

    const rows = d.prepare("SELECT id, content, status, created_at FROM observations WHERE status = 'active'").all() as Record<string, unknown>[]

    let compressed = 0
    let archived = 0
    let unchanged = 0

    for (const row of rows) {
      const created = new Date(row.created_at as string).getTime()
      const ageDays = (now - created) / msPerDay

      if (ageDays > daysCompress) {
        d.prepare("UPDATE observations SET status = 'archived' WHERE id = ?").run(row.id)
        archived++
      } else if (ageDays > daysActive) {
        d.prepare("UPDATE observations SET status = 'compressed' WHERE id = ?").run(row.id)
        compressed++
      } else {
        unchanged++
      }
    }

    d.close()
    log.info(`Archive: ${compressed} compressed, ${archived} archived, ${unchanged} unchanged`)
    return { compressed, archived, unchanged }
  } catch (err) {
    log.error(`archiveOld failed: ${err}`)
    return { compressed: 0, archived: 0, unchanged: 0 }
  }
}

export function showArchiveResult(result: ArchiveResult): void {
  const line = '\u2500'.repeat(28)
  console.log('\nREX Forgetting Curve')
  console.log(line)
  console.log(`  Compressed (30-90 days): ${result.compressed}`)
  console.log(`  Archived (90+ days):     ${result.archived}`)
  console.log(`  Unchanged (active):      ${result.unchanged}`)
  console.log(line)
}

// ── Pattern Promotion ─────────────────────────────────────────

export interface PromotedRule {
  id: number
  pattern: string
  occurrences: number
  status: string
  createdAt: string
}

function ensurePromotedRulesTable(d: ReturnType<typeof Database>): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS promoted_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      occurrences INTEGER DEFAULT 1,
      status TEXT DEFAULT 'candidate',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function promotePatterns(minOccurrences = 3): PromotedRule[] {
  try {
    const observations = getObservations({ type: 'pattern', limit: 500 })
    if (observations.length === 0) return []

    // Count similar patterns by first 60 chars as key
    const counts = new Map<string, { content: string; count: number }>()
    for (const o of observations) {
      const key = o.content.slice(0, 60).toLowerCase().trim()
      const existing = counts.get(key)
      if (existing) {
        existing.count++
      } else {
        counts.set(key, { content: o.content, count: 1 })
      }
    }

    const dbPath = join(REX_DIR, 'sync-queue.sqlite')
    const d = new Database(dbPath)
    d.pragma('journal_mode = WAL')
    ensurePromotedRulesTable(d)

    const promoted: PromotedRule[] = []

    for (const [, value] of counts) {
      if (value.count < minOccurrences) continue

      // Check if already promoted
      const existing = d.prepare('SELECT id FROM promoted_rules WHERE pattern = ?').get(value.content.slice(0, 200)) as Record<string, unknown> | undefined
      if (existing) continue

      const result = d.prepare(
        'INSERT INTO promoted_rules (pattern, occurrences) VALUES (?, ?)'
      ).run(value.content.slice(0, 200), value.count)

      promoted.push({
        id: result.lastInsertRowid as number,
        pattern: value.content.slice(0, 200),
        occurrences: value.count,
        status: 'candidate',
        createdAt: new Date().toISOString(),
      })

      log.info(`Pattern promoted: "${value.content.slice(0, 60)}..." (${value.count} occurrences)`)
    }

    d.close()
    return promoted
  } catch (err) {
    log.error(`promotePatterns failed: ${err}`)
    return []
  }
}

export function getPromotedRules(): PromotedRule[] {
  try {
    const dbPath = join(REX_DIR, 'sync-queue.sqlite')
    const d = new Database(dbPath)
    d.pragma('journal_mode = WAL')
    ensurePromotedRulesTable(d)
    const rows = d.prepare('SELECT * FROM promoted_rules ORDER BY occurrences DESC').all() as Record<string, unknown>[]
    d.close()
    return rows.map(r => ({
      id: r.id as number,
      pattern: r.pattern as string,
      occurrences: r.occurrences as number,
      status: r.status as string,
      createdAt: r.created_at as string,
    }))
  } catch (err) {
    log.error(`getPromotedRules failed: ${err}`)
    return []
  }
}
