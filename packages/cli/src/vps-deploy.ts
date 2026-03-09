/**
 * REX VPS Deployment
 * SSH-based provisioning: install rex-claude, configure daemon + gateway as systemd services.
 * Completes Phase 3 Brain VPS.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('vps-deploy')
const execFileAsync = promisify(execFile)

const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'

// ── SSH helper ──────────────────────────────────────────────

async function ssh(host: string, cmd: string, timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(
    'ssh',
    ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=10', host, cmd],
    { timeout }
  )
  return result
}

async function sshOk(host: string, cmd: string, timeout = 30_000): Promise<boolean> {
  try {
    await ssh(host, cmd, timeout)
    return true
  } catch {
    return false
  }
}

// ── Step helpers ─────────────────────────────────────────────

function step(n: number, total: number, label: string) {
  console.log(`\n${DIM}[${n}/${total}]${RESET} ${BOLD}${label}${RESET}`)
}

function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`) }
function warn(msg: string) { console.log(`  ${YELLOW}!${RESET} ${msg}`) }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`) }

// ── Load local env to push to VPS ────────────────────────────

function loadLocalEnv(): Record<string, string> {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return {}
  try {
    const s = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
    return (s.env as Record<string, string>) ?? {}
  } catch {
    return {}
  }
}

// ── Systemd service templates ─────────────────────────────────

function daemonService(envBlock: string): string {
  return `[Unit]
Description=REX Daemon
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/rex daemon
Restart=always
RestartSec=5
${envBlock}

[Install]
WantedBy=multi-user.target`
}

function gatewayService(envBlock: string): string {
  return `[Unit]
Description=REX Gateway (Telegram)
After=network.target rex-daemon.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/rex gateway
Restart=always
RestartSec=5
${envBlock}

[Install]
WantedBy=multi-user.target`
}

// ── Main deploy ───────────────────────────────────────────────

export interface DeployOptions {
  host: string        // user@hostname or IP
  nodeVersion?: string // default: '22'
  skipInstall?: boolean
  dryRun?: boolean
}

export async function deployVps(opts: DeployOptions): Promise<boolean> {
  const { host, nodeVersion = '22', skipInstall = false, dryRun = false } = opts
  const TOTAL_STEPS = 7

  console.log()
  console.log(`${BOLD}REX VPS Deployment${RESET}`)
  console.log(`${DIM}${'─'.repeat(48)}${RESET}`)
  console.log(`  Target: ${CYAN}${host}${RESET}`)
  if (dryRun) console.log(`  ${YELLOW}DRY RUN — no changes will be made${RESET}`)
  console.log()

  // Step 1: connectivity
  step(1, TOTAL_STEPS, 'Testing SSH connectivity')
  const reachable = await sshOk(host, 'echo ok', 10_000)
  if (!reachable) {
    fail(`Cannot reach ${host} via SSH. Check host/key.`)
    return false
  }
  ok('SSH connection established')

  if (dryRun) {
    console.log(`\n${YELLOW}Dry run complete — would proceed with ${TOTAL_STEPS} steps.${RESET}`)
    return true
  }

  // Step 2: detect OS
  step(2, TOTAL_STEPS, 'Detecting OS')
  let isDebian = false
  try {
    const { stdout } = await ssh(host, 'cat /etc/os-release 2>/dev/null || true')
    isDebian = stdout.includes('debian') || stdout.includes('ubuntu')
    ok(isDebian ? 'Debian/Ubuntu detected' : 'OS detected (non-Debian)')
  } catch {
    warn('Could not detect OS — assuming Debian/Ubuntu')
    isDebian = true
  }

  // Step 3: install Node.js
  step(3, TOTAL_STEPS, `Installing Node.js ${nodeVersion}`)
  if (skipInstall) {
    warn('Skipping Node.js install (--skip-install)')
  } else {
    const hasNode = await sshOk(host, 'which node')
    if (hasNode) {
      const { stdout } = await ssh(host, 'node --version')
      ok(`Node.js already installed: ${stdout.trim()}`)
    } else {
      const installCmd = isDebian
        ? `curl -fsSL https://deb.nodesource.com/setup_${nodeVersion}.x | bash - && apt-get install -y nodejs`
        : `curl -fsSL https://rpm.nodesource.com/setup_${nodeVersion}.x | bash - && yum install -y nodejs`
      try {
        await ssh(host, installCmd, 120_000)
        ok(`Node.js ${nodeVersion} installed`)
      } catch (e: unknown) {
        fail(`Node.js install failed: ${(e as Error).message?.slice(0, 120)}`)
        return false
      }
    }
  }

  // Step 4: install rex-claude
  step(4, TOTAL_STEPS, 'Installing rex-claude globally')
  if (skipInstall) {
    warn('Skipping rex-claude install (--skip-install)')
  } else {
    try {
      await ssh(host, 'npm install -g rex-claude 2>&1 | tail -5', 120_000)
      const { stdout } = await ssh(host, 'rex --version 2>/dev/null || echo unknown')
      ok(`rex-claude installed: ${stdout.trim()}`)
    } catch (e: unknown) {
      fail(`rex-claude install failed: ${(e as Error).message?.slice(0, 120)}`)
      return false
    }
  }

  // Step 5: push env vars
  step(5, TOTAL_STEPS, 'Pushing environment variables')
  const localEnv = loadLocalEnv()
  const keysToSync = [
    'REX_TELEGRAM_BOT_TOKEN',
    'REX_TELEGRAM_CHAT_ID',
    'REX_HUB_TOKEN',
    'OLLAMA_URL',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
  ]
  const envPairs: string[] = []
  for (const key of keysToSync) {
    if (localEnv[key]) envPairs.push(`${key}=${localEnv[key]}`)
  }

  if (envPairs.length > 0) {
    // Write to /etc/rex-env (sourced by systemd)
    const envContent = envPairs.join('\n')
    const writeCmd = `printf '${envContent.replace(/'/g, "'\\''")}\\n' > /etc/rex-env && chmod 600 /etc/rex-env`
    await ssh(host, writeCmd)
    ok(`${envPairs.length} env vars written to /etc/rex-env`)
  } else {
    warn('No env vars found in local settings.json — configure manually')
  }

  // Step 6: write systemd services
  step(6, TOTAL_STEPS, 'Installing systemd services')
  const envBlock = 'EnvironmentFile=-/etc/rex-env'

  const daemonSvc = daemonService(envBlock).replace(/\n/g, '\\n').replace(/'/g, "'\\''")
  const gatewaySvc = gatewayService(envBlock).replace(/\n/g, '\\n').replace(/'/g, "'\\''")

  await ssh(host, `printf '${daemonSvc}' > /etc/systemd/system/rex-daemon.service`)
  await ssh(host, `printf '${gatewaySvc}' > /etc/systemd/system/rex-gateway.service`)
  await ssh(host, 'systemctl daemon-reload && systemctl enable rex-daemon rex-gateway && systemctl restart rex-daemon rex-gateway')
  ok('rex-daemon + rex-gateway enabled and started')

  // Step 7: health check
  step(7, TOTAL_STEPS, 'Verifying deployment')
  await new Promise(r => setTimeout(r, 3000)) // give services 3s to start
  const daemonHealthy = await sshOk(host, 'systemctl is-active rex-daemon')
  const gatewayHealthy = await sshOk(host, 'systemctl is-active rex-gateway')
  const hubHealthy = await sshOk(host, 'curl -sf http://localhost:7420/api/health > /dev/null')

  ok(`rex-daemon: ${daemonHealthy ? `${GREEN}active${RESET}` : `${RED}failed${RESET}`}`)
  ok(`rex-gateway: ${gatewayHealthy ? `${GREEN}active${RESET}` : `${RED}failed${RESET}`}`)
  ok(`hub API: ${hubHealthy ? `${GREEN}reachable${RESET}` : `${YELLOW}not yet up (may need a moment)${RESET}`}`)

  const success = daemonHealthy && gatewayHealthy
  console.log()
  if (success) {
    console.log(`${GREEN}${BOLD}✓ VPS deployment complete${RESET}`)
    console.log(`  Commander hub: http://${host.split('@').pop()}:7420`)
    console.log(`  To register this node: ${CYAN}rex node register --hub=http://${host.split('@').pop()}:7420${RESET}`)
  } else {
    console.log(`${RED}${BOLD}Deployment incomplete — check logs: ssh ${host} journalctl -u rex-daemon -n 30${RESET}`)
  }
  console.log()

  return success
}

// ── Status check ─────────────────────────────────────────────

export async function checkVpsStatus(host: string): Promise<void> {
  console.log()
  console.log(`${BOLD}REX VPS Status — ${host}${RESET}`)
  console.log(`${DIM}${'─'.repeat(48)}${RESET}`)

  const reachable = await sshOk(host, 'echo ok', 5_000)
  if (!reachable) {
    fail('SSH unreachable')
    return
  }

  const checks: Array<{ label: string; cmd: string }> = [
    { label: 'rex-daemon', cmd: 'systemctl is-active rex-daemon' },
    { label: 'rex-gateway', cmd: 'systemctl is-active rex-gateway' },
    { label: 'Hub API', cmd: 'curl -sf http://localhost:7420/api/health > /dev/null' },
    { label: 'Node.js', cmd: 'node --version' },
    { label: 'rex-claude', cmd: 'rex --version' },
  ]

  for (const c of checks) {
    try {
      const { stdout } = await ssh(host, c.cmd, 5_000)
      const val = stdout.trim()
      ok(`${c.label}: ${GREEN}${val || 'ok'}${RESET}`)
    } catch {
      fail(`${c.label}: not running`)
    }
  }

  // Uptime + disk
  try {
    const { stdout: uptime } = await ssh(host, 'uptime -p 2>/dev/null || uptime | head -1')
    console.log(`  Uptime: ${DIM}${uptime.trim()}${RESET}`)
    const { stdout: disk } = await ssh(host, "df -h / | tail -1 | awk '{print $3\"/\"$2\" used\"}'")
    console.log(`  Disk:   ${DIM}${disk.trim()}${RESET}`)
  } catch { /* optional */ }
  console.log()
}
