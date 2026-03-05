import { existsSync, copyFileSync, mkdirSync, symlinkSync, renameSync, readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_DIR, MEMORY_DB_PATH, PENDING_DIR, BACKUPS_DIR, LEGACY_MEMORY_DIR, LEGACY_DB_PATH, ensureRexDirs } from './paths.js'

const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m' }

export async function migrate(): Promise<void> {
  ensureRexDirs()

  // 1. Migrate DB if legacy exists and new doesn't
  if (existsSync(LEGACY_DB_PATH) && !existsSync(MEMORY_DB_PATH)) {
    console.log(`${COLORS.yellow}Migrating${COLORS.reset} rex.sqlite to ~/.claude/rex/memory/`)
    copyFileSync(LEGACY_DB_PATH, MEMORY_DB_PATH)
    for (const ext of ['-wal', '-shm']) {
      const src = LEGACY_DB_PATH + ext
      if (existsSync(src)) copyFileSync(src, MEMORY_DB_PATH + ext)
    }
    console.log(`${COLORS.green}Done${COLORS.reset} — DB migrated`)
  } else if (existsSync(MEMORY_DB_PATH)) {
    console.log(`${COLORS.dim}DB already at ~/.claude/rex/memory/ — skipping${COLORS.reset}`)
  } else {
    console.log(`${COLORS.dim}No legacy DB found — fresh install${COLORS.reset}`)
  }

  // 2. Migrate pending/ files
  const legacyPending = join(LEGACY_MEMORY_DIR, 'pending')
  if (existsSync(legacyPending)) {
    const files = readdirSync(legacyPending).filter(f => f.endsWith('.json'))
    for (const f of files) {
      const src = join(legacyPending, f)
      const dest = join(PENDING_DIR, f)
      if (!existsSync(dest)) copyFileSync(src, dest)
    }
    if (files.length) console.log(`${COLORS.green}Migrated${COLORS.reset} ${files.length} pending files`)
  }

  // 3. Create backward-compat symlink
  if (existsSync(LEGACY_MEMORY_DIR)) {
    try {
      const stat = lstatSync(LEGACY_MEMORY_DIR)
      if (!stat.isSymbolicLink()) {
        renameSync(LEGACY_MEMORY_DIR, LEGACY_MEMORY_DIR + '.bak')
        console.log(`${COLORS.dim}Renamed ~/.rex-memory/ to ~/.rex-memory.bak/${COLORS.reset}`)
      }
    } catch {}
  }

  if (!existsSync(LEGACY_MEMORY_DIR)) {
    mkdirSync(LEGACY_MEMORY_DIR, { recursive: true })
    const legacyDbDir = join(LEGACY_MEMORY_DIR, 'db')
    if (!existsSync(legacyDbDir)) {
      symlinkSync(MEMORY_DIR, legacyDbDir)
      console.log(`${COLORS.green}Symlinked${COLORS.reset} ~/.rex-memory/db/ -> ~/.claude/rex/memory/`)
    }
  }

  // 4. Schema upgrade
  if (existsSync(MEMORY_DB_PATH)) {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(MEMORY_DB_PATH)
    db.pragma('journal_mode = WAL')

    const cols = db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)

    if (!colNames.includes('summary')) {
      db.exec("ALTER TABLE memories ADD COLUMN summary TEXT")
      console.log(`${COLORS.green}Added${COLORS.reset} summary column`)
    }
    if (!colNames.includes('needs_reprocess')) {
      db.exec("ALTER TABLE memories ADD COLUMN needs_reprocess INTEGER DEFAULT 0")
      console.log(`${COLORS.green}Added${COLORS.reset} needs_reprocess column`)
    }
    db.close()
  }

  console.log(`\n${COLORS.green}Migration complete.${COLORS.reset} REX hub at ~/.claude/rex/`)
}
