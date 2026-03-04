import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'

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

  if (hasContextHook) {
    skip('Context injection hook (SessionStart) already configured')
  } else {
    // Create the context script
    const contextScript = join(claudeDir, 'rex-context.sh')
    if (!existsSync(contextScript)) {
      writeFileSync(contextScript, `#!/bin/bash
# REX Context Injection — runs at session start
# Outputs relevant memory context to CLAUDE_ENV_FILE

if [ -z "$CLAUDE_ENV_FILE" ]; then
  exit 0
fi

# Quick check if rex-memory MCP is available
if command -v npx &>/dev/null; then
  # Context will be loaded via MCP rex_context tool
  # This hook just ensures the env is ready
  echo "REX_MEMORY_AVAILABLE=true" >> "$CLAUDE_ENV_FILE"
fi
`, { mode: 0o755 })
    }

    if (!settings.hooks.SessionStart) settings.hooks.SessionStart = []
    settings.hooks.SessionStart.push({
      hooks: [{
        type: 'command',
        command: `bash ${contextScript}`,
        timeout: 5,
      }],
    })
    ok('Context injection hook configured (SessionStart)')
  }

  // 4. Check Ollama (required for embeddings)
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

  // 5. Save settings
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
