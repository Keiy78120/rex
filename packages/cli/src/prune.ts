import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

const DB_PATH = join(homedir(), '.rex-memory', 'db', 'rex.sqlite')
const MAX_AGE_DAYS = 180 // 6 months
const MAX_DB_SIZE_MB = 50

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export async function prune(statsOnly: boolean = false) {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX ${statsOnly ? 'MEMORY STATS' : 'PRUNE'}${COLORS.reset}`)
  console.log(`${line}\n`)

  if (!existsSync(DB_PATH)) {
    console.log(`  ${COLORS.yellow}No memory database found.${COLORS.reset}`)
    console.log(`  Run ${COLORS.cyan}rex ingest${COLORS.reset} first.\n`)
    return
  }

  // Dynamic import to avoid requiring better-sqlite3 when not installed
  let Database: any
  let sqliteVec: any
  try {
    Database = (await import('better-sqlite3')).default
    sqliteVec = await import('sqlite-vec')
  } catch {
    // Fallback: use the memory package if available
    const memDir = join(homedir(), '.rex-memory')
    if (!existsSync(join(memDir, 'node_modules', 'better-sqlite3'))) {
      console.log(`  ${COLORS.yellow}better-sqlite3 not available.${COLORS.reset}`)
      console.log(`  Ensure @rex/memory is installed: ${COLORS.cyan}cd ~/.rex-memory && npm install${COLORS.reset}\n`)
      return
    }
    try {
      Database = (await import(join(memDir, 'node_modules', 'better-sqlite3', 'lib', 'index.js'))).default
      sqliteVec = await import(join(memDir, 'node_modules', 'sqlite-vec', 'src', 'index.js'))
    } catch (err) {
      console.log(`  ${COLORS.red}Cannot load database modules:${COLORS.reset} ${(err as Error).message}\n`)
      return
    }
  }

  const db = new Database(DB_PATH)
  try { sqliteVec.load(db) } catch {}
  db.pragma('journal_mode = WAL')

  // Stats
  const totalMemories = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c
  const categories = db.prepare('SELECT category, COUNT(*) as c FROM memories GROUP BY category ORDER BY c DESC').all() as Array<{ category: string; c: number }>
  const projects = db.prepare('SELECT project, COUNT(*) as c FROM memories GROUP BY project ORDER BY c DESC LIMIT 10').all() as Array<{ project: string; c: number }>
  const ingestFiles = (db.prepare('SELECT COUNT(*) as c FROM ingest_log').get() as any).c
  const dbSize = statSync(DB_PATH).size

  console.log(`  ${COLORS.bold}Database:${COLORS.reset} ${formatSize(dbSize)}`)
  console.log(`  ${COLORS.bold}Total memories:${COLORS.reset} ${totalMemories}`)
  console.log(`  ${COLORS.bold}Ingested files:${COLORS.reset} ${ingestFiles}`)
  console.log()

  console.log(`  ${COLORS.bold}By category:${COLORS.reset}`)
  for (const cat of categories) {
    console.log(`    ${COLORS.cyan}${cat.category}${COLORS.reset}: ${cat.c}`)
  }
  console.log()

  console.log(`  ${COLORS.bold}Top projects:${COLORS.reset}`)
  for (const proj of projects) {
    console.log(`    ${COLORS.dim}${proj.project || '(none)'}${COLORS.reset}: ${proj.c}`)
  }

  if (statsOnly) {
    console.log()
    db.close()
    return
  }

  // Prune old memories
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - MAX_AGE_DAYS)
  const cutoff = cutoffDate.toISOString()

  const oldCount = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE created_at < ?').get(cutoff) as any).c

  if (oldCount === 0 && dbSize < MAX_DB_SIZE_MB * 1024 * 1024) {
    console.log(`\n  ${COLORS.green}✓${COLORS.reset} Nothing to prune (all memories < ${MAX_AGE_DAYS} days, DB < ${MAX_DB_SIZE_MB}MB)`)
    db.close()
    console.log()
    return
  }

  console.log(`\n  ${COLORS.bold}Pruning:${COLORS.reset}`)

  if (oldCount > 0) {
    // Get IDs to delete from vec table too
    const oldIds = db.prepare('SELECT id FROM memories WHERE created_at < ?').all(cutoff) as Array<{ id: number }>
    const deleteVec = db.prepare('DELETE FROM memory_vec WHERE rowid = ?')
    const deleteMem = db.prepare('DELETE FROM memories WHERE id = ?')

    const tx = db.transaction(() => {
      for (const row of oldIds) {
        try { deleteVec.run(row.id) } catch {}
        deleteMem.run(row.id)
      }
    })
    tx()

    console.log(`    ${COLORS.green}✓${COLORS.reset} Removed ${oldCount} memories older than ${MAX_AGE_DAYS} days`)
  }

  // Deduplicate (same content)
  const dupes = db.prepare(`
    SELECT id FROM memories WHERE id NOT IN (
      SELECT MIN(id) FROM memories GROUP BY content
    )
  `).all() as Array<{ id: number }>

  if (dupes.length > 0) {
    const deleteVec = db.prepare('DELETE FROM memory_vec WHERE rowid = ?')
    const deleteMem = db.prepare('DELETE FROM memories WHERE id = ?')
    const tx = db.transaction(() => {
      for (const row of dupes) {
        try { deleteVec.run(row.id) } catch {}
        deleteMem.run(row.id)
      }
    })
    tx()
    console.log(`    ${COLORS.green}✓${COLORS.reset} Removed ${dupes.length} duplicate memories`)
  }

  // VACUUM
  try {
    db.exec('VACUUM')
    const newSize = statSync(DB_PATH).size
    console.log(`    ${COLORS.green}✓${COLORS.reset} Compacted: ${formatSize(dbSize)} -> ${formatSize(newSize)}`)
  } catch {}

  const remaining = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c
  console.log(`\n  ${COLORS.bold}Remaining:${COLORS.reset} ${remaining} memories`)

  db.close()
  console.log()
}
