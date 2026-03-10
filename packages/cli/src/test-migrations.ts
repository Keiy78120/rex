/**
 * Migration compatibility test
 *
 * Simulates a v1-schema SQLite database (the original schema before any
 * versioned migrations existed), then runs applyMigrations() and verifies:
 *   1. All expected tables exist
 *   2. Old data in `memories` is intact
 *   3. schema_migrations records all versions
 *   4. No errors returned
 *
 * Usage:
 *   npx tsx src/test-migrations.ts
 *   REX_DB_PATH=/tmp/custom-test.db npx tsx src/test-migrations.ts
 */

import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyMigrations, getMigrationStatus } from './db-migrations.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
}

let passed = 0
let failed = 0

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ${C.green}✓${C.reset}  ${label}`)
    passed++
  } else {
    console.log(`  ${C.red}✗${C.reset}  ${label}`)
    failed++
  }
}

function sqliteExec(db: string, sql: string): void {
  const escaped = sql.replace(/'/g, `'"'"'`)
  execSync(`sqlite3 '${db}' '${escaped}'`, { stdio: 'pipe' })
}

function sqliteQuery(db: string, sql: string): string {
  const escaped = sql.replace(/'/g, `'"'"'`)
  return execSync(`sqlite3 '${db}' '${escaped}'`, { encoding: 'utf-8' }).trim()
}

function tableExists(db: string, table: string): boolean {
  const r = sqliteQuery(db, `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${table}'`)
  return r.trim() === '1'
}

function columnExists(db: string, table: string, col: string): boolean {
  try {
    const r = sqliteQuery(db, `PRAGMA table_info('${table}')`)
    return r.split('\n').some(line => line.split('|')[1]?.trim() === col)
  } catch { return false }
}

// ── Seed v1 schema (pre-migration) ───────────────────────────────────────────

function seedV1Schema(db: string): void {
  // Exact original schema — no migrations table, no vec_id, no event_journal, etc.
  sqliteExec(db, `CREATE TABLE memories (
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
  )`)
  sqliteExec(db, `CREATE INDEX idx_memories_category ON memories(category)`)
  sqliteExec(db, `CREATE INDEX idx_memories_source ON memories(source)`)
  sqliteExec(db, `CREATE INDEX idx_memories_created ON memories(created_at)`)

  // Seed some v1 rows to verify data survival
  sqliteExec(db, `INSERT INTO memories (session_id, content, category, source, importance) VALUES
    ('sess-001', 'Used tsup for building the CLI — much faster than tsc alone', 'dev', 'session', 0.8),
    ('sess-002', 'Fixed: require() in ESM files causes silent failures', 'debug', 'session', 0.9),
    ('sess-003', 'Gateway: Telegram long-poll timeout set to 30s', 'config', 'session', 0.6)`)
}

// ── Main test runner ──────────────────────────────────────────────────────────

export async function runMigrationTests(dbPath?: string): Promise<{ passed: number; failed: number }> {
  const _dbPath = dbPath ?? join(tmpdir(), `rex-migration-test-${Date.now()}.db`)
  const _passed = { count: 0 }
  const _failed = { count: 0 }

  function _assert(condition: boolean, label: string): void {
    if (condition) {
      console.log(`  ${C.green}✓${C.reset}  ${label}`)
      _passed.count++
    } else {
      console.log(`  ${C.red}✗${C.reset}  ${label}`)
      _failed.count++
    }
  }

  console.log(`\n${C.bold}REX Migration Compatibility Test${C.reset}`)
  console.log('─'.repeat(56))
  console.log(`  DB: ${C.dim}${_dbPath}${C.reset}\n`)

  if (existsSync(_dbPath)) rmSync(_dbPath)

  console.log(`${C.bold}Phase 1${C.reset} — Create v1-schema database`)
  try {
    seedV1Schema(_dbPath)
    _assert(existsSync(_dbPath), 'database file created')
    _assert(tableExists(_dbPath, 'memories'), 'memories table exists')
    _assert(!tableExists(_dbPath, 'schema_migrations'), 'schema_migrations absent (pre-migration)')
    _assert(!tableExists(_dbPath, 'event_journal'), 'event_journal absent (pre-migration)')
    const rowCount = sqliteQuery(_dbPath, 'SELECT count(*) FROM memories').trim()
    _assert(rowCount === '3', `3 seed rows in memories (got ${rowCount})`)
  } catch (e: any) {
    console.log(`  ${C.red}✗  Failed to seed v1 schema: ${e.message}${C.reset}`)
    return { passed: _passed.count, failed: _failed.count + 1 }
  }

  console.log(`\n${C.bold}Phase 2${C.reset} — Apply migrations`)
  const result = applyMigrations({ dbPath: _dbPath })
  _assert(result.errors.length === 0, `no migration errors (got: ${result.errors.join(', ') || 'none'})`)
  _assert(result.applied.includes(1), 'migration v1 applied')
  _assert(result.applied.includes(2), 'migration v2 applied')
  _assert(result.applied.includes(3), 'migration v3 applied')
  _assert(result.applied.includes(4), 'migration v4 applied')
  _assert(result.applied.includes(5), 'migration v5 applied')

  console.log(`\n${C.bold}Phase 3${C.reset} — Verify post-migration schema`)
  _assert(tableExists(_dbPath, 'schema_migrations'), 'schema_migrations table created')
  _assert(tableExists(_dbPath, 'event_journal'), 'event_journal table created')
  _assert(tableExists(_dbPath, 'open_loops'), 'open_loops table created')
  _assert(tableExists(_dbPath, 'budget_usage'), 'budget_usage table created')
  _assert(columnExists(_dbPath, 'memories', 'vec_id'), 'memories.vec_id column added (v2)')

  console.log(`\n${C.bold}Phase 4${C.reset} — Verify data integrity`)
  const rowCount = sqliteQuery(_dbPath, 'SELECT count(*) FROM memories').trim()
  _assert(rowCount === '3', `original 3 rows still in memories (got ${rowCount})`)
  const firstContent = sqliteQuery(_dbPath, `SELECT content FROM memories WHERE id=1`).trim()
  _assert(firstContent.includes('tsup'), 'row 1 content intact')
  const highImportance = sqliteQuery(_dbPath, `SELECT count(*) FROM memories WHERE importance >= 0.8`).trim()
  _assert(highImportance === '2', `2 high-importance rows intact (got ${highImportance})`)

  console.log(`\n${C.bold}Phase 5${C.reset} — getMigrationStatus`)
  const statuses = getMigrationStatus(_dbPath)
  _assert(statuses.every(s => s.applied), `all ${statuses.length} migrations show applied=true`)

  console.log(`\n${C.bold}Phase 6${C.reset} — Idempotency check`)
  const result2 = applyMigrations({ dbPath: _dbPath })
  _assert(result2.applied.length === 0, `no migrations re-applied on second run (applied=${result2.applied.length})`)
  _assert(result2.errors.length === 0, 'no errors on idempotent run')
  _assert(result2.skipped.length === 5, `all 5 skipped (got ${result2.skipped.length})`)

  try { rmSync(_dbPath) } catch {}

  const total = _passed.count + _failed.count
  console.log('\n' + '─'.repeat(56))
  if (_failed.count === 0) {
    console.log(`  ${C.green}${C.bold}All ${total} tests passed${C.reset}`)
  } else {
    console.log(`  ${C.red}${C.bold}${_failed.count}/${total} tests FAILED${C.reset}`)
  }
  console.log()
  return { passed: _passed.count, failed: _failed.count }
}

async function main(): Promise<void> {
  const dbPath = process.env['REX_DB_PATH'] ?? join(tmpdir(), `rex-migration-test-${Date.now()}.db`)

  console.log(`\n${C.bold}REX Migration Compatibility Test${C.reset}`)
  console.log('─'.repeat(56))
  console.log(`  DB: ${C.dim}${dbPath}${C.reset}\n`)

  // Cleanup leftover from prior run
  if (existsSync(dbPath)) rmSync(dbPath)

  // ── Phase 1: Build v1 DB ───────────────────────────────────────────────────
  console.log(`${C.bold}Phase 1${C.reset} — Create v1-schema database`)
  try {
    seedV1Schema(dbPath)
    assert(existsSync(dbPath), 'database file created')
    assert(tableExists(dbPath, 'memories'), 'memories table exists')
    assert(!tableExists(dbPath, 'schema_migrations'), 'schema_migrations absent (pre-migration)')
    assert(!tableExists(dbPath, 'event_journal'), 'event_journal absent (pre-migration)')
    const rowCount = sqliteQuery(dbPath, 'SELECT count(*) FROM memories').trim()
    assert(rowCount === '3', `3 seed rows in memories (got ${rowCount})`)
  } catch (e: any) {
    console.log(`  ${C.red}✗  Failed to seed v1 schema: ${e.message}${C.reset}`)
    failed++
    process.exit(1)
  }

  // ── Phase 2: Run applyMigrations ──────────────────────────────────────────
  console.log(`\n${C.bold}Phase 2${C.reset} — Apply migrations`)
  const result = applyMigrations({ dbPath })

  assert(result.errors.length === 0, `no migration errors (got: ${result.errors.join(', ') || 'none'})`)
  assert(result.applied.includes(1), 'migration v1 applied')
  assert(result.applied.includes(2), 'migration v2 applied')
  assert(result.applied.includes(3), 'migration v3 applied')
  assert(result.applied.includes(4), 'migration v4 applied')
  assert(result.applied.includes(5), 'migration v5 applied')

  // ── Phase 3: Verify schema ────────────────────────────────────────────────
  console.log(`\n${C.bold}Phase 3${C.reset} — Verify post-migration schema`)
  assert(tableExists(dbPath, 'schema_migrations'), 'schema_migrations table created')
  assert(tableExists(dbPath, 'event_journal'), 'event_journal table created')
  assert(tableExists(dbPath, 'open_loops'), 'open_loops table created')
  assert(tableExists(dbPath, 'budget_usage'), 'budget_usage table created')
  assert(columnExists(dbPath, 'memories', 'vec_id'), 'memories.vec_id column added (v2)')

  // ── Phase 4: Verify data integrity ───────────────────────────────────────
  console.log(`\n${C.bold}Phase 4${C.reset} — Verify data integrity`)
  const rowCount = sqliteQuery(dbPath, 'SELECT count(*) FROM memories').trim()
  assert(rowCount === '3', `original 3 rows still in memories (got ${rowCount})`)

  const firstContent = sqliteQuery(dbPath, `SELECT content FROM memories WHERE id=1`).trim()
  assert(firstContent.includes('tsup'), 'row 1 content intact')

  const highImportance = sqliteQuery(dbPath, `SELECT count(*) FROM memories WHERE importance >= 0.8`).trim()
  assert(highImportance === '2', `2 high-importance rows intact (got ${highImportance})`)

  // ── Phase 5: getMigrationStatus reflects reality ──────────────────────────
  console.log(`\n${C.bold}Phase 5${C.reset} — getMigrationStatus`)
  const statuses = getMigrationStatus(dbPath)
  const allApplied = statuses.every(s => s.applied)
  assert(allApplied, `all ${statuses.length} migrations show applied=true`)

  // ── Phase 6: Idempotency — run again, nothing re-applies ─────────────────
  console.log(`\n${C.bold}Phase 6${C.reset} — Idempotency check`)
  const result2 = applyMigrations({ dbPath })
  assert(result2.applied.length === 0, `no migrations re-applied on second run (applied=${result2.applied.length})`)
  assert(result2.errors.length === 0, 'no errors on idempotent run')
  assert(result2.skipped.length === 5, `all 5 skipped (got ${result2.skipped.length})`)

  // ── Teardown ──────────────────────────────────────────────────────────────
  try { rmSync(dbPath) } catch {}

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(56))
  const total = passed + failed
  if (failed === 0) {
    console.log(`  ${C.green}${C.bold}All ${total} tests passed${C.reset}`)
  } else {
    console.log(`  ${C.red}${C.bold}${failed}/${total} tests FAILED${C.reset}`)
  }
  console.log()

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
