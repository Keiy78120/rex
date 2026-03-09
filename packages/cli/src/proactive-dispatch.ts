/**
 * REX Proactive Dispatch — Bridge signals → user notifications
 *
 * Aggregates ProactiveSignals from curious.ts (DISCOVERY/PATTERN/OPEN_LOOP)
 * and dispatches them via:
 *   1. macOS native notifications (osascript) — immediate, no network
 *   2. Telegram — fallback if osascript unavailable or for remote access
 *
 * Maintains a pending-confirmation store so PATTERN/OPEN_LOOP signals
 * can request user action before REX acts on them.
 *
 * @module CURIOUS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'
import type { Discovery } from './curious.js'

const log = createLogger('CURIOUS:dispatch')
const HOME = homedir()
const PENDING_PATH = join(REX_DIR, 'pending-signals.json')

// ── Types ─────────────────────────────────────────────────────────────────────

export type DispatchStatus = 'pending' | 'confirmed' | 'dismissed'

export interface PendingSignal {
  id: string
  title: string
  detail: string
  url?: string
  source: string
  signalType: string
  action?: string      // suggested action label (e.g. "ollama pull qwen3-coder:30b")
  status: DispatchStatus
  createdAt: string
  resolvedAt?: string
}

// ── Pending store ─────────────────────────────────────────────────────────────

function loadPending(): PendingSignal[] {
  try {
    if (existsSync(PENDING_PATH)) return JSON.parse(readFileSync(PENDING_PATH, 'utf-8'))
  } catch {}
  return []
}

function savePending(signals: PendingSignal[]): void {
  if (!existsSync(REX_DIR)) mkdirSync(REX_DIR, { recursive: true })
  writeFileSync(PENDING_PATH, JSON.stringify(signals, null, 2))
}

/**
 * Returns signals that are still awaiting user confirmation.
 */
export function getPendingSignals(): PendingSignal[] {
  return loadPending().filter(s => s.status === 'pending')
}

/**
 * Mark a signal as confirmed (user approved the suggested action).
 */
export function confirmSignal(id: string): boolean {
  const signals = loadPending()
  const s = signals.find(x => x.id === id)
  if (!s) return false
  s.status = 'confirmed'
  s.resolvedAt = new Date().toISOString()
  savePending(signals)
  return true
}

/**
 * Mark a signal as dismissed (user ignored it).
 */
export function dismissSignal(id: string): boolean {
  const signals = loadPending()
  const s = signals.find(x => x.id === id)
  if (!s) return false
  s.status = 'dismissed'
  s.resolvedAt = new Date().toISOString()
  savePending(signals)
  return true
}

/**
 * Purge old resolved signals (keep last 100 pending + all resolved from last 7 days).
 */
export function purgeOldSignals(): void {
  const signals = loadPending()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const filtered = signals.filter(s =>
    s.status === 'pending' ||
    (s.resolvedAt && s.resolvedAt > cutoff)
  ).slice(-200)
  savePending(filtered)
}

// ── Delivery: macOS native notification ──────────────────────────────────────

function isMacOS(): boolean {
  return process.platform === 'darwin'
}

function hasOsascript(): boolean {
  try {
    spawnSync('which', ['osascript'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Send a macOS native notification via osascript.
 * Falls back silently if not on macOS or osascript unavailable.
 */
export function sendMacNotification(title: string, body: string, subtitle?: string): boolean {
  if (!isMacOS() || !hasOsascript()) return false
  try {
    const safeTitle = title.replace(/"/g, '\\"').slice(0, 80)
    const safeBody = body.replace(/"/g, '\\"').slice(0, 200)
    const safeSubtitle = subtitle ? ` subtitle "${subtitle.replace(/"/g, '\\"').slice(0, 60)}"` : ''
    execSync(
      `osascript -e 'display notification "${safeBody}"${safeSubtitle} with title "REX — ${safeTitle}"'`,
      { stdio: 'ignore', timeout: 5000 }
    )
    return true
  } catch {
    return false
  }
}

// ── Delivery: Telegram ────────────────────────────────────────────────────────

async function readTelegramCreds(): Promise<{ token: string; chatId: string } | null> {
  try {
    const settingsPath = join(HOME, '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return null
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { env?: Record<string, string> }
    const env = data.env ?? {}
    const token = process.env.REX_TELEGRAM_BOT_TOKEN || env.REX_TELEGRAM_BOT_TOKEN
    const chatId = process.env.REX_TELEGRAM_CHAT_ID || env.REX_TELEGRAM_CHAT_ID
    if (!token || !chatId) return null
    return { token, chatId }
  } catch {
    return null
  }
}

export async function sendTelegramNotification(message: string): Promise<boolean> {
  const creds = await readTelegramCreds()
  if (!creds) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: creds.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Signal → action mapping ───────────────────────────────────────────────────

function suggestAction(d: Discovery): string | undefined {
  if (d.type === 'model' && d.url) {
    const modelName = d.title.replace('New model available: ', '').trim()
    return `ollama pull ${modelName}`
  }
  if (d.type === 'mcp' && d.url) return `rex mcp install ${d.url}`
  if (d.type === 'pattern') return 'rex self-improve --rule'
  if (d.type === 'open_loop') return 'rex observe decision <resolution>'
  return undefined
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  DISCOVERY: '🔭',
  PATTERN: '🔁',
  OPEN_LOOP: '🔓',
}

/**
 * Dispatch discoveries to user via macOS notification + Telegram.
 * PATTERN and OPEN_LOOP items are stored as pending signals.
 * Returns count of notifications actually sent.
 */
export async function dispatchDiscoveries(discoveries: Discovery[]): Promise<number> {
  const newItems = discoveries.filter(d => d.isNew)
  if (newItems.length === 0) return 0

  const pending = loadPending()
  const existingIds = new Set(pending.map(p => p.id))
  let dispatched = 0

  // Group by signal type for batching
  const byType: Record<string, Discovery[]> = {}
  for (const d of newItems) {
    const t = d.signalType ?? 'DISCOVERY'
    if (!byType[t]) byType[t] = []
    byType[t].push(d)
  }

  for (const [sigType, items] of Object.entries(byType)) {
    const icon = ICONS[sigType] ?? '·'
    const topItem = items[0]
    const restCount = items.length - 1

    // Build macOS notification (one per type batch, concise)
    const macTitle = `${icon} ${sigType}`
    const macBody = restCount > 0
      ? `${topItem.title} (+${restCount} more)`
      : topItem.title
    sendMacNotification(macTitle, macBody, topItem.source)

    // Build Telegram message
    const lines = items.slice(0, 4).map(d => {
      const urlLine = d.url ? `\n  🔗 ${d.url}` : ''
      const actionLine = suggestAction(d) ? `\n  ⚡ \`${suggestAction(d)}\`` : ''
      return `• *${d.title}*\n  ${d.detail}${urlLine}${actionLine}`
    })
    if (items.length > 4) lines.push(`_… and ${items.length - 4} more_`)
    const msg = `${icon} *REX ${sigType}* (${items.length} new)\n\n${lines.join('\n\n')}`
    await sendTelegramNotification(msg)

    // Store PATTERN and OPEN_LOOP in pending store for confirmation
    if (sigType === 'PATTERN' || sigType === 'OPEN_LOOP') {
      for (const d of items) {
        const id = `${sigType}:${d.title}:${Date.now()}`
        if (!existingIds.has(id)) {
          pending.push({
            id,
            title: d.title,
            detail: d.detail,
            url: d.url,
            source: d.source,
            signalType: sigType,
            action: suggestAction(d),
            status: 'pending',
            createdAt: new Date().toISOString(),
          })
          existingIds.add(id)
        }
      }
    }

    dispatched += items.length
  }

  savePending(pending)
  log.info(`Dispatched ${dispatched} signals (${Object.keys(byType).join(', ')})`)
  return dispatched
}

/**
 * Send a one-off custom notification (macOS + Telegram).
 */
export async function sendCustomNotification(message: string, title = 'REX'): Promise<void> {
  sendMacNotification(title, message)
  await sendTelegramNotification(`🔔 *${title}*\n${message}`)
}

// ── CLI display helpers ───────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
}

export function printPendingSignals(signals: PendingSignal[]): void {
  if (signals.length === 0) {
    console.log(`\n  ${C.dim}No pending signals.${C.reset}\n`)
    return
  }

  console.log(`\n${C.bold}REX Pending Signals${C.reset}  ${C.dim}(${signals.length} awaiting confirmation)${C.reset}`)
  console.log('─'.repeat(52))

  for (const s of signals) {
    const icon = ICONS[s.signalType] ?? '·'
    console.log(`\n  ${icon}  ${C.bold}${s.title}${C.reset}  ${C.dim}[${s.id.split(':').slice(0, 2).join(':')}]${C.reset}`)
    console.log(`     ${C.dim}${s.detail}${C.reset}`)
    if (s.url) console.log(`     ${C.cyan}${s.url}${C.reset}`)
    if (s.action) console.log(`     ⚡ ${C.yellow}${s.action}${C.reset}`)
    console.log(`     ${C.dim}Since ${new Date(s.createdAt).toLocaleString()}${C.reset}`)
  }

  console.log('\n' + '─'.repeat(52))
  console.log(`  ${C.dim}Confirm: rex notify --confirm <id>   Dismiss: rex notify --dismiss <id>${C.reset}\n`)
}
