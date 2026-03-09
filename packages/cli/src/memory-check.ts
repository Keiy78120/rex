/** @module MEMORY */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_DB_PATH, PENDING_DIR } from './paths.js'
import { createLogger } from './logger.js'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

const log = createLogger('MEMORY:check')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
}

export interface MemoryHealthResult {
  dbExists: boolean
  dbIntegrity: { ok: boolean; message: string }
  stats: {
    total: number
    byCategory: Record<string, number>
    oldest: string | null
    newest: string | null
    embeddingCount: number
    embeddingCoverage: number
  }
  ftsDrift: { totalFts: number; drift: number }
  orphans: { count: number; ids: number[] }
  pending: { count: number; staleCount: number; staleFiles: string[] }
  duplicates: { count: number; samples: string[] }
}

export function checkMemoryHealth(): MemoryHealthResult {
  const result: MemoryHealthResult = {
    dbExists: false,
    dbIntegrity: { ok: false, message: 'DB not found' },
    stats: { total: 0, byCategory: {}, oldest: null, newest: null, embeddingCount: 0, embeddingCoverage: 0 },
    ftsDrift: { totalFts: 0, drift: 0 },
    orphans: { count: 0, ids: [] },
    pending: { count: 0, staleCount: 0, staleFiles: [] },
    duplicates: { count: 0, samples: [] },
  }

  // Check pending queue (works even without DB)
  if (existsSync(PENDING_DIR)) {
    const files = readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'))
    result.pending.count = files.length
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const f of files) {
      try {
        const st = statSync(join(PENDING_DIR, f))
        if (st.mtimeMs < cutoff) {
          result.pending.staleCount++
          if (result.pending.staleFiles.length < 5) result.pending.staleFiles.push(f)
        }
      } catch {}
    }
  }

  if (!existsSync(MEMORY_DB_PATH)) return result

  result.dbExists = true
  let db: ReturnType<typeof Database>

  try {
    db = new Database(MEMORY_DB_PATH, { readonly: true })
    sqliteVec.load(db)
  } catch (e: any) {
    result.dbIntegrity = { ok: false, message: e.message?.slice(0, 200) || 'Failed to open' }
    return result
  }

  try {
    // DB integrity
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string } | undefined
    const integrityResult = integrity?.integrity_check ?? 'unknown'
    result.dbIntegrity = { ok: integrityResult === 'ok', message: integrityResult }

    // Total memories
    const totalRow = db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }
    result.stats.total = totalRow.c

    if (result.stats.total > 0) {
      // By category
      const cats = db.prepare('SELECT category, COUNT(*) as c FROM memories GROUP BY category ORDER BY c DESC').all() as { category: string; c: number }[]
      for (const cat of cats) result.stats.byCategory[cat.category] = cat.c

      // Oldest / newest
      const oldest = db.prepare('SELECT created_at FROM memories ORDER BY created_at ASC LIMIT 1').get() as { created_at: string } | undefined
      const newest = db.prepare('SELECT created_at FROM memories ORDER BY created_at DESC LIMIT 1').get() as { created_at: string } | undefined
      result.stats.oldest = oldest?.created_at ?? null
      result.stats.newest = newest?.created_at ?? null

      // Embedding coverage (memory_vec is a separate table)
      try {
        const vecCount = db.prepare('SELECT COUNT(*) as c FROM memory_vec').get() as { c: number }
        result.stats.embeddingCount = vecCount.c
        result.stats.embeddingCoverage = result.stats.total > 0 ? Math.round((vecCount.c / result.stats.total) * 100) : 0
      } catch {
        // memory_vec table may not exist
      }

      // Orphans: memories without embeddings
      try {
        const orphans = db.prepare(
          'SELECT m.id FROM memories m LEFT JOIN memory_vec v ON v.rowid = m.id WHERE v.rowid IS NULL LIMIT 50'
        ).all() as { id: number }[]
        result.orphans.count = orphans.length
        result.orphans.ids = orphans.map(r => r.id)
      } catch {}

      // Duplicate detection (same content)
      try {
        const dupes = db.prepare(
          `SELECT content, COUNT(*) as c FROM memories GROUP BY content HAVING c > 1 ORDER BY c DESC LIMIT 5`
        ).all() as { content: string; c: number }[]
        result.duplicates.count = dupes.reduce((sum, d) => sum + d.c - 1, 0)
        result.duplicates.samples = dupes.map(d => `${d.content.slice(0, 60)}... (x${d.c})`)
      } catch {}

      // FTS drift: check that memory_fts is in sync with memories
      try {
        const ftsCount = db.prepare('SELECT COUNT(*) as c FROM memory_fts').get() as { c: number }
        result.ftsDrift.totalFts = ftsCount.c
        result.ftsDrift.drift = result.stats.total - ftsCount.c
      } catch {}
    }
  } catch (e: any) {
    log.error(`Memory check error: ${e.message}`)
  } finally {
    db.close()
  }

  return result
}

export function showMemoryHealth(asJson = false): void {
  const result = checkMemoryHealth()

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const line = '─'.repeat(45)
  console.log(`\n${COLORS.bold}  Memory Health Check${COLORS.reset}`)
  console.log(`  ${line}`)

  // DB status
  if (!result.dbExists) {
    console.log(`  ${COLORS.red}✗${COLORS.reset} Database not found at ${MEMORY_DB_PATH}`)
    return
  }

  const intIcon = result.dbIntegrity.ok ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`
  console.log(`  ${intIcon} DB integrity: ${result.dbIntegrity.message}`)

  // Stats
  console.log(`\n  ${COLORS.bold}Stats${COLORS.reset}`)
  console.log(`    Total memories: ${COLORS.cyan}${result.stats.total}${COLORS.reset}`)
  if (result.stats.oldest) console.log(`    Range: ${COLORS.dim}${result.stats.oldest} → ${result.stats.newest}${COLORS.reset}`)

  const covColor = result.stats.embeddingCoverage >= 90 ? COLORS.green : result.stats.embeddingCoverage >= 50 ? COLORS.yellow : COLORS.red
  console.log(`    Embeddings: ${result.stats.embeddingCount}/${result.stats.total} ${covColor}(${result.stats.embeddingCoverage}%)${COLORS.reset}`)

  // Categories
  if (Object.keys(result.stats.byCategory).length > 0) {
    console.log(`\n  ${COLORS.bold}Categories${COLORS.reset}`)
    for (const [cat, count] of Object.entries(result.stats.byCategory)) {
      const bar = '█'.repeat(Math.min(20, Math.round((count / result.stats.total) * 40)))
      console.log(`    ${COLORS.dim}${cat.padEnd(12)}${COLORS.reset} ${bar} ${count}`)
    }
  }

  // Issues
  const issues: string[] = []
  if (!result.dbIntegrity.ok) issues.push(`DB integrity failed: ${result.dbIntegrity.message}`)
  if (result.orphans.count > 0) issues.push(`${result.orphans.count} memories without embeddings`)
  if (result.duplicates.count > 0) issues.push(`${result.duplicates.count} duplicate memories`)
  if (result.ftsDrift.drift > 0) issues.push(`FTS index drift: ${result.ftsDrift.drift} memories missing from search index — run rex search --rebuild-fts`)
  if (result.pending.count > 100) issues.push(`${result.pending.count} files in pending queue (>100)`)
  if (result.pending.staleCount > 0) issues.push(`${result.pending.staleCount} stale pending files (>24h old)`)

  if (issues.length > 0) {
    console.log(`\n  ${COLORS.bold}${COLORS.yellow}Issues${COLORS.reset}`)
    for (const issue of issues) {
      console.log(`    ${COLORS.yellow}!${COLORS.reset} ${issue}`)
    }
  } else {
    console.log(`\n  ${COLORS.green}✓${COLORS.reset} No issues found`)
  }

  // Pending
  console.log(`\n  ${COLORS.bold}Pending Queue${COLORS.reset}`)
  const pendIcon = result.pending.count > 100 ? `${COLORS.yellow}!${COLORS.reset}` : `${COLORS.green}✓${COLORS.reset}`
  console.log(`    ${pendIcon} ${result.pending.count} files pending`)

  console.log(`  ${line}\n`)
}
