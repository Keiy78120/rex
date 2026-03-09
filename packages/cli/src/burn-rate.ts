/**
 * REX Burn Rate — claudia-statusline inspired token analytics
 *
 * Tracks Claude Code token consumption, calculates burn rate,
 * predicts depletion, and renders visual progress bars.
 *
 * Inspired by: https://github.com/hagan/claudia-statusline
 * Used by: `rex status`, daemon healthcheck, Flutter app metrics.
 * @module BUDGET
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR, ensureRexDirs } from './paths.js'

const log = createLogger('BUDGET:burn-rate')

// ── Types ──────────────────────────────────────────────

export interface TokenSnapshot {
  timestamp: number
  sessionId: string
  tokensIn: number
  tokensOut: number
  model: string
  project?: string
}

export interface BurnRateStats {
  // Current session
  sessionTokensIn: number
  sessionTokensOut: number
  sessionTotal: number
  sessionDurationMs: number

  // Burn rate (tokens per minute)
  burnRatePerMin: number
  burnRatePerHour: number

  // Context window
  contextUsed: number
  contextTotal: number
  contextPercent: number
  contextBar: string

  // Daily stats
  dailyTokensIn: number
  dailyTokensOut: number
  dailyTotal: number

  // Projections
  estimatedMinutesLeft: number | null
  estimatedDepletionAt: Date | null

  // Plan limits (customize via rex config)
  dailyLimit: number
  dailyPercent: number
  dailyBar: string
}

// ── Constants ──────────────────────────────────────────

const SNAPSHOTS_PATH = join(REX_DIR, 'token-snapshots.jsonl')
const STATS_CACHE_PATH = join(REX_DIR, 'burn-rate-cache.json')
const CACHE_TTL = 30_000 // 30s

// Claude plan daily token limits (approximate)
const PLAN_LIMITS: Record<string, number> = {
  'claude-opus-4': 2_000_000,
  'claude-sonnet-4': 5_000_000,
  'claude-haiku-4': 20_000_000,
  default: 5_000_000,
}

// ── JSONL session scanner ──────────────────────────────

interface SessionUsage {
  inputTokens: number
  outputTokens: number
  model: string
  startTime: number
  endTime: number
}

function scanClaudeSessionFiles(): SessionUsage[] {
  const projectsDir = join(homedir(), '.claude', 'projects')
  const results: SessionUsage[] = []

  if (!existsSync(projectsDir)) return results

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    for (const proj of readdirSync(projectsDir)) {
      const projDir = join(projectsDir, proj)
      if (!statSync(projDir).isDirectory()) continue

      for (const file of readdirSync(projDir)) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = join(projDir, file)
        const mtime = statSync(filePath).mtime

        // Only scan files modified today
        if (mtime < today) continue

        const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
        let inputTokens = 0
        let outputTokens = 0
        let model = 'unknown'
        let startTime = mtime.getTime()
        let endTime = mtime.getTime()

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as Record<string, unknown>

            // Extract token usage from various Claude Code JSONL formats
            const usage = (entry.usage ?? (entry.message as Record<string, unknown> | undefined)?.usage) as Record<string, number> | undefined
            if (usage) {
              inputTokens += usage.input_tokens ?? 0
              outputTokens += usage.output_tokens ?? 0
            }

            const m = (entry.model ?? (entry.message as Record<string, unknown> | undefined)?.model) as string | undefined
            if (m) model = m

            const ts = (entry.timestamp ?? entry.created_at) as number | string | undefined
            if (ts) {
              const t = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime()
              if (t < startTime) startTime = t
              if (t > endTime) endTime = t
            }
          } catch {
            // skip malformed lines
          }
        }

        if (inputTokens > 0 || outputTokens > 0) {
          results.push({ inputTokens, outputTokens, model, startTime, endTime })
        }
      }
    }
  } catch (err) {
    log.debug(`scan error: ${err}`)
  }

  return results
}

// ── Progress bar renderer ──────────────────────────────

/**
 * Render a Unicode progress bar.
 * @param percent 0-100
 * @param width bar width in chars
 */
export function renderBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled

  const fillChar = percent >= 90 ? '█' : percent >= 70 ? '▓' : percent >= 40 ? '▒' : '░'
  const bar = fillChar.repeat(Math.max(0, filled)) + '·'.repeat(Math.max(0, empty))

  const color =
    percent >= 90 ? '\x1b[31m' : // red
    percent >= 70 ? '\x1b[33m' : // yellow
    '\x1b[32m'                    // green
  const reset = '\x1b[0m'

  return `${color}[${bar}] ${percent.toFixed(0)}%${reset}`
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

// ── Main stats calculator ──────────────────────────────

let _statsCache: { stats: BurnRateStats; at: number } | null = null

/**
 * Calculate current burn rate stats.
 * Results are cached for CACHE_TTL ms.
 */
export function getBurnRateStats(forceRefresh = false): BurnRateStats {
  const now = Date.now()
  if (!forceRefresh && _statsCache && now - _statsCache.at < CACHE_TTL) {
    return _statsCache.stats
  }

  ensureRexDirs()
  const sessions = scanClaudeSessionFiles()

  let dailyIn = 0
  let dailyOut = 0
  let latestModel = 'unknown'
  let earliestStart = now
  let latestEnd = 0

  // Find most recent session
  let sessionIn = 0
  let sessionOut = 0
  let sessionStart = now
  let sessionEnd = 0

  // Sort by recency, pick most recent session
  const sorted = [...sessions].sort((a, b) => b.endTime - a.endTime)
  if (sorted.length > 0) {
    const latest = sorted[0]
    sessionIn = latest.inputTokens
    sessionOut = latest.outputTokens
    sessionStart = latest.startTime
    sessionEnd = latest.endTime
    latestModel = latest.model
  }

  for (const s of sessions) {
    dailyIn += s.inputTokens
    dailyOut += s.outputTokens
    if (s.startTime < earliestStart) earliestStart = s.startTime
    if (s.endTime > latestEnd) latestEnd = s.endTime
    if (s.model !== 'unknown') latestModel = s.model
  }

  const dailyTotal = dailyIn + dailyOut
  const sessionTotal = sessionIn + sessionOut
  const sessionDurationMs = Math.max(1000, sessionEnd - sessionStart)

  // Burn rate
  const sessionMins = sessionDurationMs / 60_000
  const burnRatePerMin = sessionMins > 0 ? sessionTotal / sessionMins : 0
  const burnRatePerHour = burnRatePerMin * 60

  // Context window (estimate from latest session — Claude Code sessions are ~200k max)
  const contextTotal = 200_000
  const contextUsed = Math.min(sessionIn, contextTotal)
  const contextPercent = Math.min(100, (contextUsed / contextTotal) * 100)

  // Daily limit
  const modelKey = Object.keys(PLAN_LIMITS).find(k => latestModel.includes(k)) ?? 'default'
  const dailyLimit = PLAN_LIMITS[modelKey]
  const dailyPercent = Math.min(100, (dailyTotal / dailyLimit) * 100)

  // Depletion projection
  let estimatedMinutesLeft: number | null = null
  let estimatedDepletionAt: Date | null = null
  if (burnRatePerMin > 0 && dailyLimit > dailyTotal) {
    estimatedMinutesLeft = (dailyLimit - dailyTotal) / burnRatePerMin
    estimatedDepletionAt = new Date(now + estimatedMinutesLeft * 60_000)
  }

  const stats: BurnRateStats = {
    sessionTokensIn: sessionIn,
    sessionTokensOut: sessionOut,
    sessionTotal,
    sessionDurationMs,
    burnRatePerMin: Math.round(burnRatePerMin),
    burnRatePerHour: Math.round(burnRatePerHour),
    contextUsed,
    contextTotal,
    contextPercent,
    contextBar: renderBar(contextPercent),
    dailyTokensIn: dailyIn,
    dailyTokensOut: dailyOut,
    dailyTotal,
    dailyLimit,
    dailyPercent,
    dailyBar: renderBar(dailyPercent),
    estimatedMinutesLeft,
    estimatedDepletionAt,
  }

  _statsCache = { stats, at: now }
  return stats
}

/**
 * Print a formatted burn rate dashboard to stdout.
 */
export function printBurnRateDashboard(): void {
  const s = getBurnRateStats(true)
  const reset = '\x1b[0m'
  const bold = '\x1b[1m'
  const dim = '\x1b[2m'

  console.log()
  console.log(`${bold}⚡ REX Token Analytics${reset}`)
  console.log('─'.repeat(50))
  console.log(`  Context  ${s.contextBar}  ${s.contextUsed.toLocaleString()} / ${s.contextTotal.toLocaleString()}`)
  console.log(`  Daily    ${s.dailyBar}  ${s.dailyTotal.toLocaleString()} / ${s.dailyLimit.toLocaleString()}`)
  console.log()
  console.log(`  Burn rate    ${s.burnRatePerMin.toLocaleString()} tok/min  (${s.burnRatePerHour.toLocaleString()}/hr)`)
  console.log(`  Session      ${formatDuration(s.sessionDurationMs)}  ·  ${s.sessionTotal.toLocaleString()} tokens`)

  if (s.estimatedMinutesLeft !== null && s.estimatedDepletionAt) {
    const depletion = s.estimatedDepletionAt.toLocaleTimeString()
    console.log(`  ${dim}Est. depletion  ${formatDuration(s.estimatedMinutesLeft * 60_000)} (at ${depletion})${reset}`)
  }

  console.log()
}
