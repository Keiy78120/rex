/**
 * REX Launcher — the single entry point for Claude Code
 *
 * User never invokes `claude` directly. They invoke `rex`.
 * REX detects intent, builds the context profile, writes ~/.claude/settings.json,
 * spawns Claude Code as a managed subprocess, monitors it, and handles
 * kill/relaunch cycles without losing session state.
 *
 * Usage:
 *   rex                       # auto-detect intent, launch
 *   rex --intent feature      # force intent
 *   rex --profile infra       # force profile
 *   rex kill                  # dump state + kill
 *   rex relaunch              # dump + kill + relaunch with re-detection
 */

import { spawn, ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { detectIntent, type ProjectIntent } from './project-intent.js'
import { appendEvent } from './sync-queue.js'

const log = createLogger('launcher')

// ── Types ──────────────────────────────────────────────

export interface LaunchOptions {
  intent?: ProjectIntent          // force intent (skips detection)
  profileName?: string           // force named profile
  claudeArgs?: string[]          // extra args passed to `claude`
  cwd?: string
  dryRun?: boolean               // print config without launching
}

export interface SessionState {
  savedAt: string
  intent: ProjectIntent
  profileName: string
  cwd: string
  gitDiff?: string               // unstaged changes at time of kill
  memoryContext?: string         // last injected memory snapshot
  lastMessages?: string          // last N assistant messages for continuity
  pendingFiles?: string[]        // files that were being edited
  reason: string                 // why the session was killed
}

// ── Context Profiles ───────────────────────────────────

export interface ContextProfile {
  name: string
  intent: ProjectIntent | 'any'
  guards: string[]               // guard script filenames to activate
  mcpIds: string[]               // MCP server IDs from mcp-discover catalog
  skills: string[]               // skill IDs to inject in preload
  modelHint?: string             // preferred model (sonnet/haiku/opus)
  routerTasks?: string[]         // task types to hint to router.ts
  dangerousCmdStrict?: boolean   // enable strict mode for dangerous-cmd-guard
}

const PROFILES: Record<string, ContextProfile> = {
  feature: {
    name: 'feature',
    intent: 'feature',
    guards: ['ui-checklist-guard.sh', 'test-protect-guard.sh', 'completion-guard.sh', 'dangerous-cmd-guard.sh'],
    mcpIds: ['filesystem', 'github', 'playwright'],
    skills: ['ui-craft', 'test-strategy', 'code-review'],
    modelHint: 'sonnet',
  },
  'bug-fix': {
    name: 'bug-fix',
    intent: 'bug-fix',
    guards: ['error-pattern-guard.sh', 'completion-guard.sh', 'dangerous-cmd-guard.sh', 'test-protect-guard.sh'],
    mcpIds: ['filesystem', 'github', 'sqlite'],
    skills: ['debug-assist', 'fix-issue', 'error-handling'],
    modelHint: 'sonnet',
  },
  refactor: {
    name: 'refactor',
    intent: 'refactor',
    guards: ['test-protect-guard.sh', 'scope-guard.sh', 'completion-guard.sh', 'dangerous-cmd-guard.sh'],
    mcpIds: ['filesystem', 'github'],
    skills: ['perf', 'code-review', 'refactor-engine'],
    modelHint: 'sonnet',
  },
  infra: {
    name: 'infra',
    intent: 'infra',
    guards: ['dangerous-cmd-guard.sh', 'scope-guard.sh', 'completion-guard.sh'],
    mcpIds: ['filesystem', 'github'],
    skills: ['deploy-checklist', 'api-design'],
    modelHint: 'sonnet',
    dangerousCmdStrict: true,
  },
  docs: {
    name: 'docs',
    intent: 'docs',
    guards: ['scope-guard.sh'],
    mcpIds: ['filesystem', 'context7'],
    skills: ['code-explainer'],
    modelHint: 'haiku',
  },
  explore: {
    name: 'explore',
    intent: 'explore',
    guards: ['dangerous-cmd-guard.sh'],
    mcpIds: ['filesystem', 'github', 'brave-search', 'context7'],
    skills: ['research', 'context-loader'],
    modelHint: 'haiku',
  },
  discussion: {
    name: 'discussion',
    intent: 'explore',   // closest intent
    guards: [],           // no guards — just a conversation
    mcpIds: ['memory-mcp'],
    skills: [],
    modelHint: 'haiku',
  },
  'new-project': {
    name: 'new-project',
    intent: 'new-project',
    guards: ['dangerous-cmd-guard.sh', 'scope-guard.sh'],
    mcpIds: ['filesystem', 'github', 'context7'],
    skills: ['project-init', 'spec-interview', 'ui-craft'],
    modelHint: 'sonnet',
  },
}

// ── Paths ──────────────────────────────────────────────

const RECOVERY_PATH = join(REX_DIR, 'recovery-state.json')
const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')
const GUARDS_DIR = join(homedir(), '.claude', 'rex-guards')

// ── Active session ─────────────────────────────────────

let _activeProcess: ChildProcess | null = null
let _activeProfile: ContextProfile | null = null
let _activeCwd = process.cwd()

// ── Settings writer ────────────────────────────────────

/**
 * Read existing ~/.claude/settings.json preserving user config,
 * then patch the mcpServers and hooks sections for this profile.
 */
function writeClaudeSettings(profile: ContextProfile, recoveryState: SessionState | null): void {
  let settings: Record<string, unknown> = {}
  try {
    if (existsSync(CLAUDE_SETTINGS_PATH)) {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')) as Record<string, unknown>
    }
  } catch { /* start fresh */ }

  // ── MCP servers ────────────────────────────────────
  const mcpServers: Record<string, unknown> = {}

  // Always include essential MCPs (memory, filesystem basics)
  mcpServers['rex-memory'] = {
    command: 'rex',
    args: ['mcp-serve'],
    description: 'REX local memory MCP',
  }

  // Profile-specific MCPs
  for (const id of profile.mcpIds) {
    mcpServers[id] = buildMcpEntry(id)
  }

  // ── Hooks ──────────────────────────────────────────
  const hooks = buildHooks(profile, recoveryState)

  // ── Env hints ──────────────────────────────────────
  const env = (settings.env ?? {}) as Record<string, string>
  env['REX_ACTIVE_PROFILE'] = profile.name
  env['REX_ACTIVE_INTENT'] = profile.intent
  if (profile.modelHint) env['REX_PREFERRED_MODEL'] = profile.modelHint
  if (profile.dangerousCmdStrict) env['REX_DANGEROUS_CMD_STRICT'] = '1'
  if (recoveryState) env['REX_RECOVERY_STATE_PATH'] = RECOVERY_PATH

  settings.mcpServers = mcpServers
  settings.hooks = hooks
  settings.env = env

  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
  log.info(`Wrote settings for profile: ${profile.name} (${profile.mcpIds.length} MCPs, ${profile.guards.length} guards)`)
}

function buildMcpEntry(id: string): Record<string, unknown> {
  const catalog: Record<string, Record<string, unknown>> = {
    'context7': { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    'filesystem': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()] },
    'memory-mcp': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
    'brave-search': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
    'playwright': { command: 'npx', args: ['-y', '@playwright/mcp'] },
    'github': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    'sqlite': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', join(REX_DIR, 'memory.db')] },
    'exa-search': { command: 'npx', args: ['-y', 'exa-mcp-server'] },
    'anyquery': { command: 'anyquery', args: ['mcp'] },
    'mcp-gateway': { command: 'npx', args: ['-y', 'mcp-gateway'] },
  }
  return catalog[id] ?? { command: 'npx', args: ['-y', id] }
}

function buildHooks(profile: ContextProfile, _recoveryState: SessionState | null): Record<string, unknown> {
  const preToolUse = profile.guards
    .filter(g => ['dangerous-cmd-guard.sh', 'scope-guard.sh', 'test-protect-guard.sh'].includes(g))
    .map(g => ({
      matcher: g.includes('dangerous') || g.includes('scope') ? 'Bash' : undefined,
      hooks: [{ type: 'command', command: `bash ${join(GUARDS_DIR, g)}` }],
    }))
    .filter(h => h.matcher)

  const postToolUse = profile.guards
    .filter(g => ['completion-guard.sh', 'error-pattern-guard.sh', 'ui-checklist-guard.sh'].includes(g))
    .map(g => ({
      matcher: 'Task',
      hooks: [{ type: 'command', command: `bash ${join(GUARDS_DIR, g)}` }],
    }))

  const sessionStart = [{
    hooks: [{ type: 'command', command: 'rex preload --inject-context' }],
  }]

  const sessionStop = [{
    hooks: [{ type: 'command', command: 'rex session-end --save-summary' }],
  }]

  return {
    PreToolUse: preToolUse,
    PostToolUse: postToolUse,
    SessionStart: sessionStart,
    Stop: sessionStop,
  }
}

// ── Profile selection ──────────────────────────────────

export function selectProfile(intent: ProjectIntent, forceName?: string): ContextProfile {
  if (forceName && PROFILES[forceName]) return PROFILES[forceName]

  // Intent → profile mapping
  const intentMap: Record<string, string> = {
    'new-project': 'new-project',
    'feature': 'feature',
    'bug-fix': 'bug-fix',
    'refactor': 'refactor',
    'infra': 'infra',
    'docs': 'docs',
    'explore': 'explore',
  }

  const profileName = intentMap[intent] ?? 'explore'
  return PROFILES[profileName]
}

// ── Session state ──────────────────────────────────────

export async function dumpSessionState(reason: string): Promise<void> {
  if (!_activeProfile) return

  const { execSync } = await import('node:child_process')
  let gitDiff: string | undefined
  try {
    gitDiff = execSync('git diff --stat HEAD 2>/dev/null', { cwd: _activeCwd, encoding: 'utf-8' })
  } catch { /* not a git repo */ }

  const state: SessionState = {
    savedAt: new Date().toISOString(),
    intent: _activeProfile.intent as ProjectIntent,
    profileName: _activeProfile.name,
    cwd: _activeCwd,
    gitDiff,
    reason,
  }

  ensureRexDirs()
  writeFileSync(RECOVERY_PATH, JSON.stringify(state, null, 2))
  log.info(`Session state saved: ${reason}`)

  await appendEvent({ type: 'session_killed', data: { reason, profile: _activeProfile.name } })
}

export function readRecoveryState(): SessionState | null {
  try {
    if (existsSync(RECOVERY_PATH)) {
      return JSON.parse(readFileSync(RECOVERY_PATH, 'utf-8')) as SessionState
    }
  } catch { /* noop */ }
  return null
}

export function clearRecoveryState(): void {
  try { if (existsSync(RECOVERY_PATH)) unlinkSync(RECOVERY_PATH) } catch { /* noop */ }
}

// ── Launcher ───────────────────────────────────────────

/**
 * Main entry point. Detects intent, writes settings, spawns Claude Code.
 */
export async function launchRex(opts: LaunchOptions = {}): Promise<void> {
  ensureRexDirs()

  // 1. Detect intent
  const intent = opts.intent ?? await detectIntent()
  log.info(`Intent: ${intent}`)

  // 2. Select profile
  const profile = selectProfile(intent, opts.profileName)
  log.info(`Profile: ${profile.name} (guards: ${profile.guards.length}, MCPs: ${profile.mcpIds.length})`)

  // 3. Check for recovery state from previous kill
  const recovery = readRecoveryState()
  if (recovery) {
    log.info(`Recovery state found from: ${recovery.savedAt} (${recovery.reason})`)
  }

  // 4. Write settings.json
  if (!opts.dryRun) {
    writeClaudeSettings(profile, recovery)
  } else {
    console.log('\n[DRY RUN] Would write settings.json for profile:', profile.name)
    console.log('Guards:', profile.guards)
    console.log('MCPs:', profile.mcpIds)
    console.log('Skills:', profile.skills)
    return
  }

  // 5. Spawn claude
  _activeProfile = profile
  _activeCwd = opts.cwd ?? process.cwd()

  const claudeArgs = ['--dangerously-skip-permissions', ...(opts.claudeArgs ?? [])]

  log.info(`Spawning claude with profile: ${profile.name}`)
  _activeProcess = spawn('claude', claudeArgs, {
    cwd: _activeCwd,
    stdio: 'inherit',
    env: { ...process.env, REX_ACTIVE_PROFILE: profile.name },
  })

  _activeProcess.on('exit', (code) => {
    log.info(`Claude exited with code: ${code}`)
    _activeProcess = null
    clearRecoveryState()
  })

  // 6. Wait for process
  await new Promise<void>((resolve) => {
    _activeProcess?.on('exit', resolve)
    _activeProcess?.on('error', (err) => {
      log.error('Claude process error', err)
      resolve()
    })
  })
}

/**
 * Kill current session and relaunch with re-detected intent.
 */
export async function killAndRelaunch(reason = 'manual-relaunch', forceIntent?: ProjectIntent): Promise<void> {
  if (!_activeProcess) {
    log.warn('No active Claude session to kill')
    return
  }

  await dumpSessionState(reason)

  // Kill gracefully
  _activeProcess.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 2000))
  if (_activeProcess && !_activeProcess.killed) {
    _activeProcess.kill('SIGKILL')
  }
  _activeProcess = null

  // Relaunch
  log.info('Relaunching with new profile...')
  await launchRex({ intent: forceIntent })
}

/**
 * Kill current session without relaunching.
 */
export async function killSession(reason = 'manual-kill'): Promise<void> {
  if (!_activeProcess) return
  await dumpSessionState(reason)
  _activeProcess.kill('SIGTERM')
  _activeProcess = null
}
