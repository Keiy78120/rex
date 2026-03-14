/** @module OPTIMIZE */
import { execSync } from 'node:child_process'
import { platform, totalmem, homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

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
function info(msg: string) { console.log(`  ${COLORS.cyan}ℹ${COLORS.reset} ${msg}`) }
function fail(msg: string) { console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`) }

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

export interface SetupOptions {
  nonInteractive?: boolean
  skipTelegram?: boolean
  autoInstallDeps?: boolean
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function hasBrew(): boolean {
  return commandExists('brew')
}

function tryBrewInstall(formula: string, isCask = false): boolean {
  if (!hasBrew()) return false
  try {
    const cmd = isCask ? `brew install --cask ${formula}` : `brew install ${formula}`
    execSync(cmd, { stdio: 'inherit' })
    return true
  } catch {
    return false
  }
}

async function isOllamaInstalled(): Promise<boolean> {
  return commandExists('ollama')
}

async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

async function getInstalledModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    const data = await res.json() as { models: Array<{ name: string }> }
    return data.models.map(m => m.name)
  } catch {
    return []
  }
}

function pullModel(model: string) {
  console.log(`  ${COLORS.dim}Pulling ${model}...${COLORS.reset}`)
  try {
    execSync(`ollama pull ${model}`, { stdio: 'inherit' })
    ok(`${model} installed`)
  } catch {
    fail(`Failed to pull ${model}`)
  }
}

async function testEmbed(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', input: 'test embedding' }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function testGenerate(model: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Say "ok" in one word.', stream: false }),
    })
    return res.ok
  } catch {
    return false
  }
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

async function ensurePlatformDeps(os: string, autoInstallDeps: boolean) {
  console.log(`\n  ${COLORS.bold}System Dependencies${COLORS.reset}`)

  const deps: Array<{ cmd: string; formula: string; cask?: boolean; label: string }> = [
    { cmd: 'ffmpeg', formula: 'ffmpeg', label: 'ffmpeg (audio logger)' },
    { cmd: 'whisper-cli', formula: 'whisper-cpp', label: 'whisper-cli (transcription)' },
    { cmd: 'hs', formula: 'hammerspoon', cask: true, label: 'Hammerspoon CLI (call watcher)' },
  ]

  for (const dep of deps) {
    if (commandExists(dep.cmd)) {
      ok(`${dep.label} available`)
      continue
    }

    if (!autoInstallDeps) {
      info(`${dep.label} missing`)
      continue
    }

    if (os !== 'darwin') {
      info(`${dep.label} missing (auto-install currently targets macOS)`)
      continue
    }

    if (!hasBrew()) {
      info(`${dep.label} missing and Homebrew not found`)
      continue
    }

    info(`Installing ${dep.label}...`)
    const installed = tryBrewInstall(dep.formula, dep.cask === true)
    if (installed && commandExists(dep.cmd)) ok(`${dep.label} installed`)
    else fail(`Could not install ${dep.label}`)
  }
}

async function setupTelegram(options: SetupOptions = {}) {
  console.log(`\n  ${COLORS.bold}Telegram Gateway${COLORS.reset}`)
  const nonInteractive = options.nonInteractive === true

  const settingsDir = join(homedir(), '.claude')
  const settingsPath = join(settingsDir, 'settings.json')
  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })

  let settings: any = {}
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
  if (!settings.env) settings.env = {}

  const existingToken = settings.env.REX_TELEGRAM_BOT_TOKEN
  const existingChat = settings.env.REX_TELEGRAM_CHAT_ID

  if (existingToken && existingChat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${existingToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: existingChat, text: '🔔 REX Setup — Telegram gateway verified', parse_mode: 'Markdown' }),
      })
      if (res.ok) {
        ok('Telegram gateway already configured and working')
        return
      }
    } catch {}
    info('Existing Telegram config found but not working — reconfiguring')
  }

  if (options.skipTelegram) {
    info('Skipping Telegram setup (flag enabled)')
    return
  }

  if (nonInteractive) {
    const envToken = process.env.REX_TELEGRAM_BOT_TOKEN
    const envChat = process.env.REX_TELEGRAM_CHAT_ID
    if (envToken && envChat) {
      settings.env.REX_TELEGRAM_BOT_TOKEN = envToken
      settings.env.REX_TELEGRAM_CHAT_ID = envChat
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
      ok('Telegram credentials loaded from environment')
      return
    }
    info('Telegram not configured (set REX_TELEGRAM_BOT_TOKEN + REX_TELEGRAM_CHAT_ID to enable)')
    return
  }

  const botToken = await prompt('Telegram Bot Token (from @BotFather):')
  if (!botToken) {
    info('Skipped Telegram setup')
    return
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
    const data = await res.json() as { ok: boolean; result?: { username: string } }
    if (!data.ok) {
      fail('Invalid bot token')
      return
    }
    ok(`Bot: @${data.result?.username}`)
  } catch {
    fail('Could not validate bot token')
    return
  }

  console.log(`\n  ${COLORS.dim}Send /start to your bot on Telegram, then press Enter...${COLORS.reset}`)
  await prompt('Press Enter when done')

  let chatId = ''
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`)
    const data = await res.json() as { result: Array<{ message?: { chat: { id: number }; from?: { username?: string } } }> }
    const msg = data.result?.find(u => u.message)
    if (msg?.message) {
      chatId = String(msg.message.chat.id)
      ok(`Chat ID: ${chatId} (from @${msg.message.from?.username ?? '?'})`)
    }
  } catch {}

  if (!chatId) {
    chatId = await prompt('Chat ID (could not auto-detect):')
  }

  if (!chatId) {
    fail('No chat ID — Telegram setup aborted')
    return
  }

  settings.env.REX_TELEGRAM_BOT_TOKEN = botToken
  settings.env.REX_TELEGRAM_CHAT_ID = chatId
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  ok('Telegram credentials saved to settings.json')

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ *REX Setup Complete*\nTelegram gateway is active.', parse_mode: 'Markdown' }),
    })
    ok('Test message sent — check Telegram!')
  } catch {
    fail('Could not send test message')
  }
}

export async function setup(options: SetupOptions = {}) {
  const nonInteractive = options.nonInteractive === true
  const autoInstallDeps = options.autoInstallDeps ?? nonInteractive
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX SETUP — Full Configuration${COLORS.reset}`)
  console.log(`${line}\n`)

  const ramGB = Math.round(totalmem() / (1024 ** 3))
  const os = platform()
  info(`System: ${os}, ${ramGB}GB RAM`)

  await ensurePlatformDeps(os, autoInstallDeps)

  if (!(await isOllamaInstalled())) {
    if (autoInstallDeps && os === 'darwin' && hasBrew()) {
      info('Installing Ollama via Homebrew...')
      tryBrewInstall('ollama')
    }

    if (!(await isOllamaInstalled())) {
      fail('Ollama not installed')
      console.log(`\n  Install: ${COLORS.cyan}https://ollama.com/download${COLORS.reset}`)
      if (os === 'darwin' && !nonInteractive) {
        info('Opening download page...')
        try { execSync('open https://ollama.com/download', { stdio: 'ignore' }) } catch {}
      }
      return
    }
  }
  ok('Ollama installed')

  if (!(await isOllamaRunning())) {
    info('Starting Ollama...')
    try {
      execSync('nohup ollama serve > ~/.claude/rex-ollama.log 2>&1 &', { stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 3000))
      if (await isOllamaRunning()) {
        ok('Ollama started')
      } else {
        fail('Could not start Ollama — start manually: ollama serve')
        return
      }
    } catch {
      fail('Could not start Ollama — start manually: ollama serve')
      return
    }
  } else {
    ok('Ollama running')
  }

  const models = await getInstalledModels()
  if (models.some(m => m.includes('nomic-embed-text'))) {
    ok('nomic-embed-text already installed')
  } else {
    pullModel('nomic-embed-text')
  }

  const reasoningModel = ramGB >= 16 ? 'qwen3.5:9b' : 'qwen3.5:4b'
  info(`Selected reasoning model: ${reasoningModel} (${ramGB}GB RAM)`)

  if (models.some(m => m.includes(reasoningModel.split(':')[0]))) {
    ok(`${reasoningModel} already installed`)
  } else {
    pullModel(reasoningModel)
  }

  console.log(`\n  ${COLORS.dim}Testing...${COLORS.reset}`)
  const embedOk = await testEmbed()
  const genOk = await testGenerate(reasoningModel)

  if (embedOk) ok('Embedding test passed')
  else fail('Embedding test failed')

  if (genOk) ok('Generation test passed')
  else fail('Generation test failed')

  await setupTelegram(options)

  console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}`)
  if (embedOk && genOk) {
    console.log(`\n  ${COLORS.green}${COLORS.bold}Setup complete!${COLORS.reset} REX is fully configured.`)
  } else {
    console.log(`\n  ${COLORS.yellow}Setup partial.${COLORS.reset} Some tests failed — check Ollama logs.`)
  }
  console.log()
}
