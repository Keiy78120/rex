import { homedir, hostname as getHostname } from 'node:os'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execSync, execFileSync } from 'node:child_process'
import { appendEvent, getQueueStats, getUnacked, ackEvent } from './sync-queue.js'
import { discoverHub } from './node.js'
import { routeTask } from './node-mesh.js'

// --- PID lockfile (single instance guard) ---

const LOCK_FILE = join(homedir(), '.rex-memory', 'gateway.lock')

function acquireLock(): boolean {
  const pid = process.pid
  try {
    if (existsSync(LOCK_FILE)) {
      const existing = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (existing && existing !== pid) {
        // Check if process is still alive
        try {
          process.kill(existing, 0) // signal 0 = check existence
          return false // another instance is running
        } catch {
          // Process dead, stale lock — take over
        }
      }
    }
    const dir = join(homedir(), '.rex-memory')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(LOCK_FILE, String(pid))
    return true
  } catch {
    return false
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const content = readFileSync(LOCK_FILE, 'utf-8').trim()
      if (parseInt(content, 10) === process.pid) {
        unlinkSync(LOCK_FILE)
      }
    }
  } catch {}
}

// --- Config (loaded from settings.json) ---

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const STATE_FILE = join(homedir(), '.rex-memory', 'gateway-state.json')
const LOG_FILE = join(homedir(), '.claude', 'rex-gateway-commands.log')
const UPLOADS_ROOT = join(homedir(), '.rex-memory', 'gateway-uploads')
const NOTIFS_FILE = join(homedir(), '.rex-memory', 'notifications.json')
const MAX_UPLOADS = 200
const UPLOAD_RETENTION_DAYS = Math.max(1, parseInt(process.env.REX_UPLOAD_RETENTION_DAYS || '10', 10) || 10)
const MAX_MEDIA_MB = Math.max(1, parseInt(process.env.REX_GATEWAY_MAX_MEDIA_MB || '20', 10) || 20)
const MAX_MEDIA_BYTES = MAX_MEDIA_MB * 1024 * 1024
const AUTO_UPLOAD_ANALYZE = process.env.REX_GATEWAY_AUTO_ANALYZE_UPLOADS !== '0'
const AUTO_UPLOAD_MODE: 'qwen' | 'claude' = (process.env.REX_GATEWAY_AUTO_ANALYZE_MODE || 'claude').toLowerCase() === 'qwen'
  ? 'qwen'
  : 'claude'
const AUTO_UPLOAD_TASK = process.env.REX_GATEWAY_AUTO_ANALYZE_TASK
  || 'Parse this uploaded file and produce a concise coding-oriented brief with next actions.'

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
  localModel: string | null   // null = auto-detect
  claudeModel: string | null  // null = default (sonnet-4-6)
  lastActivity: string
  sessionsCount: number
  uploads: UploadEntry[]
}

interface UploadEntry {
  id: string
  chatId: string
  from: string
  kind: 'document' | 'photo' | 'audio' | 'voice' | 'video'
  filePath: string
  fileName: string
  mimeType: string
  size: number
  caption?: string
  uploadedAt: string
}

function loadState(): GatewayState {
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as Partial<GatewayState>
      return {
        mode: parsed.mode === 'claude' ? 'claude' : 'qwen',
        localModel: parsed.localModel || null,
        claudeModel: parsed.claudeModel || null,
        lastActivity: parsed.lastActivity || new Date().toISOString(),
        sessionsCount: typeof parsed.sessionsCount === 'number' ? parsed.sessionsCount : 0,
        uploads: Array.isArray(parsed.uploads) ? parsed.uploads as UploadEntry[] : [],
      }
    }
  } catch {}
  return { mode: 'qwen', localModel: null, claudeModel: null, lastActivity: new Date().toISOString(), sessionsCount: 0, uploads: [] }
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
let activeStreamController: AbortController | null = null

// --- Degrade mode ---

let degradeMode = false
let lastHubCheck = 0
const HUB_CHECK_INTERVAL = 60_000  // check hub every 60s
const gatewayStartTime = Date.now()

async function checkHubReachable(): Promise<boolean> {
  const now = Date.now()
  if (now - lastHubCheck < HUB_CHECK_INTERVAL) return !degradeMode
  lastHubCheck = now

  const hubUrl = await discoverHub()
  const wasDegrade = degradeMode
  degradeMode = hubUrl === null

  if (wasDegrade && !degradeMode) {
    console.log(`${COLORS.green}Hub recovered — exiting degrade mode${COLORS.reset}`)
    try { appendEvent('hub.event', { event: 'degrade_exit', reason: 'hub_recovered' }) } catch {}
    // Notify user about spooled messages
    try {
      const creds = getCredentials()
      if (creds) {
        const spooled = getUnacked().filter(
          e => e.type === 'gateway.message' && (e.payload as any)?.direction === 'spooled'
        )
        if (spooled.length > 0) {
          await send(
            creds.token,
            creds.chatId,
            `🟢 Hub recovered. ${spooled.length} message${spooled.length > 1 ? 's were' : ' was'} spooled while offline.\nSend /replay to reprocess them.`
          )
        }
      }
    } catch {}
  } else if (!wasDegrade && degradeMode) {
    console.log(`${COLORS.yellow}Hub unreachable — entering degrade mode${COLORS.reset}`)
    try { appendEvent('hub.event', { event: 'degrade_enter', reason: 'hub_unreachable' }) } catch {}
  }

  return !degradeMode
}

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

// --- Notifications ---

interface Notification {
  id: string
  ts: string
  project: string
  title: string
  message: string
  priority: 'urgent' | 'high' | 'normal' | 'low'
  read: boolean
}

function loadNotifications(): Notification[] {
  try {
    return JSON.parse(readFileSync(NOTIFS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveNotifications(notifs: Notification[]) {
  try {
    const dir = join(homedir(), '.rex-memory')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(NOTIFS_FILE, JSON.stringify(notifs.slice(-500), null, 2))
  } catch {}
}

function addNotification(project: string, title: string, message: string, priority: Notification['priority'] = 'normal') {
  const notifs = loadNotifications()
  notifs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    project,
    title,
    message,
    priority,
    read: false,
  })
  saveNotifications(notifs)
}

function priorityEmoji(p: string): string {
  return p === 'urgent' ? '🚨' : p === 'high' ? '🔴' : p === 'low' ? '🔵' : '🔔'
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}j`
}

function buildNotifsMessage(project: string | null, page: number): { text: string; buttons: any[][] } {
  const allNotifs = loadNotifications()
  const filtered = project && project !== 'all' ? allNotifs.filter(n => n.project === project) : allNotifs
  const sorted = [...filtered].reverse()
  const PAGE_SIZE = 5
  const total = sorted.length
  const start = page * PAGE_SIZE
  const items = sorted.slice(start, start + PAGE_SIZE)
  const projects = [...new Set(allNotifs.map(n => n.project))].sort()

  const header = project && project !== 'all'
    ? `🔔 *Notifs — ${project}*`
    : `🔔 *Notifications* (${total})`
  const unread = filtered.filter(n => !n.read).length
  const subtitle = unread > 0 ? `_${unread} non lue(s)_` : '_Tout lu_'

  if (items.length === 0) {
    return {
      text: `${header}\n\n_Aucune notification_`,
      buttons: [[{ text: '◀️ Menu', callback_data: 'menu' }]],
    }
  }

  const lines = items.map(n => {
    const status = n.read ? '✅' : priorityEmoji(n.priority)
    const proj = n.project
    const msg = n.message ? `\n   _${n.message.slice(0, 100)}_` : ''
    return `${status} *[${proj}]* ${n.title} — _${timeAgo(n.ts)} ago_${msg}`
  })
  const text = `${header}\n${subtitle}\n\n${lines.join('\n\n')}`

  // Project filter row
  const filterBtns = [{ text: project === 'all' || !project ? '• Toutes •' : 'Toutes', callback_data: 'notif_filter_all' }]
  for (const p of projects.slice(0, 5)) {
    filterBtns.push({ text: p === project ? `• ${p} •` : p, callback_data: `notif_filter_${p}` })
  }

  // Nav + actions row
  const navBtns: any[] = []
  if (start > 0) navBtns.push({ text: '◀', callback_data: `notif_page_${page - 1}_${project || 'all'}` })
  if (start + PAGE_SIZE < total) navBtns.push({ text: '▶', callback_data: `notif_page_${page + 1}_${project || 'all'}` })
  if (unread > 0) navBtns.push({ text: '✅ Tout lire', callback_data: `notif_markall_${project || 'all'}` })

  const buttons: any[][] = [filterBtns]
  if (navBtns.length) buttons.push(navBtns)
  buttons.push([{ text: '◀️ Menu', callback_data: 'menu' }])

  return { text, buttons }
}

function ensureUploadsDir() {
  if (!existsSync(UPLOADS_ROOT)) mkdirSync(UPLOADS_ROOT, { recursive: true })
}

function slugFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'upload'
}

function rememberUpload(entry: UploadEntry) {
  state.uploads.push(entry)
  if (state.uploads.length > MAX_UPLOADS) {
    state.uploads = state.uploads.slice(-MAX_UPLOADS)
  }
  saveState(state)
}

function recentUploads(chatId: string, limit = 10): UploadEntry[] {
  return state.uploads
    .filter((u) => u.chatId === chatId)
    .slice(-limit)
    .reverse()
}

function latestUpload(chatId: string): UploadEntry | null {
  const list = recentUploads(chatId, 1)
  return list.length ? list[0] : null
}

function cleanupOldUploads() {
  ensureUploadsDir()
  const now = Date.now()
  const maxAgeMs = UPLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000
  try {
    const files = readdirSync(UPLOADS_ROOT)
    for (const file of files) {
      const full = join(UPLOADS_ROOT, file)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      if ((now - st.mtimeMs) > maxAgeMs) {
        try { unlinkSync(full) } catch {}
      }
    }
  } catch {}

  const existing = new Set<string>()
  try {
    for (const file of readdirSync(UPLOADS_ROOT)) {
      existing.add(join(UPLOADS_ROOT, file))
    }
  } catch {}
  state.uploads = state.uploads.filter((u) => existing.has(u.filePath))
  saveState(state)
}

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
    const json = await res.json() as any
    if (!json?.ok && method !== 'getUpdates') {
      console.error(`${COLORS.dim}TG ${method} failed: ${json?.description || res.status}${COLORS.reset}`)
    }
    return json
  } catch (e: any) {
    console.error(`${COLORS.dim}TG ${method} error: ${e?.message || e}${COLORS.reset}`)
    return null
  }
}

async function send(token: string, chatId: string, text: string, keyboard?: any[][]) {
  const body: any = { chat_id: chatId, text, parse_mode: 'Markdown' }
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard }
  }
  const result = await tg(token, 'sendMessage', body)
  try { appendEvent('gateway.message', { direction: 'outbound', chatId, text: text?.slice(0, 500) }) } catch {}
  return result
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
      { text: '📋 Standup', callback_data: 'standup' },
      { text: '📝 Logs', callback_data: 'logs' },
      { text: '📎 Files', callback_data: 'files_menu' },
    ],
    [
      { text: '🔔 Notifs', callback_data: 'notifs' },
      { text: '🧭 Advanced', callback_data: 'advanced_menu' },
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

function advancedMenu() {
  return [
    [
      { text: '🧠 Agents', callback_data: 'agents_menu' },
      { text: '🔌 MCP', callback_data: 'mcp_menu' },
    ],
    [
      { text: '🧪 Audit', callback_data: 'audit' },
      { text: '📝 Logs', callback_data: 'logs' },
    ],
    [
      { text: '🎛 Modèles', callback_data: 'models_menu' },
      { text: '🆓 Free tiers', callback_data: 'free_tiers' },
    ],
    [
      { text: '🔑 Pool', callback_data: 'pool' },
      { text: '📊 Burn rate', callback_data: 'burn_rate' },
    ],
    [
      { text: '⚡ Setup', callback_data: 'quick_setup' },
      { text: '🔍 Review', callback_data: 'run_review' },
    ],
    [
      { text: '🔭 Curious', callback_data: 'curious_check' },
      { text: '📊 Monitor', callback_data: 'dev_monitor' },
    ],
    [{ text: '◀️ Menu', callback_data: 'menu' }],
  ]
}

function modelsMenu() {
  const local = state.localModel || 'auto'
  const claude = state.claudeModel || 'sonnet-4-6'
  return [
    [{ text: `🧠 Local: ${local}`, callback_data: 'models_local_menu' }],
    [
      { text: `qwen2.5:1.5b`, callback_data: 'set_local_qwen2.5:1.5b' },
      { text: `qwen3.5:4b`, callback_data: 'set_local_qwen3.5:4b' },
      { text: `qwen3.5:9b`, callback_data: 'set_local_qwen3.5:9b' },
      { text: `auto`, callback_data: 'set_local_auto' },
    ],
    [{ text: `🤖 Claude: ${claude}`, callback_data: 'models_claude_menu' }],
    [
      { text: `haiku-4-5`, callback_data: 'set_claude_claude-haiku-4-5-20251001' },
      { text: `sonnet-4-6`, callback_data: 'set_claude_claude-sonnet-4-6' },
      { text: `opus-4-6`, callback_data: 'set_claude_claude-opus-4-6' },
    ],
    [{ text: '◀️ Advanced', callback_data: 'advanced_menu' }],
  ]
}

function agentsMenu() {
  return [
    [
      { text: '🔄 Refresh', callback_data: 'agents_menu' },
      { text: '📦 Profiles', callback_data: 'agents_profiles' },
    ],
    [
      { text: '➕ Read', callback_data: 'agents_create_read' },
      { text: '➕ Review', callback_data: 'agents_create_review' },
    ],
    [
      { text: '▶️ Start all', callback_data: 'agents_start_all' },
      { text: '⏹ Stop all', callback_data: 'agents_stop_all' },
    ],
    [{ text: '◀️ Advanced', callback_data: 'advanced_menu' }],
  ]
}

function mcpMenu() {
  return [
    [
      { text: '🔄 Refresh', callback_data: 'mcp_menu' },
      { text: '🔁 Sync Claude', callback_data: 'mcp_sync' },
    ],
    [
      { text: '✅ Check enabled', callback_data: 'mcp_check_enabled' },
      { text: '📤 Export', callback_data: 'mcp_export' },
    ],
    [{ text: '◀️ Advanced', callback_data: 'advanced_menu' }],
  ]
}

function filesMenu() {
  return [
    [
      { text: '🆕 Last file', callback_data: 'file_last' },
      { text: '📚 List', callback_data: 'files_list' },
    ],
    [
      { text: '🤖 Analyze Claude', callback_data: 'file_analyze_claude' },
      { text: '🧠 Analyze Qwen', callback_data: 'file_analyze_qwen' },
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

function runRex(args: string[], timeout = 30000): string {
  try {
    return execFileSync('rex', args, { timeout, encoding: 'utf-8' }).trim()
  } catch (e: any) {
    const stderr = e?.stderr?.toString?.().trim?.() || ''
    const stdout = e?.stdout?.toString?.().trim?.() || ''
    return stderr || stdout || e.message || 'Command failed'
  }
}

function runRexJson(args: string[], timeout = 30000): any | null {
  const raw = strip(runRex(args, timeout)).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
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

function sanitizeToken(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) return null
  return value
}

interface AgentListEntry {
  id: string
  name: string
  profile: string
  model: string
  intervalSec: number
  enabled: boolean
  running: boolean
  lastRunAt?: string | null
}

interface McpListEntry {
  id: string
  name: string
  type: 'stdio' | 'sse' | 'http'
  enabled: boolean
  command?: string
  args?: string[]
  url?: string
}

function loadAgents(): AgentListEntry[] {
  const parsed = runRexJson(['agents', 'list', '--json'], 15000)
  const agents = parsed?.agents
  if (!Array.isArray(agents)) return []
  return agents as AgentListEntry[]
}

function loadMcpServers(): McpListEntry[] {
  const parsed = runRexJson(['mcp', 'list', '--json'], 15000)
  const servers = parsed?.servers
  if (!Array.isArray(servers)) return []
  return servers as McpListEntry[]
}

function renderAgentsSummary(max = 8): string {
  const agents = loadAgents()
  if (agents.length === 0) {
    return [
      '🧠 *Agents*',
      'No agents configured.',
      '',
      'Create quickly:',
      '`/agent_create read`',
      '`/agent_create code-review`',
    ].join('\n')
  }

  const lines = agents.slice(0, max).map((a) => {
    const icon = a.running ? '🟢' : a.enabled ? '🟡' : '⚫️'
    return `${icon} \`${a.id}\` • ${a.profile} • ${a.running ? 'running' : 'stopped'}`
  })
  const more = agents.length > max ? `\n... +${agents.length - max} more` : ''
  return [
    `🧠 *Agents* (${agents.length})`,
    '',
    ...lines,
    more,
    '',
    'Commands:',
    '`/agent_start <id>` `/agent_stop <id>` `/agent_run <id>`',
  ].filter(Boolean).join('\n')
}

function renderMcpSummary(max = 8): string {
  const servers = loadMcpServers()
  if (servers.length === 0) {
    return [
      '🔌 *MCP Registry*',
      'No servers configured.',
      '',
      'Add one:',
      '`rex mcp add <name> --command <cmd>`',
    ].join('\n')
  }

  const lines = servers.slice(0, max).map((s) => {
    const icon = s.enabled ? '🟢' : '⚫️'
    const target = s.type === 'stdio'
      ? `${s.command || 'n/a'} ${(s.args || []).join(' ')}`.trim()
      : (s.url || 'n/a')
    return `${icon} \`${s.id}\` • ${s.type} • ${target}`
  })
  const more = servers.length > max ? `\n... +${servers.length - max} more` : ''
  return [
    `🔌 *MCP Registry* (${servers.length})`,
    '',
    ...lines,
    more,
    '',
    'Commands:',
    '`/mcp_check <id>` `/mcp_sync`',
  ].filter(Boolean).join('\n')
}

interface AttachmentCandidate {
  fileId: string
  kind: UploadEntry['kind']
  fileName: string
  mimeType: string
  size: number
  caption: string
}

function pickAttachment(msg: any): AttachmentCandidate | null {
  const caption = String(msg?.caption || '').trim()
  if (msg?.document?.file_id) {
    return {
      fileId: String(msg.document.file_id),
      kind: 'document',
      fileName: String(msg.document.file_name || `document-${Date.now()}`),
      mimeType: String(msg.document.mime_type || 'application/octet-stream'),
      size: Number(msg.document.file_size || 0),
      caption,
    }
  }
  if (Array.isArray(msg?.photo) && msg.photo.length > 0) {
    const sorted = [...msg.photo].sort((a, b) => Number(a?.file_size || 0) - Number(b?.file_size || 0))
    const best = sorted[sorted.length - 1] || {}
    return {
      fileId: String(best.file_id),
      kind: 'photo',
      fileName: `photo-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      size: Number(best.file_size || 0),
      caption,
    }
  }
  if (msg?.audio?.file_id) {
    const ext = extname(String(msg.audio.file_name || '')).replace('.', '') || 'mp3'
    return {
      fileId: String(msg.audio.file_id),
      kind: 'audio',
      fileName: String(msg.audio.file_name || `audio-${Date.now()}.${ext}`),
      mimeType: String(msg.audio.mime_type || 'audio/mpeg'),
      size: Number(msg.audio.file_size || 0),
      caption,
    }
  }
  if (msg?.voice?.file_id) {
    return {
      fileId: String(msg.voice.file_id),
      kind: 'voice',
      fileName: `voice-${Date.now()}.ogg`,
      mimeType: String(msg.voice.mime_type || 'audio/ogg'),
      size: Number(msg.voice.file_size || 0),
      caption,
    }
  }
  if (msg?.video?.file_id) {
    const ext = extname(String(msg.video.file_name || '')).replace('.', '') || 'mp4'
    return {
      fileId: String(msg.video.file_id),
      kind: 'video',
      fileName: String(msg.video.file_name || `video-${Date.now()}.${ext}`),
      mimeType: String(msg.video.mime_type || 'video/mp4'),
      size: Number(msg.video.file_size || 0),
      caption,
    }
  }
  return null
}

async function downloadTelegramFile(token: string, fileId: string, fileName: string): Promise<{ path: string; size: number }> {
  const info = await tg(token, 'getFile', { file_id: fileId })
  const tgPath = info?.result?.file_path as string | undefined
  if (!tgPath) throw new Error('Telegram getFile failed')

  const res = await fetch(`https://api.telegram.org/file/bot${token}/${tgPath}`)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const ab = await res.arrayBuffer()
  const buffer = Buffer.from(ab)
  if (buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new Error(`File too large (${Math.round(buffer.byteLength / 1024 / 1024)}MB > ${MAX_MEDIA_MB}MB)`)
  }

  ensureUploadsDir()
  const base = slugFileName(fileName || basename(tgPath))
  const ext = extname(base) || extname(tgPath) || ''
  const stem = ext ? base.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '') : base
  const finalName = `${stem}-${Date.now()}${ext}`
  const full = join(UPLOADS_ROOT, finalName)
  writeFileSync(full, buffer)
  return { path: full, size: buffer.byteLength }
}

function commandExists(cmd: string): boolean {
  return run(`command -v ${cmd} >/dev/null 2>&1 && echo ok`).includes('ok')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function extractFilePreview(upload: UploadEntry, maxChars = 9000): string {
  const path = upload.filePath
  const qPath = shellQuote(path)
  const name = upload.fileName.toLowerCase()
  const mime = upload.mimeType.toLowerCase()

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    if (commandExists('pdftotext')) {
      const out = run(`pdftotext -layout ${qPath} - 2>/dev/null | head -c ${maxChars}`, 30000)
      if (out.trim()) return out.trim()
    }
    if (commandExists('python3')) {
      const py = run(
        `python3 -c "import sys
p=sys.argv[1]
t=''
try:
 import pypdf
 r=pypdf.PdfReader(p)
 t='\\n'.join([(pg.extract_text() or '') for pg in r.pages])
except Exception:
 try:
  import PyPDF2
  r=PyPDF2.PdfReader(p)
  t='\\n'.join([(pg.extract_text() or '') for pg in r.pages])
 except Exception:
  pass
print(t[:${maxChars}])" ${qPath}`,
        45000,
      )
      if (py.trim()) return py.trim()
    }
    const raw = run(`strings ${qPath} 2>/dev/null | head -c ${maxChars}`, 10000)
    return raw.trim()
  }

  const textLike = (
    mime.startsWith('text/') ||
    name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.json') ||
    name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') ||
    name.endsWith('.yml') || name.endsWith('.yaml') || name.endsWith('.toml') ||
    name.endsWith('.csv')
  )
  if (textLike) {
    const out = run(`head -c ${maxChars} ${qPath}`, 10000)
    return out.trim()
  }

  if (upload.kind === 'photo' && commandExists('tesseract')) {
    const out = run(`tesseract ${qPath} stdout 2>/dev/null | head -c ${maxChars}`, 30000)
    return out.trim()
  }

  return ''
}

async function analyzeUpload(upload: UploadEntry, task: string, mode?: 'qwen' | 'claude'): Promise<string> {
  const preview = extractFilePreview(upload)
  const activeMode = mode || state.mode
  const prompt = [
    'You are processing a file uploaded from Telegram to REX.',
    `File path: ${upload.filePath}`,
    `File name: ${upload.fileName}`,
    `Kind: ${upload.kind}`,
    `Mime type: ${upload.mimeType}`,
    `Size: ${upload.size} bytes`,
    `User task: ${task}`,
    '',
    preview
      ? `Extracted preview:\\n${preview}`
      : 'No text preview available from this file type. Explain what can be done next.',
    '',
    'Return:',
    '1) concise summary',
    '2) useful action plan for coding/ops',
  ].join('\n')

  if (activeMode === 'claude') {
    return askClaude(prompt)
  }
  return askLLM(prompt)
}

function renderUpload(u: UploadEntry): string {
  const mb = (u.size / 1024 / 1024).toFixed(2)
  return [
    `id: ${u.id}`,
    `type: ${u.kind}`,
    `name: ${u.fileName}`,
    `mime: ${u.mimeType}`,
    `size: ${mb} MB`,
    `path: ${u.filePath}`,
    `time: ${u.uploadedAt}`,
  ].join('\n')
}

function renderUploadsList(chatId: string): string {
  const uploads = recentUploads(chatId, 10)
  if (uploads.length === 0) {
    return '📎 *Files*\nNo uploads yet.\n\nSend an image, PDF, audio, or document to this bot.'
  }
  const lines = uploads.map((u) => {
    const mb = (u.size / 1024 / 1024).toFixed(2)
    return `• \`${u.id}\` ${u.kind} ${u.fileName} (${mb}MB)`
  })
  return ['📎 *Recent uploads*', '', ...lines, '', 'Auto-analysis is ON. Optional override: `/file_analyze <prompt>`'].join('\n')
}

async function handleAttachment(token: string, chatId: string, msg: any, from: string): Promise<string> {
  const attachment = pickAttachment(msg)
  if (!attachment) return ''

  if (attachment.size > MAX_MEDIA_BYTES) {
    return `⚠️ File too large (${Math.round(attachment.size / 1024 / 1024)}MB). Limit is ${MAX_MEDIA_MB}MB.`
  }

  const dl = await downloadTelegramFile(token, attachment.fileId, attachment.fileName)
  const entry: UploadEntry = {
    id: `up-${Date.now().toString(36)}`,
    chatId,
    from,
    kind: attachment.kind,
    filePath: dl.path,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: dl.size,
    caption: attachment.caption || undefined,
    uploadedAt: new Date().toISOString(),
  }
  rememberUpload(entry)

  let text = `📎 *File received*\n\`\`\`\n${renderUpload(entry)}\n\`\`\``
  if (AUTO_UPLOAD_ANALYZE) {
    const mode = AUTO_UPLOAD_MODE
    const task = attachment.caption && attachment.caption.length > 2
      ? attachment.caption
      : AUTO_UPLOAD_TASK
    try {
      const out = await analyzeUpload(entry, task, mode)
      text += `\n\n${mode === 'claude' ? '🤖' : '🧠'} *Auto analysis* (${mode})\n${truncate(out, 2800)}`
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      text += `\n\n⚠️ Auto analysis failed: ${err}`
    }
  } else {
    text += '\n\nAuto analysis disabled. Use `/file_analyze <prompt>`.'
  }
  logCommand(from, `[upload] ${attachment.kind}:${attachment.fileName}`, 'saved')
  return text
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

  const out = runRex(['llm', prompt], 60000)
  if (!out || out.includes('rex-claude') || out.includes('Commands:')) {
    return '⚠️ LLM returned no useful response'
  }
  return truncate(out)
}

/** Streaming Qwen via Ollama /api/chat — sends progressive edits to Telegram */
async function askQwenStream(token: string, chatId: string, prompt: string): Promise<string> {
  // Model detection: use pinned model from state, else auto-detect
  let model = state.localModel || 'qwen3.5:4b'
  if (!state.localModel) {
    try {
      const tags = await fetch(`${OLLAMA_URL}/api/tags`)
      if (!tags.ok) return '⚠️ Ollama not running.'
      const data = (await tags.json()) as { models: Array<{ name: string }> }
      const names = data.models.map(m => m.name)
      for (const pref of ['qwen3.5:9b', 'qwen3.5:4b', 'qwen2.5:1.5b']) {
        const base = pref.split(':')[0]
        const match = names.find(n => n.includes(base))
        if (match) { model = match; break }
      }
    } catch {
      return '⚠️ Ollama not running.'
    }
  } else {
    // Quick health check
    try {
      const check = await fetch(`${OLLAMA_URL}/api/tags`)
      if (!check.ok) return '⚠️ Ollama not running.'
    } catch {
      return '⚠️ Ollama not running.'
    }
  }

  // Send initial "thinking" message to get message_id for edits
  const initMsg = await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: '🧠 _Qwen thinking..._',
    parse_mode: 'Markdown',
  }) as { result?: { message_id: number } }
  const msgId = initMsg?.result?.message_id
  if (!msgId) return '⚠️ Failed to send initial message'

  const controller = new AbortController()
  activeStreamController = controller
  const streamTimeout = setTimeout(() => controller.abort(), 120_000) // 2min max
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      think: false,
    }),
    signal: controller.signal,
  })

  if (!res.ok || !res.body) {
    await editMessage(token, chatId, msgId, '⚠️ Ollama stream failed')
    return '⚠️ Ollama stream failed'
  }

  // Strip <think>...</think> blocks from streaming output (Qwen3 reasoning models)
  // Also handles incomplete think blocks mid-stream (opens but not yet closed)
  function stripThinkBlocks(raw: string): string {
    let clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '') // complete blocks
    clean = clean.replace(/<think>[\s\S]*$/, '') // incomplete block at end
    return clean.trim()
  }

  let rawFull = '' // everything including think tokens
  let lastEdit = 0
  let wasThinking = false
  const EDIT_INTERVAL = 800 // ms between edits (Telegram rate limit)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string; thinking?: string }; done?: boolean }
          // Collect content (skip thinking field from Ollama think:true mode)
          if (chunk.message?.content) {
            rawFull += chunk.message.content
          }
        } catch {}
      }

      // Progressive edit with rate limiting
      const now = Date.now()
      if (now - lastEdit > EDIT_INTERVAL) {
        const visible = stripThinkBlocks(rawFull)
        const isThinking = rawFull.includes('<think>') && !rawFull.includes('</think>')
        if (isThinking && !wasThinking) {
          // Show thinking indicator only once
          try { await editMessage(token, chatId, msgId, '🧠 _Réflexion en cours..._') } catch {}
          wasThinking = true
        } else if (visible.length > 0) {
          wasThinking = false
          const display = visible.length > 4000 ? visible.slice(-4000) : visible
          try { await editMessage(token, chatId, msgId, `🧠 ${display}`) } catch {}
        }
        lastEdit = now
      }
    }

    // Process any remaining data in buffer that didn't end with \n
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer) as { message?: { content?: string } }
        if (chunk.message?.content) rawFull += chunk.message.content
      } catch {}
    }
  } catch {} finally {
    clearTimeout(streamTimeout)
    activeStreamController = null
  }

  // Final edit with filtered text (no think blocks)
  const visible = stripThinkBlocks(rawFull)
  const finalText = truncate(visible || rawFull || '⚠️ Empty response')
  try {
    await editMessage(token, chatId, msgId, `🧠 ${finalText}`, [
      [
        { text: 'Mode: qwen', callback_data: 'switch_mode' },
        { text: '◀️ Menu', callback_data: 'menu' },
      ]
    ])
  } catch {}

  return finalText
}

function formatClaudeError(e: any, label: string): string {
  const stderr = e?.stderr?.toString?.()?.trim?.() || ''
  if (e?.killed || e?.signal === 'SIGTERM') {
    console.error(`${label}: timed out`)
    return `⚠️ ${label}: timed out — try a shorter prompt`
  }
  const msg = e?.message || 'unknown'
  console.error(`${label}: ${msg}${stderr ? `\nstderr: ${stderr}` : ''}`)
  return `⚠️ ${label}: ${stderr || msg}`.slice(0, 500)
}

// Build a clean env for claude CLI — unset CLAUDECODE so it can run
// even when the gateway itself was started inside a Claude Code session
function claudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CLAUDECODE
  return env
}

/** Run claude CLI asynchronously with animated progress edits */
async function runClaudeAsync(
  args: string[],
  timeoutMs: number,
  onProgress?: (frameIdx: number) => Promise<void>
): Promise<{ stdout: string; stderr: string }> {
  const { spawn } = require('node:child_process')

  // Inject model flag if set in state
  const modelArgs = state.claudeModel ? ['--model', state.claudeModel, ...args] : args

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    let child: ReturnType<typeof spawn>
    try {
      child = spawn('claude', modelArgs, { env: claudeEnv() })
    } catch (e: any) {
      resolve({ stdout: '', stderr: e?.message || 'spawn failed' })
      return
    }

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    // Animated progress updates (every 3s)
    let frameIdx = 0
    const timer = onProgress ? setInterval(() => {
      if (!settled) onProgress(frameIdx++).catch(() => {})
    }, 3000) : null

    const done = () => {
      if (settled) return
      settled = true
      if (timer) clearInterval(timer)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    }

    child.on('close', done)
    child.on('error', (e: Error) => {
      if (settled) return
      settled = true
      if (timer) clearInterval(timer)
      const code = (e as NodeJS.ErrnoException).code
      resolve({ stdout: '', stderr: code === 'ENOENT' ? 'claude CLI not found in PATH' : e.message })
    })

    // Hard timeout
    const to = setTimeout(() => {
      if (!settled) {
        settled = true
        if (timer) clearInterval(timer)
        try { child.kill() } catch {}
        resolve({ stdout: '', stderr: `Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s` })
      }
    }, timeoutMs)

    child.on('close', () => clearTimeout(to))
  })
}

function parseClaudeError(stderr: string): string {
  const s = stderr.toLowerCase()
  if (s.includes('nested session') || s.includes('claudecode') || s.includes('cannot be launched inside')) {
    return '⚠️ Claude: nested session conflict — restart gateway outside Claude Code'
  }
  if (s.includes('not logged in') || s.includes('authenticate') || s.includes('unauthorized') || s.includes('401')) {
    return '⚠️ Claude: not authenticated — run `claude auth login`'
  }
  if (s.includes('rate limit') || s.includes('429') || s.includes('quota exceeded')) {
    return '⚠️ Claude: rate limit — réessaie dans quelques minutes'
  }
  if (s.includes('timed out')) {
    return '⚠️ Claude: timeout — requête trop longue'
  }
  if (s.includes('not found in path') || s.includes('enoent')) {
    return '⚠️ Claude CLI introuvable — vérifie l\'installation'
  }
  if (s.includes('network') || s.includes('econnrefused') || s.includes('fetch failed')) {
    return '⚠️ Claude: erreur réseau — vérifie la connexion'
  }
  return `⚠️ Claude: ${stderr.slice(0, 400)}`
}

async function askClaude(prompt: string): Promise<string> {
  const { stdout, stderr } = await runClaudeAsync(['-p', prompt], 120000)
  if (stdout) return truncate(stdout)
  if (stderr) {
    console.error(`Claude CLI stderr: ${stderr.slice(0, 300)}`)
    return parseClaudeError(stderr)
  }
  return '⚠️ Claude CLI returned empty'
}

/** Ask Claude with animated progress message edits */
async function askClaudeWithProgress(
  token: string, chatId: string, msgId: number,
  args: string[]
): Promise<string> {
  const frames = [
    '🤖 _Claude réfléchit..._',
    '🤖 _Claude réfléchit.._',
    '🤖 _Claude réfléchit._',
    '🤖 _Claude réfléchit..._',
  ]
  const { stdout, stderr } = await runClaudeAsync(args, 180000, async (idx) => {
    try { await editMessage(token, chatId, msgId, frames[idx % frames.length]) } catch {}
  })
  if (stdout) return truncate(stdout)
  if (stderr) {
    console.error(`Claude session stderr: ${stderr.slice(0, 300)}`)
    return parseClaudeError(stderr)
  }
  return '⚠️ No response from Claude'
}

async function claudeSession(
  token: string, chatId: string, msgId: number,
  prompt: string, resume?: boolean
): Promise<string> {
  const args = resume ? ['--continue', '-p', prompt] : ['-p', prompt]
  const result = await askClaudeWithProgress(token, chatId, msgId, args)
  if (!result.startsWith('⚠️')) {
    state.sessionsCount++
    saveState(state)
  }
  return result
}

// --- Callback handler ---

async function handleCallback(token: string, chatId: string, messageId: number, callbackId: string, data: string, from: string) {
  await answerCallback(token, callbackId)
  logCommand(from, `[btn] ${data}`, 'ok')
  // Reload state from disk to stay in sync with mode changes
  state = loadState()

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
      const out = await claudeSession(token, chatId, messageId, 'Continue the previous task. What was I working on?', true)
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

    case 'advanced_menu':
      await editMessage(token, chatId, messageId,
        '🧭 *Advanced*\nAgents autonomes, registry MCP et audit.',
        advancedMenu()
      )
      break

    case 'audit': {
      await editMessage(token, chatId, messageId, '🧪 _Running strict audit..._')
      const out = truncate(strip(run('rex audit --strict', 120000)), 3500)
      await editMessage(token, chatId, messageId,
        `🧪 *Audit*\n\`\`\`\n${out}\n\`\`\``,
        advancedMenu()
      )
      break
    }

    case 'agents_menu':
      await editMessage(token, chatId, messageId, renderAgentsSummary(), agentsMenu())
      break

    case 'agents_profiles': {
      const parsed = runRexJson(['agents', 'profiles', '--json'], 15000)
      const rows = Array.isArray(parsed?.profiles) ? parsed.profiles : []
      const body = rows.length
        ? rows.slice(0, 8).map((p: any) => `• ${p.name} • model=${p.model} • every=${p.intervalSec}s`).join('\n')
        : 'No profile data.'
      await editMessage(token, chatId, messageId,
        `📦 *Agent Profiles*\n${body}`,
        agentsMenu()
      )
      break
    }

    case 'agents_create_read': {
      const out = truncate(strip(runRex(['agents', 'create', 'read'], 20000)), 3000)
      await editMessage(token, chatId, messageId,
        `➕ *Agent Created (read)*\n\`\`\`\n${out}\n\`\`\``,
        agentsMenu()
      )
      break
    }

    case 'agents_create_review': {
      const out = truncate(strip(runRex(['agents', 'create', 'code-review'], 20000)), 3000)
      await editMessage(token, chatId, messageId,
        `➕ *Agent Created (code-review)*\n\`\`\`\n${out}\n\`\`\``,
        agentsMenu()
      )
      break
    }

    case 'agents_start_all': {
      const targets = loadAgents().filter((a) => a.enabled)
      if (targets.length === 0) {
        await editMessage(token, chatId, messageId, '🧠 *Agents*\nNo enabled agents to start.', agentsMenu())
        break
      }
      const lines = targets.slice(0, 10).map((a) => {
        const out = runRex(['agents', 'run', a.id], 20000)
        const ok = out.includes('"ok"') || out.includes('alreadyRunning')
        return `${ok ? '✅' : '⚠️'} ${a.id}`
      })
      const more = targets.length > 10 ? `\n... +${targets.length - 10} more` : ''
      await editMessage(token, chatId, messageId,
        `▶️ *Start enabled agents*\n${lines.join('\n')}${more}`,
        agentsMenu()
      )
      break
    }

    case 'agents_stop_all': {
      const targets = loadAgents().filter((a) => a.running)
      if (targets.length === 0) {
        await editMessage(token, chatId, messageId, '🧠 *Agents*\nNo running agents to stop.', agentsMenu())
        break
      }
      const lines = targets.slice(0, 10).map((a) => {
        const out = runRex(['agents', 'stop', a.id], 20000)
        const ok = out.includes('"ok"') || out.includes('"stopped"')
        return `${ok ? '✅' : '⚠️'} ${a.id}`
      })
      const more = targets.length > 10 ? `\n... +${targets.length - 10} more` : ''
      await editMessage(token, chatId, messageId,
        `⏹ *Stop running agents*\n${lines.join('\n')}${more}`,
        agentsMenu()
      )
      break
    }

    case 'mcp_menu':
      await editMessage(token, chatId, messageId, renderMcpSummary(), mcpMenu())
      break

    case 'mcp_sync': {
      const out = truncate(strip(runRex(['mcp', 'sync-claude'], 20000)), 3000)
      await editMessage(token, chatId, messageId,
        `🔁 *MCP Sync Claude*\n\`\`\`\n${out}\n\`\`\``,
        mcpMenu()
      )
      break
    }

    case 'mcp_check_enabled': {
      const servers = loadMcpServers().filter((s) => s.enabled)
      if (servers.length === 0) {
        await editMessage(token, chatId, messageId, '🔌 *MCP*\nNo enabled servers to check.', mcpMenu())
        break
      }
      const lines = servers.slice(0, 8).map((s) => {
        const checked = runRexJson(['mcp', 'check', s.id], 15000)
        return `${checked?.ok ? '✅' : '❌'} ${s.id} (${s.type})`
      })
      const more = servers.length > 8 ? `\n... +${servers.length - 8} more` : ''
      await editMessage(token, chatId, messageId,
        `✅ *MCP check (enabled)*\n${lines.join('\n')}${more}`,
        mcpMenu()
      )
      break
    }

    case 'mcp_export': {
      const out = truncate(strip(runRex(['mcp', 'export'], 15000)), 3000)
      await editMessage(token, chatId, messageId,
        `📤 *MCP Export*\n\`\`\`\n${out}\n\`\`\``,
        mcpMenu()
      )
      break
    }

    case 'files_menu':
      await editMessage(token, chatId, messageId, renderUploadsList(chatId), filesMenu())
      break

    case 'files_list':
      await editMessage(token, chatId, messageId, renderUploadsList(chatId), filesMenu())
      break

    case 'file_last': {
      const upload = latestUpload(chatId)
      if (!upload) {
        await editMessage(token, chatId, messageId, '📎 *Files*\nNo uploaded file found yet.', filesMenu())
        break
      }
      await editMessage(token, chatId, messageId,
        `📎 *Last File*\n\`\`\`\n${renderUpload(upload)}\n\`\`\``,
        filesMenu()
      )
      break
    }

    case 'file_analyze_claude': {
      const upload = latestUpload(chatId)
      if (!upload) {
        await editMessage(token, chatId, messageId, '📎 *Files*\nNo uploaded file found yet.', filesMenu())
        break
      }
      await editMessage(token, chatId, messageId, '🤖 _Analyzing latest file with Claude..._')
      const out = await analyzeUpload(upload, 'Summarize the file and propose engineering actions.', 'claude')
      await editMessage(token, chatId, messageId,
        `🤖 *Claude file analysis*\n${truncate(out, 3200)}`,
        filesMenu()
      )
      break
    }

    case 'file_analyze_qwen': {
      const upload = latestUpload(chatId)
      if (!upload) {
        await editMessage(token, chatId, messageId, '📎 *Files*\nNo uploaded file found yet.', filesMenu())
        break
      }
      await editMessage(token, chatId, messageId, '🧠 _Analyzing latest file with Qwen..._')
      const out = await analyzeUpload(upload, 'Summarize the file and propose engineering actions.', 'qwen')
      await editMessage(token, chatId, messageId,
        `🧠 *Qwen file analysis*\n${truncate(out, 3200)}`,
        filesMenu()
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

    case 'models_menu': {
      await editMessage(token, chatId, messageId,
        `🎛 *Modèles actifs*\n🧠 Local: \`${state.localModel || 'auto'}\`\n🤖 Claude: \`${state.claudeModel || 'sonnet-4-6 (défaut)'}\``,
        modelsMenu()
      )
      break
    }

    case 'free_tiers': {
      const out = truncate(strip(run('rex free-tiers', 10000)), 3200)
      await editMessage(token, chatId, messageId,
        `🆓 *Free Tiers*\n\`\`\`\n${out}\n\`\`\``,
        advancedMenu()
      )
      break
    }

    case 'pool': {
      const out = truncate(strip(run('rex pool', 8000)), 3200)
      await editMessage(token, chatId, messageId,
        `🔑 *Account Pool*\n\`\`\`\n${out}\n\`\`\``,
        advancedMenu()
      )
      break
    }

    case 'burn_rate': {
      const out = truncate(strip(run('rex burn-rate', 8000)), 3200)
      await editMessage(token, chatId, messageId,
        `📊 *Burn Rate*\n\`\`\`\n${out}\n\`\`\``,
        advancedMenu()
      )
      break
    }

    case 'quick_setup': {
      await editMessage(token, chatId, messageId, '⚡ Running quick setup…', backMenu())
      const out = truncate(strip(run('rex setup --quick', 30000)), 3000)
      await editMessage(token, chatId, messageId, `⚡ *Quick Setup*\n\`\`\`\n${out}\n\`\`\``, advancedMenu())
      break
    }

    case 'run_review': {
      await editMessage(token, chatId, messageId, '🔍 Running code review…', backMenu())
      const out = truncate(strip(run('rex review', 30000)), 3000)
      await editMessage(token, chatId, messageId, `🔍 *Code Review*\n\`\`\`\n${out}\n\`\`\``, advancedMenu())
      break
    }

    case 'curious_check': {
      await editMessage(token, chatId, messageId, '🔭 Checking discoveries…', backMenu())
      try {
        const { runCurious } = await import('./curious.js')
        const result = await runCurious({ silent: true })
        const newOnes = result.discoveries.filter(d => d.isNew).slice(0, 6)
        if (newOnes.length === 0) {
          await editMessage(token, chatId, messageId, '🔭 *Curious*\n\nNothing new since last check.', advancedMenu())
        } else {
          const lines = newOnes.map(d => {
            const icon = d.type === 'model' ? '🤖' : d.type === 'mcp' ? '🔌' : d.type === 'repo' ? '📦' : '📰'
            return `${icon} *${d.title.slice(0, 50)}*\n   ${d.detail.slice(0, 70)}`
          })
          const msg = `🔭 *${result.newCount} new discoveries*\n\n${lines.join('\n\n')}`
          await editMessage(token, chatId, messageId, msg, advancedMenu())
        }
      } catch (e: any) {
        await editMessage(token, chatId, messageId, `⚠️ Discovery failed: ${e.message?.slice(0, 100)}`, advancedMenu())
      }
      break
    }

    case 'dev_monitor': {
      await editMessage(token, chatId, messageId, '📊 Gathering dev status…', backMenu())
      try {
        const { getDevStatus, formatDevStatusTelegram } = await import('./dev-monitor.js')
        const report = await getDevStatus()
        const msg = formatDevStatusTelegram(report)
        await editMessage(token, chatId, messageId, msg, advancedMenu())
      } catch (e: any) {
        await editMessage(token, chatId, messageId, `⚠️ Monitor failed: ${e.message?.slice(0, 100)}`, advancedMenu())
      }
      break
    }

    case 'standup': {
      await editMessage(token, chatId, messageId, '📋 Generating standup…', backMenu())
      try {
        const { getDevStatus } = await import('./dev-monitor.js')
        const report = await getDevStatus()
        const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        const lines = [`📋 *Standup — ${today}*`, '']
        if (report.commits.length > 0) {
          lines.push('*Hier :*')
          for (const c of report.commits.slice(0, 5)) {
            lines.push(`  \\- \`${c.repo}\` — ${c.lastMessage.slice(0, 60)}`)
          }
        } else {
          lines.push('*Hier :* Pas de commits')
        }
        lines.push('')
        lines.push(`📊 ${report.totalCommits} commit${report.totalCommits !== 1 ? 's' : ''} · ${report.sessionCount} session${report.sessionCount !== 1 ? 's' : ''} Claude`)
        if (report.pendingMemories > 0) lines.push(`📥 ${report.pendingMemories} memories en attente`)
        await editMessage(token, chatId, messageId, lines.join('\n'), backMenu())
      } catch (e: any) {
        await editMessage(token, chatId, messageId, `⚠️ Standup failed: ${e.message?.slice(0, 100)}`, backMenu())
      }
      break
    }

    case 'notifs': {
      const { text: t, buttons } = buildNotifsMessage(null, 0)
      await editMessage(token, chatId, messageId, t, buttons)
      break
    }

    default: {
      if (data.startsWith('set_local_')) {
        const model = data.replace('set_local_', '')
        state.localModel = model === 'auto' ? null : model
        saveState(state)
        await editMessage(token, chatId, messageId,
          `🧠 Modèle local → \`${state.localModel || 'auto-detect'}\``,
          modelsMenu()
        )
        break
      }
      if (data.startsWith('set_claude_')) {
        const model = data.replace('set_claude_', '')
        state.claudeModel = model
        saveState(state)
        await editMessage(token, chatId, messageId,
          `🤖 Modèle Claude → \`${model}\``,
          modelsMenu()
        )
        break
      }
      if (data.startsWith('notif_filter_')) {
        const proj = data.replace('notif_filter_', '')
        const { text: t, buttons } = buildNotifsMessage(proj === 'all' ? null : proj, 0)
        await editMessage(token, chatId, messageId, t, buttons)
        break
      }
      if (data.startsWith('notif_page_')) {
        const parts = data.replace('notif_page_', '').split('_')
        const page = parseInt(parts[0], 10) || 0
        const proj = parts.slice(1).join('_') || null
        const { text: t, buttons } = buildNotifsMessage(proj === 'all' ? null : proj, page)
        await editMessage(token, chatId, messageId, t, buttons)
        break
      }
      if (data.startsWith('notif_markall_')) {
        const proj = data.replace('notif_markall_', '')
        const notifs = loadNotifications()
        for (const n of notifs) {
          if (proj === 'all' || n.project === proj) n.read = true
        }
        saveNotifications(notifs)
        const { text: t, buttons } = buildNotifsMessage(proj === 'all' ? null : proj, 0)
        await editMessage(token, chatId, messageId, t, buttons)
        break
      }
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

  if (cmd.startsWith('/')) {
    try { appendEvent('gateway.command', { command: cmd.split(/\s/)[0], chatId, from }) } catch {}
  }

  // Slash commands
  if (cmd === '/start' || cmd === '/menu' || cmd === '/help' || cmd === '/h') {
    await send(token, chatId, '🦖 *REX Gateway v3*\nChoisis une action :', mainMenu())
    logCommand(from, cmd, 'menu')
    return
  }

  if (cmd === '/status' || cmd === '/s') {
    const uptime = formatUptime(Date.now() - gatewayStartTime)
    const hubReachable = await checkHubReachable()
    const ollamaUp = await isOllamaRunning()
    const queueStats = getQueueStats()

    const lines = [
      `📊 *REX Gateway Status*`,
      ``,
      `*Uptime:* ${uptime}`,
      `*Mode:* ${state.mode}`,
      `*Degrade:* ${degradeMode ? '⚠️ yes' : '✅ no'}`,
      `*Hub:* ${hubReachable ? '🟢 connected' : '🔴 disconnected'}`,
      `*Ollama:* ${ollamaUp ? '🟢 running' : '🔴 stopped'}`,
      `*Queue:* ${queueStats.unacked} pending / ${queueStats.total} total`,
      `*Sessions:* ${state.sessionsCount}`,
    ]
    const statusText = lines.join('\n')
    await send(token, chatId, statusText, backButton())
    logCommand(from, '/status', `degrade=${degradeMode}`)
    return
  }

  if (cmd === '/replay') {
    const spooled = getUnacked().filter(
      e => e.type === 'gateway.message' && (e.payload as any)?.direction === 'spooled'
    )
    if (spooled.length === 0) {
      await send(token, chatId, '📭 No spooled messages to replay.')
      return
    }
    await send(token, chatId, `🔄 Replaying ${spooled.length} spooled message${spooled.length > 1 ? 's' : ''}...`)
    let replayed = 0
    for (const ev of spooled) {
      const payload = ev.payload as any
      const text = payload?.text
      if (!text) { ackEvent(ev.id); continue }
      try {
        const response = await askQwenStream(token, chatId, text)
        if (!response.startsWith('⚠️')) {
          ackEvent(ev.id)
          replayed++
        }
      } catch {
        // leave unacked for next retry
      }
    }
    await send(token, chatId, `✅ Replayed ${replayed}/${spooled.length} messages.`, backButton())
    logCommand(from, '/replay', `${replayed}/${spooled.length}`)
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

  if (cmd === '/notifs' || cmd === '/notif' || cmd.startsWith('/notifs ')) {
    const filter = cmd.startsWith('/notifs ') ? text.replace(/^\/notifs\s+/i, '').trim() : null
    const { text: t, buttons } = buildNotifsMessage(filter || null, 0)
    await send(token, chatId, t, buttons)
    logCommand(from, '/notifs', filter || 'all')
    return
  }

  // /notify [-p project] [-P priority] "title" [message]
  if (cmd.startsWith('/notify ')) {
    const raw = text.replace(/^\/notify\s+/i, '')
    const parts = raw.match(/(?:-p\s+(\S+))?\s*(?:-P\s+(\S+))?\s*(.*)/i) || []
    let project = 'general'
    let priority: Notification['priority'] = 'normal'
    let rest = raw

    const pMatch = raw.match(/-p\s+(\S+)/)
    const PMatch = raw.match(/-P\s+(urgent|high|normal|low)/i)
    if (pMatch) { project = pMatch[1]; rest = rest.replace(pMatch[0], '').trim() }
    if (PMatch) { priority = PMatch[1].toLowerCase() as Notification['priority']; rest = rest.replace(PMatch[0], '').trim() }
    const [title = rest, ...msgParts] = rest.split('|')
    const message = msgParts.join('|').trim()

    addNotification(project, title.trim(), message, priority)
    const emoji = priorityEmoji(priority)
    await send(token, chatId,
      `${emoji} *Notification enregistrée*\n*Projet:* ${project}\n*Titre:* ${title.trim()}${message ? `\n*Détail:* ${message}` : ''}`,
      [[{ text: '🔔 Voir notifs', callback_data: 'notifs' }, { text: '◀️ Menu', callback_data: 'menu' }]]
    )
    logCommand(from, '/notify', `${project}: ${title.trim()}`)
    return
  }

  if (cmd.startsWith('/search ') || cmd.startsWith('/q ')) {
    const query = text.replace(/^\/(search|q)\s+/i, '')
    if (!query) { await send(token, chatId, 'Usage: /search <query>'); return }
    const out = runRex(['search', query])
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
    const initMsg = await send(token, chatId, '🤖 _Claude is thinking..._') as any
    const thinkMsgId = initMsg?.result?.message_id
    const out = thinkMsgId
      ? await claudeSession(token, chatId, thinkMsgId, prompt)
      : await askClaude(prompt)
    await send(token, chatId, out, [
      [
        { text: '💬 Continue', callback_data: 'claude_continue' },
        { text: '◀️ Menu', callback_data: 'menu' },
      ]
    ])
    logCommand(from, `/claude ${prompt.slice(0, 50)}`, out.slice(0, 100))
    return
  }

  if (cmd === '/advanced' || cmd === '/adv') {
    await send(token, chatId, '🧭 *Advanced*\nAgents autonomes, MCP et audit.', advancedMenu())
    logCommand(from, '/advanced', 'menu')
    return
  }

  if (cmd === '/audit') {
    await send(token, chatId, '🧪 _Running strict audit..._')
    const out = truncate(strip(run('rex audit --strict', 120000)), 3500)
    await send(token, chatId, `🧪\n\`\`\`\n${out}\n\`\`\``, advancedMenu())
    logCommand(from, '/audit', 'done')
    return
  }

  if (cmd === '/agents') {
    await send(token, chatId, renderAgentsSummary(), agentsMenu())
    logCommand(from, '/agents', 'listed')
    return
  }

  if (cmd.startsWith('/agent_create ')) {
    const parts = text.trim().split(/\s+/)
    const profile = sanitizeToken(parts[1] || '')
    const name = sanitizeToken(parts[2] || '')
    if (!profile) {
      await send(token, chatId, 'Usage: `/agent_create <read|analysis|code-review|advanced|ultimate> [name]`')
      return
    }
    const args = ['agents', 'create', profile]
    if (name) args.push(name)
    const out = truncate(strip(runRex(args, 20000)), 3200)
    await send(token, chatId, `➕ Agent created\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_create ${profile}`, 'done')
    return
  }

  if (cmd.startsWith('/agent_start ')) {
    const id = sanitizeToken(text.replace(/^\/agent_start\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_start <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'run', id], 20000)), 3200)
    await send(token, chatId, `▶️\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_start ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/agent_run ')) {
    const id = sanitizeToken(text.replace(/^\/agent_run\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_run <id>`'); return }
    await send(token, chatId, '▶️ _Running one cycle..._')
    const out = truncate(strip(runRex(['agents', 'run', id, '--once'], 90000)), 3200)
    await send(token, chatId, `▶️ One cycle done\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_run ${id}`, 'once')
    return
  }

  if (cmd.startsWith('/agent_stop ')) {
    const id = sanitizeToken(text.replace(/^\/agent_stop\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_stop <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'stop', id], 20000)), 3200)
    await send(token, chatId, `⏹\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_stop ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/agent_enable ')) {
    const id = sanitizeToken(text.replace(/^\/agent_enable\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_enable <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'enable', id], 20000)), 3200)
    await send(token, chatId, `✅\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_enable ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/agent_disable ')) {
    const id = sanitizeToken(text.replace(/^\/agent_disable\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_disable <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'disable', id], 20000)), 3200)
    await send(token, chatId, `⚫️\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_disable ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/agent_delete ')) {
    const id = sanitizeToken(text.replace(/^\/agent_delete\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_delete <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'delete', id], 20000)), 3200)
    await send(token, chatId, `🗑\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_delete ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/agent_logs ')) {
    const id = sanitizeToken(text.replace(/^\/agent_logs\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/agent_logs <id>`'); return }
    const out = truncate(strip(runRex(['agents', 'logs', id, '--tail', '25'], 20000)), 3200)
    await send(token, chatId, `📝 Agent logs\n\`\`\`\n${out}\n\`\`\``, agentsMenu())
    logCommand(from, `/agent_logs ${id}`, 'done')
    return
  }

  if (cmd.startsWith('/mcp_check ')) {
    const id = sanitizeToken(text.replace(/^\/mcp_check\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/mcp_check <id>`'); return }
    const out = truncate(strip(runRex(['mcp', 'check', id], 20000)), 3200)
    await send(token, chatId, `✅ MCP check\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, `/mcp_check ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/mcp_enable ')) {
    const id = sanitizeToken(text.replace(/^\/mcp_enable\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/mcp_enable <id>`'); return }
    const out = truncate(strip(runRex(['mcp', 'enable', id], 20000)), 3200)
    await send(token, chatId, `🟢 MCP enabled\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, `/mcp_enable ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/mcp_disable ')) {
    const id = sanitizeToken(text.replace(/^\/mcp_disable\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/mcp_disable <id>`'); return }
    const out = truncate(strip(runRex(['mcp', 'disable', id], 20000)), 3200)
    await send(token, chatId, `⚫️ MCP disabled\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, `/mcp_disable ${id}`, out.slice(0, 80))
    return
  }

  if (cmd.startsWith('/mcp_remove ')) {
    const id = sanitizeToken(text.replace(/^\/mcp_remove\s+/i, ''))
    if (!id) { await send(token, chatId, 'Usage: `/mcp_remove <id>`'); return }
    const out = truncate(strip(runRex(['mcp', 'remove', id], 20000)), 3200)
    await send(token, chatId, `🗑 MCP removed\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, `/mcp_remove ${id}`, out.slice(0, 80))
    return
  }

  if (cmd === '/mcp_sync') {
    const out = truncate(strip(runRex(['mcp', 'sync-claude'], 20000)), 3200)
    await send(token, chatId, `🔁 MCP synced\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, '/mcp_sync', 'done')
    return
  }

  if (cmd === '/mcp_export') {
    const out = truncate(strip(runRex(['mcp', 'export'], 20000)), 3200)
    await send(token, chatId, `📤 MCP export\n\`\`\`\n${out}\n\`\`\``, mcpMenu())
    logCommand(from, '/mcp_export', 'done')
    return
  }

  if (cmd.startsWith('/chat ')) {
    const userMsg = text.replace(/^\/chat\s+/i, '').trim()
    if (!userMsg) {
      await send(token, chatId, 'Usage: `/chat <message>` — Talk to the REX Orchestrator')
      return
    }
    await send(token, chatId, '🧠 _Orchestrator thinking..._')
    // Route to orchestrator agent or fallback to Claude session
    try {
      const out = truncate(strip(runRex(['agents', 'run', 'orchestrator', '--task', userMsg, '--once'], 180000)), 3500)
      await send(token, chatId, `🧠 *Orchestrator*\n${out}`, [
        [{ text: '💬 Continue', callback_data: 'menu' }],
      ])
    } catch {
      // Fallback: direct Claude session if no orchestrator agent exists
      const fbMsg = await send(token, chatId, '🤖 _Claude thinking..._') as any
      const fbMsgId = fbMsg?.result?.message_id
      const response = fbMsgId
        ? await claudeSession(token, chatId, fbMsgId, userMsg)
        : await askClaude(userMsg)
      await send(token, chatId, `🤖 *Claude*\n${response}`, [
        [{ text: '💬 Continue', callback_data: 'menu' }],
      ])
    }
    logCommand(from, `/chat ${userMsg.slice(0, 50)}`, 'orchestrator')
    return
  }

  if (cmd === '/mcp') {
    await send(token, chatId, renderMcpSummary(), mcpMenu())
    logCommand(from, '/mcp', 'listed')
    return
  }

  if (cmd === '/files' || cmd === '/file_list') {
    await send(token, chatId, renderUploadsList(chatId), filesMenu())
    logCommand(from, '/files', 'listed')
    return
  }

  if (cmd === '/file_last') {
    const upload = latestUpload(chatId)
    if (!upload) {
      await send(token, chatId, '📎 No uploaded file found yet.', filesMenu())
      return
    }
    await send(token, chatId, `📎 *Last File*\n\`\`\`\n${renderUpload(upload)}\n\`\`\``, filesMenu())
    return
  }

  if (cmd.startsWith('/file_analyze')) {
    const upload = latestUpload(chatId)
    if (!upload) {
      await send(token, chatId, '📎 No uploaded file found yet.', filesMenu())
      return
    }
    const raw = text.replace(/^\/file_analyze\s*/i, '').trim()
    let mode: 'qwen' | 'claude' | undefined
    let task = raw
    if (raw.toLowerCase().startsWith('qwen ')) {
      mode = 'qwen'
      task = raw.slice(5).trim()
    } else if (raw.toLowerCase().startsWith('claude ')) {
      mode = 'claude'
      task = raw.slice(7).trim()
    }
    if (!task) task = 'Summarize this file and propose concrete next engineering actions.'
    const runMode = mode || state.mode
    await send(token, chatId, `${runMode === 'claude' ? '🤖' : '🧠'} _Analyzing latest file..._`)
    const out = await analyzeUpload(upload, task, runMode)
    await send(token, chatId, truncate(out, 3200), filesMenu())
    logCommand(from, `/file_analyze ${runMode}`, out.slice(0, 120))
    return
  }

  if (cmd === '/pool' || cmd === '/accounts') {
    const { printPool } = await import('./account-pool.js')
    const { execSync } = await import('node:child_process')
    let msg = ''
    try {
      msg = execSync('rex pool', { encoding: 'utf-8', timeout: 8000 }).trim()
    } catch { msg = '⚠️ Could not load account pool' }
    await send(token, chatId, `🔑 *Account Pool*\n\`\`\`\n${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n\`\`\``)
    logCommand(from, '/pool', 'shown')
    return
  }

  if (cmd === '/burn' || cmd === '/burn_rate') {
    const { execSync } = await import('node:child_process')
    let msg = ''
    try {
      msg = execSync('rex burn-rate', { encoding: 'utf-8', timeout: 8000 }).trim()
    } catch { msg = '⚠️ Could not load burn rate' }
    await send(token, chatId, `📊 *Token Burn Rate*\n\`\`\`\n${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n\`\`\``)
    logCommand(from, '/burn', 'shown')
    return
  }

  if (cmd === '/free' || cmd === '/tiers') {
    const { execSync } = await import('node:child_process')
    let msg = ''
    try {
      msg = execSync('rex free-tiers', { encoding: 'utf-8', timeout: 8000 }).trim()
    } catch { msg = '⚠️ Could not load free tiers' }
    await send(token, chatId, `🆓 *Free Tiers*\n\`\`\`\n${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n\`\`\``)
    logCommand(from, '/free', 'shown')
    return
  }

  if (cmd === '/intent') {
    const { execSync } = await import('node:child_process')
    let msg = ''
    try {
      msg = execSync('rex intent', { encoding: 'utf-8', timeout: 8000 }).trim()
    } catch { msg = '⚠️ Could not detect intent' }
    await send(token, chatId, `🎯 *Project Intent*\n\`\`\`\n${msg.replace(/\x1b\[[0-9;]*m/g, '')}\n\`\`\``)
    logCommand(from, '/intent', 'shown')
    return
  }

  if (cmd === '/curious') {
    const loading = await send(token, chatId, '🔭 Checking for new models, MCPs, and news…')
    try {
      const { runCurious } = await import('./curious.js')
      const result = await runCurious({ silent: true })
      const newOnes = result.discoveries.filter(d => d.isNew).slice(0, 8)
      if (newOnes.length === 0) {
        await editMessage(token, chatId, loading.message_id, '🔭 *REX Curious*\n\nNothing new today.')
      } else {
        const lines = newOnes.map(d => {
          const icon = d.type === 'model' ? '🤖' : d.type === 'mcp' ? '🔌' : d.type === 'repo' ? '📦' : '📰'
          return `${icon} *${d.title.slice(0, 60)}*\n   ${d.detail.slice(0, 80)}`
        })
        const msg = `🔭 *${result.newCount} new discoveries*\n\n${lines.join('\n\n')}`
        await editMessage(token, chatId, loading.message_id, msg)
      }
    } catch (e: any) {
      await editMessage(token, chatId, loading.message_id, `⚠️ Curious check failed: ${e.message?.slice(0, 100)}`)
    }
    logCommand(from, '/curious', 'shown')
    return
  }

  if (cmd === '/monitor') {
    const loading = await send(token, chatId, '📊 Gathering dev status…')
    try {
      const { getDevStatus, formatDevStatusTelegram } = await import('./dev-monitor.js')
      const report = await getDevStatus()
      const msg = formatDevStatusTelegram(report)
      await editMessage(token, chatId, loading.message_id, msg)
    } catch (e: any) {
      await editMessage(token, chatId, loading.message_id, `⚠️ Monitor failed: ${e.message?.slice(0, 100)}`)
    }
    logCommand(from, '/monitor', 'shown')
    return
  }

  if (cmd === '/standup') {
    const loading = await send(token, chatId, '📋 Generating standup…')
    try {
      const { getDevStatus } = await import('./dev-monitor.js')
      const report = await getDevStatus()
      const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      const lines = [`📋 *Standup — ${today}*`, '']

      if (report.commits.length > 0) {
        lines.push('*Hier :*')
        for (const c of report.commits.slice(0, 5)) {
          lines.push(`  \\- \`${c.repo}\` — ${c.lastMessage.slice(0, 60)}`)
        }
      } else {
        lines.push('*Hier :* Pas de commits')
      }

      lines.push('')
      lines.push(`📊 ${report.totalCommits} commit${report.totalCommits !== 1 ? 's' : ''} · ${report.sessionCount} session${report.sessionCount !== 1 ? 's' : ''} Claude`)

      if (report.pendingMemories > 0) {
        lines.push(`📥 ${report.pendingMemories} memories en attente`)
      }

      await editMessage(token, chatId, loading.message_id, lines.join('\n'))
    } catch (e: any) {
      await editMessage(token, chatId, loading.message_id, `⚠️ Standup failed: ${e.message?.slice(0, 100)}`)
    }
    logCommand(from, '/standup', 'shown')
    return
  }

  if (cmd.startsWith('/remember ') || cmd === '/remember' || (cmd.startsWith('/r ') && cmd.length > 3)) {
    const note = cmd.startsWith('/remember ') ? text.trim().slice('/remember '.length)
               : cmd.startsWith('/r ') ? text.trim().slice('/r '.length)
               : ''
    if (!note) {
      await send(token, chatId, '💡 Usage: `/remember <texte>`\nEx: `/remember checker les logs Tailscale`')
      return
    }
    try {
      // Write to pending/ dir so ingest picks it up in next cycle
      const { PENDING_DIR } = await import('./paths.js')
      const { writeFileSync, mkdirSync } = await import('node:fs')
      mkdirSync(PENDING_DIR, { recursive: true })
      const ts = Date.now()
      const chunk = { source: 'gateway-note', content: note, timestamp: new Date().toISOString() }
      writeFileSync(join(PENDING_DIR, `note-${ts}.json`), JSON.stringify(chunk))
      await send(token, chatId, `📝 Mémorisé: _${note.slice(0, 100)}_\n\n_Sera indexé au prochain cycle ingest._`)
    } catch (e: any) {
      await send(token, chatId, `⚠️ Erreur: ${e.message?.slice(0, 80)}`)
    }
    logCommand(from, '/remember', 'saved')
    return
  }

  if (cmd === '/setup') {
    const loading = await send(token, chatId, '⚡ Running quick setup…')
    const out = truncate(strip(run('rex setup --quick', 30000)), 3000)
    await editMessage(token, chatId, loading.message_id, `⚡ *Quick Setup*\n\`\`\`\n${out}\n\`\`\``)
    logCommand(from, '/setup', 'done')
    return
  }

  if (cmd === '/review') {
    const loading = await send(token, chatId, '🔍 Running code review…')
    const out = truncate(strip(run('rex review', 30000)), 3000)
    await editMessage(token, chatId, loading.message_id, `🔍 *Code Review*\n\`\`\`\n${out}\n\`\`\``)
    logCommand(from, '/review', 'done')
    return
  }

  // Free text -> send to current LLM (with fallback cascade)
  if (text.length > 2) {
    // Re-read state from disk to pick up mode changes from other sources (buttons, /mode command)
    state = loadState()
    state.lastActivity = new Date().toISOString()
    saveState(state)

    let response: string
    if (state.mode === 'qwen') {
      // Streaming mode for Qwen — sends progressive edits
      response = await askQwenStream(token, chatId, text)

      // Fallback cascade: if Ollama failed, try Claude CLI
      if (response.startsWith('⚠️')) {
        console.log(`${COLORS.yellow}Qwen failed, falling back to Claude CLI${COLORS.reset}`)
        try {
          const claudeResponse = await askClaude(text)
          if (!claudeResponse.startsWith('⚠️')) {
            response = `_[fallback: Claude]_\n\n${claudeResponse}`
          }
        } catch {
          // Both failed
        }
      }

      // If both failed in degrade mode, spool and inform user
      if (response.startsWith('⚠️') && degradeMode) {
        try { appendEvent('gateway.message', { direction: 'spooled', text: text.slice(0, 1000), chatId, reason: 'degrade_mode' }) } catch {}
        response = '⚠️ Degrade mode — hub and LLM unavailable. Message spooled for later processing.'
      }
    } else {
      const thinkMsg = await send(token, chatId, '🤖 Claude _thinking..._') as any
      const thinkId = thinkMsg?.result?.message_id
      response = thinkId
        ? await claudeSession(token, chatId, thinkId, text)
        : await askClaude(text)
      await send(token, chatId, response, [
        [
          { text: 'Mode: claude', callback_data: 'switch_mode' },
          { text: '💬 Continue', callback_data: 'claude_continue' },
        ]
      ])
    }

    logCommand(from, text.slice(0, 80), response.slice(0, 100))
    return
  }

  await send(token, chatId, '🦖 *REX*\nEnvoie un message ou appuie sur Menu :', mainMenu())
}

// --- Dedup guard (prevents double processing of same update) ---
const processedUpdateIds = new Set<number>()
const MAX_PROCESSED_IDS = 500

function markProcessed(updateId: number): boolean {
  if (processedUpdateIds.has(updateId)) return false // already processed
  processedUpdateIds.add(updateId)
  // Keep set bounded
  if (processedUpdateIds.size > MAX_PROCESSED_IDS) {
    const oldest = processedUpdateIds.values().next().value
    if (oldest !== undefined) processedUpdateIds.delete(oldest)
  }
  return true
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
  cleanupOldUploads()

  // Single instance guard — prevent multiple gateway processes
  if (!acquireLock()) {
    console.error(`${COLORS.red}Another REX Gateway instance is already running.${COLORS.reset}`)
    console.error(`Remove ${LOCK_FILE} if this is stale, or stop the other instance first.`)
    process.exit(1)
  }

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

  const shutdown = (signal: string) => async () => {
    console.log(`\n${COLORS.dim}Shutting down (${signal})...${COLORS.reset}`)
    // Abort any active Qwen stream
    activeStreamController?.abort()
    state.lastActivity = new Date().toISOString()
    saveState(state)
    releaseLock()
    await send(token, chatId, `🔴 *REX Gateway* stopped (${signal})`).catch(() => {})
    process.exit(signal === 'SIGINT' ? 0 : 1)
  }

  process.on('SIGINT', shutdown('SIGINT'))
  process.on('SIGTERM', shutdown('SIGTERM'))
  process.on('uncaughtException', (err) => {
    console.error(`${COLORS.red}Uncaught exception:${COLORS.reset} ${err.message}`)
    releaseLock()
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    console.error(`${COLORS.red}Unhandled rejection:${COLORS.reset} ${reason}`)
    releaseLock()
    process.exit(1)
  })

  // Initial hub check
  await checkHubReachable()

  while (true) {
    try {
      // Periodic hub reachability check (non-blocking, respects interval)
      checkHubReachable().catch(() => {})

      // Client-side timeout = poll timeout + 15s safety margin (prevents hang if Telegram never responds)
      const pollController = new AbortController()
      const pollTimer = setTimeout(() => pollController.abort(), (config.pollTimeout + 15) * 1000)
      let res: Response
      try {
        res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${config.pollTimeout}&allowed_updates=["message","callback_query"]`,
          { signal: pollController.signal }
        )
      } finally {
        clearTimeout(pollTimer)
      }

      const data = await res.json() as {
        ok: boolean
        result: Array<{
          update_id: number
          message?: {
            chat: { id: number }
            text?: string
            caption?: string
            from?: { username?: string }
            document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string }
            photo?: Array<{ file_id: string; file_size?: number }>
            audio?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string }
            voice?: { file_id: string; file_size?: number; mime_type?: string }
            video?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string }
          }
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

        // Dedup guard — skip if already processed
        if (!markProcessed(update.update_id)) continue

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
          try { appendEvent('gateway.command', { command: cb.data, chatId: cbChatId, from }) } catch {}
          console.log(`${COLORS.cyan}@${from}${COLORS.reset} [btn] ${cb.data}`)

          if (!cb.message?.message_id || !cb.data) {
            await answerCallback(token, cb.id, '⚠️ Stale button')
            continue
          }
          await handleCallback(token, chatId, cb.message.message_id, cb.id, cb.data, from)
          continue
        }

        // Handle message (text + attachments)
        const msg = update.message
        if (!msg) continue

        // AUTH CHECK
        if (!isAuthorized(msg.chat.id, chatId)) {
          await send(token, String(msg.chat.id), '🚫 Unauthorized. This REX instance is private.')
          continue
        }

        const from = msg.from?.username ?? '?'
        try { appendEvent('gateway.message', { direction: 'inbound', chatId: String(msg.chat.id), text: (msg.text || msg.caption || '')?.slice(0, 500), from }) } catch {}
        const attachment = pickAttachment(msg)
        if (attachment) {
          console.log(`${COLORS.cyan}@${from}${COLORS.reset}: [upload] ${attachment.kind} ${attachment.fileName}`)
          await send(token, chatId, '📥 _Downloading attachment..._')
          try {
            const response = await handleAttachment(token, chatId, msg, from)
            await send(token, chatId, response, filesMenu())
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e)
            await send(token, chatId, `⚠️ Upload processing failed: ${err}`, filesMenu())
            logCommand(from, '[upload]', `error: ${err}`)
          }
          if (!msg.text) continue
        }

        if (msg.text) {
          console.log(`${COLORS.cyan}@${from}${COLORS.reset}: ${msg.text}`)

          // Mesh routing: check if a remote node is better suited for LLM tasks
          // (e.g. a GPU node or a node with larger Ollama models)
          // Falls back to local handling if no better node is found or routing fails.
          try {
            const bestNode = await routeTask('llm')
            if (bestNode && bestNode.hostname !== getHostname()) {
              // Remote node available — surface it in logs (actual forwarding is future work)
              console.log(`  [mesh] Best LLM node: ${bestNode.hostname} (${bestNode.ip}) — handling locally (forwarding TBD)`)
            }
          } catch {}

          await handleText(token, chatId, msg.text, from)
        }
      }
    } catch (err) {
      console.error(`${COLORS.red}Poll error:${COLORS.reset} ${(err as Error).message}`)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}
