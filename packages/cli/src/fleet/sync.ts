/**
 * REX Sync — Bidirectional sync between local queue and hub
 * @module MEMORY
 */

import { getUnacked, appendEvent, ackEvent, getQueueStats, getQueueHealth } from './sync-queue.js'
import { discoverHub, getNodeId } from './node.js'
import { REX_DIR, ensureRexDirs } from '../paths.js'
import { createLogger } from '../logger.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const log = createLogger('MEMORY:sync-engine')

const SYNC_STATE_PATH = join(REX_DIR, 'sync-state.json')

interface SyncState {
  lastPushAt: string | null
  lastPullAt: string | null
  lastPushCount: number
  lastPullCount: number
  consecutiveFailures: number
  lastHubCheckAt: string | null
  hubAvailable: boolean
}

function loadState(): SyncState {
  try {
    if (existsSync(SYNC_STATE_PATH)) {
      return JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'))
    }
  } catch {
    log.warn('Failed to load sync state, using defaults')
  }
  return { lastPushAt: null, lastPullAt: null, lastPushCount: 0, lastPullCount: 0, consecutiveFailures: 0, lastHubCheckAt: null, hubAvailable: false }
}

function saveState(state: SyncState): void {
  try {
    ensureRexDirs()
    writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2) + '\n')
  } catch (err) {
    log.warn(`Failed to save sync state: ${err}`)
  }
}

// ── Helpers ───────────────────────────────────────────

/** True when the hub URL resolves to this machine (prevents self-sync loop). */
function isLocalHub(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

// ── Push ──────────────────────────────────────────────

export async function syncPush(hubUrl?: string): Promise<{ pushed: number; failed: number }> {
  const url = hubUrl || await discoverHub()
  if (!url) {
    log.warn('Hub unreachable, skipping sync push')
    return { pushed: 0, failed: 0 }
  }

  const events = getUnacked(100)
  if (events.length === 0) {
    log.debug('No unacked events to push')
    return { pushed: 0, failed: 0 }
  }

  // Self-sync guard: hub is on the same machine → ack events directly (no HTTP round-trip).
  // Pushing to localhost would re-append events to the same DB creating an infinite loop.
  if (isLocalHub(url)) {
    for (const event of events) ackEvent(event.id)
    const state = loadState()
    state.lastPushAt = new Date().toISOString()
    state.lastPushCount = events.length
    state.consecutiveFailures = 0
    saveState(state)
    log.debug(`Local hub — acked ${events.length} events directly`)
    return { pushed: events.length, failed: 0 }
  }

  let pushed = 0
  let failed = 0
  const state = loadState()

  for (const event of events) {
    try {
      const res = await fetch(`${url}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: event.type,
          payload: JSON.parse(event.payload),
          source: event.source,
        }),
        signal: AbortSignal.timeout(5000),
      })

      if (res.ok) {
        ackEvent(event.id)
        pushed++
      } else {
        log.warn(`Push event ${event.id} returned ${res.status}`)
        failed++
      }
    } catch (err) {
      log.warn(`Push event ${event.id} failed: ${err}`)
      failed++
    }
  }

  appendEvent('sync.push', { pushed, failed, nodeId: getNodeId() })

  state.lastPushAt = new Date().toISOString()
  state.lastPushCount = pushed
  state.consecutiveFailures = failed > 0 ? state.consecutiveFailures + 1 : 0
  saveState(state)

  log.info(`Push complete: ${pushed} pushed, ${failed} failed`)
  return { pushed, failed }
}

// ── Pull ──────────────────────────────────────────────

export async function syncPull(hubUrl?: string): Promise<{ pulled: number }> {
  const url = hubUrl || await discoverHub()
  if (!url) {
    log.warn('Hub unreachable, skipping sync pull')
    return { pulled: 0 }
  }

  // Self-sync guard: pulling from localhost would import our own events back.
  if (isLocalHub(url)) {
    log.debug('Local hub — skipping pull (events already local)')
    const state = loadState()
    state.lastPullAt = new Date().toISOString()
    state.lastPullCount = 0
    saveState(state)
    return { pulled: 0 }
  }

  let pulled = 0
  const state = loadState()
  let offset = 0
  const limit = 100

  try {
    while (true) {
      const res = await fetch(`${url}/api/events?limit=${limit}&offset=${offset}`, {
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        log.warn(`Pull returned ${res.status}`)
        break
      }

      const body = await res.json() as { data?: Array<{ type: string; payload: unknown; source: string; timestamp: string }> }
      const events = body.data ?? []

      if (events.length === 0) break

      for (const event of events) {
        const isDuplicate = await checkDuplicate(event.timestamp, event.type, event.source)
        if (isDuplicate) continue

        appendEvent(
          event.type as Parameters<typeof appendEvent>[0],
          event.payload,
          event.source,
        )
        pulled++
      }

      if (events.length < limit) break
      offset += limit
    }
  } catch (err) {
    log.warn(`Pull failed: ${err}`)
  }

  state.lastPullAt = new Date().toISOString()
  state.lastPullCount = pulled
  state.consecutiveFailures = pulled >= 0 ? 0 : state.consecutiveFailures + 1
  saveState(state)

  log.info(`Pull complete: ${pulled} new events`)
  return { pulled }
}

async function checkDuplicate(timestamp: string, type: string, source: string): Promise<boolean> {
  // We access the DB through getUnacked/getEventLog but they don't filter by timestamp+type+source.
  // For now, import the DB path and do a direct check.
  try {
    const { default: Database } = await import('better-sqlite3')
    const { SYNC_QUEUE_DB_PATH } = await import('./sync-queue.js')
    const db = new Database(SYNC_QUEUE_DB_PATH, { readonly: true })
    const row = db.prepare(
      'SELECT id FROM events WHERE timestamp = ? AND type = ? AND source = ? LIMIT 1'
    ).get(timestamp, type, source)
    db.close()
    return row !== undefined
  } catch {
    return false
  }
}

// ── Bidirectional ─────────────────────────────────────

export async function syncBidirectional(hubUrl?: string): Promise<{ pushed: number; pulled: number; failed: number }> {
  const url = hubUrl || await discoverHub()
  const pushResult = await syncPush(url ?? undefined)
  const pullResult = await syncPull(url ?? undefined)
  return { pushed: pushResult.pushed, pulled: pullResult.pulled, failed: pushResult.failed }
}

// ── Status ────────────────────────────────────────────

const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

export function getSyncStatusData() {
  const state = loadState()
  const stats = getQueueStats()
  return {
    lastPush: state.lastPushAt || null,
    lastPull: state.lastPullAt || null,
    pendingPush: stats.unacked,
    pendingPull: 0,
    autoSync: autoSyncInterval !== null,
    consecutiveFailures: state.consecutiveFailures,
  }
}

export async function showSyncStatus(): Promise<void> {
  const state = loadState()
  const stats = getQueueStats()
  const hubUrl = await discoverHub()

  const hubDisplay = hubUrl
    ? `${GREEN}\u25CF${RESET} connected (${hubUrl})`
    : `${RED}\u25CB${RESET} disconnected`

  const pushDisplay = state.lastPushAt
    ? `${state.lastPushAt} (${state.lastPushCount} events)`
    : `${DIM}never${RESET}`

  const pullDisplay = state.lastPullAt
    ? `${state.lastPullAt} (${state.lastPullCount} events)`
    : `${DIM}never${RESET}`

  console.log()
  console.log(`${BOLD}REX Sync${RESET}`)
  console.log(`${DIM}${'─'.repeat(28)}${RESET}`)
  console.log(`  Hub:          ${hubDisplay}`)
  console.log(`  Last push:    ${pushDisplay}`)
  console.log(`  Last pull:    ${pullDisplay}`)
  console.log(`  Local queue:  ${CYAN}${stats.total}${RESET} total, ${CYAN}${stats.unacked}${RESET} unacked`)
  console.log(`  Failures:     ${state.consecutiveFailures} consecutive`)
  console.log(`${DIM}${'─'.repeat(28)}${RESET}`)
  console.log()
}

// ── Hub Availability ─────────────────────────────────

export async function checkHubAvailable(hubUrl?: string): Promise<boolean> {
  const candidates: string[] = []
  if (hubUrl) candidates.push(hubUrl)
  if (process.env.REX_HUB_URL) candidates.push(process.env.REX_HUB_URL.replace(/\/$/, ''))
  candidates.push('http://localhost:7420')

  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/health`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return true
    } catch {
      // try next
    }
  }
  return false
}

// ── Sync Status ──────────────────────────────────────

export interface SyncStatus {
  hubAvailable: boolean
  pendingCount: number
  lastSyncAt: string | null
  consecutiveFailures: number
}

export function getSyncStatus(): SyncStatus {
  const state = loadState()
  const health = getQueueHealth()
  const lastSyncAt = state.lastPushAt && state.lastPullAt
    ? (state.lastPushAt > state.lastPullAt ? state.lastPushAt : state.lastPullAt)
    : state.lastPushAt || state.lastPullAt
  return {
    hubAvailable: state.hubAvailable,
    pendingCount: health.pendingCount,
    lastSyncAt,
    consecutiveFailures: state.consecutiveFailures,
  }
}

// ── Sync with Retry (degraded mode) ──────────────────

export async function syncWithRetry(
  hubUrl?: string,
  maxAttempts = 3,
): Promise<{ pushed: number; pulled: number; failed: number; hubWasDown: boolean }> {
  const state = loadState()

  // Check hub availability
  const available = await checkHubAvailable(hubUrl)
  state.lastHubCheckAt = new Date().toISOString()
  state.hubAvailable = available

  if (!available) {
    // Hub is down — spool locally, don't attempt sync
    log.warn('Hub unavailable — operating in degraded mode (events spooled locally)')
    state.consecutiveFailures++
    saveState(state)
    return { pushed: 0, pulled: 0, failed: 0, hubWasDown: true }
  }

  // Hub is back — if we had failures before, replay pending events
  const wasDegraded = state.consecutiveFailures > 0
  if (wasDegraded) {
    log.info(`Hub available again after ${state.consecutiveFailures} failures — replaying pending events`)
  }

  let lastResult = { pushed: 0, pulled: 0, failed: 0 }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await syncBidirectional(hubUrl)
      lastResult = result

      if (result.failed === 0) {
        state.consecutiveFailures = 0
        state.hubAvailable = true
        saveState(state)
        return { ...result, hubWasDown: false }
      }

      // Partial failure — retry with backoff
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000)
        log.warn(`Sync attempt ${attempt}/${maxAttempts}: ${result.failed} failed, retrying in ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (err) {
      log.warn(`Sync attempt ${attempt}/${maxAttempts} error: ${err}`)
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  state.consecutiveFailures++
  saveState(state)
  return { ...lastResult, hubWasDown: false }
}

// ── Auto Sync ─────────────────────────────────────────

let autoSyncInterval: NodeJS.Timeout | null = null

export function startAutoSync(hubUrl?: string, intervalMs = 300_000): void {
  stopAutoSync()
  log.info(`Starting auto sync every ${intervalMs / 1000}s`)

  const runSync = async () => {
    try {
      await syncBidirectional(hubUrl)
    } catch (err) {
      log.warn(`Auto sync failed: ${err}`)
    }
  }

  runSync()
  autoSyncInterval = setInterval(runSync, intervalMs)
}

export function stopAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval)
    autoSyncInterval = null
    log.info('Auto sync stopped')
  }
}
