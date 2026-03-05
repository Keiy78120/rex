import { homedir } from 'node:os'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execSync, execFileSync } from 'node:child_process'

// --- Config (loaded from settings.json) ---

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const STATE_FILE = join(homedir(), '.rex-memory', 'gateway-state.json')
const LOG_FILE = join(homedir(), '.claude', 'rex-gateway-commands.log')
const UPLOADS_ROOT = join(homedir(), '.rex-memory', 'gateway-uploads')
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
        lastActivity: parsed.lastActivity || new Date().toISOString(),
        sessionsCount: typeof parsed.sessionsCount === 'number' ? parsed.sessionsCount : 0,
        uploads: Array.isArray(parsed.uploads) ? parsed.uploads as UploadEntry[] : [],
      }
    }
  } catch {}
  return { mode: 'qwen', lastActivity: new Date().toISOString(), sessionsCount: 0, uploads: [] }
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
      { text: '📎 Files', callback_data: 'files_menu' },
    ],
    [{ text: '🧭 Advanced', callback_data: 'advanced_menu' }],
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
    [{ text: '◀️ Menu', callback_data: 'menu' }],
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
    return claudeSession(prompt)
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
  cleanupOldUploads()

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

        // Handle message (text + attachments)
        const msg = update.message
        if (!msg) continue

        // AUTH CHECK
        if (!isAuthorized(msg.chat.id, chatId)) {
          await send(token, String(msg.chat.id), '🚫 Unauthorized. This REX instance is private.')
          continue
        }

        const from = msg.from?.username ?? '?'
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
          await handleText(token, chatId, msg.text, from)
        }
      }
    } catch (err) {
      console.error(`${COLORS.red}Poll error:${COLORS.reset} ${(err as Error).message}`)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}
