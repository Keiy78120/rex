// packages/cli/src/agents.ts — REX Autonomous Agents (Claude Code + Ollama)
import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, execSync, ChildProcess } from 'node:child_process'

// ─── Types ──────────────────────────────────────────────────

interface AgentDef {
  id: string
  name: string
  profile: string
  prompt: string
  model: 'claude' | 'local'
  localModel?: string
  cwd?: string
  allowedTools: string[]
  maxTurns: number
  maxRetries: number
  intervalSec: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  totalRuns: number
  totalErrors: number
  team?: string
  mcpServers?: string[]
}

interface AgentStore {
  agents: AgentDef[]
}

interface AgentRuntime {
  id: string
  pid: number | null
  running: boolean
  startedAt?: string
  lastHeartbeat?: string
  lastRunAt?: string
  lastError?: string
  consecutiveErrors: number
  currentRetry: number
}

interface RunResult {
  ok: boolean
  output: string
  exitCode: number | null
  duration: number
  toolsUsed: string[]
  turns: number
  error?: string
}

// ─── Constants ──────────────────────────────────────────────

const HOME = homedir()
const ROOT_DIR = join(HOME, '.claude', 'rex', 'agents')
const STORE_FILE = join(ROOT_DIR, 'agents.json')
const LOGS_DIR = join(ROOT_DIR, 'logs')
const RUNTIME_DIR = join(ROOT_DIR, 'runtime')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

// ─── Profile Templates ─────────────────────────────────────

const PROFILE_TEMPLATES: Record<string, {
  prompt: string
  allowedTools: string[]
  maxTurns: number
  model: 'claude' | 'local'
  intervalSec: number
}> = {
  scout: {
    prompt: 'You are a codebase scout. Read files, analyze structure, identify issues, and report findings. Do NOT modify any files.',
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash(ls *)', 'Bash(git *)'],
    maxTurns: 10,
    model: 'claude',
    intervalSec: 0, // one-shot by default
  },
  reviewer: {
    prompt: 'You are a strict code reviewer. Analyze recent changes, find bugs, security issues, missing tests. Report with file:line references and severity. Do NOT modify files.',
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash(git *)', 'Bash(npm test *)', 'Bash(pnpm test *)'],
    maxTurns: 20,
    model: 'claude',
    intervalSec: 0,
  },
  fixer: {
    prompt: 'You are an autonomous bug fixer. Identify the bug, understand root cause, implement the fix, verify it compiles/passes tests. Create a git commit when done.',
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    maxTurns: 30,
    model: 'claude',
    intervalSec: 0,
  },
  architect: {
    prompt: 'You are a senior architect. Analyze the full codebase, identify tech debt, propose refactoring plans, check for scalability issues. Write a report to docs/audit.md.',
    allowedTools: ['Read', 'Write', 'Glob', 'Grep', 'Bash(git *)', 'Bash(wc *)', 'Bash(cloc *)'],
    maxTurns: 40,
    model: 'claude',
    intervalSec: 0,
  },
  worker: {
    prompt: 'You are an autonomous worker. Execute the assigned task end-to-end: plan, implement, test, verify. If something fails, debug and retry. Do not stop until the task is complete or you have exhausted all approaches.',
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    maxTurns: 50,
    model: 'claude',
    intervalSec: 0,
  },
  monitor: {
    prompt: 'You are a system monitor. Check health of services, verify builds pass, check for stale branches, report anomalies. Run periodically.',
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash(git *)', 'Bash(curl *)', 'Bash(rex *)'],
    maxTurns: 15,
    model: 'claude',
    intervalSec: 3600, // hourly
  },
  watchdog: {
    prompt: `You are the REX Watchdog. Monitor system health and fix issues automatically.
Check: 1) rex ingest runs and captures new sessions (delta ingest for growing files)
2) Ollama is running for embeddings 3) LaunchAgents are loaded 4) Memory DB is not corrupted.
If ingest is behind, run "rex ingest" to catch up. If Ollama is down, try "ollama serve".
Report what you checked and any actions taken.`,
    allowedTools: ['Read', 'Bash(rex *)', 'Bash(ollama *)', 'Bash(launchctl *)', 'Bash(ps *)', 'Bash(curl *)'],
    maxTurns: 15,
    model: 'claude',
    intervalSec: 1800, // every 30 min
  },
  'local-analyst': {
    prompt: 'Analyze the project and provide insights on architecture, patterns, and potential improvements.',
    allowedTools: [],
    maxTurns: 1,
    model: 'local',
    intervalSec: 0,
  },
  orchestrator: {
    prompt: `You are the REX Orchestrator (Opus). You supervise all agents, detect loops/crashes, and coordinate work.
You know all agent profiles and can create, start, stop, and monitor agents.
Use local LLM (Ollama) for simple tasks and Claude for complex ones.
If an agent fails 3 times consecutively, stop it and alert.
Always explain what you are doing and why.`,
    allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
    maxTurns: 100,
    model: 'claude',
    intervalSec: 0,
  },
}

// ─── Storage Helpers ────────────────────────────────────────

function ensureDirs() {
  for (const d of [ROOT_DIR, LOGS_DIR, RUNTIME_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true })
  }
}

function readStore(): AgentStore {
  ensureDirs()
  try {
    if (existsSync(STORE_FILE)) {
      const parsed = JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as AgentStore
      if (Array.isArray(parsed.agents)) return parsed
    }
  } catch { /* noop */ }
  return { agents: [] }
}

function writeStore(store: AgentStore) {
  ensureDirs()
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2))
}

function runtimePath(id: string) { return join(RUNTIME_DIR, `${id}.json`) }

function readRuntime(id: string): AgentRuntime {
  try {
    const p = runtimePath(id)
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as AgentRuntime
  } catch { /* noop */ }
  return { id, pid: null, running: false, consecutiveErrors: 0, currentRetry: 0 }
}

function writeRuntime(id: string, data: AgentRuntime) {
  ensureDirs()
  writeFileSync(runtimePath(id), JSON.stringify(data, null, 2))
}

function isPidRunning(pid: number | null): boolean {
  if (!pid || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

function logPath(id: string) { return join(LOGS_DIR, `${id}.log`) }

function appendLog(id: string, text: string) {
  ensureDirs()
  const now = new Date().toISOString()
  appendFileSync(logPath(id), `[${now}] ${text}\n`)
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'agent'
}

function parseFlag(args: string[], name: string): string | null {
  // Support --flag=value and --flag value
  const eqIdx = args.findIndex(a => a.startsWith(`${name}=`))
  if (eqIdx >= 0) return args[eqIdx].split('=').slice(1).join('=')
  const idx = args.findIndex(a => a === name)
  if (idx < 0) return null
  return args[idx + 1] || null
}

function findAgent(store: AgentStore, idOrName: string): AgentDef | null {
  return store.agents.find(a => a.id === idOrName || a.name === idOrName) || null
}

// ─── Context Builder ────────────────────────────────────────

function buildAgentContext(agent: AgentDef): string {
  const parts: string[] = []

  // Inject REX context awareness
  parts.push('# Agent Context (auto-injected by REX)')
  parts.push(`Agent: ${agent.name} (${agent.profile})`)
  parts.push(`Time: ${new Date().toISOString()}`)
  parts.push(`Run #${agent.totalRuns + 1}`)

  // Detect current project from cwd
  if (agent.cwd) {
    const claudeMd = join(agent.cwd, 'CLAUDE.md')
    if (existsSync(claudeMd)) {
      try {
        const content = readFileSync(claudeMd, 'utf-8').slice(0, 2000)
        parts.push(`\n# Project Context (from CLAUDE.md)\n${content}`)
      } catch { /* noop */ }
    }
  }

  // Inject last error for self-correction
  const rt = readRuntime(agent.id)
  if (rt.lastError) {
    parts.push(`\n# Previous Run Error (self-correct this)\n${rt.lastError.slice(0, 500)}`)
  }

  parts.push('\n# Instructions')
  parts.push(agent.prompt)
  parts.push('\n# Rules')
  parts.push('- Be autonomous: plan, execute, verify, retry if needed.')
  parts.push('- If a tool call fails, analyze the error and try a different approach.')
  parts.push('- If stuck after 3 attempts at the same approach, stop and report what you tried.')
  parts.push('- Always verify your work before declaring done (build, test, or read back).')
  parts.push('- Be concise in your output. Focus on actions taken and results.')

  return parts.join('\n')
}

// ─── Claude Code Runner ─────────────────────────────────────

function findClaudeCli(): string | null {
  try {
    const path = execSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim()
    return path || null
  } catch { return null }
}

async function runWithClaude(agent: AgentDef, task?: string): Promise<RunResult> {
  const claudePath = findClaudeCli()
  if (!claudePath) {
    return { ok: false, output: '', exitCode: 1, duration: 0, toolsUsed: [], turns: 0, error: 'Claude CLI not found. Install: npm i -g @anthropic-ai/claude-code' }
  }

  const systemPrompt = buildAgentContext(agent)
  const prompt = task || agent.prompt
  const start = Date.now()

  const args = [
    '-p', prompt,
    '--append-system-prompt', systemPrompt,
    '--output-format', 'json',
    '--max-turns', String(agent.maxTurns),
  ]

  // Add allowed tools and enforce with permissionMode
  if (agent.allowedTools.length > 0) {
    for (const tool of agent.allowedTools) {
      args.push('--allowedTools', tool)
    }
    // acceptEdits = auto-approve listed tools + edits, prompt for dangerous ops
    args.push('--permission-mode', 'acceptEdits')
  }

  // Inject MCP servers if configured
  if (agent.mcpServers && agent.mcpServers.length > 0) {
    for (const mcp of agent.mcpServers) {
      args.push('--mcp-server', mcp)
    }
  }

  return new Promise<RunResult>((resolve) => {
    const cwd = agent.cwd || process.cwd()
    // Remove CLAUDECODE env var to allow spawning from within CC sessions
    const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'rex-agent' }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_SESSION
    // Multi-instance: isolate config per agent to avoid session conflicts
    const agentConfigDir = join(HOME, `.claude-agent-${agent.id}`)
    if (!existsSync(agentConfigDir)) mkdirSync(agentConfigDir, { recursive: true })
    env.CLAUDE_CONFIG_DIR = agentConfigDir
    const child = spawn(claudePath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600_000, // 10 min max
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    child.on('close', (code) => {
      const duration = Date.now() - start
      let output = ''
      let toolsUsed: string[] = []
      let turns = 0

      try {
        const parsed = JSON.parse(stdout)
        output = parsed.result || parsed.output || ''
        turns = parsed.num_turns || 0
        if (parsed.tools_used) toolsUsed = parsed.tools_used
        // session_id for potential resume
      } catch {
        // If JSON parse fails, try to extract result from NDJSON (stream-json output)
        // or use raw stdout
        const lines = stdout.trim().split('\n')
        for (const line of lines.reverse()) {
          try {
            const obj = JSON.parse(line)
            if (obj.result) { output = obj.result; break }
            if (obj.type === 'result' && obj.result) { output = obj.result; break }
          } catch { /* skip non-JSON lines */ }
        }
        if (!output) output = stdout || stderr
      }

      resolve({
        ok: code === 0,
        output: output.slice(0, 10000), // cap log size
        exitCode: code,
        duration,
        toolsUsed,
        turns,
        error: code !== 0 ? (stderr || `Exit code ${code}`).slice(0, 2000) : undefined,
      })
    })

    child.on('error', (err) => {
      resolve({
        ok: false,
        output: '',
        exitCode: 1,
        duration: Date.now() - start,
        toolsUsed: [],
        turns: 0,
        error: err.message,
      })
    })
  })
}

// ─── Ollama Runner (local fallback) ─────────────────────────

async function runWithOllama(agent: AgentDef, task?: string): Promise<RunResult> {
  const start = Date.now()
  const prompt = buildAgentContext(agent) + '\n\nTask: ' + (task || agent.prompt)

  // Detect available model
  let model = agent.localModel || 'qwen3.5:4b'
  try {
    const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (tagsRes.ok) {
      const tags = await tagsRes.json() as { models?: Array<{ name?: string }> }
      const names = (tags.models || []).map(m => m.name || '').filter(Boolean)
      if (!names.includes(model)) {
        const base = model.split(':')[0]
        model = names.find(n => n.includes(base)) || names.find(n => !n.includes('embed')) || model
      }
    }
  } catch { /* use default */ }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, keep_alive: '30s' }),
      signal: AbortSignal.timeout(300_000),
    })

    if (!res.ok) throw new Error(`Ollama ${res.status}`)
    const data = await res.json() as { response?: string }
    const output = (data.response || '').trim()

    return {
      ok: true,
      output: output.slice(0, 10000),
      exitCode: 0,
      duration: Date.now() - start,
      toolsUsed: [],
      turns: 1,
    }
  } catch (e: any) {
    return {
      ok: false,
      output: '',
      exitCode: 1,
      duration: Date.now() - start,
      toolsUsed: [],
      turns: 0,
      error: e.message,
    }
  }
}

// ─── Agent Executor (with retry & self-correction) ──────────

async function executeAgent(agent: AgentDef, task?: string): Promise<RunResult> {
  const runner = agent.model === 'claude' ? runWithClaude : runWithOllama
  let lastResult: RunResult = { ok: false, output: '', exitCode: 1, duration: 0, toolsUsed: [], turns: 0 }

  for (let attempt = 0; attempt <= agent.maxRetries; attempt++) {
    if (attempt > 0) {
      appendLog(agent.id, `RETRY ${attempt}/${agent.maxRetries} — self-correcting from: ${lastResult.error?.slice(0, 200)}`)
      // Inject error context for self-correction
      const rt = readRuntime(agent.id)
      writeRuntime(agent.id, { ...rt, currentRetry: attempt, lastError: lastResult.error || lastResult.output.slice(0, 500) })

      // Exponential backoff: 5s, 15s, 45s
      await new Promise(r => setTimeout(r, 5000 * Math.pow(3, attempt - 1)))
    }

    lastResult = await runner(agent, task)

    if (lastResult.ok) {
      return lastResult
    }

    appendLog(agent.id, `ATTEMPT ${attempt + 1} FAILED (${lastResult.duration}ms): ${lastResult.error?.slice(0, 300)}`)
  }

  return lastResult
}

// ─── CLI Commands ───────────────────────────────────────────

function listAgents(jsonMode: boolean) {
  const store = readStore()
  const rows = store.agents.map(a => {
    const rt = readRuntime(a.id)
    const running = rt.running && isPidRunning(rt.pid)
    return { id: a.id, name: a.name, profile: a.profile, model: a.model, enabled: a.enabled, running, lastRunAt: a.lastRunAt || null, totalRuns: a.totalRuns, totalErrors: a.totalErrors, intervalSec: a.intervalSec }
  })

  if (jsonMode) { console.log(JSON.stringify({ agents: rows }, null, 2)); return }

  if (rows.length === 0) {
    console.log(`No agents. Create one:\n  rex agents create <${Object.keys(PROFILE_TEMPLATES).join('|')}> [name] [--cwd path] [--task "..."]`)
    return
  }

  const line = '─'.repeat(60)
  console.log(`\n${COLORS.bold}  REX Agents${COLORS.reset}\n${line}`)
  for (const r of rows) {
    const status = r.running ? `${COLORS.green}RUNNING${COLORS.reset}` : r.enabled ? `${COLORS.yellow}IDLE${COLORS.reset}` : `${COLORS.dim}DISABLED${COLORS.reset}`
    const model = r.model === 'claude' ? `${COLORS.magenta}claude${COLORS.reset}` : `${COLORS.cyan}local${COLORS.reset}`
    const schedule = r.intervalSec > 0 ? `every ${r.intervalSec}s` : 'one-shot'
    console.log(`  ${status}  ${COLORS.bold}${r.name}${COLORS.reset} (${r.profile}) ${model} — ${schedule}`)
    console.log(`  ${COLORS.dim}  id=${r.id} runs=${r.totalRuns} errors=${r.totalErrors} last=${r.lastRunAt || 'never'}${COLORS.reset}`)
  }
  console.log(line)
}

function createAgent(args: string[]) {
  const profile = args[0]
  if (!profile || !PROFILE_TEMPLATES[profile]) {
    console.log(`Usage: rex agents create <${Object.keys(PROFILE_TEMPLATES).join('|')}> [name] [--cwd path] [--task "..."] [--model claude|local] [--interval sec] [--team name]`)
    return
  }

  const template = PROFILE_TEMPLATES[profile]
  const store = readStore()
  const nameArg = args[1] && !args[1].startsWith('--') ? args[1] : `${profile}-agent`
  const taskOverride = parseFlag(args, '--task')
  const cwdOverride = parseFlag(args, '--cwd')
  const modelOverride = parseFlag(args, '--model') as 'claude' | 'local' | null
  const intervalOverride = parseFlag(args, '--interval')
  const maxTurnsOverride = parseFlag(args, '--max-turns')
  const maxRetriesOverride = parseFlag(args, '--max-retries')
  const teamFlag = parseFlag(args, '--team')
  const mcpFlag = parseFlag(args, '--mcp')

  const id = `${slug(nameArg)}-${Date.now().toString().slice(-6)}`
  const now = new Date().toISOString()

  // Smart CWD detection: use current dir if not specified
  const cwd = cwdOverride || process.cwd()

  const agent: AgentDef = {
    id,
    name: nameArg,
    profile,
    prompt: taskOverride || template.prompt,
    model: modelOverride || template.model,
    localModel: modelOverride === 'local' ? 'qwen3.5:4b' : undefined,
    cwd,
    allowedTools: template.allowedTools,
    maxTurns: parseInt(maxTurnsOverride || String(template.maxTurns), 10),
    maxRetries: parseInt(maxRetriesOverride || '2', 10),
    intervalSec: parseInt(intervalOverride || String(template.intervalSec), 10),
    enabled: true,
    createdAt: now,
    updatedAt: now,
    totalRuns: 0,
    totalErrors: 0,
    team: teamFlag || undefined,
    mcpServers: mcpFlag ? mcpFlag.split(',').map(s => s.trim()).filter(Boolean) : undefined,
  }

  store.agents.push(agent)
  writeStore(store)
  writeRuntime(agent.id, { id: agent.id, pid: null, running: false, consecutiveErrors: 0, currentRetry: 0 })

  console.log(`\n${COLORS.green}Agent created:${COLORS.reset} ${agent.name} (${agent.profile})`)
  console.log(`  ${COLORS.dim}id:${COLORS.reset}    ${agent.id}`)
  console.log(`  ${COLORS.dim}model:${COLORS.reset} ${agent.model}`)
  console.log(`  ${COLORS.dim}cwd:${COLORS.reset}   ${agent.cwd}`)
  console.log(`  ${COLORS.dim}tools:${COLORS.reset} ${agent.allowedTools.join(', ') || 'none (local mode)'}`)
  console.log(`  ${COLORS.dim}turns:${COLORS.reset} ${agent.maxTurns} max, ${agent.maxRetries} retries`)
  console.log(`\nRun it: ${COLORS.cyan}rex agents run ${agent.name}${COLORS.reset}`)
}

async function runAgent(args: string[]) {
  const idOrName = args[0]
  const once = args.includes('--once') || !args.includes('--daemon')
  const taskOverride = parseFlag(args, '--task')

  if (!idOrName) {
    console.log('Usage: rex agents run <id|name> [--task "..."] [--daemon]')
    return
  }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) { console.log(`Agent not found: ${idOrName}`); return }

  // Check if already running
  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    console.log(`${COLORS.yellow}Already running${COLORS.reset} (pid ${rt.pid}). Use: rex agents stop ${agent.name}`)
    return
  }

  // One-shot mode (default): run inline, show output
  if (once || agent.intervalSec === 0) {
    console.log(`\n${COLORS.bold}Running ${agent.name}${COLORS.reset} (${agent.profile}, ${agent.model})...`)
    console.log(`${COLORS.dim}cwd: ${agent.cwd || process.cwd()}${COLORS.reset}`)
    console.log(`${COLORS.dim}tools: ${agent.allowedTools.join(', ') || 'local LLM'}${COLORS.reset}`)
    console.log(`${COLORS.dim}max turns: ${agent.maxTurns}, retries: ${agent.maxRetries}${COLORS.reset}\n`)

    writeRuntime(agent.id, { ...rt, pid: process.pid, running: true, startedAt: new Date().toISOString(), lastHeartbeat: new Date().toISOString(), consecutiveErrors: 0, currentRetry: 0 })

    const result = await executeAgent(agent, taskOverride || undefined)

    // Update stats
    agent.lastRunAt = new Date().toISOString()
    agent.updatedAt = new Date().toISOString()
    agent.totalRuns++
    if (!result.ok) agent.totalErrors++
    writeStore(store)
    writeRuntime(agent.id, { ...readRuntime(agent.id), pid: null, running: false, lastRunAt: agent.lastRunAt, lastError: result.error, consecutiveErrors: result.ok ? 0 : (readRuntime(agent.id).consecutiveErrors + 1), currentRetry: 0 })

    // Log
    const status = result.ok ? 'OK' : 'FAIL'
    appendLog(agent.id, `RUN ${status} (${result.duration}ms, ${result.turns} turns, tools: ${result.toolsUsed.join(',') || 'none'})`)
    // Log only meaningful output (skip raw JSON transcripts)
    if (result.output && !result.output.startsWith('[{"type":"system"')) appendLog(agent.id, result.output.slice(0, 5000))
    if (result.error) appendLog(agent.id, `ERROR: ${result.error}`)

    // Print result
    if (result.ok) {
      console.log(`${COLORS.green}Done${COLORS.reset} (${Math.round(result.duration / 1000)}s, ${result.turns} turns)\n`)
      console.log(result.output)
    } else {
      console.log(`${COLORS.red}Failed${COLORS.reset} (${Math.round(result.duration / 1000)}s)\n`)
      console.log(result.error || result.output)
    }
    return
  }

  // Daemon mode: spawn detached background process
  const script = process.argv[1]
  const child = spawn(process.execPath, [script, 'agents', '_daemon-loop', agent.id], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const pid = child.pid || null
  writeRuntime(agent.id, { id: agent.id, pid, running: pid !== null, startedAt: new Date().toISOString(), lastHeartbeat: new Date().toISOString(), consecutiveErrors: 0, currentRetry: 0 })

  console.log(`${COLORS.green}Agent started in background${COLORS.reset} (pid ${pid})`)
  console.log(`  Logs: rex agents logs ${agent.name}`)
  console.log(`  Stop: rex agents stop ${agent.name}`)
}

// Daemon loop for scheduled agents
async function daemonLoop(agentId: string) {
  let alive = true
  process.on('SIGTERM', () => { alive = false })
  process.on('SIGINT', () => { alive = false })

  const MAX_CONSECUTIVE_ERRORS = 5

  while (alive) {
    const store = readStore()
    const agent = store.agents.find(a => a.id === agentId)
    if (!agent || !agent.enabled) break

    const runtime = readRuntime(agent.id)

    // Circuit breaker: stop after too many consecutive errors
    if (runtime.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      appendLog(agent.id, `CIRCUIT BREAKER: ${runtime.consecutiveErrors} consecutive errors — stopping agent`)
      break
    }

    writeRuntime(agent.id, { ...runtime, id: agent.id, pid: process.pid, running: true, lastHeartbeat: new Date().toISOString() })

    const result = await executeAgent(agent)

    // Update stats
    agent.lastRunAt = new Date().toISOString()
    agent.updatedAt = new Date().toISOString()
    agent.totalRuns++
    if (!result.ok) agent.totalErrors++
    writeStore(store)

    const newConsecutive = result.ok ? 0 : (runtime.consecutiveErrors + 1)
    writeRuntime(agent.id, { ...readRuntime(agent.id), id: agent.id, pid: process.pid, running: true, lastRunAt: agent.lastRunAt, lastError: result.error, consecutiveErrors: newConsecutive, currentRetry: 0, lastHeartbeat: new Date().toISOString() })

    const status = result.ok ? 'OK' : 'FAIL'
    appendLog(agent.id, `SCHEDULED RUN ${status} (${result.duration}ms, ${result.turns} turns)`)
    if (result.output && !result.output.startsWith('[{"type":"system"')) appendLog(agent.id, result.output.slice(0, 3000))
    if (result.error) appendLog(agent.id, `ERROR: ${result.error}`)

    // Wait for next interval (min 30s)
    const interval = Math.max(30, agent.intervalSec)
    await new Promise(r => setTimeout(r, interval * 1000))
  }

  // Clean exit
  const finalState = readRuntime(agentId)
  writeRuntime(agentId, { ...finalState, id: agentId, pid: null, running: false, lastHeartbeat: new Date().toISOString() })
  appendLog(agentId, 'DAEMON STOPPED')
}

function stopAgent(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) { console.log('Usage: rex agents stop <id|name>'); return }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) { console.log(`Agent not found: ${idOrName}`); return }

  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    try { process.kill(rt.pid, 'SIGTERM') } catch { /* noop */ }
    console.log(`${COLORS.green}Stopped${COLORS.reset} ${agent.name} (pid ${rt.pid})`)
  } else {
    console.log(`${COLORS.dim}${agent.name} was not running${COLORS.reset}`)
  }

  writeRuntime(agent.id, { ...rt, running: false, pid: null, lastHeartbeat: new Date().toISOString() })
}

function statusAgent(args: string[], jsonMode: boolean) {
  const idOrName = args[0]
  if (!idOrName) { listAgents(jsonMode); return }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) { console.log(`Agent not found: ${idOrName}`); return }

  const rt = readRuntime(agent.id)
  const running = rt.running && isPidRunning(rt.pid)

  if (jsonMode) {
    console.log(JSON.stringify({ ...agent, runtime: { ...rt, running } }, null, 2))
    return
  }

  const status = running ? `${COLORS.green}RUNNING${COLORS.reset}` : agent.enabled ? `${COLORS.yellow}IDLE${COLORS.reset}` : `${COLORS.dim}DISABLED${COLORS.reset}`

  console.log(`\n  ${COLORS.bold}${agent.name}${COLORS.reset} ${status}`)
  console.log(`  Profile:   ${agent.profile}`)
  console.log(`  Model:     ${agent.model}${agent.localModel ? ` (${agent.localModel})` : ''}`)
  console.log(`  CWD:       ${agent.cwd || 'current dir'}`)
  console.log(`  Tools:     ${agent.allowedTools.join(', ') || 'none'}`)
  console.log(`  Turns:     ${agent.maxTurns} max, ${agent.maxRetries} retries`)
  console.log(`  Schedule:  ${agent.intervalSec > 0 ? `every ${agent.intervalSec}s` : 'one-shot'}`)
  console.log(`  Runs:      ${agent.totalRuns} total, ${agent.totalErrors} errors`)
  console.log(`  Last run:  ${agent.lastRunAt || 'never'}`)
  if (rt.lastError) console.log(`  Last err:  ${COLORS.red}${rt.lastError.slice(0, 100)}${COLORS.reset}`)
  if (rt.consecutiveErrors > 0) console.log(`  Consec errors: ${COLORS.red}${rt.consecutiveErrors}${COLORS.reset}`)
  console.log()
}

function showLogs(args: string[]) {
  const idOrName = args[0]
  const tailArg = parseFlag(args, '--tail')
  const tail = Math.max(1, parseInt(tailArg || '50', 10))

  if (!idOrName) { console.log('Usage: rex agents logs <id|name> [--tail N]'); return }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) { console.log(`Agent not found: ${idOrName}`); return }

  const p = logPath(agent.id)
  if (!existsSync(p)) { console.log('No logs yet.'); return }

  const lines = readFileSync(p, 'utf-8').split('\n').filter(Boolean)
  console.log(lines.slice(-tail).join('\n'))
}

function setEnabled(args: string[], enabled: boolean) {
  const idOrName = args[0]
  if (!idOrName) { console.log(`Usage: rex agents ${enabled ? 'enable' : 'disable'} <id|name>`); return }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) { console.log(`Agent not found: ${idOrName}`); return }

  agent.enabled = enabled
  agent.updatedAt = new Date().toISOString()
  writeStore(store)
  console.log(`${enabled ? COLORS.green : COLORS.yellow}${agent.name} ${enabled ? 'enabled' : 'disabled'}${COLORS.reset}`)
}

function deleteAgent(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) { console.log('Usage: rex agents delete <id|name>'); return }

  const store = readStore()
  const idx = store.agents.findIndex(a => a.id === idOrName || a.name === idOrName)
  if (idx < 0) { console.log(`Agent not found: ${idOrName}`); return }

  const agent = store.agents[idx]
  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    try { process.kill(rt.pid, 'SIGTERM') } catch { /* noop */ }
  }

  store.agents.splice(idx, 1)
  writeStore(store)
  console.log(`${COLORS.green}Deleted${COLORS.reset} ${agent.name}`)
}

function profiles(jsonMode: boolean) {
  const rows = Object.entries(PROFILE_TEMPLATES).map(([name, t]) => ({
    name, model: t.model, allowedTools: t.allowedTools, maxTurns: t.maxTurns, intervalSec: t.intervalSec, prompt: t.prompt.slice(0, 80) + '...',
  }))

  if (jsonMode) { console.log(JSON.stringify({ profiles: rows }, null, 2)); return }

  const line = '─'.repeat(60)
  console.log(`\n${COLORS.bold}  Agent Profiles${COLORS.reset}\n${line}`)
  for (const r of rows) {
    const model = r.model === 'claude' ? `${COLORS.magenta}claude${COLORS.reset}` : `${COLORS.cyan}local${COLORS.reset}`
    const schedule = r.intervalSec > 0 ? `every ${r.intervalSec}s` : 'one-shot'
    console.log(`  ${COLORS.bold}${r.name}${COLORS.reset} ${model} — ${r.maxTurns} turns — ${schedule}`)
    console.log(`  ${COLORS.dim}${r.prompt}${COLORS.reset}`)
    if (r.allowedTools.length) console.log(`  ${COLORS.dim}tools: ${r.allowedTools.join(', ')}${COLORS.reset}`)
    console.log()
  }
}

// ─── Team & Orchestrator ─────────────────────────────────────

function teamCommand(args: string[]) {
  const teamName = args[0]
  if (!teamName) {
    // List all teams
    const store = readStore()
    const teams = [...new Set(store.agents.filter(a => a.team).map(a => a.team!))]
    if (teams.length === 0) { console.log('No teams defined. Create agents with --team <name>'); return }
    for (const t of teams) {
      const members = store.agents.filter(a => a.team === t)
      console.log(`\n${COLORS.bold}${t}${COLORS.reset} (${members.length} agents)`)
      for (const m of members) {
        const rt = readRuntime(m.id)
        const running = rt.running && isPidRunning(rt.pid)
        const status = running ? `${COLORS.green}RUN${COLORS.reset}` : `${COLORS.dim}IDLE${COLORS.reset}`
        console.log(`  ${status} ${m.name} (${m.profile})`)
      }
    }
    return
  }
  // List specific team
  const store = readStore()
  const members = store.agents.filter(a => a.team === teamName)
  if (members.length === 0) { console.log(`No agents in team "${teamName}"`); return }
  console.log(`\n${COLORS.bold}Team: ${teamName}${COLORS.reset}`)
  for (const m of members) {
    const rt = readRuntime(m.id)
    const running = rt.running && isPidRunning(rt.pid)
    const status = running ? `${COLORS.green}RUNNING${COLORS.reset}` : `${COLORS.dim}IDLE${COLORS.reset}`
    console.log(`  ${status} ${m.name} (${m.profile})`)
  }
}

async function chatWithOrchestrator(args: string[]) {
  const message = args.join(' ')
  if (!message) {
    console.log('Usage: rex agents chat <message>')
    console.log('Sends a message to the orchestrator agent.')
    return
  }

  // Find or auto-create orchestrator
  const store = readStore()
  let orch = store.agents.find(a => a.profile === 'orchestrator')
  if (!orch) {
    console.log(`${COLORS.cyan}Creating orchestrator agent...${COLORS.reset}`)
    // Auto-create
    const template = PROFILE_TEMPLATES.orchestrator
    const id = `orchestrator-${Date.now().toString().slice(-6)}`
    const now = new Date().toISOString()
    orch = {
      id,
      name: 'orchestrator',
      profile: 'orchestrator',
      prompt: template.prompt,
      model: template.model,
      allowedTools: template.allowedTools,
      maxTurns: template.maxTurns,
      maxRetries: 2,
      intervalSec: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      totalRuns: 0,
      totalErrors: 0,
    }
    store.agents.push(orch)
    writeStore(store)
    writeRuntime(orch.id, { id: orch.id, pid: null, running: false, consecutiveErrors: 0, currentRetry: 0 })
  }

  // Inject agent list + status into the orchestrator's context
  const agentList = store.agents.map(a => {
    const rt = readRuntime(a.id)
    const running = rt.running && isPidRunning(rt.pid)
    return `- ${a.name} (${a.profile}, ${a.model}) ${running ? 'RUNNING' : a.enabled ? 'IDLE' : 'DISABLED'} runs=${a.totalRuns} errors=${a.totalErrors}`
  }).join('\n')

  const enrichedTask = `Current agents:\n${agentList}\n\nUser request: ${message}`

  console.log(`\n${COLORS.bold}Orchestrator${COLORS.reset} thinking...\n`)
  const result = await executeAgent(orch, enrichedTask)

  if (result.ok) {
    console.log(result.output)
  } else {
    console.log(`${COLORS.red}Error:${COLORS.reset} ${result.error || result.output}`)
  }
}

// ─── Entry Point ────────────────────────────────────────────

export async function agents(args: string[]) {
  ensureDirs()
  const sub = args[0] || 'list'
  const rest = args.slice(1)
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'list': listAgents(jsonMode); return
    case 'profiles': profiles(jsonMode); return
    case 'create': createAgent(rest); return
    case 'run': await runAgent(rest); return
    case '_daemon-loop': await daemonLoop(rest[0]); return
    case 'stop': stopAgent(rest); return
    case 'status': statusAgent(rest, jsonMode); return
    case 'logs': showLogs(rest); return
    case 'enable': setEnabled(rest, true); return
    case 'disable': setEnabled(rest, false); return
    case 'delete': deleteAgent(rest); return
    case 'team': teamCommand(rest); return
    case 'chat': await chatWithOrchestrator(rest); return
    default:
      console.log(`Usage: rex agents <profiles|list|create|run|stop|status|logs|enable|disable|delete|team|chat>`)
      console.log(`\nQuick start:`)
      console.log(`  rex agents profiles                    # See available profiles`)
      console.log(`  rex agents create worker my-worker     # Create an agent`)
      console.log(`  rex agents run my-worker --task "..."  # Run with a task`)
      console.log(`  rex agents run my-worker --daemon      # Run in background (scheduled)`)
      console.log(`  rex agents team [name]                 # List teams or team members`)
      console.log(`  rex agents chat <message>              # Chat with the orchestrator`)
  }
}
