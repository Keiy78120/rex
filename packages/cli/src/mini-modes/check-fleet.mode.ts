/**
 * Mini-mode: Check Fleet
 * Intent: "état fleet", "machines", "VPS en ligne", "mon mac/pc"
 * LLM calls: 0 — script-only
 * Security: SAFE
 * @module IDENTITY
 */

import { execSync } from 'node:child_process'
import { registerMode, type ModeContext } from './engine.js'
import { createLogger } from '../logger.js'

const log = createLogger('IDENTITY:mode:check-fleet')

async function loadFleetStatus(ctx: ModeContext): Promise<Record<string, unknown>> {
  try {
    const raw = execSync('rex status --json', {
      encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'],
    })
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { fleet_raw: raw.trim().slice(0, 600) }
    const data = JSON.parse(match[0])
    return { fleet_status: data, fleet_raw: null }
  } catch (e: any) {
    log.warn(`Fleet status load failed: ${e.message?.slice(0, 80)}`)
    // Fallback: try rex doctor
    try {
      const raw = execSync('rex doctor --quiet 2>&1 | head -20', {
        encoding: 'utf-8' as BufferEncoding, timeout: 6000, shell: '/bin/sh',
      })
      return { fleet_raw: raw.trim(), fleet_status: null }
    } catch { return { fleet_status: null, fleet_raw: null } }
  }
}

function formatFleet(ctx: ModeContext): string {
  const raw = ctx['fleet_raw'] as string | null
  if (raw) return `Fleet REX :\n${raw}`

  const data = ctx['fleet_status'] as Record<string, unknown> | null
  if (!data) return 'Impossible de lire l\'état de la fleet (rex status non disponible).'

  const lines: string[] = ['🖥️  Fleet REX']
  const services = data['services'] ?? data['checks'] ?? data
  if (typeof services === 'object' && services) {
    for (const [name, status] of Object.entries(services)) {
      const icon = String(status).includes('ok') || status === true ? '✅' : '❌'
      lines.push(`  ${icon} ${name}: ${status}`)
    }
  }
  if (data['ollama']) lines.push(`  🦙 Ollama: ${data['ollama']}`)
  if (data['daemon']) lines.push(`  👾 Daemon: ${data['daemon']}`)
  if (data['gateway']) lines.push(`  📡 Gateway: ${data['gateway']}`)
  return lines.join('\n')
}

registerMode({
  id: 'check-fleet',
  description: 'État des machines et services REX',
  triggers: [
    /fleet|mes machines|état.*machine|machine.*état|vps|status.*rex|rex.*status/i,
    /daemon.*alive|gateway.*ok|ollama.*running|services.*rex/i,
  ],
  security: 'SAFE',
  estimatedTokens: 0,
  loaders: [loadFleetStatus],
  template: '{{fleet_status}}',
  llmFields: [],
  outputFormatter: formatFleet,
})
