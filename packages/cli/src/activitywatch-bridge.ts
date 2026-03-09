/** @module REX-MONITOR */

import { createLogger } from './logger.js'

const log = createLogger('activitywatch-bridge')

const AW_BASE = 'http://localhost:5600/api/0'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AwEvent {
  id: number
  timestamp: string
  duration: number // seconds
  data: Record<string, unknown>
}

export interface AppUsage {
  app: string
  title: string
  duration: number // seconds
  events: number
}

export interface AwStatus {
  available: boolean
  version?: string
  bucketsCount: number
}

export interface ProductivitySnapshot {
  date: string
  totalFocusMin: number
  devToolsMin: number
  browserMin: number
  communicationMin: number
  topApp: string
}

// ─── Internal ──────────────────────────────────────────────────────────────────

async function awFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${AW_BASE}${path}`, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

const DEV_APPS = ['code', 'cursor', 'xcode', 'terminal', 'iterm', 'zed', 'fleet', 'vscode', 'intellij', 'phpstorm', 'webstorm', 'goland']
const BROWSER_APPS = ['safari', 'chrome', 'firefox', 'arc', 'brave', 'opera', 'edge']
const COMM_APPS = ['slack', 'discord', 'zoom', 'teams', 'telegram', 'messages', 'mail', 'outlook', 'notion']

export function categorizeApp(app: string): 'dev' | 'browser' | 'communication' | 'other' {
  const a = app.toLowerCase()
  if (DEV_APPS.some(d => a.includes(d))) return 'dev'
  if (BROWSER_APPS.some(b => a.includes(b))) return 'browser'
  if (COMM_APPS.some(c => a.includes(c))) return 'communication'
  return 'other'
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getAwStatus(): Promise<AwStatus> {
  const info = await awFetch<{ version?: string }>('/info')
  if (!info) return { available: false, bucketsCount: 0 }
  const buckets = await awFetch<Record<string, unknown>>('/buckets')
  return {
    available: true,
    version: info.version,
    bucketsCount: buckets ? Object.keys(buckets).length : 0,
  }
}

export async function getWindowBucketId(): Promise<string | null> {
  const buckets = await awFetch<Record<string, { type: string }>>('/buckets')
  if (!buckets) return null
  return Object.keys(buckets).find(k => k.includes('aw-watcher-window')) ?? null
}

export async function getAppUsage(hours = 8): Promise<AppUsage[]> {
  const bucketId = await getWindowBucketId()
  if (!bucketId) {
    log.debug('No aw-watcher-window bucket found')
    return []
  }

  const start = new Date(Date.now() - hours * 3600_000).toISOString()
  const events = await awFetch<AwEvent[]>(
    `/buckets/${encodeURIComponent(bucketId)}/events?limit=2000&start=${encodeURIComponent(start)}`
  )
  if (!events) return []

  const appMap = new Map<string, AppUsage>()
  for (const ev of events) {
    const app = (ev.data.app as string) ?? 'unknown'
    const title = (ev.data.title as string) ?? ''
    const existing = appMap.get(app)
    if (existing) {
      existing.duration += ev.duration
      existing.events++
    } else {
      appMap.set(app, { app, title, duration: ev.duration, events: 1 })
    }
  }

  return [...appMap.values()].sort((a, b) => b.duration - a.duration)
}

export async function getTopApps(hours = 8, limit = 10): Promise<AppUsage[]> {
  const usage = await getAppUsage(hours)
  return usage.slice(0, limit)
}

/**
 * Returns the number of minutes the user has been AFK (idle) according to
 * the aw-watcher-afk bucket. Returns 0 if ActivityWatch is not available.
 */
export async function getAfkIdleMinutes(): Promise<number> {
  const buckets = await awFetch<Record<string, unknown>>('/buckets')
  if (!buckets) return 0
  const afkKey = Object.keys(buckets).find(k => k.includes('afk'))
  if (!afkKey) return 0
  const events = await awFetch<Array<{ data?: { status?: string }; duration?: number }>>(
    `/buckets/${encodeURIComponent(afkKey)}/events?limit=1`
  )
  if (!events || !events[0]) return 0
  const last = events[0]
  if (last.data?.status !== 'afk') return 0
  return Math.round((last.duration ?? 0) / 60)
}

export async function getProductivitySnapshot(hours = 8): Promise<ProductivitySnapshot> {
  const usage = await getAppUsage(hours)
  let devSec = 0, browserSec = 0, commSec = 0, totalSec = 0
  let topApp = ''
  let topDuration = 0

  for (const u of usage) {
    totalSec += u.duration
    const cat = categorizeApp(u.app)
    if (cat === 'dev') devSec += u.duration
    else if (cat === 'browser') browserSec += u.duration
    else if (cat === 'communication') commSec += u.duration
    if (u.duration > topDuration) { topDuration = u.duration; topApp = u.app }
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    totalFocusMin: Math.round(totalSec / 60),
    devToolsMin: Math.round(devSec / 60),
    browserMin: Math.round(browserSec / 60),
    communicationMin: Math.round(commSec / 60),
    topApp,
  }
}
