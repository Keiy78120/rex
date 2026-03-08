/**
 * REX Provider Registry
 * Registers and selects providers with owned-first, free-first ordering.
 * Selection: free > subscription > pay-per-use, available > degraded.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { FREE_TIER_PROVIDERS, getApiKey } from './free-tiers.js'

const log = createLogger('providers')

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

  register(
    name: string,
    config: Omit<Provider, 'status'> & { check: () => Promise<boolean> },
  ): void {
    this.providers.set(name, { ...config, status: 'unavailable' })
  }

  async checkAll(opts?: { silent?: boolean }): Promise<void> {
    const entries = [...this.providers.entries()]
    const results = await Promise.all(
      entries.map(async ([name, p]) => {
        try {
          const ok = await p.check()
          return [name, ok ? 'available' : 'unavailable'] as const
        } catch {
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

  return registry
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
