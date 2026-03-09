/** @module BUDGET */
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('BUDGET:cache')

export const CACHE_DB_PATH = join(REX_DIR, 'cache.sqlite')

let db: ReturnType<typeof Database> | null = null

function ensureDb(): ReturnType<typeof Database> {
  if (db) return db
  ensureRexDirs()
  db = new Database(CACHE_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_hash TEXT UNIQUE NOT NULL,
      response TEXT NOT NULL,
      model TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT 'general',
      tokens_saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      ttl_hours INTEGER NOT NULL DEFAULT 168
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_hash ON llm_cache (prompt_hash)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cache_created ON llm_cache (created_at)`)
  return db
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex')
}

export function cacheGet(promptHash: string): string | null {
  try {
    const d = ensureDb()
    const row = d.prepare(
      'SELECT id, response, created_at, ttl_hours FROM llm_cache WHERE prompt_hash = ?'
    ).get(promptHash) as { id: number; response: string; created_at: string; ttl_hours: number } | undefined

    if (!row) return null

    // Check TTL
    const created = new Date(row.created_at).getTime()
    const expiresAt = created + row.ttl_hours * 3600_000
    if (Date.now() > expiresAt) {
      d.prepare('DELETE FROM llm_cache WHERE id = ?').run(row.id)
      log.debug(`Cache expired for hash ${promptHash.slice(0, 8)}`)
      return null
    }

    // Increment hit count
    d.prepare('UPDATE llm_cache SET hit_count = hit_count + 1 WHERE id = ?').run(row.id)
    log.debug(`Cache hit for hash ${promptHash.slice(0, 8)}`)
    return row.response
  } catch (err) {
    log.error(`cacheGet failed: ${err}`)
    return null
  }
}

export function cacheSet(
  promptHash: string,
  response: string,
  model: string,
  taskType: string,
  tokensSaved: number,
  ttlHours = 168
): void {
  try {
    const d = ensureDb()
    d.prepare(`
      INSERT INTO llm_cache (prompt_hash, response, model, task_type, tokens_saved, created_at, ttl_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(prompt_hash) DO UPDATE SET
        response = excluded.response,
        model = excluded.model,
        task_type = excluded.task_type,
        tokens_saved = excluded.tokens_saved,
        created_at = excluded.created_at,
        ttl_hours = excluded.ttl_hours,
        hit_count = 0
    `).run(promptHash, response, model, taskType, tokensSaved, new Date().toISOString(), ttlHours)
    log.debug(`Cache set for hash ${promptHash.slice(0, 8)} (${model}, ${tokensSaved} tokens)`)
  } catch (err) {
    log.error(`cacheSet failed: ${err}`)
  }
}

export interface CacheStats {
  totalEntries: number
  totalHits: number
  totalTokensSaved: number
  hitRate: number
  byModel: Record<string, number>
  byTaskType: Record<string, number>
}

export function cacheStats(): CacheStats {
  try {
    const d = ensureDb()
    const totalRow = d.prepare('SELECT COUNT(*) as cnt FROM llm_cache').get() as { cnt: number }
    const hitsRow = d.prepare('SELECT COALESCE(SUM(hit_count), 0) as total FROM llm_cache').get() as { total: number }
    const tokensRow = d.prepare('SELECT COALESCE(SUM(tokens_saved * hit_count), 0) as total FROM llm_cache').get() as { total: number }

    const modelRows = d.prepare(
      'SELECT model, COUNT(*) as cnt FROM llm_cache GROUP BY model'
    ).all() as { model: string; cnt: number }[]
    const byModel: Record<string, number> = {}
    for (const r of modelRows) byModel[r.model] = r.cnt

    const taskRows = d.prepare(
      'SELECT task_type, COUNT(*) as cnt FROM llm_cache GROUP BY task_type'
    ).all() as { task_type: string; cnt: number }[]
    const byTaskType: Record<string, number> = {}
    for (const r of taskRows) byTaskType[r.task_type] = r.cnt

    const totalEntries = totalRow.cnt
    const totalHits = hitsRow.total
    const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0

    return {
      totalEntries,
      totalHits,
      totalTokensSaved: tokensRow.total,
      hitRate,
      byModel,
      byTaskType,
    }
  } catch (err) {
    log.error(`cacheStats failed: ${err}`)
    return { totalEntries: 0, totalHits: 0, totalTokensSaved: 0, hitRate: 0, byModel: {}, byTaskType: {} }
  }
}

export function cacheClean(): number {
  try {
    const d = ensureDb()
    const now = Date.now()
    // Get all entries and check TTL
    const rows = d.prepare(
      'SELECT id, created_at, ttl_hours FROM llm_cache'
    ).all() as { id: number; created_at: string; ttl_hours: number }[]

    let removed = 0
    const deleteStmt = d.prepare('DELETE FROM llm_cache WHERE id = ?')
    for (const row of rows) {
      const created = new Date(row.created_at).getTime()
      const expiresAt = created + row.ttl_hours * 3600_000
      if (now > expiresAt) {
        deleteStmt.run(row.id)
        removed++
      }
    }

    if (removed > 0) log.info(`Cache cleaned: ${removed} expired entries removed`)
    return removed
  } catch (err) {
    log.error(`cacheClean failed: ${err}`)
    return 0
  }
}
