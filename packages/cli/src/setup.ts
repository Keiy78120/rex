import { execSync } from 'node:child_process'
import { platform, totalmem } from 'node:os'

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

async function isOllamaInstalled(): Promise<boolean> {
  try {
    execSync('which ollama', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
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

export async function setup() {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX SETUP — LLM Configuration${COLORS.reset}`)
  console.log(`${line}\n`)

  // Hardware info
  const ramGB = Math.round(totalmem() / (1024 ** 3))
  const os = platform()
  info(`System: ${os}, ${ramGB}GB RAM`)

  // 1. Check Ollama installed
  if (!(await isOllamaInstalled())) {
    fail('Ollama not installed')
    console.log(`\n  Install: ${COLORS.cyan}https://ollama.com/download${COLORS.reset}`)
    if (os === 'darwin') {
      info('Opening download page...')
      try { execSync('open https://ollama.com/download', { stdio: 'ignore' }) } catch {}
    }
    return
  }
  ok('Ollama installed')

  // 2. Check Ollama running
  if (!(await isOllamaRunning())) {
    info('Starting Ollama...')
    try {
      execSync('ollama serve &', { stdio: 'ignore' })
      // Wait a bit for it to start
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

  // 3. Pull embedding model
  const models = await getInstalledModels()
  if (models.some(m => m.includes('nomic-embed-text'))) {
    ok('nomic-embed-text already installed')
  } else {
    pullModel('nomic-embed-text')
  }

  // 4. Pull reasoning model based on RAM
  const reasoningModel = ramGB >= 16 ? 'qwen3.5:9b' : 'qwen3.5:4b'
  info(`Selected reasoning model: ${reasoningModel} (${ramGB}GB RAM)`)

  if (models.some(m => m.includes(reasoningModel.split(':')[0]))) {
    ok(`${reasoningModel} already installed`)
  } else {
    pullModel(reasoningModel)
  }

  // 5. Test
  console.log(`\n  ${COLORS.dim}Testing...${COLORS.reset}`)
  const embedOk = await testEmbed()
  const genOk = await testGenerate(reasoningModel)

  if (embedOk) ok('Embedding test passed')
  else fail('Embedding test failed')

  if (genOk) ok('Generation test passed')
  else fail('Generation test failed')

  console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}`)
  if (embedOk && genOk) {
    console.log(`\n  ${COLORS.green}${COLORS.bold}Setup complete!${COLORS.reset} REX is ready for local AI.`)
  } else {
    console.log(`\n  ${COLORS.yellow}Setup incomplete.${COLORS.reset} Some tests failed — check Ollama logs.`)
  }
  console.log()
}
