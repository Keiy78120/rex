/** @module REX-MONITOR */

import { createLogger } from '../logger.js'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { getAppUsage, getProductivitySnapshot, categorizeApp, type AppUsage, type ProductivitySnapshot } from '../activitywatch-bridge.js'

const log = createLogger('pattern-detector')

const MONITOR_DIR = join(homedir(), '.claude', 'rex', 'monitor')
const EVENTS_FILE = join(MONITOR_DIR, 'events.jsonl')

// ─── Signal Types ──────────────────────────────────────────────────────────────

export type SignalKind = 'DISCOVERY' | 'PATTERN' | 'OPEN_LOOP'

export interface CuriousSignal {
  kind: SignalKind
  message: string
  detail?: string
  source: 'activitywatch' | 'hammerspoon' | 'audio' | 'manual'
  confidence: number // 0–1
  detectedAt: string
}

// ─── Hammerspoon Events ────────────────────────────────────────────────────────

interface HammerEvent {
  ts: string
  type: 'app_focus' | 'clipboard' | 'hotkey' | 'heartbeat'
  data: string | Record<string, string>
}

function loadHammerEvents(sinceHours = 24): HammerEvent[] {
  if (!existsSync(EVENTS_FILE)) return []
  const cutoff = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const lines = readFileSync(EVENTS_FILE, 'utf-8').split('\n').filter(Boolean)
  const events: HammerEvent[] = []
  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as HammerEvent
      if (ev.ts >= cutoff) events.push(ev)
    } catch { /* skip malformed */ }
  }
  return events
}

// ─── Pattern Detectors ─────────────────────────────────────────────────────────

function detectAppSwitchingPattern(events: HammerEvent[]): CuriousSignal | null {
  const focuses = events.filter(e => e.type === 'app_focus')
  if (focuses.length < 20) return null

  const apps = focuses
    .map(f => (typeof f.data === 'object' ? (f.data as Record<string, string>).app : ''))
    .filter(Boolean)

  // Detect repeated A→B pair
  const sequences = new Map<string, number>()
  for (let i = 0; i + 1 < apps.length; i++) {
    const pair = `${apps[i]}→${apps[i + 1]}`
    sequences.set(pair, (sequences.get(pair) ?? 0) + 1)
  }
  const top = [...sequences.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top && top[1] >= 5) {
    const [a, b] = top[0].split('→')
    return {
      kind: 'PATTERN',
      message: `Vous alternez fréquemment entre ${a} et ${b} (${top[1]}x) — voulez-vous automatiser ce workflow ?`,
      detail: `Pair: ${top[0]}, count: ${top[1]}`,
      source: 'hammerspoon',
      confidence: 0.8,
      detectedAt: new Date().toISOString(),
    }
  }

  // Detect high switch rate
  const hourlyRate = (focuses.length / 24)
  if (hourlyRate > 30) {
    return {
      kind: 'PATTERN',
      message: `Vous changez d'application fréquemment (~${Math.round(hourlyRate)}/h) — voulez-vous que j'organise votre workspace ?`,
      detail: `${focuses.length} switches in 24h`,
      source: 'hammerspoon',
      confidence: 0.65,
      detectedAt: new Date().toISOString(),
    }
  }

  return null
}

function detectDeepFocusPattern(usage: AppUsage[]): CuriousSignal | null {
  const totalSec = usage.reduce((s, u) => s + u.duration, 0)
  const totalMin = totalSec / 60
  if (totalMin < 60) return null

  const devSec = usage
    .filter(u => categorizeApp(u.app) === 'dev')
    .reduce((s, u) => s + u.duration, 0)
  const devMin = devSec / 60
  const focusRatio = totalMin > 0 ? devMin / totalMin : 0

  if (focusRatio > 0.7 && devMin > 120) {
    return {
      kind: 'PATTERN',
      message: `Forte session dev (${Math.round(devMin)}min sur ${Math.round(totalMin)}min) — voulez-vous un résumé de session ?`,
      detail: `Dev focus ratio: ${Math.round(focusRatio * 100)}%`,
      source: 'activitywatch',
      confidence: 0.75,
      detectedAt: new Date().toISOString(),
    }
  }
  return null
}

function detectHighCommunicationLoad(usage: AppUsage[]): CuriousSignal | null {
  const commSec = usage
    .filter(u => categorizeApp(u.app) === 'communication')
    .reduce((s, u) => s + u.duration, 0)
  const commMin = commSec / 60

  if (commMin > 120) {
    return {
      kind: 'PATTERN',
      message: `${Math.round(commMin)}min en communication aujourd'hui — voulez-vous un résumé de vos messages importants ?`,
      detail: `Communication load: ${Math.round(commMin)}min`,
      source: 'activitywatch',
      confidence: 0.65,
      detectedAt: new Date().toISOString(),
    }
  }
  return null
}

function detectOpenLoops(events: HammerEvent[]): CuriousSignal[] {
  // Open loops come from clipboard patterns (copy something, never paste it)
  // Simple heuristic: many clipboard events without corresponding app usage growth
  const clipboardEvents = events.filter(e => e.type === 'clipboard')
  if (clipboardEvents.length > 20) {
    return [{
      kind: 'OPEN_LOOP',
      message: `${clipboardEvents.length} opérations clipboard aujourd'hui — avez-vous des éléments en attente de traitement ?`,
      detail: `Clipboard events: ${clipboardEvents.length}`,
      source: 'hammerspoon',
      confidence: 0.5,
      detectedAt: new Date().toISOString(),
    }]
  }
  return []
}

// ─── Report ────────────────────────────────────────────────────────────────────

export interface PatternReport {
  signals: CuriousSignal[]
  productivity: ProductivitySnapshot | null
  awAvailable: boolean
  hammerEventsCount: number
  detectedAt: string
}

export async function detectPatterns(hours = 8): Promise<PatternReport> {
  const signals: CuriousSignal[] = []

  // Hammerspoon events
  const hammerEvents = loadHammerEvents(24)
  log.debug(`Loaded ${hammerEvents.length} Hammerspoon events`)

  const switchSignal = detectAppSwitchingPattern(hammerEvents)
  if (switchSignal) signals.push(switchSignal)

  const openLoops = detectOpenLoops(hammerEvents)
  signals.push(...openLoops)

  // ActivityWatch data
  let productivity: ProductivitySnapshot | null = null
  let awAvailable = false

  try {
    const usage = await getAppUsage(hours)
    if (usage.length > 0) {
      awAvailable = true
      productivity = await getProductivitySnapshot(hours)

      const focusSignal = detectDeepFocusPattern(usage)
      if (focusSignal) signals.push(focusSignal)

      const commSignal = detectHighCommunicationLoad(usage)
      if (commSignal) signals.push(commSignal)
    }
  } catch (err) {
    log.debug(`ActivityWatch unavailable: ${(err as Error).message}`)
  }

  signals.sort((a, b) => b.confidence - a.confidence)

  log.debug(`Detected ${signals.length} pattern signals`)

  return {
    signals,
    productivity,
    awAvailable,
    hammerEventsCount: hammerEvents.length,
    detectedAt: new Date().toISOString(),
  }
}
