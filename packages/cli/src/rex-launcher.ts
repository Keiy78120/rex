/**
 * REX Launcher — single entry point replacing `claude`
 *
 * User runs `rex` (no subcommand) instead of `claude`.
 * Flow:
 *   detect intent → build profile → patch ~/.claude/settings.json
 *   → spawn `claude` subprocess → monitor PID
 *   → on exit: check intent drift, save recovery-state.json for zero-loss
 *
 * Commands:
 *   rex            Launch Claude Code with auto-detected profile
 *   rex kill       SIGTERM the tracked Claude subprocess
 *   rex relaunch   Kill + relaunch with fresh intent profile
 *
 * Spec: docs/plans/action.md §21
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { detectIntent } from './project-intent.js'
import { buildContextProfile } from './context-loader.js'
import type { ContextProfile } from './context-loader.js'
import type { ProjectIntent } from './project-intent.js'
import { REX_DIR, LAUNCHER_PID_PATH, RECOVERY_STATE_PATH, ensureRexDirs } from './paths.js'

const log = createLogger('launcher')

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

// ── Types ──────────────────────────────────────────────────────────

export interface RecoveryState {
  lastIntent: ProjectIntent
  lastProfile: ContextProfile
  exitedAt: string
  cwd: string
  exitCode: number | null
}

// ── Settings patching ──────────────────────────────────────────────

function readSettings(): Record<string, unknown> {
  try {
    if (existsSync(CLAUDE_SETTINGS_PATH)) {
      return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8')) as Record<string, unknown>
    }
  } catch {}
  return {}
}

function writeSettings(settings: Record<string, unknown>): void {
  mkdirSync(join(homedir(), '.claude'), { recursive: true })
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
}

/**
 * Ensure dangerous-cmd-guard is present in PreToolUse hooks.
 * Additive only — never removes existing hooks.
 * Logs which profile MCPs are active vs missing (informational).
 */
function patchSettingsForProfile(profile: ContextProfile): void {
  const settings = readSettings()

  // Guard hooks: ensure dangerous-cmd-guard is registered
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>
  const preToolUse = Array.isArray(hooks.PreToolUse)
    ? (hooks.PreToolUse as Array<{ matcher: string; hooks: unknown[] }>)
    : []

  const guardScript = join(homedir(), '.claude', 'rex-guards', 'dangerous-cmd-guard.sh')
  const alreadyRegistered = preToolUse.some(
    h => h.matcher === 'Bash' && JSON.stringify(h.hooks ?? []).includes('dangerous-cmd-guard')
  )

  if (!alreadyRegistered && existsSync(guardScript)) {
    preToolUse.push({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: guardScript }],
    })
    hooks.PreToolUse = preToolUse
    settings.hooks = hooks
    log.info('Registered dangerous-cmd-guard in PreToolUse hooks')
  }

  // MCPs: log active vs suggested (we don't auto-install — installServer() does that)
  const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>
  const active  = profile.mcps.filter(id => mcpServers[id])
  const missing = profile.mcps.filter(id => !mcpServers[id])
  if (active.length > 0)   log.info(`Active MCPs: ${active.join(', ')}`)
  if (missing.length > 0)  log.info(`Suggested MCPs (not installed): ${missing.join(', ')} — run rex mcp install <id>`)

  writeSettings(settings)
}

// ── PID management ─────────────────────────────────────────────────

function writePid(pid: number): void {
  ensureRexDirs()
  writeFileSync(LAUNCHER_PID_PATH, String(pid))
}

function readPid(): number | null {
  try {
    if (!existsSync(LAUNCHER_PID_PATH)) return null
    const pid = parseInt(readFileSync(LAUNCHER_PID_PATH, 'utf-8').trim(), 10)
    return isNaN(pid) ? null : pid
  } catch { return null }
}

function clearPid(): void {
  try { if (existsSync(LAUNCHER_PID_PATH)) unlinkSync(LAUNCHER_PID_PATH) } catch {}
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

// ── Recovery state ─────────────────────────────────────────────────

function saveRecovery(state: RecoveryState): void {
  ensureRexDirs()
  writeFileSync(RECOVERY_STATE_PATH, JSON.stringify(state, null, 2))
}

export function readRecovery(): RecoveryState | null {
  try {
    if (existsSync(RECOVERY_STATE_PATH)) {
      return JSON.parse(readFileSync(RECOVERY_STATE_PATH, 'utf-8')) as RecoveryState
    }
  } catch {}
  return null
}

// ── Display ────────────────────────────────────────────────────────

function printLaunchBanner(profile: ContextProfile): void {
  const bold = '\x1b[1m', reset = '\x1b[0m', dim = '\x1b[2m', cyan = '\x1b[36m'
  console.log(`\n${bold}REX${reset} ${dim}→ launching Claude Code${reset}`)
  console.log(`  Intent: ${bold}${profile.intent}${reset} ${dim}(${profile.confidence})${reset}`)
  if (profile.mcps.length > 0)   console.log(`  MCPs:   ${cyan}${profile.mcps.join(', ')}${reset}`)
  if (profile.skills.length > 0) console.log(`  Skills: ${profile.skills.map(s => `/${s}`).join(', ')}`)
  if (profile.note)               console.log(`  ${dim}${profile.note}${reset}`)
  console.log()
}

// ── Main launch ────────────────────────────────────────────────────

export async function launchRex(cwd = process.cwd()): Promise<void> {
  // 1. Detect intent → build profile
  const intentCtx = detectIntent(cwd)
  const profile = buildContextProfile(intentCtx)

  // 2. Banner
  printLaunchBanner(profile)

  // 3. Guard against double-launch
  const existingPid = readPid()
  if (existingPid && isAlive(existingPid)) {
    console.log(`\x1b[33m⚠\x1b[0m  Claude already running (PID ${existingPid}).`)
    console.log(`  Use \x1b[1mrex relaunch\x1b[0m to restart with a fresh profile.\n`)
    process.exit(0)
  }

  // 4. Patch settings.json (hooks + MCP audit — additive only)
  try {
    patchSettingsForProfile(profile)
  } catch (e: any) {
    log.warn(`Settings patch failed: ${e.message?.slice(0, 100)} — continuing`)
  }

  // 5. Surface previous session context
  const recovery = readRecovery()
  if (recovery) {
    const elapsed = Math.round((Date.now() - new Date(recovery.exitedAt).getTime()) / 1000)
    const unit = elapsed > 3600 ? `${Math.round(elapsed / 3600)}h`
               : elapsed > 60   ? `${Math.round(elapsed / 60)}m`
               : `${elapsed}s`
    console.log(`\x1b[2mPrevious session: ${recovery.lastIntent} (${unit} ago)\x1b[0m\n`)
  }

  // 6. Spawn claude — forward any extra args after `rex`
  const extraArgs = process.argv.slice(3)
  const child = spawn('claude', extraArgs, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env },
    cwd,
  })

  if (!child.pid) {
    console.error('\x1b[31m✗\x1b[0m  Failed to spawn claude.')
    console.error('  Install Claude Code: npm install -g @anthropic-ai/claude-code')
    process.exit(1)
  }

  writePid(child.pid)
  log.info(`Claude spawned PID=${child.pid} intent=${profile.intent} confidence=${profile.confidence}`)

  // 7. Handle spawn error (ENOENT = not installed)
  child.on('error', (err) => {
    clearPid()
    log.error(`Spawn error: ${err.message}`)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('\x1b[31m✗\x1b[0m  claude not found in PATH.')
      console.error('  Install: npm install -g @anthropic-ai/claude-code')
    } else {
      console.error(`\x1b[31m✗\x1b[0m  ${err.message}`)
    }
    process.exit(1)
  })

  // 8. On exit: save recovery state + check intent drift
  child.on('exit', (code, signal) => {
    clearPid()

    saveRecovery({
      lastIntent: profile.intent,
      lastProfile: profile,
      exitedAt: new Date().toISOString(),
      cwd,
      exitCode: code,
    })

    log.info(`Claude exited code=${code} signal=${signal}`)

    // Intent drift: re-detect and surface if shifted at high confidence
    try {
      const newIntent = detectIntent(cwd)
      if (newIntent.intent !== profile.intent && newIntent.confidence === 'high') {
        const yellow = '\x1b[33m', bold = '\x1b[1m', reset = '\x1b[0m', dim = '\x1b[2m'
        console.log(`\n${yellow}Intent drift:${reset} ${profile.intent} → ${bold}${newIntent.intent}${reset}`)
        console.log(`  ${dim}Run rex relaunch to start a fresh session with the updated profile.${reset}\n`)
      }
    } catch {}

    process.exit(code ?? 0)
  })
}

// ── Kill ───────────────────────────────────────────────────────────

export function killRex(): void {
  const pid = readPid()
  if (!pid) {
    console.log('No active REX session found.')
    return
  }
  if (!isAlive(pid)) {
    clearPid()
    console.log(`PID ${pid} already dead — cleared stale lock.`)
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    clearPid()
    console.log(`\x1b[32m✓\x1b[0m  Sent SIGTERM to Claude (PID ${pid})`)
  } catch (err: any) {
    console.error(`\x1b[31m✗\x1b[0m  Failed to kill PID ${pid}: ${err.message}`)
    process.exit(1)
  }
}

// ── Relaunch ───────────────────────────────────────────────────────

export async function relaunchRex(cwd = process.cwd()): Promise<void> {
  // Kill existing session
  const pid = readPid()
  if (pid && isAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
      clearPid()
      console.log(`\x1b[32m✓\x1b[0m  Terminated session (PID ${pid})`)
      // Brief pause so the process cleans up before we relaunch
      await new Promise(r => setTimeout(r, 500))
    } catch (e: any) {
      log.warn(`SIGTERM failed: ${e.message}`)
    }
  }

  await launchRex(cwd)
}
