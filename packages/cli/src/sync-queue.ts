import { join } from 'node:path'
import { hostname } from 'node:os'
import Database from 'better-sqlite3'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('sync-queue')

export const SYNC_QUEUE_DB_PATH = join(REX_DIR, 'sync-queue.sqlite')

export type EventType =
  | 'gateway.message'
  | 'gateway.command'
  | 'notification'
  | 'memory.ingest'
  | 'memory.categorize'
  | 'task.delegated'
  | 'task.completed'
  | 'daemon.job'
  | 'sync.push'
  | 'sync.pull'
  | 'node.register'
  | 'node.heartbeat'
  | 'hub.event'

export interface QueueEvent {
  id: number
  type: EventType
  payload: string
  source: string
  timestamp: string
  acked: boolean
  ackedAt: string | null
  replayed: boolean
  error: string | null
}

let db: ReturnType<typeof Database> | null = null

function ensureDb(): ReturnType<typeof Database> {
  if (db) return db
  ensureRexDirs()
  db = new Database(SYNC_QUEUE_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'local',
      timestamp TEXT NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0,
      acked_at TEXT,
      replayed INTEGER NOT NULL DEFAULT 0,
      error TEXT
    )
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_acked ON events (acked)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)`)
  return db
}

function rowToEvent(row: Record<string, unknown>): QueueEvent {
  return {
    id: row.id as number,
    type: row.type as EventType,
    payload: row.payload as string,
    source: row.source as string,
    timestamp: row.timestamp as string,
    acked: (row.acked as number) === 1,
    ackedAt: (row.acked_at as string) ?? null,
    replayed: (row.replayed as number) === 1,
    error: (row.error as string) ?? null,
  }
}

export function appendEvent(type: EventType, payload: unknown, source?: string): number {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'INSERT INTO events (type, payload, source, timestamp) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(
      type,
      JSON.stringify(payload),
      source ?? hostname(),
      new Date().toISOString()
    )
    return result.lastInsertRowid as number
  } catch (err) {
    log.error(`appendEvent failed: ${err}`)
    return -1
  }
}

export function ackEvent(id: number): boolean {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'UPDATE events SET acked = 1, acked_at = ? WHERE id = ?'
    )
    const result = stmt.run(new Date().toISOString(), id)
    return result.changes > 0
  } catch (err) {
    log.error(`ackEvent failed: ${err}`)
    return false
  }
}

export function getUnacked(limit = 100): QueueEvent[] {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'SELECT * FROM events WHERE acked = 0 ORDER BY id ASC LIMIT ?'
    )
    const rows = stmt.all(limit) as Record<string, unknown>[]
    return rows.map(rowToEvent)
  } catch (err) {
    log.error(`getUnacked failed: ${err}`)
    return []
  }
}

export async function replayUnacked(
  handlers?: Partial<Record<EventType, (event: QueueEvent) => Promise<boolean>>>
): Promise<{ processed: number; failed: number }> {
  const events = getUnacked()
  let processed = 0
  let failed = 0

  for (const event of events) {
    const handler = handlers?.[event.type]
    if (!handler) {
      continue
    }
    try {
      const success = await handler(event)
      if (success) {
        ackEvent(event.id)
        processed++
      } else {
        markError(event.id, 'handler returned false')
        failed++
      }
    } catch (err) {
      markError(event.id, String(err))
      failed++
    }
  }

  return { processed, failed }
}

function markError(id: number, error: string): void {
  try {
    const d = ensureDb()
    const stmt = d.prepare('UPDATE events SET error = ? WHERE id = ?')
    stmt.run(error, id)
  } catch (err) {
    log.error(`markError failed: ${err}`)
  }
}

export function getEventLog(limit = 50, offset = 0): QueueEvent[] {
  try {
    const d = ensureDb()
    const stmt = d.prepare(
      'SELECT * FROM events ORDER BY id DESC LIMIT ? OFFSET ?'
    )
    const rows = stmt.all(limit, offset) as Record<string, unknown>[]
    return rows.map(rowToEvent)
  } catch (err) {
    log.error(`getEventLog failed: ${err}`)
    return []
  }
}

export function getQueueStats(): { total: number; unacked: number; byType: Record<string, number> } {
  try {
    const d = ensureDb()
    const totalRow = d.prepare('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }
    const unackedRow = d.prepare('SELECT COUNT(*) as cnt FROM events WHERE acked = 0').get() as { cnt: number }
    const typeRows = d.prepare(
      'SELECT type, COUNT(*) as cnt FROM events GROUP BY type'
    ).all() as { type: string; cnt: number }[]

    const byType: Record<string, number> = {}
    for (const row of typeRows) {
      byType[row.type] = row.cnt
    }

    return { total: totalRow.cnt, unacked: unackedRow.cnt, byType }
  } catch (err) {
    log.error(`getQueueStats failed: ${err}`)
    return { total: 0, unacked: 0, byType: {} }
  }
}

export function purgeOldEvents(olderThanDays = 30): number {
  try {
    const d = ensureDb()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - olderThanDays)
    const stmt = d.prepare(
      'DELETE FROM events WHERE acked = 1 AND timestamp < ?'
    )
    const result = stmt.run(cutoff.toISOString())
    return result.changes
  } catch (err) {
    log.error(`purgeOldEvents failed: ${err}`)
    return 0
  }
}

// ── Queue Health ─────────────────────────────────────

export interface QueueHealth {
  pendingCount: number
  oldestPendingAge: number | null // milliseconds
  totalSizeBytes: number
}

export function getQueueHealth(): QueueHealth {
  try {
    const d = ensureDb()
    const pendingRow = d.prepare('SELECT COUNT(*) as cnt FROM events WHERE acked = 0').get() as { cnt: number }
    const oldestRow = d.prepare(
      'SELECT MIN(timestamp) as ts FROM events WHERE acked = 0'
    ).get() as { ts: string | null }

    let oldestPendingAge: number | null = null
    if (oldestRow.ts) {
      oldestPendingAge = Date.now() - new Date(oldestRow.ts).getTime()
    }

    // Approximate size: sum of payload lengths for all events
    const sizeRow = d.prepare(
      'SELECT COALESCE(SUM(LENGTH(payload)), 0) as sz FROM events'
    ).get() as { sz: number }

    return {
      pendingCount: pendingRow.cnt,
      oldestPendingAge,
      totalSizeBytes: sizeRow.sz,
    }
  } catch (err) {
    log.error(`getQueueHealth failed: ${err}`)
    return { pendingCount: 0, oldestPendingAge: null, totalSizeBytes: 0 }
  }
}

// ── Retry with Backoff ───────────────────────────────

const retryCountMap = new Map<number, number>()

export async function retryWithBackoff(
  eventId: number,
  handler: (event: QueueEvent) => Promise<boolean>,
  maxRetries = 5,
): Promise<boolean> {
  const attempts = retryCountMap.get(eventId) ?? 0
  if (attempts >= maxRetries) {
    markError(eventId, `max retries (${maxRetries}) exceeded`)
    retryCountMap.delete(eventId)
    log.warn(`Event ${eventId}: max retries exceeded`)
    return false
  }

  const delayMs = Math.min(1000 * Math.pow(2, attempts), 60_000)
  await new Promise(resolve => setTimeout(resolve, delayMs))

  try {
    const d = ensureDb()
    const row = d.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Record<string, unknown> | undefined
    if (!row) {
      retryCountMap.delete(eventId)
      return false
    }

    const event = rowToEvent(row)
    const success = await handler(event)
    if (success) {
      ackEvent(eventId)
      retryCountMap.delete(eventId)
      log.info(`Event ${eventId}: retry #${attempts + 1} succeeded`)
      return true
    }

    retryCountMap.set(eventId, attempts + 1)
    markError(eventId, `retry #${attempts + 1} failed`)
    return false
  } catch (err) {
    retryCountMap.set(eventId, attempts + 1)
    markError(eventId, `retry #${attempts + 1} error: ${err}`)
    log.warn(`Event ${eventId}: retry #${attempts + 1} error: ${err}`)
    return false
  }
}

// ── Prune Old Events ─────────────────────────────────

export function pruneOldEvents(daysToKeep = 30): number {
  try {
    const d = ensureDb()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysToKeep)
    const stmt = d.prepare(
      'DELETE FROM events WHERE acked = 1 AND timestamp < ?'
    )
    const result = stmt.run(cutoff.toISOString())
    log.info(`Pruned ${result.changes} acked events older than ${daysToKeep} days`)
    return result.changes
  } catch (err) {
    log.error(`pruneOldEvents failed: ${err}`)
    return 0
  }
}
