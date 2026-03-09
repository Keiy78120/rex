import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform, totalmem } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { init, installDaemonAgent, installGatewayAgent, installApp } from './init.js'
import { setup } from './setup.js'
import { audit } from './audit.js'
import { createLogger } from './logger.js'
import { ensureRexDirs } from './paths.js'
import { loadConfig, saveConfig } from './config.js'

const log = createLogger('install')

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

function ok(msg: string) { console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`) }
function info(msg: string) { console.log(`  ${COLORS.cyan}i${COLORS.reset} ${msg}`) }
function warn(msg: string) { console.log(`  ${COLORS.yellow}!${COLORS.reset} ${msg}`) }

export type InstallProfile = 'local-dev' | 'desktop-full' | 'headless-node' | 'hub-vps' | 'gpu-node'

interface InstallOptions {
  profile?: InstallProfile
  yes?: boolean
}

interface ResourceReport {
  os: string
  ramGB: number
  node: boolean
  nodeVersion: string
  git: boolean
  ollama: boolean
  flutter: boolean
  brew: boolean
  systemd: boolean
  gpu: boolean
}

const PROFILES: Record<InstallProfile, { label: string; desc: string; steps: string[] }> = {
  'local-dev': {
    label: 'Local Dev',
    desc: 'CLI + guards + memory (minimal setup for Claude Code companion)',
    steps: ['init', 'setup-ollama'],
  },
  'desktop-full': {
    label: 'Desktop Full',
    desc: 'CLI + guards + memory + daemon + gateway + Flutter app (macOS)',
    steps: ['init', 'setup-ollama', 'daemon', 'gateway', 'flutter-app'],
  },
  'headless-node': {
    label: 'Headless Node',
    desc: 'CLI + guards + memory + daemon (server, no GUI)',
    steps: ['init', 'setup-ollama', 'daemon', 'systemd-hint'],
  },
  'hub-vps': {
    label: 'Hub VPS',
    desc: 'CLI + daemon + hub API (centralized server)',
    steps: ['init', 'setup-ollama', 'daemon', 'systemd-hint', 'hub-hint'],
  },
  'gpu-node': {
    label: 'GPU Node',
    desc: 'CLI + daemon + Ollama large models (GPU inference specialist)',
    steps: ['init', 'setup-ollama', 'daemon', 'systemd-hint', 'gpu-hint'],
  },
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function detectResources(): ResourceReport {
  const os = platform()
  const ramGB = Math.round(totalmem() / (1024 ** 3))

  let nodeVersion = ''
  try { nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim() } catch {}

  let systemd = false
  if (os === 'linux') {
    try {
      execSync('systemctl --version', { stdio: 'ignore' })
      systemd = true
    } catch {}
  }

  let gpu = false
  try {
    if (os === 'darwin') {
      const info = execSync('system_profiler SPDisplaysDataType 2>/dev/null', { encoding: 'utf-8' })
      gpu = info.includes('Metal')
    } else if (os === 'linux') {
      execSync('nvidia-smi', { stdio: 'ignore' })
      gpu = true
    }
  } catch {}

  return {
    os,
    ramGB,
    node: commandExists('node'),
    nodeVersion,
    git: commandExists('git'),
    ollama: commandExists('ollama'),
    flutter: commandExists('flutter'),
    brew: commandExists('brew'),
    systemd,
    gpu,
  }
}

function printResources(res: ResourceReport) {
  console.log(`\n  ${COLORS.bold}Detected Resources${COLORS.reset}`)
  const dot = (ok: boolean) => ok ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.red}●${COLORS.reset}`
  console.log(`  ${dot(true)} OS: ${res.os}, ${res.ramGB}GB RAM`)
  console.log(`  ${dot(res.node)} Node.js: ${res.nodeVersion || 'not found'}`)
  console.log(`  ${dot(res.git)} Git: ${res.git ? 'available' : 'not found'}`)
  console.log(`  ${dot(res.ollama)} Ollama: ${res.ollama ? 'installed' : 'not found'}`)
  console.log(`  ${dot(res.flutter)} Flutter: ${res.flutter ? 'available' : 'not found'}`)
  console.log(`  ${dot(res.gpu)} GPU: ${res.gpu ? (res.os === 'darwin' ? 'Metal' : 'NVIDIA') : 'not detected'}`)
  if (res.os === 'darwin') console.log(`  ${dot(res.brew)} Homebrew: ${res.brew ? 'available' : 'not found'}`)
  if (res.os === 'linux') console.log(`  ${dot(res.systemd)} systemd: ${res.systemd ? 'available' : 'not found'}`)
}

function printProfiles(res: ResourceReport) {
  console.log(`\n  ${COLORS.bold}Available Profiles${COLORS.reset}\n`)
  const profiles = Object.entries(PROFILES) as [InstallProfile, typeof PROFILES[InstallProfile]][]
  for (let i = 0; i < profiles.length; i++) {
    const [key, p] = profiles[i]
    let note = ''
    if (key === 'desktop-full' && res.os !== 'darwin') note = ` ${COLORS.dim}(macOS only)${COLORS.reset}`
    if (key === 'hub-vps' && res.os === 'darwin') note = ` ${COLORS.dim}(typically Linux VPS)${COLORS.reset}`
    if (key === 'gpu-node' && !res.gpu) note = ` ${COLORS.dim}(no GPU detected)${COLORS.reset}`
    console.log(`  ${COLORS.cyan}${i + 1}${COLORS.reset}) ${COLORS.bold}${p.label}${COLORS.reset}${note}`)
    console.log(`     ${COLORS.dim}${p.desc}${COLORS.reset}`)
  }
}

function suggestProfile(res: ResourceReport): InstallProfile {
  if (res.os === 'darwin' && res.flutter) return 'desktop-full'
  if (res.os === 'darwin') return 'local-dev'
  if (res.gpu && res.systemd) return 'gpu-node'
  if (res.systemd) return 'headless-node'
  return 'local-dev'
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(`  ${COLORS.cyan}?${COLORS.reset} ${question} `, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function selectProfile(res: ResourceReport, nonInteractive: boolean): Promise<InstallProfile> {
  const suggested = suggestProfile(res)

  if (nonInteractive) {
    info(`Auto-selected profile: ${COLORS.bold}${suggested}${COLORS.reset}`)
    return suggested
  }

  printProfiles(res)
  const profileKeys = Object.keys(PROFILES) as InstallProfile[]
  const suggestedIdx = profileKeys.indexOf(suggested) + 1

  const answer = await prompt(`Select profile [1-5] (default: ${suggestedIdx} = ${suggested}):`)
  if (!answer) return suggested

  const num = parseInt(answer, 10)
  if (num >= 1 && num <= 5) return profileKeys[num - 1]

  // Try matching by name
  const match = profileKeys.find(k => k === answer || k.startsWith(answer))
  if (match) return match

  warn(`Unknown selection "${answer}", using ${suggested}`)
  return suggested
}

async function runStep(step: string, res: ResourceReport) {
  switch (step) {
    case 'init':
      console.log(`\n  ${COLORS.bold}Step: Guards + Hooks + Memory${COLORS.reset}`)
      await init()
      break

    case 'setup-ollama':
      console.log(`\n  ${COLORS.bold}Step: Ollama + Models${COLORS.reset}`)
      await setup({
        nonInteractive: true,
        autoInstallDeps: true,
        skipTelegram: process.env.REX_SKIP_TELEGRAM === '1',
      })
      break

    case 'daemon':
      console.log(`\n  ${COLORS.bold}Step: Background Daemon${COLORS.reset}`)
      if (res.os === 'darwin') {
        installDaemonAgent()
      } else {
        info('Daemon will run via systemd on Linux (see systemd-hint step)')
      }
      break

    case 'gateway':
      console.log(`\n  ${COLORS.bold}Step: Telegram Gateway${COLORS.reset}`)
      if (res.os === 'darwin') {
        installGatewayAgent()
      } else {
        info('Gateway can be started manually: rex gateway')
      }
      break

    case 'flutter-app':
      console.log(`\n  ${COLORS.bold}Step: Flutter Desktop App${COLORS.reset}`)
      if (res.os !== 'darwin') {
        info('Flutter app currently targets macOS only')
        return
      }
      if (!res.flutter) {
        info('Flutter not found — skip app build (install Flutter SDK to enable)')
        return
      }

      // Check if app is already built
      const thisDir = new URL('.', import.meta.url).pathname
      const flutterDir = join(thisDir, '..', '..', 'flutter_app')
      if (!existsSync(flutterDir)) {
        info('Flutter app source not found in monorepo — skipping')
        return
      }

      info('Building Flutter app (this may take a few minutes)...')
      try {
        execSync('flutter build macos --debug', { cwd: flutterDir, stdio: 'inherit' })
        ok('Flutter app built')
        installApp()
      } catch {
        warn('Flutter build failed — you can retry manually: cd packages/flutter_app && flutter build macos --debug')
      }
      break

    case 'systemd-hint':
      if (res.os !== 'linux') return
      console.log(`\n  ${COLORS.bold}Step: systemd Service${COLORS.reset}`)

      let rexBin = ''
      try { rexBin = execSync('which rex', { encoding: 'utf-8' }).trim() } catch {}
      if (!rexBin) rexBin = '/usr/local/bin/rex'

      const unit = `[Unit]
Description=REX Daemon
After=network.target

[Service]
Type=simple
User=${process.env.USER || 'node'}
ExecStart=${rexBin} daemon
Restart=always
Environment=OLLAMA_URL=${process.env.OLLAMA_URL || 'http://localhost:11434'}

[Install]
WantedBy=multi-user.target`

      info('Suggested systemd unit for rex daemon:')
      console.log(`\n${COLORS.dim}${unit}${COLORS.reset}\n`)
      info(`Save to /etc/systemd/system/rex-daemon.service then:`)
      info(`  sudo systemctl daemon-reload && sudo systemctl enable --now rex-daemon`)
      break

    case 'hub-hint':
      console.log(`\n  ${COLORS.bold}Step: Hub API${COLORS.reset}`)
      info('Hub API is not yet implemented — tracked in CLAUDE.md roadmap')
      info('The daemon provides health checks, ingest, and maintenance in the meantime')
      break

    case 'gpu-hint':
      console.log(`\n  ${COLORS.bold}Step: GPU Inference Setup${COLORS.reset}`)
      if (res.gpu) {
        info(`GPU detected (${res.os === 'darwin' ? 'Metal/Apple Silicon' : 'NVIDIA'})`)
        info('Recommended large models for Ollama:')
        if (res.ramGB >= 24) {
          info('  ollama pull qwen2.5:14b   (14B — good balance)')
          info('  ollama pull deepseek-r1:14b (14B — reasoning)')
        } else if (res.ramGB >= 16) {
          info('  ollama pull qwen2.5:7b    (7B — fast)')
          info('  ollama pull deepseek-r1:8b (8B — reasoning)')
        } else {
          info('  ollama pull qwen2.5:3b    (3B — lightweight)')
        }
        info('Run: ollama pull <model> to download')
      } else {
        warn('No GPU detected — GPU Node profile is more effective with a GPU')
        info('You can still use Ollama with CPU (smaller models recommended)')
      }
      break
  }
}

function printSummary(profile: InstallProfile, res: ResourceReport) {
  const p = PROFILES[profile]
  const line = COLORS.dim + '-'.repeat(45) + COLORS.reset

  console.log(`\n${line}`)
  console.log(`\n  ${COLORS.green}${COLORS.bold}REX install complete!${COLORS.reset}`)
  console.log(`  Profile: ${COLORS.bold}${p.label}${COLORS.reset} (${profile})`)
  console.log(`  OS: ${res.os}, ${res.ramGB}GB RAM\n`)

  const installed: string[] = []
  for (const step of p.steps) {
    switch (step) {
      case 'init': installed.push('Guards, hooks, memory MCP, skills'); break
      case 'setup-ollama': installed.push('Ollama + embedding/reasoning models'); break
      case 'daemon': installed.push('Background daemon (auto-start)'); break
      case 'gateway': installed.push('Telegram gateway (auto-start)'); break
      case 'flutter-app': if (res.flutter) installed.push('Flutter desktop app'); break
      case 'gpu-hint': installed.push('GPU inference recommendations printed'); break
    }
  }

  for (const item of installed) {
    console.log(`  ${COLORS.green}●${COLORS.reset} ${item}`)
  }

  console.log(`\n  Next: run ${COLORS.cyan}rex doctor${COLORS.reset} to verify everything`)
  console.log()
}

function printDryRun(profile: InstallProfile, res: ResourceReport) {
  const p = PROFILES[profile]
  const line = COLORS.dim + '-'.repeat(45) + COLORS.reset
  console.log(`\n${line}`)
  console.log(`\n  ${COLORS.bold}[DRY RUN] Would install profile: ${p.label}${COLORS.reset}`)
  console.log(`  ${COLORS.dim}${p.desc}${COLORS.reset}\n`)
  console.log(`  Steps that would run:`)
  for (const step of p.steps) {
    const labels: Record<string, string> = {
      'init': 'Install guards, hooks, memory MCP',
      'setup-ollama': 'Install / configure Ollama + models',
      'daemon': res.os === 'darwin' ? 'Install daemon LaunchAgent' : 'Print systemd unit hint',
      'gateway': res.os === 'darwin' ? 'Install gateway LaunchAgent' : 'Print gateway start hint',
      'flutter-app': res.flutter ? 'Build + install Flutter desktop app' : 'Skip (Flutter SDK not found)',
      'systemd-hint': 'Print systemd unit for daemon',
      'hub-hint': 'Print hub API setup hint',
      'gpu-hint': res.gpu ? 'Print GPU model recommendations' : 'Print GPU setup hint (no GPU detected)',
    }
    console.log(`  ${COLORS.cyan}→${COLORS.reset} ${labels[step] ?? step}`)
  }
  console.log(`\n  ${COLORS.dim}Run without --dry-run to execute.${COLORS.reset}\n`)
}

export async function install(options: InstallOptions = {}) {
  const profileFlag = options.profile
    || process.argv.find(a => a.startsWith('--profile='))?.split('=')[1] as InstallProfile | undefined
  const nonInteractive = options.yes
    || process.argv.includes('--yes')
    || process.argv.includes('-y')
  const dryRun = process.argv.includes('--dry-run')

  const line = '='.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX INSTALL — One Command Setup${dryRun ? ' [DRY RUN]' : ''}${COLORS.reset}`)
  console.log(`${line}`)

  ensureRexDirs()

  // 1. Detect resources
  const res = detectResources()
  printResources(res)

  if (!res.node) {
    console.log(`\n  ${COLORS.red}Node.js is required. Install it first.${COLORS.reset}\n`)
    process.exitCode = 1
    return
  }

  // 2. Select profile
  let profile: InstallProfile
  if (profileFlag && profileFlag in PROFILES) {
    profile = profileFlag as InstallProfile
    info(`Using profile: ${COLORS.bold}${profile}${COLORS.reset}`)
  } else if (profileFlag) {
    warn(`Unknown profile "${profileFlag}"`)
    profile = await selectProfile(res, nonInteractive || dryRun)
  } else {
    profile = await selectProfile(res, nonInteractive || dryRun)
  }

  // Warn if desktop-full on non-macOS
  if (profile === 'desktop-full' && res.os !== 'darwin') {
    warn('desktop-full profile targets macOS — Flutter app step will be skipped')
  }

  // Dry run: print plan and exit
  if (dryRun) {
    printDryRun(profile, res)
    return
  }

  const p = PROFILES[profile]
  log.info(`Starting install with profile: ${profile}`)

  // 3. Execute steps
  for (const step of p.steps) {
    await runStep(step, res)
  }

  // 4. Post-install doctor
  console.log(`\n  ${COLORS.bold}Post-install verification${COLORS.reset}`)
  try {
    await audit({ strict: false })
  } catch {
    warn('Post-install audit had warnings — run rex doctor for details')
  }

  // 5. Save profile in config
  const config = loadConfig()
  ;(config as any).installProfile = profile
  saveConfig(config)

  // 6. Summary
  printSummary(profile, res)
}
