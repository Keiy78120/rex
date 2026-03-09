/** @module OPTIMIZE */
// packages/cli/src/self-improve.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { SELF_IMPROVEMENT_DIR, MEMORY_DB_PATH } from './paths.js'
import { loadConfig } from './config.js'
import { llm } from './llm.js'
import { pickModel } from './router.js'
import { createLogger } from './logger.js'

const log = createLogger('OPTIMIZE:self-improve')

interface Lesson {
  id: string
  text: string
  category: string
  occurrences: number
  firstSeen: string
  lastSeen: string
  promoted: boolean
  dismissed: boolean
}

interface ErrorPattern {
  pattern: string
  count: number
  firstSeen: string
  lastSeen: string
  suggestedRule?: string
}

export function listLessons(): Lesson[] { return loadLessons() }

function loadLessons(): Lesson[] {
  const path = join(SELF_IMPROVEMENT_DIR, 'lessons.json')
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function saveLessons(lessons: Lesson[]): void {
  writeFileSync(join(SELF_IMPROVEMENT_DIR, 'lessons.json'), JSON.stringify(lessons, null, 2))
}

function loadErrorPatterns(): ErrorPattern[] {
  const path = join(SELF_IMPROVEMENT_DIR, 'error-patterns.json')
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function saveErrorPatterns(patterns: ErrorPattern[]): void {
  writeFileSync(join(SELF_IMPROVEMENT_DIR, 'error-patterns.json'), JSON.stringify(patterns, null, 2))
}

export async function selfReview(): Promise<{ newLessons: number; ruleCandidates: number }> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' }
  const config = loadConfig()
  if (!config.selfImprovement.enabled) {
    log.info('Self-improvement disabled in config')
    console.log(`${COLORS.dim}Self-improvement disabled in config.${COLORS.reset}`)
    return { newLessons: 0, ruleCandidates: 0 }
  }
  if (!existsSync(MEMORY_DB_PATH)) {
    log.warn(`No memory DB found at ${MEMORY_DB_PATH}`)
    console.log(`${COLORS.yellow}No memory DB found at ${MEMORY_DB_PATH}${COLORS.reset}`)
    return { newLessons: 0, ruleCandidates: 0 }
  }

  console.log(`\n${COLORS.bold}REX Self-Review${COLORS.reset}\n`)

  const db = new Database(MEMORY_DB_PATH, { readonly: true })
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // Find recent lesson-type memories not yet extracted
  const recentLessons = db.prepare(
    "SELECT id, summary, content, created_at FROM memories WHERE category = 'lesson' AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 20"
  ).all() as Array<{ id: number; summary: string; content: string; created_at: string }>

  const existingLessons = loadLessons()
  const existingTexts = new Set(existingLessons.map(l => l.text.toLowerCase().trim()))
  let newCount = 0

  for (const mem of recentLessons) {
    const text = mem.summary.trim()
    if (existingTexts.has(text.toLowerCase())) {
      // Increment occurrences
      const existing = existingLessons.find(l => l.text.toLowerCase().trim() === text.toLowerCase())
      if (existing) {
        existing.occurrences++
        existing.lastSeen = mem.created_at
      }
      continue
    }
    existingLessons.push({
      id: `lesson-${Date.now()}-${mem.id}`,
      text,
      category: 'lesson',
      occurrences: 1,
      firstSeen: mem.created_at,
      lastSeen: mem.created_at,
      promoted: false,
      dismissed: false,
    })
    newCount++
  }

  saveLessons(existingLessons)
  log.info(`Lessons: ${existingLessons.length} total, ${newCount} new`)
  console.log(`  Lessons: ${existingLessons.length} total, ${newCount} new`)

  // Check error patterns
  const errorMemories = db.prepare(
    "SELECT summary FROM memories WHERE category IN ('debug', 'fix') AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 50"
  ).all() as Array<{ summary: string }>

  const patterns = loadErrorPatterns()
  let ruleCandidates = 0

  // Detect recurring patterns via LLM
  if (errorMemories.length >= 5) {
    const errorSummaries = errorMemories.map(m => m.summary).join('\n')
    try {
      const model = await pickModel('reason')
      console.log(`  Analyzing ${errorMemories.length} error/fix memories with ${model}...`)
      const analysis = await llm(
        `Analyze these error/fix summaries for recurring patterns. Output JSON array of patterns:\n\n${errorSummaries.slice(0, 3000)}\n\nJSON: [{"pattern": "description", "count": estimated_occurrences, "suggestedRule": "rule text"}]`,
        'You are a code pattern analyzer. Output ONLY valid JSON.',
        model
      )

      let parsed: any[] = []
      try { parsed = JSON.parse(analysis) } catch {
        const brace = analysis.match(/\[[\s\S]*\]/)
        if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
      }

      for (const p of parsed) {
        if (p.count >= config.selfImprovement.ruleThreshold) {
          const exists = patterns.find(ep => ep.pattern === p.pattern)
          if (!exists) {
            patterns.push({
              pattern: p.pattern,
              count: p.count,
              firstSeen: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              suggestedRule: p.suggestedRule,
            })
            ruleCandidates++
          }
        }
      }
    } catch (e: any) {
      log.warn(`Pattern analysis skipped: ${e.message?.slice(0, 100)}`)
      console.log(`  ${COLORS.yellow}Pattern analysis skipped (LLM unavailable)${COLORS.reset}`)
    }
  } else {
    console.log(`  ${COLORS.dim}Not enough error memories for pattern analysis (need 5+, have ${errorMemories.length})${COLORS.reset}`)
  }

  saveErrorPatterns(patterns)

  // Write rule-candidates.md for human review
  const activePatterns = patterns.filter(p => p.count >= config.selfImprovement.ruleThreshold)
  if (activePatterns.length) {
    const md = `# Rule Candidates\n\nThese patterns were detected ${config.selfImprovement.ruleThreshold}+ times. Review and approve with \`rex promote-rule <index>\`.\n\n` +
      activePatterns.map((p, i) => `## ${i + 1}. ${p.pattern}\n\n- Count: ${p.count}\n- First seen: ${p.firstSeen}\n- Suggested rule: ${p.suggestedRule || 'N/A'}\n`).join('\n')
    writeFileSync(join(SELF_IMPROVEMENT_DIR, 'rule-candidates.md'), md)
    console.log(`  Rule candidates: ${activePatterns.length} (see ~/.claude/rex/self-improvement/rule-candidates.md)`)
  }

  db.close()

  log.info(`Self-review done: ${newCount} new lessons, ${ruleCandidates} rule candidates`)
  console.log(`\n${COLORS.green}Done.${COLORS.reset} ${newCount} new lessons, ${ruleCandidates} rule candidates\n`)
  return { newLessons: newCount, ruleCandidates }
}

export async function promoteRule(index: number): Promise<boolean> {
  const patterns = loadErrorPatterns()
  const active = patterns.filter(p => p.count >= loadConfig().selfImprovement.ruleThreshold)
  if (index < 1 || index > active.length) return false

  const pattern = active[index - 1]
  if (!pattern.suggestedRule) return false

  // ── Sandbox gate: validate before promoting to prod rules ─────────────────
  try {
    const { validateBeforePromote } = await import('./sandbox/sandbox-runner.js')
    const validation = await validateBeforePromote({ ...pattern, suggestedRule: pattern.suggestedRule! })
    if (!validation.safe) {
      log.warn(`promoteRule: sandbox rejected rule #${index} — ${validation.reason}`)
      console.log(`  ⚠️  Sandbox validation failed: ${validation.reason}`)
      console.log(`  Rule NOT promoted. Fix the issue and retry.`)
      return false
    }
    log.info(`promoteRule: sandbox validated rule #${index} (${validation.reason})`)
    console.log(`  ✓ Sandbox validation passed`)
  } catch (err) {
    // Sandbox unavailable (Docker not installed) — warn but allow promote
    log.warn(`promoteRule: sandbox validation unavailable — ${(err as Error).message?.slice(0, 60)}`)
    console.log(`  ⚠️  Sandbox not available — promoting without validation (install Docker to enable)`)
  }

  const HOME = process.env.HOME || '~'
  const rulesDir = join(HOME, '.claude', 'rules')
  const ruleName = pattern.pattern.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const rulePath = join(rulesDir, `${ruleName}.md`)

  writeFileSync(rulePath, `# ${pattern.pattern}\n\n${pattern.suggestedRule}\n\n<!-- Auto-generated by REX self-improvement on ${new Date().toISOString()} -->\n`)
  return true
}
