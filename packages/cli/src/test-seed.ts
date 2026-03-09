/**
 * Test data seeder — populates a test SQLite DB with Kevin-like fixtures.
 * Run via: REX_DB_PATH=/tmp/rex-test.db npx tsx src/test-seed.ts
 *
 * Used by docker-compose.test.yml and CI to set up isolated test state.
 * @module TEST
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const DB_PATH = process.env.REX_DB_PATH ?? join(homedir(), '.rex-memory', 'rex-memory.db')

function ensureDir(p: string): void {
  const dir = dirname(p)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// ── Fixture data (Kevin-like dev patterns) ────────────────────────────────────

const MEMORY_FIXTURES = [
  {
    content: 'Travailler sur le projet REX monorepo TypeScript — pnpm build pour compiler le CLI',
    source: 'session', category: 'dev', tags: '["project","rex","typescript"]',
    created_at: daysAgo(1),
  },
  {
    content: 'Fix bug gateway Telegram : double réponse causée par mutex update_id manquant',
    source: 'session', category: 'bug', tags: '["telegram","gateway","mutex"]',
    created_at: daysAgo(2),
  },
  {
    content: 'Réunion client D-Studio chaque jeudi 14h — brief automatique 30min avant',
    source: 'calendar', category: 'meeting', tags: '["client","dstudio","recurrence"]',
    created_at: daysAgo(3),
  },
  {
    content: 'Stack : TypeScript/Node, CakePHP, Angular/Ionic, Flutter, React/Next.js',
    source: 'profile', category: 'context', tags: '["stack","tech","profile"]',
    created_at: daysAgo(7),
  },
  {
    content: 'REX CLI commande rex search --hybrid utilise FTS5 BM25 + vecteur RRF',
    source: 'session', category: 'dev', tags: '["search","fts5","vector","hybrid"]',
    created_at: daysAgo(5),
  },
  {
    content: 'TODO: brancher activitywatch-bridge dans user-cycles pour le sleepScore — FIXME',
    source: 'session', category: 'todo', tags: '["todo","activitywatch","user-cycles"]',
    created_at: daysAgo(8),
  },
  {
    content: 'LaunchAgents actifs : rex-doctor (1h), rex-ingest (1h RunAtLoad), rex-gateway (KeepAlive)',
    source: 'config', category: 'infrastructure', tags: '["launchagent","macos","daemon"]',
    created_at: daysAgo(14),
  },
  {
    content: 'Memory DB: 768 dimensions pour nomic-embed-text, 512 tokens par chunk',
    source: 'session', category: 'memory', tags: '["embed","nomic","sqlite-vec"]',
    created_at: daysAgo(10),
  },
]

const EVENT_JOURNAL_FIXTURES = [
  { event_type: 'session_start', source: 'daemon', data: '{"user":"kevin"}', created_at: daysAgo(0) },
  { event_type: 'llm_call', source: 'orchestrator', data: '{"model":"qwen2.5","tokens":450}', created_at: daysAgo(0) },
  { event_type: 'signal_detected', source: 'curious', data: '{"type":"DISCOVERY","title":"new MCP server"}', created_at: daysAgo(1) },
  { event_type: 'ingest_complete', source: 'daemon', data: '{"chunks":23,"duration_ms":1200}', created_at: daysAgo(1) },
]

const BUDGET_FIXTURES = [
  { provider: 'ollama', model: 'qwen2.5', task_type: 'chat', tokens_in: 1200, tokens_out: 350, estimated_cost_usd: 0 },
  { provider: 'claude-haiku-4', model: 'claude-haiku-4', task_type: 'classify', tokens_in: 800, tokens_out: 200, estimated_cost_usd: 0.0003 },
  { provider: 'claude-sonnet-4', model: 'claude-sonnet-4', task_type: 'code', tokens_in: 2400, tokens_out: 800, estimated_cost_usd: 0.019 },
]

const OPEN_LOOP_FIXTURES = [
  { title: 'VPS cold start procedure non documentée', description: 'Sequence exacte installation VPS vierge', priority: 2, status: 'open' },
  { title: 'Fleet auth JWT non implémenté', description: 'FLEET node sans preuve identité au BRAIN', priority: 3, status: 'open' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ── Main seeder ───────────────────────────────────────────────────────────────

export function seedTestDb(dbPath = DB_PATH): void {
  ensureDir(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // memories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      source TEXT,
      category TEXT,
      tags TEXT,
      embedding BLOB,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // event_journal table
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      source TEXT,
      data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // budget_entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT,
      task_type TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // open_loops table
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_loops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 1,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Seed memories
  const insMemory = db.prepare(`
    INSERT INTO memories (content, source, category, tags, created_at) VALUES (?, ?, ?, ?, ?)
  `)
  for (const f of MEMORY_FIXTURES) {
    insMemory.run(f.content, f.source, f.category, f.tags, f.created_at)
  }

  // Seed event journal
  const insEvent = db.prepare(`
    INSERT INTO event_journal (event_type, source, data, created_at) VALUES (?, ?, ?, ?)
  `)
  for (const f of EVENT_JOURNAL_FIXTURES) {
    insEvent.run(f.event_type, f.source, f.data, f.created_at)
  }

  // Seed budget
  const insBudget = db.prepare(`
    INSERT INTO budget_entries (provider, model, task_type, tokens_in, tokens_out, estimated_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const f of BUDGET_FIXTURES) {
    insBudget.run(f.provider, f.model, f.task_type, f.tokens_in, f.tokens_out, f.estimated_cost_usd)
  }

  // Seed open loops
  const insLoop = db.prepare(`
    INSERT INTO open_loops (title, description, priority, status) VALUES (?, ?, ?, ?)
  `)
  for (const f of OPEN_LOOP_FIXTURES) {
    insLoop.run(f.title, f.description, f.priority, f.status)
  }

  db.close()
  console.log(`[seed] Seeded ${MEMORY_FIXTURES.length} memories, ${EVENT_JOURNAL_FIXTURES.length} events, ${BUDGET_FIXTURES.length} budget entries, ${OPEN_LOOP_FIXTURES.length} open loops → ${dbPath}`)
}

// Run directly if executed as script
if (process.argv[1]?.endsWith('test-seed.ts') || process.argv[1]?.endsWith('test-seed.js')) {
  seedTestDb()
}
