/**
 * REX Context Loader — Real-Time Adaptive Loading
 *
 * Maps ProjectIntent → ContextProfile (guards + MCPs + skills).
 * Called at SessionStart via preload.ts after intent detection.
 *
 * Principle: nothing loaded statically except dangerous-cmd-guard.
 * Every other tool is intent-driven — only what this session needs.
 *
 * Spec: docs/plans/action.md §20
 * @module AGENTS
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { IntentContext, ProjectIntent } from './project-intent.js'

// ── Types ──────────────────────────────────────────────────────────

export interface ContextProfile {
  intent: ProjectIntent
  confidence: string
  /** Guards active for this session (always includes dangerous-cmd-guard) */
  guards: string[]
  /** MCP server IDs relevant to this session */
  mcps: string[]
  /** Skills relevant to this session */
  skills: string[]
  /** Short human-readable note for preload context */
  note: string
}

// ── Profile table ──────────────────────────────────────────────────

const ALWAYS_ON_GUARDS = ['dangerous-cmd-guard']

interface IntentProfile {
  mcps: string[]
  skills: string[]
  note: string
}

/**
 * Per-intent profile table.
 * MCPs = suggest enabling; Skills = suggest invoking.
 * Guards always include dangerous-cmd-guard (infra gets it especially).
 */
const PROFILE_TABLE: Record<ProjectIntent, IntentProfile> = {
  'new-project': {
    mcps: ['filesystem'],
    skills: ['project-init', 'ux-flow', 'api-design'],
    note: 'New project — scaffold with /project-init, setup guards + CI + lint',
  },
  'feature': {
    mcps: ['github', 'context7'],
    skills: ['ux-flow', 'api-design', 'test-strategy'],
    note: 'Feature — map flows (/ux-flow), design contracts (/api-design) before coding',
  },
  'bug-fix': {
    mcps: ['github'],
    skills: ['debug-assist', 'test-strategy'],
    note: 'Bug-fix — use /debug-assist, search past solutions with rex search "<error>"',
  },
  'refactor': {
    mcps: ['github'],
    skills: ['code-review', 'test-strategy'],
    note: 'Refactor — run rex review to catch regressions after changes',
  },
  'infra': {
    mcps: ['github'],
    skills: ['error-handling', 'build-validate'],
    note: 'Infra — guards active, run rex review before deploying',
  },
  'docs': {
    mcps: ['context7'],
    skills: ['doc'],
    note: 'Docs — use context7 MCP for up-to-date library references',
  },
  'explore': {
    mcps: ['context7'],
    skills: [],
    note: 'Explore — rex context for stack analysis, rex search for past patterns',
  },
}

// ── Core ───────────────────────────────────────────────────────────

/**
 * Build a ContextProfile from an IntentContext.
 *
 * MCPs: prefer already-installed ones, fall back to all suggestions
 * if none from the profile are installed yet (so user sees what to install).
 */
export function buildContextProfile(ctx: IntentContext): ContextProfile {
  const profile = PROFILE_TABLE[ctx.intent]
  const guards = [...ALWAYS_ON_GUARDS]

  // MCPs: prefer installed subset, fall back to full suggestion list
  const installedIds = getInstalledMcpIds()
  const profileMcps = profile.mcps
  const installed = profileMcps.filter(id => installedIds.has(id))
  const mcps = installed.length > 0 ? installed : profileMcps

  // Note: append missing-setup warning for critical gaps
  let note = profile.note
  const critical = Object.keys(ctx.missing).filter(k =>
    k === 'ci' || k === 'tests' || k === 'gitignore'
  )
  if (critical.length > 0) {
    note += ` | Missing: ${critical.join(', ')}`
  }

  return {
    intent: ctx.intent,
    confidence: ctx.confidence,
    guards,
    mcps,
    skills: profile.skills,
    note,
  }
}

/**
 * Compact one-liner for preload context (≤200 chars).
 * e.g. "Profile: bug-fix (high) | MCPs: github | Skills: /debug-assist, /test-strategy"
 */
export function profileToPreloadLine(profile: ContextProfile): string {
  const parts = [`Profile: ${profile.intent} (${profile.confidence})`]
  if (profile.mcps.length > 0)    parts.push(`MCPs: ${profile.mcps.join(', ')}`)
  if (profile.skills.length > 0)  parts.push(`Skills: /${profile.skills.join(', /')}`)
  return parts.join(' | ').slice(0, 200)
}

/**
 * Print a formatted profile summary to stdout (for rex context --profile).
 */
export function printContextProfile(profile: ContextProfile): void {
  const bold = '\x1b[1m', reset = '\x1b[0m', dim = '\x1b[2m'
  const green = '\x1b[32m', cyan = '\x1b[36m', yellow = '\x1b[33m'

  console.log(`\n${bold}REX Context Profile${reset}`)
  console.log('─'.repeat(36))
  console.log(`  Intent:  ${bold}${profile.intent}${reset} ${dim}(${profile.confidence})${reset}`)

  if (profile.guards.length > 0) {
    console.log(`  Guards:  ${green}${profile.guards.join(', ')}${reset}`)
  }

  if (profile.mcps.length > 0) {
    console.log(`  MCPs:    ${cyan}${profile.mcps.join(', ')}${reset}`)
  }

  if (profile.skills.length > 0) {
    console.log(`  Skills:  ${profile.skills.map(s => `/${s}`).join(', ')}`)
  }

  console.log(`  ${dim}${profile.note}${reset}`)
  console.log()
}

// ── Helpers ────────────────────────────────────────────────────────

function getInstalledMcpIds(): Set<string> {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return new Set()
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    const mcpServers = settings.mcpServers as Record<string, unknown> | undefined
    if (!mcpServers) return new Set()
    return new Set(Object.keys(mcpServers))
  } catch {
    return new Set()
  }
}
