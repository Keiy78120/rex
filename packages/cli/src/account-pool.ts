/**
 * REX Account Pool
 *
 * Manages multiple Claude Code accounts for parallel agent execution.
 * Each account = isolated ~/.claude-account-N/ config dir.
 *
 * Selection strategy:
 *   1. Pick the account with fewest active tasks
 *   2. Skip accounts that hit rate limits (auto-unlock after cooldown)
 *   3. Fall back to main ~/.claude if pool is empty
 *
 * Setup: create additional accounts by copying auth from
 *   ~/.claude/ into ~/.claude-account-2/, ~/.claude-account-3/, etc.
 */

import { homedir } from 'node:os'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('account-pool')
const HOME = homedir()
const STATE_PATH = join(HOME, '.claude', 'rex', 'account-pool.json')
const RATE_LIMIT_COOLDOWN_MS = 60 * 60 * 1000  // 1 hour

// ── Types ──────────────────────────────────────────────────────────

export interface AccountEntry {
  id: number                  // 1 = main, 2-N = secondary
  configDir: string           // e.g. ~/.claude or ~/.claude-account-2
  activeTasks: number
  totalTasksRun: number
  totalErrors: number
  rateLimitedUntil: number | null  // epoch ms, null = not limited
  lastUsedAt: number | null
}

interface PoolState {
  accounts: AccountEntry[]
  updatedAt: string
}

// ── Persistence ────────────────────────────────────────────────────

function loadState(): PoolState {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
  } catch {
    return { accounts: [], updatedAt: new Date().toISOString() }
  }
}

function saveState(state: PoolState): void {
  const dir = join(HOME, '.claude', 'rex')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  state.updatedAt = new Date().toISOString()
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n')
}

// ── Pool discovery ─────────────────────────────────────────────────

/**
 * Scans filesystem for available Claude config dirs.
 * ~/.claude (account 1) + ~/.claude-account-N (N = 2, 3, …)
 */
export function discoverAccounts(): AccountEntry[] {
  const state = loadState()
  const existing = new Map<number, AccountEntry>(
    state.accounts.map(a => [a.id, a])
  )

  const discovered: AccountEntry[] = []

  // Account 1: main config dir
  const mainDir = join(HOME, '.claude')
  if (existsSync(mainDir)) {
    discovered.push(existing.get(1) ?? {
      id: 1,
      configDir: mainDir,
      activeTasks: 0,
      totalTasksRun: 0,
      totalErrors: 0,
      rateLimitedUntil: null,
      lastUsedAt: null,
    })
  }

  // Accounts 2-N: ~/.claude-account-N
  try {
    const entries = readdirSync(HOME, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      const m = e.name.match(/^\.claude-account-(\d+)$/)
      if (!m) continue
      const id = parseInt(m[1], 10)
      const dir = join(HOME, e.name)
      // Only count if it has a credentials file (auth token present)
      if (existsSync(join(dir, '.credentials.json')) || existsSync(join(dir, 'credentials.json'))) {
        discovered.push(existing.get(id) ?? {
          id,
          configDir: dir,
          activeTasks: 0,
          totalTasksRun: 0,
          totalErrors: 0,
          rateLimitedUntil: null,
          lastUsedAt: null,
        })
      }
    }
  } catch {}

  // Sort by id
  discovered.sort((a, b) => a.id - b.id)

  // Persist updated discovery
  const updated: PoolState = { accounts: discovered, updatedAt: new Date().toISOString() }
  saveState(updated)

  return discovered
}

// ── Account selection ──────────────────────────────────────────────

/**
 * Select the best available account for a new task.
 * Returns null if all accounts are rate-limited.
 */
export function selectAccount(): AccountEntry | null {
  const state = loadState()
  const now = Date.now()

  // Auto-unlock expired rate limits
  let changed = false
  for (const a of state.accounts) {
    if (a.rateLimitedUntil && a.rateLimitedUntil <= now) {
      a.rateLimitedUntil = null
      changed = true
      log.info(`Account ${a.id} rate limit expired — unlocked`)
    }
  }
  if (changed) saveState(state)

  const available = state.accounts.filter(a =>
    !a.rateLimitedUntil || a.rateLimitedUntil <= now
  )

  if (available.length === 0) {
    // All limited — return main account anyway (let Claude handle the error)
    log.warn('All accounts rate-limited, falling back to account 1')
    return state.accounts.find(a => a.id === 1) ?? null
  }

  // Pick the one with fewest active tasks, break ties by totalTasksRun (least used)
  available.sort((a, b) => {
    const taskDiff = a.activeTasks - b.activeTasks
    if (taskDiff !== 0) return taskDiff
    return a.totalTasksRun - b.totalTasksRun
  })

  return available[0]
}

// ── Task lifecycle ─────────────────────────────────────────────────

/** Call before spawning a Claude process for a task */
export function acquireAccount(accountId: number): void {
  const state = loadState()
  const a = state.accounts.find(a => a.id === accountId)
  if (!a) return
  a.activeTasks = Math.max(0, a.activeTasks) + 1
  a.lastUsedAt = Date.now()
  a.totalTasksRun++
  saveState(state)
}

/** Call when a Claude process finishes (success or error) */
export function releaseAccount(accountId: number, opts: { error?: boolean; rateLimited?: boolean } = {}): void {
  const state = loadState()
  const a = state.accounts.find(a => a.id === accountId)
  if (!a) return
  a.activeTasks = Math.max(0, a.activeTasks - 1)
  if (opts.error) a.totalErrors++
  if (opts.rateLimited) {
    a.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    log.warn(`Account ${a.id} marked rate-limited for 1h`)
  }
  saveState(state)
}

/** Mark an account as rate-limited (call when Claude returns 429) */
export function markRateLimited(accountId: number, cooldownMs = RATE_LIMIT_COOLDOWN_MS): void {
  const state = loadState()
  const a = state.accounts.find(a => a.id === accountId)
  if (!a) return
  a.rateLimitedUntil = Date.now() + cooldownMs
  a.activeTasks = Math.max(0, a.activeTasks - 1)
  saveState(state)
  log.warn(`Account ${a.id} rate-limited for ${Math.round(cooldownMs / 60000)}min`)
}

// ── Env injection ──────────────────────────────────────────────────

/**
 * Returns env vars to set for a Claude subprocess using this account.
 * Merges into process.env before spawning.
 */
export function getAccountEnv(account: AccountEntry): Record<string, string> {
  return {
    CLAUDE_CONFIG_DIR: account.configDir,
    REX_ACCOUNT_ID: String(account.id),
  }
}

// ── Pretty print ───────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
}

export function printPool(): void {
  const accounts = discoverAccounts()
  const now = Date.now()

  console.log(`\n${C.bold}REX Account Pool${C.reset}`)
  console.log('─'.repeat(52))

  if (accounts.length === 0) {
    console.log(`  ${C.dim}No accounts found.${C.reset}`)
    console.log(`  ${C.dim}Add ~/.claude-account-2/ with credentials to expand pool.${C.reset}\n`)
    return
  }

  for (const a of accounts) {
    const limited = a.rateLimitedUntil && a.rateLimitedUntil > now
    const dot = limited ? `${C.yellow}◌${C.reset}` : `${C.green}●${C.reset}`
    const label = a.id === 1 ? `${C.dim}(main)${C.reset}` : ''
    const limitStr = limited
      ? ` ${C.yellow}rate-limited ${Math.ceil((a.rateLimitedUntil! - now) / 60000)}min${C.reset}`
      : ''

    console.log(`  ${dot}  Account ${a.id} ${label}${limitStr}`)
    console.log(`      Dir:     ${C.dim}${a.configDir}${C.reset}`)
    console.log(`      Active:  ${a.activeTasks} tasks`)
    console.log(`      Total:   ${a.totalTasksRun} runs · ${a.totalErrors} errors`)
    if (a.lastUsedAt) {
      const ago = Math.round((now - a.lastUsedAt) / 60000)
      console.log(`      Last:    ${C.dim}${ago}min ago${C.reset}`)
    }
  }

  const available = accounts.filter(a => !a.rateLimitedUntil || a.rateLimitedUntil <= now).length
  console.log(`\n  ${accounts.length} accounts · ${available} available\n`)
}

// ── Setup hint ─────────────────────────────────────────────────────

export function printSetupHint(): void {
  console.log(`
${C.bold}Add accounts to the pool:${C.reset}

  1. Login to a second Claude account in a browser
  2. Copy auth: cp -r ~/.claude ~/.claude-account-2
  3. Login the new dir: CLAUDE_CONFIG_DIR=~/.claude-account-2 claude /login
  4. Verify: rex pool list

  Multiple accounts allow REX to run parallel agents without hitting
  rate limits on a single subscription.
`)
}
