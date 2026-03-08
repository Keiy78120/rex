import { join } from 'node:path'
import Database from 'better-sqlite3'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('observer')

const DB_PATH = join(REX_DIR, 'sync-queue.sqlite')

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or',
])

export interface Runbook {
  id: number
  name: string
  trigger: string
  steps: string[]
  source: string
  successCount: number
  lastUsed: string | null
  createdAt: string
}

let db: ReturnType<typeof Database> | null = null

function ensureDb(): ReturnType<typeof Database> {
  if (db) return db
  ensureRexDirs()
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS runbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      steps TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      success_count INTEGER DEFAULT 1,
      last_used TEXT,
      created_at TEXT NOT NULL
    )
  `)
  return db
}

function rowToRunbook(row: Record<string, unknown>): Runbook {
  return {
    id: row.id as number,
    name: row.name as string,
    trigger: row.trigger as string,
    steps: JSON.parse(row.steps as string) as string[],
    source: (row.source as string) ?? 'manual',
    successCount: row.success_count as number,
    lastUsed: (row.last_used as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export function saveRunbook(name: string, trigger: string, steps: string[], source = 'manual'): number {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'INSERT INTO runbooks (name, trigger, steps, source, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    const result = stmt.run(name, trigger, JSON.stringify(steps), source, new Date().toISOString())
    log.info(`Saved runbook "${name}" (id=${result.lastInsertRowid})`)
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`saveRunbook failed: ${err}`)
    return -1
  }
}

export function findRunbooks(context: string, limit = 5): Runbook[] {
  try {
    const d = ensureDb()
    const rows = d.prepare('SELECT * FROM runbooks').all() as Record<string, unknown>[]
    const contextWords = context.toLowerCase().split(/\s+/).filter(w => !STOP_WORDS.has(w))

    const scored: { runbook: Runbook; score: number }[] = []
    for (const row of rows) {
      const trigger = (row.trigger as string).toLowerCase()
      const triggerWords = trigger.split(/\s+/).filter(w => !STOP_WORDS.has(w))
      if (triggerWords.length === 0) continue

      const matched = triggerWords.filter(w => contextWords.includes(w)).length
      const score = matched / triggerWords.length
      if (score >= 0.4) {
        scored.push({ runbook: rowToRunbook(row), score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map(s => s.runbook)
  } catch (err) {
    log.error(`findRunbooks failed: ${err}`)
    return []
  }
}

export function markRunbookUsed(id: number): void {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'UPDATE runbooks SET success_count = success_count + 1, last_used = ? WHERE id = ?'
    )
    stmt.run(new Date().toISOString(), id)
  } catch (err) {
    log.error(`markRunbookUsed failed: ${err}`)
  }
}

export function listRunbooks(): Runbook[] {
  try {
    const d = ensureDb()
    const rows = d.prepare('SELECT * FROM runbooks ORDER BY success_count DESC').all() as Record<string, unknown>[]
    return rows.map(rowToRunbook)
  } catch (err) {
    log.error(`listRunbooks failed: ${err}`)
    return []
  }
}

export function showRunbooks(): void {
  const runbooks = listRunbooks()
  console.log('\nREX Runbooks')
  console.log('\u2500'.repeat(28))

  if (runbooks.length === 0) {
    console.log('  No runbooks saved yet.')
    console.log('\u2500'.repeat(28))
    return
  }

  for (const rb of runbooks) {
    const stepsStr = rb.steps.map((s, i) => `${i + 1}. ${s}`).join('  ')
    console.log(`  #${rb.id}  ${rb.name}          \u00d7${rb.successCount} uses`)
    console.log(`      Trigger: ${rb.trigger}`)
    console.log(`      Steps: ${stepsStr}`)
    console.log(`      Source: ${rb.source}`)
    console.log()
  }

  console.log('\u2500'.repeat(28))
  console.log(`  ${runbooks.length} runbook${runbooks.length === 1 ? '' : 's'} saved`)
}

export function deleteRunbook(id: number): boolean {
  try {
    const d = ensureDb()
    const stmt = d.prepare('DELETE FROM runbooks WHERE id = ?')
    const result = stmt.run(id)
    if (result.changes > 0) {
      log.info(`Deleted runbook id=${id}`)
      return true
    }
    return false
  } catch (err) {
    log.error(`deleteRunbook failed: ${err}`)
    return false
  }
}

// ── Observations ──────────────────────────────────────────────

export type ObservationType = 'decision' | 'blocker' | 'solution' | 'error' | 'pattern' | 'habit'

export interface Observation {
  id: number
  sessionId: string
  project: string
  type: ObservationType
  content: string
  status: string
  createdAt: string
}

function ensureObservationsTable(): void {
  const d = ensureDb()
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
}

export function addObservation(sessionId: string, project: string, type: ObservationType, content: string): number {
  try {
    ensureObservationsTable()
    const d = ensureDb()
    const stmt = d.prepare(
      'INSERT INTO observations (session_id, project, type, content) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(sessionId, project, type, content)
    log.info(`Observation added: type=${type}, id=${result.lastInsertRowid}`)
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`addObservation failed: ${err}`)
    return -1
  }
}

export function getObservations(opts?: { project?: string; type?: ObservationType; limit?: number }): Observation[] {
  try {
    ensureObservationsTable()
    const d = ensureDb()
    const conditions: string[] = []
    const params: unknown[] = []
    if (opts?.project) { conditions.push('project = ?'); params.push(opts.project) }
    if (opts?.type) { conditions.push('type = ?'); params.push(opts.type) }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = opts?.limit ?? 50
    const rows = d.prepare(`SELECT * FROM observations ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, limit) as Record<string, unknown>[]
    return rows.map(r => ({
      id: r.id as number,
      sessionId: (r.session_id as string) ?? '',
      project: (r.project as string) ?? '',
      type: r.type as ObservationType,
      content: r.content as string,
      status: (r.status as string) ?? 'active',
      createdAt: r.created_at as string,
    }))
  } catch (err) {
    log.error(`getObservations failed: ${err}`)
    return []
  }
}

export function getObservationStats(): { byType: Record<string, number>; byProject: Record<string, number>; total: number } {
  try {
    ensureObservationsTable()
    const d = ensureDb()
    const byType: Record<string, number> = {}
    const byProject: Record<string, number> = {}
    const typeRows = d.prepare('SELECT type, COUNT(*) as cnt FROM observations GROUP BY type').all() as Record<string, unknown>[]
    for (const r of typeRows) byType[r.type as string] = r.cnt as number
    const projRows = d.prepare('SELECT project, COUNT(*) as cnt FROM observations WHERE project != \'\' GROUP BY project').all() as Record<string, unknown>[]
    for (const r of projRows) byProject[r.project as string] = r.cnt as number
    const totalRow = d.prepare('SELECT COUNT(*) as cnt FROM observations').get() as Record<string, unknown>
    return { byType, byProject, total: totalRow.cnt as number }
  } catch (err) {
    log.error(`getObservationStats failed: ${err}`)
    return { byType: {}, byProject: {}, total: 0 }
  }
}

export function showObservations(opts?: { project?: string; type?: ObservationType }): void {
  const observations = getObservations(opts)
  const stats = getObservationStats()
  console.log('\nREX Observations')
  console.log('\u2500'.repeat(28))

  if (observations.length === 0) {
    console.log('  No observations recorded yet.')
    console.log('\u2500'.repeat(28))
    return
  }

  for (const o of observations) {
    const typeLabel = o.type.toUpperCase().padEnd(9)
    console.log(`  #${o.id}  [${typeLabel}] ${o.content.slice(0, 80)}`)
    if (o.project) console.log(`       project: ${o.project}`)
    console.log(`       ${o.createdAt}  status: ${o.status}`)
    console.log()
  }

  console.log('\u2500'.repeat(28))
  console.log(`  ${stats.total} total observations`)
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`    ${type.padEnd(12)} ${count}`)
  }
}

// ── Habits ────────────────────────────────────────────────────

export interface Habit {
  id: number
  pattern: string
  frequency: number
  confidence: number
  firstSeen: string
  lastSeen: string
}

function ensureHabitsTable(): void {
  const d = ensureDb()
  d.exec(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.5,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function recordHabit(pattern: string): number {
  try {
    ensureHabitsTable()
    const d = ensureDb()
    const existing = d.prepare('SELECT id, frequency FROM habits WHERE pattern = ?').get(pattern) as Record<string, unknown> | undefined
    if (existing) {
      const newFreq = (existing.frequency as number) + 1
      const newConf = Math.min(1, 0.5 + (newFreq - 1) * 0.1)
      d.prepare('UPDATE habits SET frequency = ?, confidence = ?, last_seen = datetime(\'now\') WHERE id = ?')
        .run(newFreq, newConf, existing.id)
      log.info(`Habit updated: freq=${newFreq}, id=${existing.id}`)
      return existing.id as number
    }
    const result = d.prepare('INSERT INTO habits (pattern) VALUES (?)').run(pattern)
    log.info(`Habit recorded: id=${result.lastInsertRowid}`)
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`recordHabit failed: ${err}`)
    return -1
  }
}

export function getHabits(minFrequency = 1): Habit[] {
  try {
    ensureHabitsTable()
    const d = ensureDb()
    const rows = d.prepare('SELECT * FROM habits WHERE frequency >= ? ORDER BY frequency DESC').all(minFrequency) as Record<string, unknown>[]
    return rows.map(r => ({
      id: r.id as number,
      pattern: r.pattern as string,
      frequency: r.frequency as number,
      confidence: r.confidence as number,
      firstSeen: r.first_seen as string,
      lastSeen: r.last_seen as string,
    }))
  } catch (err) {
    log.error(`getHabits failed: ${err}`)
    return []
  }
}

export function showHabits(minFrequency = 1): void {
  const habits = getHabits(minFrequency)
  console.log('\nREX Habits')
  console.log('\u2500'.repeat(28))

  if (habits.length === 0) {
    console.log('  No habits detected yet.')
    console.log('\u2500'.repeat(28))
    return
  }

  for (const h of habits) {
    const bar = '\u2588'.repeat(Math.min(h.frequency, 20))
    console.log(`  #${h.id}  ${h.pattern.slice(0, 60)}`)
    console.log(`       freq: ${h.frequency}  confidence: ${h.confidence.toFixed(2)}  ${bar}`)
    console.log(`       first: ${h.firstSeen}  last: ${h.lastSeen}`)
    console.log()
  }

  console.log('\u2500'.repeat(28))
  console.log(`  ${habits.length} habit${habits.length === 1 ? '' : 's'} tracked`)
}

// ── Facts ─────────────────────────────────────────────────────

export interface Fact {
  id: number
  category: string
  content: string
  source: string
  confidence: number
  accessCount: number
  lastAccessed: string | null
  createdAt: string
}

function ensureFactsTable(): void {
  const d = ensureDb()
  d.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT DEFAULT '',
      confidence REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

export function addFact(category: string, content: string, source = ''): number {
  try {
    ensureFactsTable()
    const d = ensureDb()
    const result = d.prepare(
      'INSERT INTO facts (category, content, source) VALUES (?, ?, ?)'
    ).run(category, content, source)
    log.info(`Fact added: category=${category}, id=${result.lastInsertRowid}`)
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`addFact failed: ${err}`)
    return -1
  }
}

export function getFacts(category?: string): Fact[] {
  try {
    ensureFactsTable()
    const d = ensureDb()
    const query = category
      ? 'SELECT * FROM facts WHERE category = ? ORDER BY access_count DESC'
      : 'SELECT * FROM facts ORDER BY access_count DESC'
    const rows = (category ? d.prepare(query).all(category) : d.prepare(query).all()) as Record<string, unknown>[]

    // Increment access_count for returned facts
    const updateStmt = d.prepare('UPDATE facts SET access_count = access_count + 1, last_accessed = datetime(\'now\') WHERE id = ?')
    for (const r of rows) updateStmt.run(r.id)

    return rows.map(r => ({
      id: r.id as number,
      category: r.category as string,
      content: r.content as string,
      source: (r.source as string) ?? '',
      confidence: r.confidence as number,
      accessCount: r.access_count as number,
      lastAccessed: (r.last_accessed as string) ?? null,
      createdAt: r.created_at as string,
    }))
  } catch (err) {
    log.error(`getFacts failed: ${err}`)
    return []
  }
}

export function factStats(): { byCategory: Record<string, number>; total: number } {
  try {
    ensureFactsTable()
    const d = ensureDb()
    const byCategory: Record<string, number> = {}
    const rows = d.prepare('SELECT category, COUNT(*) as cnt FROM facts GROUP BY category').all() as Record<string, unknown>[]
    for (const r of rows) byCategory[r.category as string] = r.cnt as number
    const totalRow = d.prepare('SELECT COUNT(*) as cnt FROM facts').get() as Record<string, unknown>
    return { byCategory, total: totalRow.cnt as number }
  } catch (err) {
    log.error(`factStats failed: ${err}`)
    return { byCategory: {}, total: 0 }
  }
}

export function showFacts(category?: string): void {
  const facts = getFacts(category)
  const stats = factStats()
  console.log('\nREX Facts')
  console.log('\u2500'.repeat(28))

  if (facts.length === 0) {
    console.log(`  No facts stored${category ? ` in category "${category}"` : ''}.`)
    console.log('\u2500'.repeat(28))
    return
  }

  for (const f of facts) {
    console.log(`  #${f.id}  [${f.category}] ${f.content.slice(0, 80)}`)
    if (f.source) console.log(`       source: ${f.source}`)
    console.log(`       confidence: ${f.confidence.toFixed(2)}  accessed: ${f.accessCount}x`)
    console.log()
  }

  console.log('\u2500'.repeat(28))
  console.log(`  ${stats.total} total facts`)
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    console.log(`    ${cat.padEnd(16)} ${count}`)
  }
}
