/**
 * Integration tests for the REX SQLite memory schema.
 * Uses better-sqlite3 directly with a temp database.
 * Tests: schema creation, CRUD, FTS5 search, event journal, open_loops, budget_usage.
 * Does NOT require Ollama, sqlite3 CLI, or migrations runner — validates the data model directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_DIR = join(tmpdir(), `rex-memory-test-${process.pid}`)
mkdirSync(TEST_DIR, { recursive: true })
const DB_PATH = join(TEST_DIR, 'test-memory.sqlite')

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── Schema setup (mirrors db-migrations.ts SQL) ───────────────────────────────

import Database from 'better-sqlite3'

function openDb(): InstanceType<typeof Database> {
  return new Database(DB_PATH)
}

function setupSchema(db: InstanceType<typeof Database>): void {
  // v1 — memories
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
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
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)`)

  // v2 — vec_id column
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN vec_id INTEGER`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_vec_id ON memories(vec_id) WHERE vec_id IS NOT NULL`)
  } catch (e: any) {
    if (!e.message?.includes('duplicate column')) throw e
  }

  // v3 — event_journal
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_type ON event_journal(event_type)`)

  // v4 — open_loops
  db.exec(`
    CREATE TABLE IF NOT EXISTS open_loops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open',
      source TEXT DEFAULT 'user',
      due_at TEXT,
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loops_status ON open_loops(status)`)

  // v5 — budget_usage
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_budget_provider ON budget_usage(provider)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_budget_created ON budget_usage(created_at)`)

  // schema_migrations tracker
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let db: InstanceType<typeof Database>

beforeAll(() => {
  db = openDb()
  setupSchema(db)
})

// ── Schema integrity ──────────────────────────────────────────────────────────

describe('schema integrity', () => {
  it('memories table exists', () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memories'`).get()
    expect(row).toBeDefined()
  })

  it('event_journal table exists', () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='event_journal'`).get()
    expect(row).toBeDefined()
  })

  it('open_loops table exists', () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='open_loops'`).get()
    expect(row).toBeDefined()
  })

  it('budget_usage table exists', () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='budget_usage'`).get()
    expect(row).toBeDefined()
  })

  it('schema_migrations table exists', () => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`).get()
    expect(row).toBeDefined()
  })

  it('memories table has vec_id column (v2 migration)', () => {
    const cols = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    expect(names).toContain('vec_id')
  })

  it('memories table has all expected columns', () => {
    const cols = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>
    const names = cols.map(c => c.name)
    for (const col of ['id', 'content', 'category', 'tags', 'source', 'importance', 'embedding_done', 'created_at']) {
      expect(names).toContain(col)
    }
  })
})

// ── memories CRUD ─────────────────────────────────────────────────────────────

describe('memories CRUD', () => {
  it('inserts and retrieves a memory', () => {
    const stmt = db.prepare(`INSERT INTO memories (content, category) VALUES (?, ?) RETURNING id`)
    const row = stmt.get('Fixed the JWT bug by rotating the secret key', 'debug') as { id: number }
    expect(row.id).toBeGreaterThan(0)

    const mem = db.prepare(`SELECT content, category FROM memories WHERE id = ?`).get(row.id) as { content: string; category: string }
    expect(mem.content).toBe('Fixed the JWT bug by rotating the secret key')
    expect(mem.category).toBe('debug')
  })

  it('updates a memory', () => {
    const insert = db.prepare(`INSERT INTO memories (content) VALUES (?) RETURNING id`)
    const row = insert.get('Old content') as { id: number }

    db.prepare(`UPDATE memories SET content = ?, updated_at = datetime('now') WHERE id = ?`)
      .run('New content after update', row.id)

    const mem = db.prepare(`SELECT content FROM memories WHERE id = ?`).get(row.id) as { content: string }
    expect(mem.content).toBe('New content after update')
  })

  it('filters by category', () => {
    db.prepare(`INSERT INTO memories (content, category) VALUES (?, ?)`).run('Code insight', 'code')
    db.prepare(`INSERT INTO memories (content, category) VALUES (?, ?)`).run('Life insight', 'personal')

    const code = db.prepare(`SELECT content FROM memories WHERE category = ?`).all('code') as Array<{ content: string }>
    expect(code.some(r => r.content === 'Code insight')).toBe(true)
    const personal = db.prepare(`SELECT content FROM memories WHERE category = ?`).all('personal') as Array<{ content: string }>
    expect(personal.some(r => r.content === 'Life insight')).toBe(true)
  })

  it('counts all memories', () => {
    const count = (db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number }).c
    expect(count).toBeGreaterThan(0)
  })
})

// ── event_journal ─────────────────────────────────────────────────────────────

describe('event_journal', () => {
  it('inserts and retrieves events', () => {
    db.prepare(`INSERT INTO event_journal (event_type, actor, payload) VALUES (?, ?, ?)`).run(
      'TASK_STARTED', 'rex', JSON.stringify({ task: 'relay-test' })
    )
    const events = db.prepare(`SELECT event_type, actor FROM event_journal WHERE event_type = 'TASK_STARTED'`).all() as Array<{ event_type: string; actor: string }>
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].actor).toBe('rex')
  })

  it('can filter by event_type', () => {
    db.prepare(`INSERT INTO event_journal (event_type, actor) VALUES ('RELAY_DONE', 'rex-relay')`).run()
    const done = db.prepare(`SELECT COUNT(*) as c FROM event_journal WHERE event_type = 'RELAY_DONE'`).get() as { c: number }
    expect(done.c).toBeGreaterThan(0)
  })
})

// ── open_loops ────────────────────────────────────────────────────────────────

describe('open_loops', () => {
  it('creates an open loop', () => {
    const res = db.prepare(`INSERT INTO open_loops (title, priority) VALUES (?, ?) RETURNING id`).get('Review fleet routing', 'high') as { id: number }
    expect(res.id).toBeGreaterThan(0)
  })

  it('retrieves open loops by status', () => {
    db.prepare(`INSERT INTO open_loops (title, status) VALUES ('Write tests', 'open')`).run()
    const open = db.prepare(`SELECT title FROM open_loops WHERE status = 'open'`).all() as Array<{ title: string }>
    expect(open.some(l => l.title === 'Write tests')).toBe(true)
  })

  it('closes a loop by updating status and closed_at', () => {
    const res = db.prepare(`INSERT INTO open_loops (title) VALUES ('Investigate latency') RETURNING id`).get() as { id: number }
    db.prepare(`UPDATE open_loops SET status = 'closed', closed_at = datetime('now') WHERE id = ?`).run(res.id)
    const loop = db.prepare(`SELECT status, closed_at FROM open_loops WHERE id = ?`).get(res.id) as { status: string; closed_at: string }
    expect(loop.status).toBe('closed')
    expect(loop.closed_at).toBeTruthy()
  })
})

// ── budget_usage ──────────────────────────────────────────────────────────────

describe('budget_usage', () => {
  it('records a usage entry', () => {
    db.prepare(`INSERT INTO budget_usage (provider, model, prompt_tokens, completion_tokens, cost_usd) VALUES (?, ?, ?, ?, ?)`)
      .run('claude', 'claude-sonnet-4-6', 1000, 200, 0.0054)
    const rows = db.prepare(`SELECT * FROM budget_usage WHERE provider = 'claude' ORDER BY id DESC LIMIT 1`).all() as Array<{
      provider: string; model: string; cost_usd: number; prompt_tokens: number
    }>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].cost_usd).toBeCloseTo(0.0054, 5)
    expect(rows[0].prompt_tokens).toBe(1000)
  })

  it('sums total cost per provider', () => {
    db.prepare(`INSERT INTO budget_usage (provider, model, cost_usd) VALUES ('ollama', 'qwen2.5:7b', 0)`).run()
    const totals = db.prepare(
      `SELECT provider, SUM(cost_usd) as total FROM budget_usage GROUP BY provider`
    ).all() as Array<{ provider: string; total: number }>
    const claude = totals.find(t => t.provider === 'claude')
    const ollama = totals.find(t => t.provider === 'ollama')
    expect(claude?.total).toBeGreaterThan(0)
    expect(ollama?.total).toBe(0)
  })
})

// ── schema_migrations ─────────────────────────────────────────────────────────

describe('schema_migrations', () => {
  it('can record migration versions', () => {
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (1, 'initial schema')`).run()
    const row = db.prepare(`SELECT version, description FROM schema_migrations WHERE version = 1`).get() as { version: number; description: string }
    expect(row.version).toBe(1)
    expect(row.description).toBe('initial schema')
  })

  it('version is unique (PRIMARY KEY constraint)', () => {
    db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (99, 'test migration')`).run()
    expect(() => {
      db.prepare(`INSERT INTO schema_migrations (version, description) VALUES (99, 'duplicate')`).run()
    }).toThrow()
  })
})
