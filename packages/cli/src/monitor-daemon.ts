/**
 * REX Monitor Daemon — Orchestrates ActivityWatch + Hammerspoon + Audio Logger
 *
 * Runs on a configurable interval (default 1h), aggregates data from all monitor
 * sources, runs pattern detection, and dispatches CURIOUS signals to the user.
 *
 * Can be started standalone (`rex monitor-daemon`) or called from the main daemon
 * every 30 minutes for lightweight signal generation.
 *
 * @module REX-MONITOR
 */

import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'
import { detectPatterns, type PatternReport } from './pattern-detector.js'
import { dispatchDiscoveries } from './proactive-dispatch.js'
import type { Discovery } from './curious.js'

const log = createLogger('REX-MONITOR:daemon')
const MONITOR_STATE_PATH = join(REX_DIR, 'monitor-state.json')
const MONITOR_DIR = join(homedir(), '.claude', 'rex', 'monitor')

// ── State ─────────────────────────────────────────────────────────────────────

interface MonitorState {
  lastRunAt: string
  lastReportAt: string
  totalSignalsDispatched: number
  consecutiveEmptyRuns: number
  awAvailableSince?: string
  hammerAvailableSince?: string
}

function loadState(): MonitorState {
  try {
    if (existsSync(MONITOR_STATE_PATH)) {
      return JSON.parse(readFileSync(MONITOR_STATE_PATH, 'utf-8')) as MonitorState
    }
  } catch {}
  return {
    lastRunAt: new Date(0).toISOString(),
    lastReportAt: new Date(0).toISOString(),
    totalSignalsDispatched: 0,
    consecutiveEmptyRuns: 0,
  }
}

function saveState(state: MonitorState): void {
  try {
    mkdirSync(join(REX_DIR), { recursive: true })
    writeFileSync(MONITOR_STATE_PATH, JSON.stringify(state, null, 2))
  } catch (err) {
    log.warn(`Failed to save monitor state: ${(err as Error).message}`)
  }
}

// ── Signal → Discovery bridge ─────────────────────────────────────────────────

/**
 * Convert a PatternReport into Discovery objects that proactive-dispatch understands.
 */
function reportToDiscoveries(report: PatternReport): Discovery[] {
  const discoveries: Discovery[] = []

  for (const signal of report.signals) {
    // Only dispatch high-confidence signals
    if (signal.confidence < 0.5) continue

    const type: Discovery['type'] = signal.kind === 'DISCOVERY'
      ? 'model'
      : signal.kind === 'PATTERN'
        ? 'repo'
        : 'news'

    discoveries.push({
      type,
      title: signal.message,
      detail: signal.detail ?? '',
      url: '',
      source: signal.source,
      seenAt: signal.detectedAt,
      isNew: true,
    })
  }

  // Add productivity snapshot as a discovery if ActivityWatch is available
  if (report.awAvailable && report.productivity) {
    const { totalFocusMin, devToolsMin } = report.productivity
    if (totalFocusMin > 60) {
      const focusPct = Math.round((devToolsMin / totalFocusMin) * 100)
      discoveries.push({
        type: 'news',
        title: `Session dev : ${Math.round(devToolsMin)}min de focus (${focusPct}% de la session)`,
        detail: `Total actif : ${Math.round(totalFocusMin)}min. App principale : ${report.productivity.topApp}`,
        url: '',
        source: 'activitywatch',
        seenAt: new Date().toISOString(),
        isNew: true,
      })
    }
  }

  return discoveries
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export interface MonitorRunResult {
  signalsFound: number
  signalsDispatched: number
  awAvailable: boolean
  hammerEventsCount: number
  durationMs: number
  report: PatternReport
}

export async function runMonitorCycle(hours = 8): Promise<MonitorRunResult> {
  const startMs = Date.now()
  const state = loadState()

  log.info(`Monitor cycle starting (looking back ${hours}h)`)

  // Ensure monitor dir exists
  mkdirSync(MONITOR_DIR, { recursive: true })

  // Run pattern detection
  const report = await detectPatterns(hours)

  // Update state
  if (report.awAvailable && !state.awAvailableSince) {
    state.awAvailableSince = new Date().toISOString()
  }
  if (report.hammerEventsCount > 0 && !state.hammerAvailableSince) {
    state.hammerAvailableSince = new Date().toISOString()
  }

  state.lastRunAt = new Date().toISOString()

  let dispatched = 0
  if (report.signals.length > 0) {
    state.consecutiveEmptyRuns = 0
    state.lastReportAt = new Date().toISOString()

    const discoveries = reportToDiscoveries(report)
    if (discoveries.length > 0) {
      await dispatchDiscoveries(discoveries)
      dispatched = discoveries.length
      state.totalSignalsDispatched += dispatched
      log.info(`Dispatched ${dispatched} monitor signals`)
    }
  } else {
    state.consecutiveEmptyRuns++
    log.debug(`No signals (${state.consecutiveEmptyRuns} consecutive empty runs)`)
  }

  saveState(state)

  const durationMs = Date.now() - startMs
  log.info(`Monitor cycle done in ${durationMs}ms — ${report.signals.length} signals found, ${dispatched} dispatched`)

  return {
    signalsFound: report.signals.length,
    signalsDispatched: dispatched,
    awAvailable: report.awAvailable,
    hammerEventsCount: report.hammerEventsCount,
    durationMs,
    report,
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

export interface MonitorStatus {
  lastRunAt: string
  lastReportAt: string
  totalSignalsDispatched: number
  awAvailable: boolean
  hammerAvailable: boolean
  state: MonitorState
}

export function getMonitorStatus(): MonitorStatus {
  const state = loadState()
  const eventsFile = join(MONITOR_DIR, 'events.jsonl')

  return {
    lastRunAt: state.lastRunAt,
    lastReportAt: state.lastReportAt,
    totalSignalsDispatched: state.totalSignalsDispatched,
    awAvailable: !!state.awAvailableSince,
    hammerAvailable: existsSync(eventsFile),
    state,
  }
}

// ── Standalone daemon loop ────────────────────────────────────────────────────

/**
 * Run in daemon mode — loops every intervalMin minutes.
 * Called by `rex monitor-daemon` or embedded in the main REX daemon.
 */
export async function startMonitorDaemon(intervalMin = 60): Promise<void> {
  log.info(`Monitor daemon started (interval: ${intervalMin}min)`)

  const runAndWait = async () => {
    try {
      const result = await runMonitorCycle()
      log.info(`Cycle complete: ${result.signalsFound} signals, AW=${result.awAvailable}, Hammer=${result.hammerEventsCount} events`)
    } catch (err) {
      log.error(`Monitor cycle error: ${(err as Error).message}`)
    }
  }

  // Run immediately then every intervalMin minutes
  await runAndWait()

  const intervalMs = intervalMin * 60 * 1000
  while (true) {
    await new Promise(r => setTimeout(r, intervalMs))
    await runAndWait()
  }
}

// ── JSON output for CLI ───────────────────────────────────────────────────────

export function printMonitorStatus(json: boolean): void {
  const status = getMonitorStatus()
  if (json) {
    console.log(JSON.stringify(status))
    return
  }

  const ago = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    if (diffMs < 60_000) return 'just now'
    if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}min ago`
    if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`
    return `${Math.round(diffMs / 86_400_000)}d ago`
  }

  console.log('\nREX Monitor Daemon Status\n')
  console.log(`  Last run       : ${ago(status.lastRunAt)}`)
  console.log(`  Last signal    : ${ago(status.lastReportAt)}`)
  console.log(`  Total signals  : ${status.totalSignalsDispatched}`)
  console.log(`  ActivityWatch  : ${status.awAvailable ? '✓ available' : '✗ not running'}`)
  console.log(`  Hammerspoon    : ${status.hammerAvailable ? '✓ events found' : '✗ no events'}`)
  console.log()
}
