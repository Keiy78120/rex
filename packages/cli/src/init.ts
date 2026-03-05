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

export function installApp() {
  if (process.platform !== 'darwin') return

  // Find REX.app — check build output or /Applications
  const thisDir = new URL('.', import.meta.url).pathname
  const buildApp = join(thisDir, '..', '..', 'flutter_app', 'build', 'macos', 'Build', 'Products', 'Release', 'rex_app.app')
  const installedApp = '/Applications/REX.app'

  if (existsSync(installedApp)) {
    skip('REX.app already in /Applications')
  } else if (existsSync(buildApp)) {
    try {
      execSync(`cp -R "${buildApp}" "${installedApp}"`, { stdio: 'ignore' })
      ok('REX.app installed to /Applications')
    } catch {
      info('Could not copy REX.app to /Applications (try manually)')
      return
    }
  } else {
    info('REX.app not built — run: cd packages/flutter_app && flutter build macos')
    return
  }

  // Add to Login Items
  try {
    execSync(`osascript -e 'tell application "System Events" to make login item at end with properties {path:"${installedApp}", hidden:false}'`, { stdio: 'ignore' })
    ok('REX.app added to Login Items (auto-start on login)')
  } catch {
    skip('REX.app already in Login Items')
  }
}

export function installHammerspoonCallWatcher() {
  if (process.platform !== 'darwin') return

  const hsDir = join(homedir(), '.hammerspoon')
  ensureDir(hsDir)
  ensureDir(join(homedir(), '.rex-memory', 'runtime'))

  const watcherPath = join(hsDir, 'rex-call-watcher.lua')
  const watcherLua = `-- REX Call Watcher
-- Detects known voice apps (Discord/Zoom/Meet/Slack/Teams/WhatsApp/FaceTime)
-- and writes a machine-readable state for local automations.

local M = {}

local HOME = os.getenv("HOME") or ""
local STATE_PATH = HOME .. "/.rex-memory/runtime/call-state.json"
local EVENTS_PATH = HOME .. "/.rex-memory/runtime/call-events.jsonl"

local VOICE_APPS = {
  ["Discord"] = true,
  ["zoom.us"] = true,
  ["Microsoft Teams"] = true,
  ["Slack"] = true,
  ["WhatsApp"] = true,
  ["FaceTime"] = true,
  ["Telegram"] = true,
}

local BROWSER_APPS = {
  ["Google Chrome"] = true,
  ["Arc"] = true,
  ["Brave Browser"] = true,
  ["Safari"] = true,
  ["Microsoft Edge"] = true,
}

local BROWSER_KEYWORDS = {
  "google meet",
  " meet",
  " huddle",
  "slack call",
  "discord",
  "voice",
  "call",
}

local watcher = nil
local heartbeat = nil

local current = {
  active = false,
  app = "",
  reason = "",
  title = "",
  startedAt = 0,
  updatedAt = 0,
}

local function ensureRuntimeDir()
  os.execute('mkdir -p "' .. HOME .. '/.rex-memory/runtime"')
end

local function writeState(state)
  ensureRuntimeDir()
  local f = io.open(STATE_PATH, "w")
  if not f then return end
  f:write(hs.json.encode(state))
  f:close()
end

local function appendEvent(ev)
  ensureRuntimeDir()
  local f = io.open(EVENTS_PATH, "a")
  if not f then return end
  f:write(hs.json.encode(ev) .. "\\n")
  f:close()
end

local function titleLooksLikeCall(title)
  if not title then return false end
  local t = string.lower(title)
  for _, kw in ipairs(BROWSER_KEYWORDS) do
    if string.find(t, kw, 1, true) then
      return true
    end
  end
  return false
end

local function detectCall(appName)
  if VOICE_APPS[appName] then
    return true, "voice_app"
  end

  if BROWSER_APPS[appName] then
    local win = hs.window.frontmostWindow()
    local title = win and win:title() or ""
    if titleLooksLikeCall(title) then
      return true, "browser_title", title
    end
  end

  return false, "", ""
end

local function updateFromFrontmost()
  local app = hs.application.frontmostApplication()
  local appName = app and app:name() or ""
  local now = os.time()
  local active, reason, title = detectCall(appName)

  if active and not current.active then
    current.active = true
    current.app = appName
    current.reason = reason
    current.title = title or ""
    current.startedAt = now
    current.updatedAt = now

    appendEvent({
      type = "call_start",
      app = current.app,
      reason = current.reason,
      title = current.title,
      timestamp = now,
      iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
    })
  elseif active and current.active then
    current.updatedAt = now
    if current.app ~= appName then
      current.app = appName
      current.reason = reason
      current.title = title or ""
    end
  elseif (not active) and current.active then
    local duration = math.max(0, now - (current.startedAt or now))
    appendEvent({
      type = "call_end",
      app = current.app,
      reason = current.reason,
      title = current.title,
      duration = duration,
      startedAt = current.startedAt,
      endedAt = now,
      iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
    })

    current.active = false
    current.app = ""
    current.reason = ""
    current.title = ""
    current.startedAt = 0
    current.updatedAt = now
  end

  writeState({
    active = current.active,
    app = current.app,
    reason = current.reason,
    title = current.title,
    startedAt = current.startedAt,
    updatedAt = current.updatedAt,
    iso = os.date("!%Y-%m-%dT%H:%M:%SZ", now),
  })
end

function M.start()
  if watcher then return end

  watcher = hs.application.watcher.new(function(_, eventType, _)
    if eventType == hs.application.watcher.activated then
      updateFromFrontmost()
    end
  end)
  watcher:start()

  -- Keep state fresh even if app title changes without app switch (browser tabs).
  heartbeat = hs.timer.doEvery(5, updateFromFrontmost)
  updateFromFrontmost()
  hs.printf("REX Call Watcher started")
end

function M.stop()
  if watcher then
    watcher:stop()
    watcher = nil
  end
  if heartbeat then
    heartbeat:stop()
    heartbeat = nil
  end
end

return M
`

  writeFileSync(watcherPath, watcherLua)
  ok('Hammerspoon call watcher script installed (~/.hammerspoon/rex-call-watcher.lua)')

  const hsInitPath = join(hsDir, 'init.lua')
  const marker = 'rex-call-watcher.lua'
  const block = `
-- REX Call Watcher (installed by rex init)
do
  local ok_rex_call, rex_call = pcall(dofile, os.getenv("HOME") .. "/.hammerspoon/rex-call-watcher.lua")
  if ok_rex_call and rex_call and rex_call.start then
    rex_call.start()
  end
end
`

  const currentInit = existsSync(hsInitPath) ? readFileSync(hsInitPath, 'utf-8') : ''
  if (!currentInit.includes(marker)) {
    writeFileSync(hsInitPath, currentInit + block)
    ok('Hammerspoon init.lua updated with REX call watcher bootstrap')
  } else {
    skip('Hammerspoon init.lua already includes REX call watcher')
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
      file: 'test-protect-guard.sh',
      event: 'PostToolUse',
      desc: 'Test assertion protector',
      matcher: 'Edit|Write',
    },
    {
      file: 'session-summary.sh',
      event: 'Stop',
      desc: 'Auto session summary',
      matcher: undefined,
    },
    {
      file: 'ui-checklist-guard.sh',
      event: 'PostToolUse',
      desc: 'UI states checklist (loading/error/empty)',
      matcher: 'Edit|Write',
    },
    {
      file: 'scope-guard.sh',
      event: 'PostToolUse',
      desc: 'Scope creep detector',
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

  // 8. Sync @rex/memory to ~/.rex-memory/ if not present
  const memoryMonorepoDir = join(thisDir, '..', '..', 'memory')
  const memoryTargetDir = join(homedir(), '.rex-memory')
  if (existsSync(join(memoryMonorepoDir, 'package.json')) && !existsSync(join(memoryTargetDir, 'package.json'))) {
    try {
      execSync(`cp -R "${memoryMonorepoDir}" "${memoryTargetDir}"`, { stdio: 'ignore' })
      execSync('npm install --production 2>/dev/null', { cwd: memoryTargetDir, stdio: 'ignore' })
      ok('@rex/memory synced to ~/.rex-memory/')
    } catch {
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
