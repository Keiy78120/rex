import { homedir } from 'node:os'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

// --- Config (loaded from settings.json) ---

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const STATE_FILE = join(homedir(), '.rex-memory', 'gateway-state.json')
const LOG_FILE = join(homedir(), '.claude', 'rex-gateway-commands.log')

interface GatewayConfig {
  macTailscaleIp: string
  macAddress: string
  vpsTailscaleIp: string
  pollTimeout: number
  maxOutputLength: number
}

function loadConfig(): GatewayConfig {
  const defaults: GatewayConfig = {
    macTailscaleIp: '100.112.24.122',
    macAddress: '52:f1:cf:b2:a5:32',
    vpsTailscaleIp: '100.86.167.118',
    pollTimeout: 30,
    maxOutputLength: 4000,
  }
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const gw = settings.env || {}
    return {
      macTailscaleIp: gw.REX_MAC_TAILSCALE_IP || defaults.macTailscaleIp,
      macAddress: gw.REX_MAC_ADDRESS || defaults.macAddress,
      vpsTailscaleIp: gw.REX_VPS_TAILSCALE_IP || defaults.vpsTailscaleIp,
      pollTimeout: parseInt(gw.REX_POLL_TIMEOUT || '') || defaults.pollTimeout,
      maxOutputLength: parseInt(gw.REX_MAX_OUTPUT || '') || defaults.maxOutputLength,
    }
  } catch {
    return defaults
  }
}

// --- State (persisted) ---

interface GatewayState {
  mode: 'qwen' | 'claude'
  lastActivity: string
  sessionsCount: number
}

function loadState(): GatewayState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch {}
  return { mode: 'qwen', lastActivity: new Date().toISOString(), sessionsCount: 0 }
}

function saveState(state: GatewayState) {
  try {
    const dir = join(homedir(), '.rex-memory')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch {}
}

let state = loadState()
let config = loadConfig()

// --- Logging ---

function logCommand(from: string, command: string, result: string) {
  try {
    const ts = new Date().toISOString()
    const entry = `[${ts}] @${from}: ${command} -> ${result.slice(0, 200)}\n`
    const dir = join(homedir(), '.claude')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(LOG_FILE, entry, { flag: 'a' })
  } catch {}
}

const COLORS = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m',
}

// --- Telegram API helpers ---

function getCredentials(): { token: string; chatId: string } | null {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const token = settings.env?.REX_TELEGRAM_BOT_TOKEN
    const chatId = settings.env?.REX_TELEGRAM_CHAT_ID
    if (token && chatId) return { token, chatId }
  } catch {}
  const token = process.env.REX_TELEGRAM_BOT_TOKEN
  const chatId = process.env.REX_TELEGRAM_CHAT_ID
  if (token && chatId) return { token, chatId }
  return null
}

async function tg(token: string, method: string, body: Record<string, any>) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json() as any
  } catch { return null }
}

async function send(token: string, chatId: string, text: string, keyboard?: any[][]) {
  const body: any = { chat_id: chatId, text, parse_mode: 'Markdown' }
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard }
  }
  return tg(token, 'sendMessage', body)
}

async function editMessage(token: string, chatId: string, messageId: number, text: string, keyboard?: any[][]) {
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' }
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard }
  }
  return tg(token, 'editMessageText', body)
}

async function answerCallback(token: string, callbackId: string, text?: string) {
  return tg(token, 'answerCallbackQuery', { callback_query_id: callbackId, text })
}

// --- Auth ---

function isAuthorized(msgChatId: string | number, authorizedChatId: string): boolean {
  return String(msgChatId) === String(authorizedChatId)
}

// --- Keyboards ---

function mainMenu() {
  return [
    [
      { text: '📊 Status', callback_data: 'status' },
      { text: '🩺 Doctor', callback_data: 'doctor' },
      { text: '🔍 Memory', callback_data: 'memory_menu' },
    ],
    [
      { text: '🖥 Git', callback_data: 'git' },
      { text: '⚡ Optimize', callback_data: 'optimize' },
      { text: '📥 Ingest', callback_data: 'ingest' },
    ],
    [
      { text: `🤖 Mode: ${state.mode === 'qwen' ? 'Qwen (local)' : 'Claude'}`, callback_data: 'switch_mode' },
      { text: '🧹 Prune', callback_data: 'prune' },
    ],
    [
      { text: '💤 Wake Mac', callback_data: 'wake_mac' },
      { text: '🔌 Mac Status', callback_data: 'mac_status' },
    ],
    [
      { text: '📋 Sessions', callback_data: 'sessions' },
      { text: '📝 Logs', callback_data: 'logs' },
    ],
  ]
}

function backButton() {
  return [[{ text: '◀️ Menu', callback_data: 'menu' }]]
}

function claudeMenu() {
  return [
    [
      { text: '💬 New Session', callback_data: 'claude_new' },
      { text: '📂 Continue Last', callback_data: 'claude_continue' },
    ],
    [
      { text: '📋 List Sessions', callback_data: 'claude_sessions' },
      { text: '🔄 Resume #', callback_data: 'claude_resume' },
    ],
    [{ text: '◀️ Menu', callback_data: 'menu' }],
  ]
}

// --- Shell helpers ---

function run(cmd: string, timeout = 30000): string {
  try {
    return execSync(cmd, { timeout, encoding: 'utf-8' }).trim()
  } catch (e: any) {
    return e.stderr?.trim() || e.message || 'Command failed'
  }
}

function strip(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

function truncate(text: string, max?: number): string {
  const limit = max || config.maxOutputLength
  if (text.length <= limit) return text
  return text.slice(0, limit) + '\n\n... (truncated)'
}

// --- Wake-on-LAN ---

async function wakeMac(): Promise<string> {
  try {
    const mac = config.macAddress.replace(/:/g, '')
    const pyCmd = `python3 -c "
import socket, struct
mac = bytes.fromhex('${mac}')
pkt = b'\\xff'*6 + mac*16
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
s.sendto(pkt, ('255.255.255.255', 9))
s.sendto(pkt, ('${config.macTailscaleIp}', 9))
s.close()
print('Magic packet sent')
"`
    const out = run(pyCmd, 5000)
    if (out.includes('Magic packet sent')) return '✅ Magic packet sent to Mac'
  } catch {}

  try {
    const ping = run(`ping -c 1 -W 2 ${config.macTailscaleIp} 2>/dev/null`, 5000)
    if (ping.includes('1 packets received') || ping.includes('1 received')) {
      return '✅ Mac is already awake (responds to ping)'
    }
  } catch {}

  return '⚠️ Magic packet sent — Mac may take 30s to wake'
}

async function checkMacStatus(): Promise<{ online: boolean; details: string }> {
  try {
    const ping = run(`ping -c 1 -W 3 ${config.macTailscaleIp} 2>/dev/null`, 5000)
    const online = ping.includes('1 packets received') || ping.includes('1 received')
    if (online) {
      const ts = run('tailscale status 2>/dev/null | head -5', 5000)
      return { online: true, details: ts }
    }
    return { online: false, details: 'Mac not responding to ping' }
  } catch {
    return { online: false, details: 'Ping failed' }
  }
}

// --- LLM ---

async function askLLM(prompt: string): Promise<string> {
  if (state.mode === 'qwen') {
    return askQwen(prompt)
  } else {
    return askClaude(prompt)
  }
}

async function askQwen(prompt: string): Promise<string> {
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!check.ok) return '⚠️ Ollama not running. /wake to wake Mac first.'
  } catch {
    return '⚠️ Ollama not running. Wake Mac first.'
  }

  const out = run(`rex llm "${prompt.replace(/"/g, '\\"').replace(/`/g, '\\`')}"`, 60000)
  if (!out || out.includes('rex-claude') || out.includes('Commands:')) {
    return '⚠️ LLM returned no useful response'
  }
  return truncate(out)
}

async function askClaude(prompt: string): Promise<string> {
  try {
    // Use Claude Code CLI in print mode for single-shot queries
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`')
    const out = run(`claude -p "${escapedPrompt}" 2>/dev/null`, 120000)
    if (out) return truncate(out)
    return '⚠️ Claude CLI not available or returned empty'
  } catch {
    return '⚠️ Claude CLI error'
  }
}

async function claudeSession(prompt: string, resume?: boolean): Promise<string> {
  try {
    const flag = resume ? '--continue' : ''
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`')
    const out = run(`claude ${flag} -p "${escapedPrompt}" 2>/dev/null`, 180000)
    state.sessionsCount++
    saveState(state)
    if (out) return truncate(out)
    return '⚠️ No response from Claude session'
  } catch {
    return '⚠️ Claude session error'
  }
}

// --- Callback handler ---

async function handleCallback(token: string, chatId: string, messageId: number, callbackId: string, data: string, from: string) {
  await answerCallback(token, callbackId)
  logCommand(from, `[btn] ${data}`, 'ok')

  switch (data) {
    case 'menu':
      await editMessage(token, chatId, messageId,
        '🦖 *REX Gateway v3*\nChoisis une action :',
        mainMenu()
      )
      break

    case 'status': {
      const out = strip(run('rex status'))
      await editMessage(token, chatId, messageId,
        `📊 *Status*\n${out}`,
        backButton()
      )
      break
    }

    case 'doctor': {
      await editMessage(token, chatId, messageId, '🩺 _Running diagnostics..._')
      const out = truncate(strip(run('rex doctor')))
      await editMessage(token, chatId, messageId,
        `🩺 *Doctor*\n\`\`\`\n${out}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'git': {
      const branch = run('git branch --show-current 2>/dev/null || echo "n/a"')
      const status = run('git status --short 2>/dev/null | head -15')
      const lastCommit = run('git log -1 --format="%s" 2>/dev/null || echo "n/a"')
      await editMessage(token, chatId, messageId,
        `🖥 *Git*\nBranch: \`${branch}\`\nLast: ${lastCommit}\n\`\`\`\n${status || 'Clean'}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'optimize': {
      await editMessage(token, chatId, messageId, '⚡ _Analyzing CLAUDE.md..._')
      const out = truncate(strip(run('rex optimize', 60000)), 3500)
      await editMessage(token, chatId, messageId,
        `⚡ *Optimize*\n\`\`\`\n${out}\n\`\`\``,
        [[
          { text: '🔧 Apply', callback_data: 'optimize_apply' },
          { text: '◀️ Menu', callback_data: 'menu' },
        ]]
      )
      break
    }

    case 'optimize_apply': {
      await editMessage(token, chatId, messageId, '🔧 _Applying optimizations..._')
      const out = truncate(strip(run('rex optimize --apply', 120000)), 3500)
      await editMessage(token, chatId, messageId,
        `🔧 *Applied*\n\`\`\`\n${out}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'ingest': {
      await editMessage(token, chatId, messageId, '📥 _Ingesting sessions..._')
      const out = truncate(strip(run('rex ingest', 120000)), 3500)
      await editMessage(token, chatId, messageId,
        `📥 *Ingest*\n\`\`\`\n${out}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'prune': {
      await editMessage(token, chatId, messageId, '🧹 _Pruning old memories..._')
      const out = truncate(strip(run('rex prune', 60000)))
      await editMessage(token, chatId, messageId,
        `🧹 *Prune*\n\`\`\`\n${out}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'memory_menu':
      await editMessage(token, chatId, messageId,
        '🔍 *Memory*\nEnvoie ta recherche en texte ou :',
        [
          [
            { text: '📥 Ingest Now', callback_data: 'ingest' },
            { text: '🧹 Prune', callback_data: 'prune' },
          ],
          [
            { text: '📊 Stats', callback_data: 'memory_stats' },
            { text: '◀️ Menu', callback_data: 'menu' },
          ],
        ]
      )
      break

    case 'memory_stats': {
      const out = run('rex prune --stats', 10000)
      await editMessage(token, chatId, messageId,
        `📊 *Memory Stats*\n\`\`\`\n${strip(out)}\n\`\`\``,
        backButton()
      )
      break
    }

    case 'switch_mode':
      state.mode = state.mode === 'qwen' ? 'claude' : 'qwen'
      state.lastActivity = new Date().toISOString()
      saveState(state)
      await editMessage(token, chatId, messageId,
        `🤖 Mode switched to *${state.mode === 'qwen' ? 'Qwen (local LLM)' : 'Claude (CLI)'}*`,
        mainMenu()
      )
      break

    case 'wake_mac': {
      await editMessage(token, chatId, messageId, '💤 _Sending wake signal..._')
      const result = await wakeMac()
      await new Promise(r => setTimeout(r, 3000))
      const status = await checkMacStatus()
      await editMessage(token, chatId, messageId,
        `💤 *Wake Mac*\n${result}\n\n🔌 ${status.online ? '🟢 Online' : '🔴 Offline'}\n\`${status.details}\``,
        [[
          { text: '🔄 Check Again', callback_data: 'mac_status' },
          { text: '◀️ Menu', callback_data: 'menu' },
        ]]
      )
      break
    }

    case 'mac_status': {
      await editMessage(token, chatId, messageId, '🔌 _Checking Mac..._')
      const status = await checkMacStatus()
      await editMessage(token, chatId, messageId,
        `🔌 *Mac Status*\n${status.online ? '🟢 Online' : '🔴 Offline'}\n\`\`\`\n${status.details}\n\`\`\``,
        [[
          { text: '💤 Wake', callback_data: 'wake_mac' },
          { text: '🔄 Refresh', callback_data: 'mac_status' },
          { text: '◀️ Menu', callback_data: 'menu' },
        ]]
      )
      break
    }

    case 'sessions': {
      await editMessage(token, chatId, messageId,
        `📋 *Claude Sessions*\nMode: *${state.mode}*\nSessions: ${state.sessionsCount}\nLast: ${state.lastActivity}`,
        claudeMenu()
      )
      break
    }

    case 'claude_new':
      await editMessage(token, chatId, messageId,
        '💬 *New Claude Session*\nEnvoie ta question/tache en texte. Claude va la traiter en mode session.',
        backButton()
      )
      break

    case 'claude_continue': {
      await editMessage(token, chatId, messageId, '📂 _Continuing last session..._')
      const out = await claudeSession('Continue the previous task. What was I working on?', true)
      await editMessage(token, chatId, messageId,
        `📂 *Session Continued*\n${out}`,
        [[
          { text: '💬 Reply', callback_data: 'claude_new' },
          { text: '◀️ Menu', callback_data: 'menu' },
        ]]
      )
      break
    }

    case 'claude_sessions': {
      const sessions = run('ls -lt ~/.claude/projects/ 2>/dev/null | head -10')
      await editMessage(token, chatId, messageId,
        `📋 *Recent Sessions*\n\`\`\`\n${strip(sessions)}\n\`\`\``,
        claudeMenu()
      )
      break
    }

    case 'claude_resume': {
      await editMessage(token, chatId, messageId,
        '🔄 *Resume Session*\nEnvoie le chemin du projet pour reprendre la session.',
        backButton()
      )
      break
    }

    case 'logs': {
      let logs = 'No logs yet'
      try {
        if (existsSync(LOG_FILE)) {
          logs = run(`tail -20 "${LOG_FILE}"`)
        }
      } catch {}
      await editMessage(token, chatId, messageId,
        `📝 *Recent Logs*\n\`\`\`\n${truncate(strip(logs), 3000)}\n\`\`\``,
        backButton()
      )
      break
    }
  }
}

// --- Text message handler ---

const BLOCKED_COMMANDS = [
  'rm -rf', 'rm -r /', 'mkfs', 'dd if=', ':(){', 'chmod -R 777',
  'git push --force main', 'git push --force master',
  'sudo rm', 'sudo chmod', 'eval ', 'curl | sh', 'curl | bash',
  'wget | sh', '> /dev/sd', 'shutdown', 'reboot', 'init 0',
]

async function handleText(token: string, chatId: string, text: string, from: string): Promise<void> {
  const cmd = text.trim().toLowerCase()

  // Slash commands
  if (cmd === '/start' || cmd === '/menu' || cmd === '/help' || cmd === '/h') {
    await send(token, chatId, '🦖 *REX Gateway v3*\nChoisis une action :', mainMenu())
    logCommand(from, cmd, 'menu')
    return
  }

  if (cmd === '/status' || cmd === '/s') {
    const out = strip(run('rex status'))
    await send(token, chatId, `📊 ${out}`, backButton())
    logCommand(from, '/status', out)
    return
  }

  if (cmd === '/wake' || cmd === '/w') {
    await send(token, chatId, '💤 _Sending wake signal..._')
    const result = await wakeMac()
    await send(token, chatId, result, backButton())
    logCommand(from, '/wake', result)
    return
  }

  if (cmd === '/doctor' || cmd === '/d') {
    await send(token, chatId, '🩺 _Running diagnostics..._')
    const out = truncate(strip(run('rex doctor')))
    await send(token, chatId, `🩺\n\`\`\`\n${out}\n\`\`\``, backButton())
    logCommand(from, '/doctor', 'done')
    return
  }

  if (cmd === '/ingest' || cmd === '/i') {
    await send(token, chatId, '📥 _Ingesting..._')
    const out = truncate(strip(run('rex ingest', 120000)))
    await send(token, chatId, `📥\n\`\`\`\n${out}\n\`\`\``, backButton())
    logCommand(from, '/ingest', 'done')
    return
  }

  if (cmd === '/prune') {
    await send(token, chatId, '🧹 _Pruning..._')
    const out = truncate(strip(run('rex prune', 60000)))
    await send(token, chatId, `🧹\n\`\`\`\n${out}\n\`\`\``, backButton())
    logCommand(from, '/prune', 'done')
    return
  }

  if (cmd.startsWith('/search ') || cmd.startsWith('/q ')) {
    const query = text.replace(/^\/(search|q)\s+/i, '')
    if (!query) { await send(token, chatId, 'Usage: /search <query>'); return }
    const out = run(`rex search ${query}`)
    await send(token, chatId,
      out ? `🔍 *Search:* ${query}\n\`\`\`\n${truncate(out, 3000)}\n\`\`\`` : 'No results',
      backButton()
    )
    logCommand(from, `/search ${query}`, out ? 'found' : 'empty')
    return
  }

  if (cmd.startsWith('/sh ') || cmd.startsWith('/run ')) {
    const shellCmd = text.replace(/^\/(sh|run)\s+/i, '')
    if (BLOCKED_COMMANDS.some(b => shellCmd.toLowerCase().includes(b))) {
      await send(token, chatId, '🚫 Blocked: dangerous command')
      logCommand(from, `/sh ${shellCmd}`, 'BLOCKED')
      return
    }
    const out = run(shellCmd)
    await send(token, chatId, `\`$ ${shellCmd}\`\n\`\`\`\n${truncate(out, 3500)}\n\`\`\``, backButton())
    logCommand(from, `/sh ${shellCmd}`, out.slice(0, 100))
    return
  }

  if (cmd.startsWith('/mode')) {
    state.mode = state.mode === 'qwen' ? 'claude' : 'qwen'
    state.lastActivity = new Date().toISOString()
    saveState(state)
    await send(token, chatId,
      `🤖 Switched to *${state.mode === 'qwen' ? 'Qwen (local)' : 'Claude'}*`,
      mainMenu()
    )
    logCommand(from, '/mode', state.mode)
    return
  }

  if (cmd === '/claude' || cmd === '/c') {
    await send(token, chatId, '🤖 *Claude Remote*\nGere tes sessions Claude a distance :', claudeMenu())
    return
  }

  if (cmd.startsWith('/claude ') || cmd.startsWith('/c ')) {
    const prompt = text.replace(/^\/(claude|c)\s+/i, '')
    await send(token, chatId, '🤖 _Claude is thinking..._')
    const out = await claudeSession(prompt)
    await send(token, chatId, out, [
      [
        { text: '💬 Continue', callback_data: 'claude_continue' },
        { text: '◀️ Menu', callback_data: 'menu' },
      ]
    ])
    logCommand(from, `/claude ${prompt.slice(0, 50)}`, out.slice(0, 100))
    return
  }

  // Free text -> send to current LLM
  if (text.length > 2) {
    const modeLabel = state.mode === 'qwen' ? '🧠 Qwen' : '🤖 Claude'
    await send(token, chatId, `${modeLabel} _thinking..._`)
    state.lastActivity = new Date().toISOString()
    saveState(state)

    let response: string
    if (state.mode === 'claude') {
      response = await claudeSession(text)
    } else {
      response = await askLLM(text)
    }

    await send(token, chatId, response, [
      [
        { text: `Mode: ${state.mode}`, callback_data: 'switch_mode' },
        { text: state.mode === 'claude' ? '💬 Continue' : '◀️ Menu', callback_data: state.mode === 'claude' ? 'claude_continue' : 'menu' },
      ]
    ])
    logCommand(from, text.slice(0, 80), response.slice(0, 100))
    return
  }

  await send(token, chatId, '🦖 *REX*\nEnvoie un message ou appuie sur Menu :', mainMenu())
}

// --- Main loop ---

export async function gateway() {
  const creds = getCredentials()
  if (!creds) {
    console.error(`${COLORS.red}No Telegram credentials found.${COLORS.reset}`)
    console.error(`Run ${COLORS.cyan}rex setup${COLORS.reset} to configure Telegram gateway.`)
    process.exit(1)
  }

  const { token, chatId } = creds
  config = loadConfig()
  state = loadState()

  console.log(`${COLORS.bold}REX Gateway v3${COLORS.reset} — Interactive Telegram bot`)
  console.log(`${COLORS.dim}Chat: ${chatId} | Mode: ${state.mode} | Sessions: ${state.sessionsCount}${COLORS.reset}`)
  console.log(`${COLORS.dim}Auth: restricted to chat_id ${chatId}${COLORS.reset}`)
  console.log(`${COLORS.dim}Ctrl+C to stop${COLORS.reset}\n`)

  // Flush old updates
  let offset = 0
  try {
    const flush = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1`)
    const flushData = await flush.json() as { result?: Array<{ update_id: number }> }
    if (flushData.result?.length) {
      offset = flushData.result[flushData.result.length - 1].update_id + 1
    }
  } catch {}

  await send(token, chatId, `🟢 *REX Gateway v3* started\nMode: ${state.mode} | Sessions: ${state.sessionsCount}`, mainMenu())

  process.on('SIGINT', async () => {
    console.log(`\n${COLORS.dim}Shutting down...${COLORS.reset}`)
    state.lastActivity = new Date().toISOString()
    saveState(state)
    await send(token, chatId, '🔴 *REX Gateway* stopped')
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    state.lastActivity = new Date().toISOString()
    saveState(state)
    await send(token, chatId, '🔴 *REX Gateway* stopped (SIGTERM)')
    process.exit(0)
  })

  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${config.pollTimeout}&allowed_updates=["message","callback_query"]`
      )

      const data = await res.json() as {
        ok: boolean
        result: Array<{
          update_id: number
          message?: { chat: { id: number }; text?: string; from?: { username?: string } }
          callback_query?: {
            id: string
            message?: { chat: { id: number }; message_id: number }
            data?: string
            from?: { username?: string }
          }
        }>
      }

      if (!data.ok || !data.result?.length) continue

      for (const update of data.result) {
        offset = update.update_id + 1

        // Handle callback (button press)
        if (update.callback_query) {
          const cb = update.callback_query
          const cbChatId = String(cb.message?.chat?.id)

          // AUTH CHECK
          if (!isAuthorized(cbChatId, chatId)) {
            await answerCallback(token, cb.id, '🚫 Unauthorized')
            continue
          }

          const from = cb.from?.username ?? '?'
          console.log(`${COLORS.cyan}@${from}${COLORS.reset} [btn] ${cb.data}`)

          await handleCallback(token, chatId, cb.message!.message_id, cb.id, cb.data!, from)
          continue
        }

        // Handle text message
        const msg = update.message
        if (!msg?.text) continue

        // AUTH CHECK
        if (!isAuthorized(msg.chat.id, chatId)) {
          await send(token, String(msg.chat.id), '🚫 Unauthorized. This REX instance is private.')
          continue
        }

        const from = msg.from?.username ?? '?'
        console.log(`${COLORS.cyan}@${from}${COLORS.reset}: ${msg.text}`)

        await handleText(token, chatId, msg.text, from)
      }
    } catch (err) {
      console.error(`${COLORS.red}Poll error:${COLORS.reset} ${(err as Error).message}`)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}
