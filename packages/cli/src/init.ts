import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

function log(icon: string, msg: string) {
  console.log(`  ${icon} ${msg}`)
}

function ok(msg: string) { log(`${COLORS.green}✓${COLORS.reset}`, msg) }
function skip(msg: string) { log(`${COLORS.yellow}→${COLORS.reset}`, `${COLORS.dim}${msg}${COLORS.reset}`) }
function info(msg: string) { log(`${COLORS.cyan}ℹ${COLORS.reset}`, msg) }

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function writeJson(path: string, data: any) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

const PLIST_LABEL = 'com.dstudio.rex'
const INGEST_PLIST_LABEL = 'com.dstudio.rex-ingest'
const GATEWAY_PLIST_LABEL = 'com.dstudio.rex-gateway'
const CALL_WATCH_PLIST_LABEL = 'com.dstudio.rex-call-watch'
const DAEMON_PLIST_LABEL = 'com.dstudio.rex-daemon'

export function installIngestAgent() {
  if (process.platform !== 'darwin') {
    info('Auto-ingest only supported on macOS')
    return
  }

  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  ensureDir(launchAgentsDir)
  const plistPath = join(launchAgentsDir, `${INGEST_PLIST_LABEL}.plist`)

  let rexBin = ''
  try {
    rexBin = execSync('which rex', { encoding: 'utf-8' }).trim()
  } catch {}

  if (!rexBin) {
    info('rex binary not in PATH — skipping ingest LaunchAgent')
    return
  }

  if (existsSync(plistPath)) {
    skip('Ingest LaunchAgent already installed (auto-ingest every hour)')
    return
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${INGEST_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${rexBin}</string>
    <string>ingest</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>${join(homedir(), '.claude', 'rex-ingest.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), '.claude', 'rex-ingest.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${dirname(rexBin)}</string>
  </dict>
</dict>
</plist>
`
  writeFileSync(plistPath, plist)

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  ok('Ingest LaunchAgent installed — auto-ingest every hour')
}

export function uninstallIngestAgent() {
  if (process.platform !== 'darwin') return

  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${INGEST_PLIST_LABEL}.plist`)
  if (!existsSync(plistPath)) {
    info('Ingest LaunchAgent not installed')
    return
  }

  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  try { unlinkSync(plistPath) } catch {}
  ok('Ingest LaunchAgent removed')
}

export function installGatewayAgent() {
  if (process.platform !== 'darwin') {
    info('Gateway LaunchAgent only supported on macOS')
    return
  }

  // Check if Telegram is configured
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  let hasTelegram = false
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    hasTelegram = !!(settings.env?.REX_TELEGRAM_BOT_TOKEN && settings.env?.REX_TELEGRAM_CHAT_ID)
  } catch {}
  if (!hasTelegram) {
    info('Telegram not configured — skipping gateway LaunchAgent (run rex setup first)')
    return
  }

  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  ensureDir(launchAgentsDir)
  const plistPath = join(launchAgentsDir, `${GATEWAY_PLIST_LABEL}.plist`)

  let rexBin = ''
  try {
    rexBin = execSync('which rex', { encoding: 'utf-8' }).trim()
  } catch {}

  if (!rexBin) {
    info('rex binary not in PATH — skipping gateway LaunchAgent')
    return
  }

  if (existsSync(plistPath)) {
    skip('Gateway LaunchAgent already installed (Telegram bot always-on)')
    return
  }

  // Read env vars from settings to inject into plist
  let botToken = ''
  let chatIdVal = ''
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    botToken = settings.env?.REX_TELEGRAM_BOT_TOKEN || ''
    chatIdVal = settings.env?.REX_TELEGRAM_CHAT_ID || ''
  } catch {}

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${GATEWAY_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${rexBin}</string>
    <string>gateway</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), '.claude', 'rex-gateway.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), '.claude', 'rex-gateway.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${dirname(rexBin)}</string>
    <key>REX_TELEGRAM_BOT_TOKEN</key>
    <string>${botToken}</string>
    <key>REX_TELEGRAM_CHAT_ID</key>
    <string>${chatIdVal}</string>
  </dict>
</dict>
</plist>
`
  writeFileSync(plistPath, plist)

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  ok('Gateway LaunchAgent installed — Telegram bot always-on (auto-restart)')
}

export function installDaemonAgent() {
  if (process.platform !== 'darwin') {
    info('Daemon LaunchAgent only supported on macOS')
    return
  }

  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  ensureDir(launchAgentsDir)
  const plistPath = join(launchAgentsDir, `${DAEMON_PLIST_LABEL}.plist`)

  let rexBin = ''
  try {
    rexBin = execSync('which rex', { encoding: 'utf-8' }).trim()
  } catch {}

  if (!rexBin) {
    info('rex binary not in PATH — skipping daemon LaunchAgent')
    return
  }

  if (existsSync(plistPath)) {
    skip('Daemon LaunchAgent already installed (unified background daemon)')
    return
  }

  // Read Telegram credentials from settings
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  let botToken = ''
  let chatIdVal = ''
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    botToken = settings.env?.REX_TELEGRAM_BOT_TOKEN || ''
    chatIdVal = settings.env?.REX_TELEGRAM_CHAT_ID || ''
  } catch {}

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${rexBin}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), '.claude', 'rex', 'daemon.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), '.claude', 'rex', 'daemon.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${dirname(rexBin)}</string>
    <key>REX_TELEGRAM_BOT_TOKEN</key>
    <string>${botToken}</string>
    <key>REX_TELEGRAM_CHAT_ID</key>
    <string>${chatIdVal}</string>
  </dict>
</dict>
</plist>
`
  writeFileSync(plistPath, plist)

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  ok('Daemon LaunchAgent installed — unified background daemon (KeepAlive)')
}

export function uninstallGatewayAgent() {
  if (process.platform !== 'darwin') return

  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${GATEWAY_PLIST_LABEL}.plist`)
  if (!existsSync(plistPath)) {
    info('Gateway LaunchAgent not installed')
    return
  }

  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  try { unlinkSync(plistPath) } catch {}
  ok('Gateway LaunchAgent removed')
}

export function installHammerspoonCallWatcher() {
  if (process.platform !== 'darwin') {
    info('Hammerspoon call watcher only supported on macOS')
    return
  }

  let hsBin = ''
  try {
    hsBin = execSync('which hs', { encoding: 'utf-8' }).trim()
  } catch {}

  if (!hsBin) {
    info('Hammerspoon CLI (hs) not found — skipping call watcher install')
    return
  }

  const hsDir = join(homedir(), '.hammerspoon')
  ensureDir(hsDir)

  const thisDir = dirname(fileURLToPath(import.meta.url))
  const sourceWatcher = join(thisDir, 'hammerspoon', 'rex-call-watcher.lua')
  const targetWatcher = join(hsDir, 'rex-call-watcher.lua')

  if (!existsSync(sourceWatcher)) {
    info('Bundled call watcher not found in rex-cli package')
    return
  }

  try {
    copyFileSync(sourceWatcher, targetWatcher)
    chmodSync(targetWatcher, 0o644)
    ok('Hammerspoon call watcher installed')
  } catch {
    info('Could not install Hammerspoon call watcher')
    return
  }

  const initLuaPath = join(hsDir, 'init.lua')
  const loaderBlock = `
-- REX Call Watcher (installed by rex init)
do
  local ok_rex_call, rex_call = pcall(dofile, os.getenv("HOME") .. "/.hammerspoon/rex-call-watcher.lua")
  if ok_rex_call and rex_call and rex_call.start then
    rex_call.start()
  end
end
`

  try {
    const current = existsSync(initLuaPath) ? readFileSync(initLuaPath, 'utf-8') : ''
    if (current.includes('rex-call-watcher.lua')) {
      skip('Hammerspoon init.lua already loads REX call watcher')
    } else {
      const next = current.endsWith('\n') || current.length === 0 ? current + loaderBlock : `${current}\n${loaderBlock}`
      writeFileSync(initLuaPath, next)
      ok('Hammerspoon init.lua patched to start call watcher')
    }
  } catch {
    info('Could not patch ~/.hammerspoon/init.lua automatically')
  }

  try {
    execSync(`${hsBin} -c "hs.reload()"`, { stdio: 'ignore' })
    ok('Hammerspoon config reloaded')
  } catch {
    skip('Could not auto-reload Hammerspoon config (reload manually in Hammerspoon)')
  }
}

export function installCallWatchAgent() {
  if (process.platform !== 'darwin') {
    info('Call watch LaunchAgent only supported on macOS')
    return
  }

  const watcherPath = join(homedir(), '.hammerspoon', 'rex-call-watcher.lua')
  if (!existsSync(watcherPath)) {
    info('Hammerspoon call watcher not installed — skipping call watch LaunchAgent')
    return
  }

  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  ensureDir(launchAgentsDir)
  const plistPath = join(launchAgentsDir, `${CALL_WATCH_PLIST_LABEL}.plist`)

  let rexBin = ''
  try {
    rexBin = execSync('which rex', { encoding: 'utf-8' }).trim()
  } catch {}

  if (!rexBin) {
    info('rex binary not in PATH — skipping call watch LaunchAgent')
    return
  }

  if (existsSync(plistPath)) {
    skip('Call watch LaunchAgent already installed (auto audio logger)')
    return
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CALL_WATCH_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${rexBin}</string>
    <string>call</string>
    <string>watch</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), '.claude', 'rex-call-watch.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), '.claude', 'rex-call-watch.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:${dirname(rexBin)}</string>
  </dict>
</dict>
</plist>
`

  writeFileSync(plistPath, plist)

  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  ok('Call watch LaunchAgent installed — auto audio logger on call start/end')
}

export function uninstallCallWatchAgent() {
  if (process.platform !== 'darwin') return

  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${CALL_WATCH_PLIST_LABEL}.plist`)
  if (!existsSync(plistPath)) return

  try {
    execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  try { unlinkSync(plistPath) } catch {}
  ok('Call watch LaunchAgent removed')
}

export function installApp() {
  if (process.platform !== 'darwin') return

  // Find app bundle — check release first, then debug build output.
  const thisDir = new URL('.', import.meta.url).pathname
  const releaseBuild = join(thisDir, '..', '..', 'flutter_app', 'build', 'macos', 'Build', 'Products', 'Release', 'rex_app.app')
  const debugBuild = join(thisDir, '..', '..', 'flutter_app', 'build', 'macos', 'Build', 'Products', 'Debug', 'rex_app.app')
  const buildApp = existsSync(releaseBuild) ? releaseBuild : debugBuild
  const installedApp = '/Applications/rex_app.app'
  const legacyApp = '/Applications/REX.app'

  if (existsSync(installedApp)) {
    skip('rex_app.app already in /Applications')
  } else if (existsSync(buildApp)) {
    try {
      execSync(`ditto "${buildApp}" "${installedApp}"`, { stdio: 'ignore' })
      ok('rex_app.app installed to /Applications')
      try {
        execSync(`ln -sfn "${installedApp}" "${legacyApp}"`, { stdio: 'ignore' })
      } catch {}
    } catch {
      info('Could not copy rex_app.app to /Applications (try manually)')
      return
    }
  } else {
    info('App not built — run `rex app update` (or `flutter build macos --debug`) in packages/flutter_app first')
    return
  }

  // Add to Login Items
  try {
    execSync(`osascript -e 'tell application "System Events" to make login item at end with properties {path:"${installedApp}", hidden:false}'`, { stdio: 'ignore' })
    ok('rex_app.app added to Login Items (auto-start on login)')
  } catch {
    skip('rex_app.app already in Login Items')
  }
}

export function installStartup() {
  if (process.platform !== 'darwin') {
    info('Startup auto-launch only supported on macOS')
    return
  }

  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents')
  ensureDir(launchAgentsDir)
  const plistPath = join(launchAgentsDir, `${PLIST_LABEL}.plist`)

  // Find rex binary
  let rexBin = ''
  try {
    rexBin = execSync('which rex', { encoding: 'utf-8' }).trim()
  } catch {
    // Fallback: npx
    rexBin = ''
  }

  if (!rexBin) {
    info('rex binary not in PATH — skipping LaunchAgent (install globally first)')
    return
  }

  if (existsSync(plistPath)) {
    skip('LaunchAgent already installed (auto-start on login)')
    return
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${rexBin}</string>
    <string>doctor</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>${join(homedir(), '.claude', 'rex-doctor.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), '.claude', 'rex-doctor.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:${dirname(rexBin)}</string>
  </dict>
</dict>
</plist>
`
  writeFileSync(plistPath, plist)

  // Load the agent
  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'ignore' })
  } catch {}

  ok('LaunchAgent installed — rex runs at login + every hour')
}

export function uninstallStartup() {
  if (process.platform !== 'darwin') return

  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`)
  if (!existsSync(plistPath)) {
    info('LaunchAgent not installed')
  } else {
    try { execSync(`launchctl unload ${plistPath}`, { stdio: 'ignore' }) } catch {}
    try { unlinkSync(plistPath) } catch {}
    ok('LaunchAgent removed')
  }

  uninstallIngestAgent()
  uninstallGatewayAgent()
  uninstallCallWatchAgent()
}

export async function init() {
  const claudeDir = join(homedir(), '.claude')
  const line = '═'.repeat(45)

  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX INIT — Setup${COLORS.reset}`)
  console.log(`${line}\n`)

  // 1. Find memory package path
  let memoryServerPath: string | null = null
  {
    const thisDir = new URL('.', import.meta.url).pathname
    const candidates = [
      join(thisDir, '..', '..', 'memory', 'src', 'server.ts'),
      join(homedir(), '.rex-memory', 'src', 'server.ts'),
    ]
    for (const c of candidates) {
      if (existsSync(c)) {
        memoryServerPath = c
        break
      }
    }
  }

  // 2. Configure MCP server for rex-memory
  const settingsPath = join(claudeDir, 'settings.json')
  ensureDir(claudeDir)

  const settings = readJson(settingsPath) ?? {}
  if (!settings.mcpServers) settings.mcpServers = {}

  if (settings.mcpServers['rex-memory']) {
    skip('MCP server rex-memory already configured')
  } else if (memoryServerPath) {
    const serverDir = join(memoryServerPath, '..', '..')
    settings.mcpServers['rex-memory'] = {
      command: 'npx',
      args: ['tsx', memoryServerPath],
      cwd: serverDir,
    }
    writeJson(settingsPath, settings)
    ok('MCP server rex-memory configured')
  } else {
    info('Memory package not found — install @rex/memory or run from monorepo')
  }

  // 2b. Sync optional MCP registry into settings (auto-bootstrap)
  const registryPath = join(homedir(), '.rex-memory', 'mcp-registry.json')
  if (existsSync(registryPath)) {
    try {
      const registry = readJson(registryPath)
      const registryServers = registry?.servers as Record<string, any> | undefined
      if (registryServers && typeof registryServers === 'object') {
        let added = 0
        for (const [name, cfg] of Object.entries(registryServers)) {
          if (!settings.mcpServers[name]) {
            settings.mcpServers[name] = cfg
            added++
          }
        }
        if (added > 0) {
          writeJson(settingsPath, settings)
          ok(`MCP registry synced (${added} server${added > 1 ? 's' : ''} added)`)
        } else {
          skip('MCP registry already synced')
        }
      }
    } catch {
      info('MCP registry exists but could not be parsed')
    }
  }

  // 3. Setup hooks
  if (!settings.hooks) settings.hooks = {}

  // 3a. SessionEnd → auto-ingest transcript to memory
  const hasIngestHook = settings.hooks.SessionEnd?.some?.((h: any) =>
    h.hooks?.some?.((hh: any) => hh.command?.includes('rex') && hh.command?.includes('ingest'))
  )

  if (hasIngestHook) {
    skip('Auto-ingest hook (SessionEnd) already configured')
  } else {
    if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = []
    settings.hooks.SessionEnd.push({
      hooks: [{
        type: 'command',
        command: 'npx rex-cli ingest 2>/dev/null &',
        timeout: 5,
      }],
    })
    ok('Auto-ingest hook configured (SessionEnd)')
  }

  // 3b. SessionStart → inject REX context
  const hasContextHook = settings.hooks.SessionStart?.some?.((h: any) =>
    h.hooks?.some?.((hh: any) => hh.command?.includes('rex-context'))
  )

  // Always refresh context script so new automation logic is applied.
  const contextScript = join(claudeDir, 'rex-context.sh')
  writeFileSync(contextScript, `#!/bin/bash
# REX Context Injection — runs at session start
# Outputs relevant memory context to CLAUDE_ENV_FILE

if [ -z "$CLAUDE_ENV_FILE" ]; then
  exit 0
fi

PROJECT_PATH="\${CLAUDE_PROJECT_DIR:-$PWD}"

# Quick check if rex-memory MCP is available
if command -v npx &>/dev/null; then
  # Context will be loaded via MCP rex_context tool
  # This hook just ensures the env is ready
  echo "REX_MEMORY_AVAILABLE=true" >> "$CLAUDE_ENV_FILE"
fi

# Auto tool/skill recommendations (LLM-assisted)
if command -v rex &>/dev/null; then
  rex agents recommend "$PROJECT_PATH" --quiet --env-file "$CLAUDE_ENV_FILE" >/dev/null 2>&1 || true
elif command -v npx &>/dev/null; then
  npx rex-cli agents recommend "$PROJECT_PATH" --quiet --env-file "$CLAUDE_ENV_FILE" >/dev/null 2>&1 || true
fi
`, { mode: 0o755 })

  if (hasContextHook) {
    skip('Context injection hook (SessionStart) already configured')
  } else {
    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = []
    settings.hooks.SessionStart.push({
      hooks: [{
        type: 'command',
        command: `bash ${contextScript}`,
        timeout: 20,
      }],
    })
    ok('Context injection hook configured (SessionStart)')
  }

  // 4. Install REX Guards (hooks that prevent common LLM mistakes)
  const guardsDir = join(claudeDir, 'rex-guards')
  ensureDir(guardsDir)

  const thisDir = dirname(fileURLToPath(import.meta.url))
  const srcGuardsDir = join(thisDir, 'guards')

  const GUARDS = [
    {
      file: 'completion-guard.sh',
      event: 'Stop',
      desc: 'Completion verifier (prevents 70% problem)',
      matcher: undefined,
    },
    {
      file: 'dangerous-cmd-guard.sh',
      event: 'PreToolUse',
      desc: 'Dangerous command blocker',
      matcher: 'Bash',
    },
    {
      file: 'secret-guard.sh',
      event: 'PreToolUse',
      desc: 'Secret/API key leak prevention (BLOCK)',
      matcher: 'Write|Edit',
    },
    {
      file: 'session-summary.sh',
      event: 'Stop',
      desc: 'Auto session summary',
      matcher: undefined,
    },
    {
      // Combined guard: test-protect + ui-checklist + scope + any-type + console-log
      file: 'post-edit-guard.sh',
      event: 'PostToolUse',
      desc: 'Combined edit guard (test, UI states, scope, any-type, console.log)',
      matcher: 'Edit|Write',
    },
    {
      file: 'error-pattern-guard.sh',
      event: 'PostToolUse',
      desc: 'Recurring error pattern detector',
      matcher: 'Bash',
    },
    {
      file: 'notify-telegram.sh',
      event: 'Stop',
      desc: 'Telegram notification on task completion',
      matcher: undefined,
    },
  ]

  let guardsInstalled = 0
  for (const guard of GUARDS) {
    const destPath = join(guardsDir, guard.file)
    const srcPath = join(srcGuardsDir, guard.file)

    // Copy guard script to ~/.claude/rex-guards/
    if (existsSync(srcPath)) {
      writeFileSync(destPath, readFileSync(srcPath, 'utf-8'), { mode: 0o755 })
    } else if (!existsSync(destPath)) {
      continue
    }

    // Check if this guard is already hooked
    const event = guard.event as string
    if (!settings.hooks[event]) settings.hooks[event] = []

    const alreadyInstalled = settings.hooks[event].some((h: any) =>
      h.hooks?.some?.((hh: any) => hh.command?.includes(guard.file))
    )

    if (!alreadyInstalled) {
      const hookEntry: any = {
        hooks: [{
          type: 'command',
          command: `bash ${destPath}`,
          timeout: 10,
        }],
      }
      if (guard.matcher) hookEntry.matcher = guard.matcher
      settings.hooks[event].push(hookEntry)
      guardsInstalled++
    }
  }

  if (guardsInstalled > 0) {
    ok(`${guardsInstalled} REX guards installed (completion, safety, UI, scope)`)
  } else {
    skip('All REX guards already installed')
  }

  // 5. Install LaunchAgents (auto-start on login)
  installStartup()
  installIngestAgent()
  installGatewayAgent()
  installDaemonAgent()
  installHammerspoonCallWatcher()
  installCallWatchAgent()

  // 5b. Install REX.app to /Applications + Login Items (if built)
  installApp()

  // 6. Check Ollama (required for embeddings)
  let ollamaOk = false
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    ollamaOk = res.ok
  } catch {}

  if (ollamaOk) {
    ok('Ollama running')
    // Check for embedding model
    try {
      const res = await fetch('http://localhost:11434/api/tags')
      const data = await res.json() as { models: Array<{ name: string }> }
      const hasNomic = data.models?.some((m: any) => m.name?.includes('nomic-embed-text'))
      if (hasNomic) {
        ok('nomic-embed-text model available')
      } else {
        info('Pull embedding model: ollama pull nomic-embed-text')
      }
    } catch {}
  } else {
    info('Ollama not running — needed for memory/RAG. Install: https://ollama.ai')
  }

  // 7. Sync bundled skills to ~/.claude/skills/
  const bundledSkillsDir = join(thisDir, '..', 'skills')
  if (existsSync(bundledSkillsDir)) {
    const skillsTargetDir = join(claudeDir, 'skills')
    ensureDir(skillsTargetDir)
    let skillsSynced = 0
    try {
      const skillDirs = readdirSync(bundledSkillsDir).filter(d => {
        try { return statSync(join(bundledSkillsDir, d)).isDirectory() } catch { return false }
      })
      for (const skill of skillDirs) {
        const srcSkill = join(bundledSkillsDir, skill, 'SKILL.md')
        const destSkillDir = join(skillsTargetDir, skill)
        const destSkill = join(destSkillDir, 'SKILL.md')
        if (existsSync(srcSkill)) {
          const srcContent = readFileSync(srcSkill, 'utf-8')
          const destContent = existsSync(destSkill) ? readFileSync(destSkill, 'utf-8') : ''
          if (srcContent !== destContent) {
            ensureDir(destSkillDir)
            writeFileSync(destSkill, srcContent)
            skillsSynced++
          }
        }
      }
    } catch {}
    if (skillsSynced > 0) {
      ok(`${skillsSynced} skills synced from rex-claude`)
    } else {
      skip('All skills up to date')
    }
  }

  // 8. Ensure memory runtime deps in ~/.rex-memory/ (used by prune/search bridge)
  const memoryMonorepoDir = join(thisDir, '..', '..', 'memory')
  const memoryTargetDir = join(homedir(), '.rex-memory')
  ensureDir(memoryTargetDir)
  const runtimePkgPath = join(memoryTargetDir, 'package.json')
  const runtimePkg = {
    name: 'rex-memory-runtime',
    private: true,
    type: 'module',
    dependencies: {
      'better-sqlite3': '^11.8.1',
      'sqlite-vec': '^0.1.6',
    },
  }

  try {
    let shouldInstall = false
    if (!existsSync(runtimePkgPath)) {
      writeJson(runtimePkgPath, runtimePkg)
      shouldInstall = true
    } else {
      const existing = readJson(runtimePkgPath) || {}
      const deps = existing.dependencies || {}
      if (!deps['better-sqlite3'] || !deps['sqlite-vec']) {
        writeJson(runtimePkgPath, {
          ...existing,
          private: true,
          type: existing.type || 'module',
          dependencies: {
            ...deps,
            'better-sqlite3': deps['better-sqlite3'] || '^11.8.1',
            'sqlite-vec': deps['sqlite-vec'] || '^0.1.6',
          },
        })
        shouldInstall = true
      }
    }

    if (!existsSync(join(memoryTargetDir, 'node_modules', 'better-sqlite3'))) {
      shouldInstall = true
    }

    if (shouldInstall) {
      execSync('npm install --production 2>/dev/null', { cwd: memoryTargetDir, stdio: 'ignore' })
      ok('Memory runtime dependencies installed in ~/.rex-memory/')
    } else {
      skip('Memory runtime dependencies already present')
    }
  } catch {
    if (existsSync(join(memoryMonorepoDir, 'package.json')) && !existsSync(join(memoryTargetDir, 'src'))) {
      try {
        execSync(`cp -R "${memoryMonorepoDir}/." "${memoryTargetDir}/"`, { stdio: 'ignore' })
        execSync('npm install --production 2>/dev/null', { cwd: memoryTargetDir, stdio: 'ignore' })
        ok('@rex/memory synced to ~/.rex-memory/')
      } catch {
        info('Could not sync @rex/memory — install manually')
      }
    } else {
      info('Could not sync @rex/memory — install manually')
    }
  }

  // 9. Save settings
  writeJson(settingsPath, settings)

  console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}`)
  console.log(`\n${COLORS.bold}  REX initialized!${COLORS.reset}`)
  console.log(`\n  Next steps:`)
  if (!ollamaOk) {
    console.log(`    1. Install Ollama: ${COLORS.cyan}https://ollama.ai${COLORS.reset}`)
    console.log(`    2. Pull model: ${COLORS.cyan}ollama pull nomic-embed-text${COLORS.reset}`)
    console.log(`    3. Ingest history: ${COLORS.cyan}rex ingest${COLORS.reset}`)
  } else {
    console.log(`    1. Ingest session history: ${COLORS.cyan}rex ingest${COLORS.reset}`)
  }
  console.log(`    •  Run ${COLORS.cyan}rex doctor${COLORS.reset} to verify setup`)
  console.log()
}
