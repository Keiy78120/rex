/**
 * REX Database Migrations
 *
 * Versioned SQLite schema management. Each migration runs exactly once and
 * is recorded in the `schema_migrations` table. Migrations are applied in
 * order (by version number) and cannot be skipped.
 *
 * Usage:
 *   rex upgrade           Apply pending migrations
 *   rex upgrade --status  Show migration status
 *   rex upgrade --dry-run Show what would run without applying
 *
 * Adding a new migration:
 *   1. Add a new entry to MIGRATIONS below (increment version)
 *   2. Write forward-only SQL (no rollback needed — use ADD COLUMN / CREATE TABLE)
 *   3. Run `rex upgrade` — it will apply only the new migration
 *
 * @module MEMORY
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { MEMORY_DB_PATH } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('MEMORY:migrations')

// ── Migration registry ────────────────────────────────────────────────────────

interface Migration {
  version: number
  description: string
  sql: string[]  // array of SQL statements — each runs in sequence
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'initial schema — memories table + fts5',
    sql: [
      `CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        content TEXT NOT NULL,
        summary TEXT,
        category TEXT DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        source TEXT DEFAULT 'session',
        importance REAL DEFAULT 0.5,
        embedding_done INTEGER DEFAULT 0,
        needs_reprocess INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)`,
      `CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        content,
        summary,
        tags,
        content='memories',
        content_rowid='id',
        tokenize='porter unicode61'
      )`,
    ],
  },
  {
    version: 2,
    description: 'add embedding vector support (sqlite-vec)',
    sql: [
      // vector table created by ingest.ts via better-sqlite3 + sqlite-vec extension
      // this migration just ensures the metadata column exists
      // Note: SQLite does not support IF NOT EXISTS on ALTER TABLE — error handler below
      // catches "duplicate column name" if migration is re-run on an already-upgraded DB
      `ALTER TABLE memories ADD COLUMN vec_id INTEGER`,
      `CREATE INDEX IF NOT EXISTS idx_memories_vec_id ON memories(vec_id) WHERE vec_id IS NOT NULL`,
    ],
  },
  {
    version: 3,
    description: 'add event journal table',
    sql: [
      `CREATE TABLE IF NOT EXISTS event_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_journal_type ON event_journal(event_type)`,
      `CREATE INDEX IF NOT EXISTS idx_journal_created ON event_journal(created_at)`,
    ],
  },
  {
    version: 4,
    description: 'add open loops table',
    sql: [
      `CREATE TABLE IF NOT EXISTS open_loops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'open',
        source TEXT DEFAULT 'user',
        due_at TEXT,
        closed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_loops_status ON open_loops(status)`,
      `CREATE INDEX IF NOT EXISTS idx_loops_priority ON open_loops(priority)`,
    ],
  },
  {
    version: 5,
    description: 'add session budget tracking table',
    sql: [
      `CREATE TABLE IF NOT EXISTS budget_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        session_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_budget_provider ON budget_usage(provider)`,
      `CREATE INDEX IF NOT EXISTS idx_budget_created ON budget_usage(created_at)`,
    ],
  },
]

// ── SQLite executor ───────────────────────────────────────────────────────────

function sqliteExec(db: string, sql: string): void {
  // Escape single quotes in sql for shell
  const escaped = sql.replace(/'/g, `'"'"'`)
  execSync(`sqlite3 '${db}' '${escaped}'`, { stdio: 'pipe' })
}

function sqliteQuery(db: string, sql: string): string {
  const escaped = sql.replace(/'/g, `'"'"'`)
  return execSync(`sqlite3 '${db}' '${escaped}'`, { encoding: 'utf-8' }).trim()
}

function hasSqlite3(): boolean {
  try { execSync('which sqlite3', { stdio: 'pipe' }); return true } catch { return false }
}

// ── Migration tracking table ─────────────────────────────────────────────────

function ensureMigrationsTable(db: string): void {
  sqliteExec(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )`)
}

function getAppliedVersions(db: string): Set<number> {
  try {
    const raw = sqliteQuery(db, 'SELECT version FROM schema_migrations ORDER BY version')
    const versions = raw.split('\n').filter(Boolean).map(Number)
    return new Set(versions)
  } catch { return new Set() }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface MigrationStatus {
  version: number
  description: string
  applied: boolean
  appliedAt?: string
}

export function getMigrationStatus(dbPath = MEMORY_DB_PATH): MigrationStatus[] {
  if (!existsSync(dbPath) || !hasSqlite3()) {
    return MIGRATIONS.map(m => ({ version: m.version, description: m.description, applied: false }))
  }
  try {
    ensureMigrationsTable(dbPath)
    const raw = sqliteQuery(dbPath, 'SELECT version, applied_at FROM schema_migrations ORDER BY version')
    const applied = new Map<number, string>()
    for (const line of raw.split('\n').filter(Boolean)) {
      const [v, ts] = line.split('|')
      applied.set(Number(v), ts)
    }
    return MIGRATIONS.map(m => ({
      version: m.version,
      description: m.description,
      applied: applied.has(m.version),
      appliedAt: applied.get(m.version),
    }))
  } catch { return MIGRATIONS.map(m => ({ version: m.version, description: m.description, applied: false })) }
}

export interface UpgradeResult {
  applied: number[]
  skipped: number[]
  errors: string[]
}

export function applyMigrations(opts: { dbPath?: string; dryRun?: boolean } = {}): UpgradeResult {
  const dbPath = opts.dbPath ?? MEMORY_DB_PATH
  const dryRun = opts.dryRun ?? false

  const result: UpgradeResult = { applied: [], skipped: [], errors: [] }

  if (!existsSync(dbPath)) {
    log.warn(`Database not found at ${dbPath} — run rex ingest first`)
    return result
  }

  if (!hasSqlite3()) {
    log.warn('sqlite3 CLI not found — cannot run migrations')
    result.errors.push('sqlite3 CLI required (brew install sqlite or apt install sqlite3)')
    return result
  }

  try {
    ensureMigrationsTable(dbPath)
    const applied = getAppliedVersions(dbPath)

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) {
        result.skipped.push(migration.version)
        continue
      }

      if (dryRun) {
        log.info(`[dry-run] Would apply migration v${migration.version}: ${migration.description}`)
        result.applied.push(migration.version)
        continue
      }

      log.info(`Applying migration v${migration.version}: ${migration.description}`)
      try {
        for (const sql of migration.sql) {
          // Skip IF NOT EXISTS / ALTER COLUMN IF NOT EXISTS safely
          try {
            sqliteExec(dbPath, sql)
          } catch (e: any) {
            // sqlite3 doesn't support IF NOT EXISTS on ALTER — ignore "duplicate column" errors
            if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) {
              throw e
            }
          }
        }
        sqliteExec(dbPath, `INSERT INTO schema_migrations (version, description) VALUES (${migration.version}, '${migration.description.replace(/'/g, "''")}')`)
        result.applied.push(migration.version)
        log.info(`Migration v${migration.version} applied successfully`)
      } catch (e: any) {
        const msg = `Migration v${migration.version} failed: ${e.message?.slice(0, 200)}`
        log.error(msg)
        result.errors.push(msg)
        break  // Stop on first failure to avoid cascading issues
      }
    }
  } catch (e: any) {
    result.errors.push(`Migration setup failed: ${e.message}`)
  }

  return result
}

// ── CLI printer ───────────────────────────────────────────────────────────────

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }

export function printMigrationStatus(dbPath = MEMORY_DB_PATH): void {
  const statuses = getMigrationStatus(dbPath)
  const pending = statuses.filter(s => !s.applied)

  console.log(`\n${C.bold}REX Database Migrations${C.reset}`)
  console.log('─'.repeat(56))
  console.log(`  Database: ${dbPath}`)
  console.log(`  Total: ${statuses.length} | Applied: ${statuses.filter(s => s.applied).length} | Pending: ${pending.length}`)
  console.log()

  for (const s of statuses) {
    const icon = s.applied ? `${C.green}✓${C.reset}` : `${C.yellow}○${C.reset}`
    const ts = s.appliedAt ? `${C.dim}(${s.appliedAt})${C.reset}` : `${C.yellow}[pending]${C.reset}`
    console.log(`  ${icon}  v${s.version}  ${s.description}  ${ts}`)
  }
  console.log()

  if (pending.length > 0) {
    console.log(`  ${C.yellow}Run 'rex upgrade' to apply ${pending.length} pending migration(s)${C.reset}`)
    console.log()
  }
}
