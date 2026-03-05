import { homedir } from 'node:os'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

function getCredentials(): { token: string; chatId: string } | null {
  const settingsPath = join(homedir(), '.claude', 'settings.json')
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    const token = settings.env?.REX_TELEGRAM_BOT_TOKEN
    const chatId = settings.env?.REX_TELEGRAM_CHAT_ID
    if (token && chatId) return { token, chatId }
  } catch {}
  // Fallback to env vars
  const token = process.env.REX_TELEGRAM_BOT_TOKEN
  const chatId = process.env.REX_TELEGRAM_CHAT_ID
  if (token && chatId) return { token, chatId }
  return null
}

async function sendMessage(token: string, chatId: string, text: string, parseMode = 'Markdown') {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    })
  } catch {}
}

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 30000, encoding: 'utf-8' }).trim()
  } catch (e: any) {
    return e.stderr?.trim() || e.message || 'Command failed'
  }
}

async function handleCommand(text: string): Promise<string> {
  const cmd = text.trim().toLowerCase()

  // /status — quick health check
  if (cmd === '/status' || cmd === '/s') {
    const out = runCommand('rex status')
    return out || 'REX status unavailable'
  }

  // /doctor — full health check
  if (cmd === '/doctor' || cmd === '/d') {
    const out = runCommand('rex doctor')
    // Strip ANSI codes for Telegram
    return out.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 4000)
  }

  // /ingest — run ingest
  if (cmd === '/ingest' || cmd === '/i') {
    const out = runCommand('rex ingest')
    return `*Ingest*\n\`\`\`\n${out.slice(0, 3000)}\n\`\`\``
  }

  // /search <query> — semantic search
  if (cmd.startsWith('/search ') || cmd.startsWith('/q ')) {
    const query = text.replace(/^\/(search|q)\s+/i, '')
    if (!query) return 'Usage: /search <query>'
    const out = runCommand(`rex search ${query}`)
    return out ? `*Search:* ${query}\n\`\`\`\n${out.slice(0, 3000)}\n\`\`\`` : 'No results'
  }

  // /llm <prompt> — local LLM
  if (cmd.startsWith('/llm ') || cmd.startsWith('/ask ')) {
    const prompt = text.replace(/^\/(llm|ask)\s+/i, '')
    if (!prompt) return 'Usage: /llm <prompt>'
    const out = runCommand(`rex llm "${prompt.replace(/"/g, '\\"')}"`)
    return out.slice(0, 4000)
  }

  // /optimize — analyze CLAUDE.md
  if (cmd === '/optimize' || cmd === '/o') {
    const out = runCommand('rex optimize')
    return `*Optimize*\n\`\`\`\n${out.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 3000)}\n\`\`\``
  }

  // /git — quick git status
  if (cmd === '/git' || cmd === '/g') {
    const branch = runCommand('git branch --show-current 2>/dev/null || echo "n/a"')
    const status = runCommand('git status --short 2>/dev/null | head -15')
    const lastCommit = runCommand('git log -1 --format="%s" 2>/dev/null || echo "n/a"')
    return `*Git*\nBranch: \`${branch}\`\nLast: ${lastCommit}\n\`\`\`\n${status || 'Clean'}\n\`\`\``
  }

  // /sh <command> — run shell command (restricted)
  if (cmd.startsWith('/sh ') || cmd.startsWith('/run ')) {
    const shellCmd = text.replace(/^\/(sh|run)\s+/i, '')
    // Block dangerous commands
    const blocked = ['rm -rf', 'rm -r /', 'mkfs', 'dd if=', ':(){', 'chmod -R 777', 'git push --force main', 'git push --force master']
    if (blocked.some(b => shellCmd.toLowerCase().includes(b))) {
      return 'Blocked: dangerous command'
    }
    const out = runCommand(shellCmd)
    return `\`$ ${shellCmd}\`\n\`\`\`\n${out.slice(0, 3500)}\n\`\`\``
  }

  // /help
  if (cmd === '/help' || cmd === '/start' || cmd === '/h') {
    return `*REX Gateway*
━━━━━━━━━━━━━━
/status — Quick health check
/doctor — Full diagnostics
/ingest — Sync sessions to memory
/search <q> — Semantic search
/llm <prompt> — Ask local LLM
/optimize — Analyze CLAUDE.md
/git — Git status
/sh <cmd> — Run shell command
/help — This message`
  }

  // Unknown — try as LLM prompt if Ollama is up
  if (text.length > 3) {
    try {
      const check = await fetch('http://localhost:11434/api/tags')
      if (check.ok) {
        const out = runCommand(`rex llm "${text.replace(/"/g, '\\"')}"`)
        if (out && !out.includes('rex-claude') && !out.includes('Commands:')) {
          return out.slice(0, 4000)
        }
      }
    } catch {}
    return `Unknown command: "${text.slice(0, 50)}"\nSend /help for available commands.`
  }

  return 'Send /help for available commands.'
}

export async function gateway() {
  const creds = getCredentials()
  if (!creds) {
    console.error(`${COLORS.red}No Telegram credentials found.${COLORS.reset}`)
    console.error(`Run ${COLORS.cyan}rex setup${COLORS.reset} to configure Telegram gateway.`)
    process.exit(1)
  }

  const { token, chatId } = creds

  console.log(`${COLORS.bold}REX Gateway${COLORS.reset} — Telegram long-polling active`)
  console.log(`${COLORS.dim}Bot token: ...${token.slice(-8)}${COLORS.reset}`)
  console.log(`${COLORS.dim}Chat ID: ${chatId}${COLORS.reset}`)
  console.log(`${COLORS.dim}Press Ctrl+C to stop${COLORS.reset}\n`)

  // Flush old updates before starting (don't replay old messages)
  let offset = 0
  try {
    const flush = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1`)
    const flushData = await flush.json() as { result?: Array<{ update_id: number }> }
    if (flushData.result?.length) {
      offset = flushData.result[flushData.result.length - 1].update_id + 1
    }
  } catch {}

  await sendMessage(token, chatId, '🟢 *REX Gateway* started\nSend /help for commands.')
  const POLL_TIMEOUT = 30 // seconds (Telegram long-polling)

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`\n${COLORS.dim}Shutting down...${COLORS.reset}`)
    await sendMessage(token, chatId, '🔴 *REX Gateway* stopped')
    process.exit(0)
  })

  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=${POLL_TIMEOUT}&allowed_updates=["message"]`
      )
      const data = await res.json() as { ok: boolean; result: Array<{ update_id: number; message?: { chat: { id: number }; text?: string; from?: { username?: string } } }> }

      if (!data.ok || !data.result?.length) continue

      for (const update of data.result) {
        offset = update.update_id + 1

        const msg = update.message
        if (!msg?.text) continue

        // Only respond to authorized chat
        if (String(msg.chat.id) !== chatId) {
          console.log(`${COLORS.yellow}Ignored message from chat ${msg.chat.id}${COLORS.reset}`)
          continue
        }

        const from = msg.from?.username ?? '?'
        console.log(`${COLORS.cyan}@${from}${COLORS.reset}: ${msg.text}`)

        const reply = await handleCommand(msg.text)
        await sendMessage(token, chatId, reply)

        console.log(`${COLORS.green}→${COLORS.reset} ${reply.slice(0, 80)}...`)
      }
    } catch (err) {
      console.error(`${COLORS.red}Poll error:${COLORS.reset} ${(err as Error).message}`)
      // Wait before retrying on network error
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}
