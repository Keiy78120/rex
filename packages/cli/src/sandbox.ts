/**
 * REX Sandbox
 * @module TOOLS
 *
 * Thin routing layer over OS-level and Docker isolation runtimes.
 * REX does NOT implement isolation primitives — it delegates to OSS runtimes.
 *
 * Runtimes (in priority order):
 *   light → macOS sandbox-exec (seatbelt) — instant, no disk write outside cwd
 *   full  → Docker container with project mounted — full isolation, ~2s startup
 *   off   → no isolation (raw subprocess)
 *
 * §4 REX Master Plan — Sandbox layer
 */

import { execSync, spawn } from 'node:child_process'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('sandbox')

export type SandboxMode = 'light' | 'full' | 'off'
export type SandboxRuntime = 'seatbelt' | 'docker' | 'none'

export interface SandboxOptions {
  mode?: SandboxMode
  cwd?: string
  network?: boolean     // allow network in sandbox (default: true for light, false for full)
  image?: string        // Docker image (default: node:22-alpine)
  interactive?: boolean // stdin/tty passthrough
}

export interface SandboxStatus {
  mode: SandboxMode
  runtimes: { name: SandboxRuntime; available: boolean; version?: string }[]
  activeRuntime: SandboxRuntime
}

function whichExists(cmd: string): boolean {
  try { execSync(`which ${cmd}`, { stdio: 'ignore', timeout: 2000 }); return true } catch { return false }
}

function tryVersion(cmd: string): string | undefined {
  try { return execSync(`${cmd} --version 2>&1`, { timeout: 3000, encoding: 'utf-8' }).trim().split('\n')[0] } catch { return undefined }
}

/** Check which isolation runtimes are available on this machine */
export function detectRuntime(mode: SandboxMode): SandboxRuntime {
  if (mode === 'off') return 'none'

  if (mode === 'light' || mode === 'full') {
    // Full mode: prefer Docker
    if (mode === 'full' && whichExists('docker')) {
      try {
        execSync('docker info 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
        return 'docker'
      } catch {}
    }
    // Light mode: macOS seatbelt (sandbox-exec)
    if (process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
      return 'seatbelt'
    }
    // Docker as fallback for light too
    if (whichExists('docker')) {
      try {
        execSync('docker info 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
        return 'docker'
      } catch {}
    }
  }

  return 'none'
}

export function getSandboxStatus(mode: SandboxMode = 'light'): SandboxStatus {
  const seatbeltAvailable = process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')
  let dockerAvailable = false
  let dockerVersion: string | undefined
  if (whichExists('docker')) {
    try {
      execSync('docker info 2>/dev/null', { stdio: 'ignore', timeout: 3000 })
      dockerAvailable = true
      dockerVersion = tryVersion('docker')
    } catch {}
  }

  const runtime = detectRuntime(mode)

  return {
    mode,
    runtimes: [
      { name: 'seatbelt', available: seatbeltAvailable },
      { name: 'docker', available: dockerAvailable, version: dockerVersion },
    ],
    activeRuntime: runtime,
  }
}

/** Generate a minimal macOS seatbelt profile that:
 *  - allows read-only access everywhere
 *  - allows write access only to cwd and /tmp
 *  - allows network (toggleable)
 */
function writeSeatbeltProfile(cwd: string, allowNetwork: boolean): string {
  const profilePath = join(tmpdir(), `rex-sandbox-${Date.now()}.sb`)
  const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath "${cwd}"))
(allow file-write* (subpath "/tmp"))
(allow file-write* (subpath "${join(homedir(), '.claude', 'rex')}"))
${allowNetwork ? '' : '(deny network*)'}
(allow process-exec)
(allow process-fork)
`
  writeFileSync(profilePath, profile)
  return profilePath
}

/** Run a command using macOS sandbox-exec (seatbelt) */
async function runWithSeatbelt(cmd: string[], opts: SandboxOptions): Promise<number> {
  const cwd = opts.cwd ?? process.cwd()
  const allowNet = opts.network ?? true
  const profilePath = writeSeatbeltProfile(resolve(cwd), allowNet)

  return new Promise((res) => {
    const proc = spawn('sandbox-exec', ['-f', profilePath, ...cmd], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })
    proc.on('close', code => res(code ?? 0))
    proc.on('error', () => res(1))
  })
}

/** Run a command inside a Docker container with cwd mounted */
async function runWithDocker(cmd: string[], opts: SandboxOptions): Promise<number> {
  const cwd = opts.cwd ?? process.cwd()
  const image = opts.image ?? 'node:22-alpine'
  const allowNet = opts.network ?? false  // default: no network in full mode
  const networkFlag = allowNet ? '' : '--network none'
  const interactive = opts.interactive ?? false

  // Ensure image is available
  try {
    execSync(`docker image inspect ${image} 2>/dev/null`, { stdio: 'ignore', timeout: 5000 })
  } catch {
    log.info(`Pulling Docker image: ${image}`)
    execSync(`docker pull ${image}`, { stdio: 'inherit', timeout: 120_000 })
  }

  const dockerArgs = [
    'run',
    '--rm',
    interactive ? '-it' : '-i',
    '--workdir', '/workspace',
    '-v', `${resolve(cwd)}:/workspace`,
    networkFlag,
    image,
    ...cmd,
  ].filter(Boolean)

  return new Promise((res) => {
    const proc = spawn('docker', dockerArgs, {
      cwd,
      stdio: 'inherit',
      env: process.env,
    })
    proc.on('close', code => res(code ?? 0))
    proc.on('error', () => res(1))
  })
}

/** Parse a shell command string into argv array (basic, no $() expansion) */
function parseCmd(cmdStr: string): string[] {
  // Simple split respecting single/double quotes
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  for (const ch of cmdStr) {
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

/** Run a command in sandbox */
export async function sandboxRun(cmdStr: string, opts: SandboxOptions = {}): Promise<void> {
  const mode = opts.mode ?? 'light'
  const runtime = detectRuntime(mode)

  if (runtime === 'none' && mode !== 'off') {
    log.warn('No isolation runtime available — running without sandbox')
  }

  const cmd = parseCmd(cmdStr)
  log.info(`sandbox run [${runtime}] ${cmdStr.slice(0, 80)}`)

  let exitCode = 0
  if (runtime === 'seatbelt') {
    exitCode = await runWithSeatbelt(cmd, opts)
  } else if (runtime === 'docker') {
    exitCode = await runWithDocker(cmd, opts)
  } else {
    // no sandbox — raw subprocess
    const { spawn: sp } = await import('node:child_process')
    exitCode = await new Promise((res) => {
      const proc = sp(cmd[0], cmd.slice(1), { stdio: 'inherit', cwd: opts.cwd ?? process.cwd() })
      proc.on('close', code => res(code ?? 0))
      proc.on('error', () => res(1))
    })
  }

  if (exitCode !== 0) process.exit(exitCode)
}

/** Open an interactive shell in sandbox */
export async function sandboxShell(opts: SandboxOptions = {}): Promise<void> {
  const mode = opts.mode ?? 'light'
  const runtime = detectRuntime(mode)

  if (runtime === 'docker') {
    await runWithDocker(['/bin/sh'], { ...opts, interactive: true })
  } else if (runtime === 'seatbelt') {
    await runWithSeatbelt(['bash'], { ...opts, interactive: true })
  } else {
    // Fallback: just open bash
    const proc = spawn('bash', [], { stdio: 'inherit' })
    await new Promise(res => proc.on('close', res))
  }
}

/** Run Claude Code in sandbox on a task */
export async function sandboxClaude(task: string, opts: SandboxOptions = {}): Promise<void> {
  // Claude Code runs as `claude` binary with --print flag for non-interactive
  const claudeCmd = `claude --print "${task.replace(/"/g, '\\"')}"`
  log.info(`sandbox claude: ${task.slice(0, 60)}`)
  await sandboxRun(claudeCmd, { ...opts, mode: opts.mode ?? 'light' })
}

/** Run Codex in sandbox on a task */
export async function sandboxCodex(task: string, opts: SandboxOptions = {}): Promise<void> {
  const codexCmd = `codex "${task.replace(/"/g, '\\"')}"`
  log.info(`sandbox codex: ${task.slice(0, 60)}`)
  await sandboxRun(codexCmd, { ...opts, mode: opts.mode ?? 'light' })
}

/** Auto-detect risk level of a task and suggest sandbox mode */
export function detectRisk(task: string): { level: 'none' | 'light' | 'full'; reason: string } {
  const t = task.toLowerCase()

  // High risk — full isolation
  if (/npm install|pip install|yarn add|brew install|apt(-get)? install|docker run/.test(t)) {
    return { level: 'full', reason: 'installs external packages — full isolation recommended' }
  }
  if (/rm -rf|sudo|chmod 777|curl.*\|.*sh|wget.*\|.*bash/.test(t)) {
    return { level: 'full', reason: 'potentially destructive command — full isolation required' }
  }
  if (/\/etc\/|\/usr\/|\/sys\/|system config/.test(t)) {
    return { level: 'full', reason: 'touches system config — full isolation required' }
  }

  // Medium risk — light isolation
  if (/write|create|modify|update|delete|git commit|git push/.test(t)) {
    return { level: 'light', reason: 'modifies files — light isolation recommended' }
  }

  // No risk
  return { level: 'none', reason: 'read-only task — no sandbox needed' }
}

/** Print sandbox status to console */
export function printSandboxStatus(mode: SandboxMode = 'light'): void {
  const status = getSandboxStatus(mode)
  const { bold, reset, green, yellow, dim, red } = {
    bold: '\x1b[1m', reset: '\x1b[0m',
    green: '\x1b[32m', yellow: '\x1b[33m',
    dim: '\x1b[2m', red: '\x1b[31m',
  }

  console.log(`\n${bold}REX Sandbox${reset}  ${dim}isolation layer${reset}`)
  console.log('─'.repeat(48))
  console.log(`  Mode:    ${status.mode === 'off' ? dim : bold}${status.mode}${reset}`)
  console.log(`  Runtime: ${status.activeRuntime === 'none' ? yellow + 'none (no isolation)' : green + status.activeRuntime}${reset}`)
  console.log()
  console.log(`${bold}  Runtimes:${reset}`)
  for (const r of status.runtimes) {
    const dot = r.available ? `${green}●${reset}` : `${dim}○${reset}`
    const ver = r.version ? `  ${dim}${r.version.slice(0, 40)}${reset}` : ''
    console.log(`    ${dot}  ${r.name.padEnd(10)}${ver}`)
  }
  console.log()

  if (status.activeRuntime === 'none' && status.mode !== 'off') {
    console.log(`  ${yellow}!${reset}  No sandbox runtime available.`)
    console.log(`  ${dim}Install Docker for full isolation, or use macOS built-in sandbox-exec.${reset}`)
  }
  console.log()
}
