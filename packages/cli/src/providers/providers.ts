/**
 * REX Provider Registry
 * Registers and selects providers with owned-first, free-first ordering.
 * Selection: free > subscription > pay-per-use, available > degraded.
 * @module BUDGET
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../logger.js'
import { FREE_TIER_PROVIDERS, getApiKey } from './free-tiers.js'

const log = createLogger('BUDGET:providers')

const HOME = process.env.HOME || '~'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export type ProviderType = 'llm' | 'gateway' | 'tool' | 'service'
export type CostTier = 'free' | 'subscription' | 'pay-per-use'
export type ProviderStatus = 'available' | 'unavailable' | 'degraded'

export interface Provider {
  name: string
  type: ProviderType
  costTier: CostTier
  status: ProviderStatus
  capabilities: string[]
  details?: string
}

interface RegisteredProvider extends Provider {
  check: () => Promise<boolean>
}

interface ProviderCooldownState {
  until: number
  failures: number
}

// ── Cost tier priority (lower = preferred) ─────────────

const COST_PRIORITY: Record<CostTier, number> = {
  free: 0,
  subscription: 1,
  'pay-per-use': 2,
}

const STATUS_PRIORITY: Record<ProviderStatus, number> = {
  available: 0,
  degraded: 1,
  unavailable: 2,
}

// ── Registry ───────────────────────────────────────────

export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>()
  private cooldownMap = new Map<string, ProviderCooldownState>()

  register(
    name: string,
    config: Omit<Provider, 'status'> & { check: () => Promise<boolean> },
  ): void {
    this.providers.set(name, { ...config, status: 'unavailable' })
  }

  private getActiveCooldown(name: string): ProviderCooldownState | null {
    const cooldown = this.cooldownMap.get(name)
    if (!cooldown) return null
    if (Date.now() >= cooldown.until) {
      this.cooldownMap.delete(name)
      return null
    }
    return cooldown
  }

  private markFailure(name: string): void {
    const previousFailures = this.cooldownMap.get(name)?.failures ?? 0
    const failures = previousFailures + 1
    const cooldownMs = Math.min(30_000, 2_000 * (2 ** previousFailures))
    this.cooldownMap.set(name, { failures, until: Date.now() + cooldownMs })
  }

  private clearCooldown(name: string): void {
    this.cooldownMap.delete(name)
  }

  async checkAll(opts?: { silent?: boolean }): Promise<void> {
    const entries = [...this.providers.entries()]
    const results = await Promise.all(
      entries.map(async ([name, p]) => {
        const cooldown = this.getActiveCooldown(name)
        if (cooldown) {
          return [name, 'unavailable'] as const
        }
        try {
          const ok = await p.check()
          if (ok) {
            this.clearCooldown(name)
          } else {
            this.markFailure(name)
          }
          return [name, ok ? 'available' : 'unavailable'] as const
        } catch {
          this.markFailure(name)
          return [name, 'unavailable'] as const
        }
      }),
    )
    for (const [name, status] of results) {
      const p = this.providers.get(name)!
      p.status = status as ProviderStatus
    }
    if (!opts?.silent) {
      const avail = results.filter(([, s]) => s === 'available').length
      log.info(`Provider check: ${avail}/${results.length} available`)
    }
  }

  async select(capability: string): Promise<Provider | null> {
    const candidates = [...this.providers.values()]
      .filter(p => p.capabilities.includes(capability) && p.status !== 'unavailable')
      .filter(p => !this.getActiveCooldown(p.name))

    if (candidates.length === 0) return null

    candidates.sort((a, b) => {
      const costDiff = COST_PRIORITY[a.costTier] - COST_PRIORITY[b.costTier]
      if (costDiff !== 0) return costDiff
      return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
    })

    return candidates[0]
  }

  listAll(): Provider[] {
    return [...this.providers.values()].map(({ check: _, ...rest }) => rest)
  }

  getByName(name: string): Provider | undefined {
    const p = this.providers.get(name)
    if (!p) return undefined
    const { check: _, ...rest } = p
    return rest
  }
}

// ── Helpers ────────────────────────────────────────────

function exec(cmd: string, timeoutMs = 3000): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function hasTelegramCreds(): boolean {
  if (process.env.REX_TELEGRAM_BOT_TOKEN && process.env.REX_TELEGRAM_CHAT_ID) return true
  try {
    const settingsPath = join(HOME, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const env = settings.env || {}
      return !!(env.REX_TELEGRAM_BOT_TOKEN && env.REX_TELEGRAM_CHAT_ID)
    }
  } catch {}
  return false
}

// ── Default Registry ───────────────────────────────────

export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry()

  registry.register('ollama', {
    name: 'Ollama',
    type: 'llm',
    costTier: 'free',
    capabilities: ['chat', 'embed', 'code'],
    check: async () => {
      try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
        return res.ok
      } catch {
        return false
      }
    },
  })

  registry.register('claude-code', {
    name: 'Claude Code',
    type: 'llm',
    costTier: 'subscription',
    capabilities: ['chat', 'code', 'agent'],
    check: async () => !!exec('which claude', 2000),
  })

  registry.register('claude-api', {
    name: 'Claude API',
    type: 'llm',
    costTier: 'pay-per-use',
    capabilities: ['chat', 'code', 'vision'],
    check: async () => !!process.env.ANTHROPIC_API_KEY,
  })

  // ── Free tier API providers (Vercel AI SDK) ──────────
  for (const ft of FREE_TIER_PROVIDERS) {
    if (ft.name === 'Ollama') continue  // Ollama already registered above
    registry.register(ft.name.toLowerCase().replace(/\s+/g, '-'), {
      name: ft.name,
      type: 'llm',
      costTier: 'free',
      capabilities: ['chat', 'code'],
      details: `${ft.rpmLimit} RPM · ${ft.defaultModel}`,
      check: async () => !!getApiKey(ft.envKey),
    })
  }

  registry.register('telegram', {
    name: 'Telegram',
    type: 'gateway',
    costTier: 'free',
    capabilities: ['messaging', 'commands'],
    check: async () => hasTelegramCreds(),
  })

  registry.register('local-scripts', {
    name: 'Local Scripts',
    type: 'tool',
    costTier: 'free',
    capabilities: ['automation', 'shell'],
    check: async () => true,
  })

  registry.register('docker', {
    name: 'Docker',
    type: 'service',
    costTier: 'free',
    capabilities: ['containers', 'sandbox'],
    check: async () => {
      const out = exec('docker info', 3000)
      return out.includes('Server Version') || out.includes('Containers')
    },
  })

  registry.register('tailscale', {
    name: 'Tailscale',
    type: 'service',
    costTier: 'free',
    capabilities: ['network', 'vpn', 'ssh'],
    check: async () => {
      const out = exec('tailscale status', 3000)
      return !!out && !out.includes('not running') && !out.includes('stopped')
    },
  })

  // ── Codex (ChatGPT/Plus OAuth) — background worker via device-code flow ──────
  registry.register('codex-oauth', {
    name: 'Codex OAuth',
    type: 'llm',
    costTier: 'subscription',
    capabilities: ['code', 'agent', 'background'],
    details: 'ChatGPT Plus/Pro — device-code OAuth',
    check: async () => {
      const credPath = join(HOME, '.rex', 'credentials', 'codex-token.json')
      if (!existsSync(credPath)) return false
      try {
        const cred = JSON.parse(readFileSync(credPath, 'utf-8'))
        if (!cred.access_token) return false
        // Token expires check (if exp field present)
        if (cred.expires_at) {
          const exp = new Date(cred.expires_at).getTime()
          if (Date.now() > exp) return false
        }
        return true
      } catch {
        return false
      }
    },
  })

  return registry
}

// ── Codex OAuth device-code flow (replicates OpenClaw PR #32065 pattern) ──────

const CODEX_CLIENT_ID = 'openai-codex'
const CODEX_DEVICE_CODE_URL = 'https://auth.openai.com/oauth/device/code'
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_SCOPE = 'openid profile email offline_access'
const CODEX_CRED_DIR = join(process.env.HOME || '~', '.rex', 'credentials')
const CODEX_CRED_PATH = join(CODEX_CRED_DIR, 'codex-token.json')

export interface CodexDeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface CodexTokenResponse {
  access_token: string
  token_type: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

/**
 * Start Codex device-code OAuth flow.
 * Returns device_code info for the user to visit the verification URL.
 * Follows OpenClaw PR #32065 pattern.
 */
export async function startCodexDeviceFlow(): Promise<CodexDeviceCodeResponse> {
  const res = await fetch(CODEX_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      scope: CODEX_SCOPE,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Codex device-code request failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<CodexDeviceCodeResponse>
}

/**
 * Poll for Codex OAuth token after user completes device-code flow.
 * Polls every `interval` seconds until token received or expired.
 */
export async function pollCodexToken(deviceCode: string, intervalSec: number, timeoutSec: number): Promise<CodexTokenResponse> {
  const deadline = Date.now() + timeoutSec * 1000
  const pollMs = Math.max(intervalSec, 5) * 1000

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs))
    try {
      const res = await fetch(CODEX_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CODEX_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const token = await res.json() as CodexTokenResponse
        return token
      }
      // authorization_pending → keep polling
      const err = await res.json().catch(() => ({})) as { error?: string }
      if (err.error === 'authorization_pending') continue
      if (err.error === 'slow_down') { await new Promise(r => setTimeout(r, 5000)); continue }
      throw new Error(`Codex token poll error: ${err.error ?? res.status}`)
    } catch (e) {
      if ((e as Error).message?.includes('Codex token poll error')) throw e
    }
  }
  throw new Error('Codex OAuth timed out — user did not complete device-code flow')
}

/**
 * Persist Codex OAuth credentials to ~/.rex/credentials/codex-token.json
 */
export function saveCodexCredentials(token: CodexTokenResponse): void {
  mkdirSync(CODEX_CRED_DIR, { recursive: true })
  const expires_at = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : undefined
  writeFileSync(CODEX_CRED_PATH, JSON.stringify({ ...token, expires_at }, null, 2), 'utf-8')
  log.info(`Codex credentials saved to ${CODEX_CRED_PATH}`)
}

/**
 * Load Codex access token from credentials file.
 * Returns null if not found or expired.
 */
export function loadCodexToken(): string | null {
  if (!existsSync(CODEX_CRED_PATH)) return null
  try {
    const cred = JSON.parse(readFileSync(CODEX_CRED_PATH, 'utf-8'))
    if (!cred.access_token) return null
    if (cred.expires_at && Date.now() > new Date(cred.expires_at).getTime()) {
      log.warn('Codex token expired — re-run `rex codex auth` to refresh')
      return null
    }
    return cred.access_token as string
  } catch {
    return null
  }
}

// ── Pretty Print ───────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

const DOT_ON = `${C.green}\u25cf${C.reset}`
const DOT_OFF = `${C.dim}\u25cb${C.reset}`
const LINE = '\u2500'.repeat(28)

export async function showProviders(): Promise<void> {
  const registry = createDefaultRegistry()
  await registry.checkAll()
  const all = registry.listAll()

  const tiers: CostTier[] = ['free', 'subscription', 'pay-per-use']
  const tierLabels: Record<CostTier, string> = {
    free: 'Owned / Free',
    subscription: 'Subscription',
    'pay-per-use': 'Pay-per-use',
  }

  let totalAvailable = 0

  console.log(`\n${C.bold}REX Providers${C.reset}`)
  console.log(LINE)

  for (const tier of tiers) {
    const group = all.filter(p => p.costTier === tier)
    if (group.length === 0) continue

    console.log(`\n  ${C.bold}${tierLabels[tier]}${C.reset}`)
    for (const p of group) {
      const isUp = p.status === 'available'
      if (isUp) totalAvailable++
      const dot = isUp ? DOT_ON : DOT_OFF
      const caps = p.capabilities.join(', ')
      const detail = p.details ? `  ${C.dim}${p.details}${C.reset}` : ''
      console.log(`   ${dot}  ${p.name.padEnd(16)} ${C.dim}${p.type.padEnd(10)}${C.reset} ${caps}${detail}`)
    }
  }

  console.log(`\n${LINE}`)
  console.log(`  ${all.length} providers, ${totalAvailable} available\n`)
}
