/**
 * REX Platform Warnings
 * Detects platform limitations and warns about unavailable features.
 * Shown in `rex doctor` and `rex doctor --platform`.
 * @module TOOLS
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform, release, arch, cpus } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('platform')

export interface PlatformWarning {
  feature: string
  reason: string
  alternative: string
}

export type PlatformProfile =
  | 'macos'
  | 'linux-gpu'
  | 'linux-no-gpu'
  | 'docker'
  | 'windows-wsl2'
  | 'unknown'

// ─── Platform detection ───────────────────────────────────────────────────────

function isDocker(): boolean {
  return existsSync('/.dockerenv') || existsSync('/run/.containerenv')
}

function isWSL(): boolean {
  const r = release().toLowerCase()
  return r.includes('microsoft') || r.includes('wsl')
}

function hasNvidiaGpu(): boolean {
  try {
    execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
      stdio: 'pipe',
      timeout: 3000,
    })
    return true
  } catch {
    return false
  }
}

function hasAppleSilicon(): boolean {
  return platform() === 'darwin' && arch() === 'arm64'
}

export function detectPlatform(): PlatformProfile {
  const p = platform()
  if (isDocker()) return 'docker'
  if (p === 'darwin') return 'macos'
  if (isWSL()) return 'windows-wsl2'
  if (p === 'linux') {
    return hasNvidiaGpu() ? 'linux-gpu' : 'linux-no-gpu'
  }
  return 'unknown'
}

// ─── Warning table ────────────────────────────────────────────────────────────

const WARNINGS: Partial<Record<PlatformProfile, PlatformWarning[]>> = {
  'linux-no-gpu': [
    {
      feature: 'Large LLM (>3B params)',
      reason: 'No GPU — will be very slow on CPU',
      alternative: 'Connect a GPU node via the mesh (`rex nodes`)',
    },
    {
      feature: 'Flutter GUI',
      reason: 'Linux headless',
      alternative: 'Use CLI + Gateway Telegram (or add `--platform` for a future Web Dashboard)',
    },
    {
      feature: 'Voice / Audio',
      reason: 'No microphone in headless mode',
      alternative: 'Route voice through a Mac node (`rex voice` from Mac)',
    },
    {
      feature: 'Call watcher (Hammerspoon)',
      reason: 'macOS-only',
      alternative: 'Disabled on Linux — call events not detected',
    },
    {
      feature: 'sandbox-exec',
      reason: 'macOS-only',
      alternative: 'bubblewrap or Docker sandbox on Linux',
    },
  ],
  'linux-gpu': [
    {
      feature: 'Flutter GUI',
      reason: 'Linux headless (no display)',
      alternative: 'Use CLI + Gateway Telegram',
    },
    {
      feature: 'Call watcher (Hammerspoon)',
      reason: 'macOS-only',
      alternative: 'Disabled on Linux',
    },
  ],
  docker: [
    {
      feature: 'Flutter GUI',
      reason: 'Running inside container',
      alternative: 'Web Dashboard on exposed port (future feature)',
    },
    {
      feature: 'Voice / Audio',
      reason: 'No audio devices in container',
      alternative: 'Disabled',
    },
    {
      feature: 'systemd (LaunchAgents)',
      reason: 'Container has no init system',
      alternative: 'Use internal cron or supervisord',
    },
    {
      feature: 'sandbox-exec',
      reason: 'macOS-only',
      alternative: 'Docker isolation handles sandboxing',
    },
  ],
  'windows-wsl2': [
    {
      feature: 'LaunchAgents',
      reason: 'macOS-only',
      alternative: 'Windows Scheduled Tasks or WSL cron',
    },
    {
      feature: 'Hammerspoon / Call watcher',
      reason: 'macOS-only',
      alternative: 'Disabled on WSL',
    },
    {
      feature: 'sandbox-exec',
      reason: 'macOS-only',
      alternative: 'Docker sandbox or WSL isolation',
    },
  ],
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface PlatformReport {
  profile: PlatformProfile
  os: string
  arch: string
  cpuCores: number
  appleM: boolean
  hasGpu: boolean
  isDocker: boolean
  warnings: PlatformWarning[]
}

export function getPlatformReport(): PlatformReport {
  const profile = detectPlatform()
  const warnings = WARNINGS[profile] ?? []
  const p = platform()
  const r = release()
  const a = arch()

  let os = `${p} ${r}`
  if (p === 'darwin') os = `macOS ${r}`
  else if (p === 'linux') os = `Linux ${r}`
  else if (p === 'win32') os = `Windows ${r}`

  return {
    profile,
    os,
    arch: a,
    cpuCores: cpus().length,
    appleM: hasAppleSilicon(),
    hasGpu: profile === 'linux-gpu',
    isDocker: isDocker(),
    warnings,
  }
}

// ─── Print helpers ────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'

export function printPlatformSummary(report: PlatformReport): void {
  const { profile, os, arch: a, cpuCores, appleM, warnings } = report

  const gpuLabel = report.hasGpu ? `${GREEN}GPU${RESET}` : `${DIM}CPU only${RESET}`
  const mLabel = appleM ? ` ${CYAN}(Apple Silicon)${RESET}` : ''
  const dockerLabel = report.isDocker ? ` ${YELLOW}[container]${RESET}` : ''

  console.log(`\n${BOLD}Platform${RESET}`)
  console.log(`  OS      : ${os}${mLabel}${dockerLabel}`)
  console.log(`  Profile : ${profile}`)
  console.log(`  CPU     : ${cpuCores} cores  ${gpuLabel}`)

  if (warnings.length === 0) {
    console.log(`  ${GREEN}✓${RESET} All features available on this platform`)
    return
  }

  console.log(`\n  ${YELLOW}⚠${RESET}  ${warnings.length} feature(s) limited on this platform:`)
  for (const w of warnings) {
    console.log(`    ${YELLOW}•${RESET} ${w.feature} — ${DIM}${w.reason}${RESET}`)
    console.log(`      ${DIM}→ ${w.alternative}${RESET}`)
  }
  console.log(`\n  ${DIM}Run ${BOLD}rex doctor --platform${RESET}${DIM} for full details${RESET}`)
}

export function printPlatformDetail(report: PlatformReport): void {
  const { os, profile, cpuCores, appleM, hasGpu, isDocker, warnings } = report

  console.log(`\n${BOLD}REX Platform Report${RESET}`)
  console.log('─'.repeat(60))
  console.log(`  OS           : ${os}`)
  console.log(`  Profile      : ${profile}`)
  console.log(`  CPU cores    : ${cpuCores}`)
  console.log(`  Apple Silicon: ${appleM ? `${GREEN}yes${RESET}` : 'no'}`)
  console.log(`  GPU (NVIDIA) : ${hasGpu ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`}`)
  console.log(`  Container    : ${isDocker ? `${YELLOW}yes${RESET}` : 'no'}`)

  if (warnings.length === 0) {
    console.log(`\n  ${GREEN}✓${RESET} No platform limitations detected.`)
    return
  }

  console.log(`\n  ${BOLD}Feature Limitations (${warnings.length})${RESET}`)
  console.log('─'.repeat(60))
  for (const w of warnings) {
    console.log(`\n  ${YELLOW}⚠${RESET}  ${BOLD}${w.feature}${RESET}`)
    console.log(`     Reason  : ${w.reason}`)
    console.log(`     Fix     : ${CYAN}${w.alternative}${RESET}`)
  }
  console.log()
}
