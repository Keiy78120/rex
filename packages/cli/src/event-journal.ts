/** @module HQ */
import { join } from 'node:path'
import { hostname } from 'node:os'
import Database from 'better-sqlite3'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('HQ:journal')

export const JOURNAL_DB_PATH = join(REX_DIR, 'event-journal.sqlite')

export type JournalEventType =
  | 'gateway_message'
  | 'memory_observation'
  | 'task_delegation'
  | 'sync_event'
  | 'guard_trigger'
  | 'daemon_action'

export interface JournalEvent {
  id: number
  event_type: JournalEventType
  source: string
  payload: string
  node_id: string
  created_at: string
  acked: boolean
}

let db: ReturnType<typeof Database> | null = null

function ensureDb(): ReturnType<typeof Database> {
  if (db) return db
  ensureRexDirs()
  db = new Database(JOURNAL_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      node_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_acked ON event_journal (acked)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_type ON event_journal (event_type)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_journal_created ON event_journal (created_at)`)
  return db
}

function rowToEvent(row: Record<string, unknown>): JournalEvent {
  return {
    id: row.id as number,
    event_type: row.event_type as JournalEventType,
    source: row.source as string,
    payload: row.payload as string,
    node_id: row.node_id as string,
    created_at: row.created_at as string,
    acked: (row.acked as number) === 1,
  }
}

export function appendEvent(type: JournalEventType, source: string, payload: unknown): number {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'INSERT INTO event_journal (event_type, source, payload, node_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    const result = stmt.run(
      type,
      source,
      JSON.stringify(payload),
      hostname(),
      new Date().toISOString()
    )
    log.debug(`Event appended: ${type} from ${source}`)
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`appendEvent failed: ${err}`)
    return -1
  }
}

export function getUnacked(limit = 100): JournalEvent[] {
  try {
    const d = ensureDb()
    const rows = d.prepare(
      'SELECT * FROM event_journal WHERE acked = 0 ORDER BY id ASC LIMIT ?'
    ).all(limit) as Record<string, unknown>[]
    return rows.map(rowToEvent)
  } catch (err) {
    log.error(`getUnacked failed: ${err}`)
    return []
  }
}

export function ackEvent(id: number): boolean {
  try {
    const d = ensureDb()
    const result = d.prepare(
      'UPDATE event_journal SET acked = 1 WHERE id = ?'
    ).run(id)
    return result.changes > 0
  } catch (err) {
    log.error(`ackEvent failed: ${err}`)
    return false
  }
}

export function replayUnacked(): { replayed: number; total: number } {
  const events = getUnacked()
  let replayed = 0
  for (const event of events) {
    log.info(`Replay: [${event.event_type}] ${event.source} — ${event.payload.slice(0, 100)}`)
    ackEvent(event.id)
    replayed++
  }
  return { replayed, total: events.length }
}

export interface JournalStats {
  total: number
  unacked: number
  byType: Record<string, number>
  bySource: Record<string, number>
  oldest: string | null
  newest: string | null
}

export function getJournalStats(): JournalStats {
  try {
    const d = ensureDb()
    const totalRow = d.prepare('SELECT COUNT(*) as cnt FROM event_journal').get() as { cnt: number }
    const unackedRow = d.prepare('SELECT COUNT(*) as cnt FROM event_journal WHERE acked = 0').get() as { cnt: number }

    const typeRows = d.prepare(
      'SELECT event_type, COUNT(*) as cnt FROM event_journal GROUP BY event_type'
    ).all() as { event_type: string; cnt: number }[]
    const byType: Record<string, number> = {}
    for (const r of typeRows) byType[r.event_type] = r.cnt

    const sourceRows = d.prepare(
      'SELECT source, COUNT(*) as cnt FROM event_journal GROUP BY source'
    ).all() as { source: string; cnt: number }[]
    const bySource: Record<string, number> = {}
    for (const r of sourceRows) bySource[r.source] = r.cnt

    const oldestRow = d.prepare('SELECT MIN(created_at) as ts FROM event_journal').get() as { ts: string | null }
    const newestRow = d.prepare('SELECT MAX(created_at) as ts FROM event_journal').get() as { ts: string | null }

    return {
      total: totalRow.cnt,
      unacked: unackedRow.cnt,
      byType,
      bySource,
      oldest: oldestRow.ts,
      newest: newestRow.ts,
    }
  } catch (err) {
    log.error(`getJournalStats failed: ${err}`)
    return { total: 0, unacked: 0, byType: {}, bySource: {}, oldest: null, newest: null }
  }
}

export function purgeOldJournalEvents(olderThanDays = 30): number {
  try {
    const d = ensureDb()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)
    const result = d.prepare(
      'DELETE FROM event_journal WHERE acked = 1 AND created_at < ?'
    ).run(cutoff.toISOString())
    return result.changes
  } catch (err) {
    log.error(`purgeOldJournalEvents failed: ${err}`)
    return 0
  }
}
