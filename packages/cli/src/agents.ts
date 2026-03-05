import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

interface AgentDef {
  id: string
  name: string
  profile: string
  prompt: string
  model: string
  intervalSec: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastRunAt?: string
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
}

const HOME = homedir()
const ROOT_DIR = join(HOME, '.rex-memory', 'agents')
const STORE_FILE = join(ROOT_DIR, 'agents.json')
const LOGS_DIR = join(ROOT_DIR, 'logs')
const RUNTIME_DIR = join(HOME, '.rex-memory', 'runtime', 'agents')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

const PROFILE_TEMPLATES: Record<string, { prompt: string; intervalSec: number; model: string }> = {
  read: {
    prompt: 'Read the latest project context and produce a concise summary of key changes and risks.',
    intervalSec: 600,
    model: 'qwen3.5:4b',
  },
  analysis: {
    prompt: 'Analyze architecture and identify bottlenecks, regressions, and high-impact improvements.',
    intervalSec: 900,
    model: 'qwen3.5:9b',
  },
  'code-review': {
    prompt: 'Perform strict code review: bugs first, then risks, then missing tests, with actionable fixes.',
    intervalSec: 900,
    model: 'qwen3.5:9b',
  },
  advanced: {
    prompt: 'Act as a senior orchestrator: review current state, prioritize work, and propose next autonomous actions.',
    intervalSec: 1200,
    model: 'qwen3.5:9b',
  },
  ultimate: {
    prompt: 'Act as a principal autonomous agent with strict safety: plan, execute, validate, and summarize.',
    intervalSec: 1800,
    model: 'qwen3.5:9b',
  },
}

function ensureDirs() {
  if (!existsSync(ROOT_DIR)) mkdirSync(ROOT_DIR, { recursive: true })
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true })
  if (!existsSync(RUNTIME_DIR)) mkdirSync(RUNTIME_DIR, { recursive: true })
}

function readStore(): AgentStore {
  ensureDirs()
  try {
    if (existsSync(STORE_FILE)) {
      const parsed = JSON.parse(readFileSync(STORE_FILE, 'utf-8')) as AgentStore
      if (Array.isArray(parsed.agents)) return parsed
    }
  } catch {
    // noop
  }
  return { agents: [] }
}

function writeStore(store: AgentStore) {
  ensureDirs()
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2))
}

function runtimePath(id: string) {
  return join(RUNTIME_DIR, `${id}.json`)
}

function readRuntime(id: string): AgentRuntime {
  try {
    const p = runtimePath(id)
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf-8')) as AgentRuntime
    }
  } catch {
    // noop
  }
  return { id, pid: null, running: false }
}

function writeRuntime(id: string, data: AgentRuntime) {
  ensureDirs()
  writeFileSync(runtimePath(id), JSON.stringify(data, null, 2))
}

function isPidRunning(pid: number | null): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function logPath(id: string) {
  return join(LOGS_DIR, `${id}.log`)
}

function appendLog(id: string, text: string) {
  ensureDirs()
  const now = new Date().toISOString()
  const prev = existsSync(logPath(id)) ? readFileSync(logPath(id), 'utf-8') : ''
  writeFileSync(logPath(id), `${prev}[${now}] ${text}\n`)
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'agent'
}

function parseFlag(args: string[], name: string): string | null {
  const idx = args.findIndex((a) => a === name)
  if (idx < 0) return null
  return args[idx + 1] || null
}

function findAgent(store: AgentStore, idOrName: string): AgentDef | null {
  return store.agents.find((a) => a.id === idOrName || a.name === idOrName) || null
}

async function askModel(model: string, prompt: string): Promise<string> {
  const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`).catch(() => null)
  let chosenModel = model
  if (tagsRes && tagsRes.ok) {
    const tags = await tagsRes.json() as { models?: Array<{ name?: string }> }
    const names = (tags.models || []).map((m) => m.name || '').filter(Boolean)
    if (!names.includes(model)) {
      const base = model.split(':')[0]
      const baseMatch = names.find((n) => n.includes(base))
      chosenModel = baseMatch || names.find((n) => !n.includes('embed')) || model
    }
  }

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: chosenModel, prompt, stream: false }),
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const data = await res.json() as { response?: string }
  return (data.response || '').trim()
}

async function runAgentOnce(agent: AgentDef): Promise<string> {
  const prompt = [
    `Agent profile: ${agent.profile}`,
    `Agent name: ${agent.name}`,
    `Current time: ${new Date().toISOString()}`,
    '',
    'Objective:',
    agent.prompt,
    '',
    'Return a concise autonomous work update in this structure:',
    '1) Current focus',
    '2) Risks',
    '3) Recommended next actions',
  ].join('\n')

  return askModel(agent.model, prompt)
}

function listAgents(jsonMode: boolean) {
  const store = readStore()
  const rows = store.agents.map((a) => {
    const rt = readRuntime(a.id)
    const running = rt.running && isPidRunning(rt.pid)
    return {
      id: a.id,
      name: a.name,
      profile: a.profile,
      model: a.model,
      intervalSec: a.intervalSec,
      enabled: a.enabled,
      running,
      lastRunAt: a.lastRunAt || null,
    }
  })

  if (jsonMode) {
    console.log(JSON.stringify({ agents: rows }, null, 2))
    return
  }

  if (rows.length === 0) {
    console.log('No agents configured. Use: rex agents create <read|analysis|code-review|advanced|ultimate> [name]')
    return
  }

  for (const row of rows) {
    console.log(`${row.id}  ${row.name}  profile=${row.profile}  model=${row.model}  enabled=${row.enabled}  running=${row.running}`)
  }
}

function createAgent(args: string[]) {
  const profile = args[0]
  if (!profile) {
    console.log('Usage: rex agents create <read|analysis|code-review|advanced|ultimate> [name] [--prompt text] [--model model] [--interval sec]')
    process.exit(1)
  }

  const template = PROFILE_TEMPLATES[profile]
  if (!template) {
    console.log(`Unknown profile: ${profile}`)
    process.exit(1)
  }

  const store = readStore()
  const baseName = args[1] && !args[1].startsWith('--') ? args[1] : `${profile}-agent`
  const promptOverride = parseFlag(args, '--prompt')
  const modelOverride = parseFlag(args, '--model')
  const intervalOverride = parseFlag(args, '--interval')

  const id = `${slug(baseName)}-${Date.now().toString().slice(-6)}`
  const now = new Date().toISOString()
  const agent: AgentDef = {
    id,
    name: baseName,
    profile,
    prompt: promptOverride || template.prompt,
    model: modelOverride || template.model,
    intervalSec: Math.max(30, parseInt(intervalOverride || `${template.intervalSec}`, 10) || template.intervalSec),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }

  store.agents.push(agent)
  writeStore(store)
  writeRuntime(agent.id, { id: agent.id, pid: null, running: false })

  console.log(JSON.stringify({ ok: true, agent }, null, 2))
}

function stopAgent(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log('Usage: rex agents stop <id|name>')
    process.exit(1)
  }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    try { process.kill(rt.pid, 'SIGTERM') } catch {}
  }

  writeRuntime(agent.id, { ...rt, running: false, pid: null, lastHeartbeat: new Date().toISOString() })
  console.log(JSON.stringify({ ok: true, stopped: agent.id }, null, 2))
}

function statusAgent(args: string[], jsonMode: boolean) {
  const store = readStore()
  const idOrName = args[0]

  if (!idOrName) {
    listAgents(jsonMode)
    return
  }

  const agent = findAgent(store, idOrName)
  if (!agent) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  const rt = readRuntime(agent.id)
  const payload = {
    ...agent,
    runtime: {
      ...rt,
      running: rt.running && isPidRunning(rt.pid),
    },
  }

  if (jsonMode) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(JSON.stringify(payload, null, 2))
  }
}

function showLogs(args: string[]) {
  const idOrName = args[0]
  const tailArg = parseFlag(args, '--tail')
  const tail = Math.max(1, parseInt(tailArg || '100', 10) || 100)

  if (!idOrName) {
    console.log('Usage: rex agents logs <id|name> [--tail N]')
    process.exit(1)
  }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  const p = logPath(agent.id)
  if (!existsSync(p)) {
    console.log('No logs yet.')
    return
  }

  const lines = readFileSync(p, 'utf-8').split('\n').filter(Boolean)
  const out = lines.slice(-tail).join('\n')
  console.log(out)
}

function setEnabled(args: string[], enabled: boolean) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log(`Usage: rex agents ${enabled ? 'enable' : 'disable'} <id|name>`)
    process.exit(1)
  }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  agent.enabled = enabled
  agent.updatedAt = new Date().toISOString()
  writeStore(store)
  console.log(JSON.stringify({ ok: true, id: agent.id, enabled }, null, 2))
}

function deleteAgent(args: string[]) {
  const idOrName = args[0]
  if (!idOrName) {
    console.log('Usage: rex agents delete <id|name>')
    process.exit(1)
  }

  const store = readStore()
  const idx = store.agents.findIndex((a) => a.id === idOrName || a.name === idOrName)
  if (idx < 0) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  const agent = store.agents[idx]
  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    try { process.kill(rt.pid, 'SIGTERM') } catch {}
  }

  store.agents.splice(idx, 1)
  writeStore(store)
  writeRuntime(agent.id, { id: agent.id, pid: null, running: false })
  console.log(JSON.stringify({ ok: true, deleted: agent.id }, null, 2))
}

async function daemonLoop(agentId: string) {
  let alive = true
  process.on('SIGTERM', () => { alive = false })
  process.on('SIGINT', () => { alive = false })

  while (alive) {
    const store = readStore()
    const agent = store.agents.find((a) => a.id === agentId)
    if (!agent || !agent.enabled) break

    const runtime = readRuntime(agent.id)
    writeRuntime(agent.id, {
      ...runtime,
      id: agent.id,
      pid: process.pid,
      running: true,
      startedAt: runtime.startedAt || new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    })

    try {
      const output = await runAgentOnce(agent)
      appendLog(agent.id, `RUN OK\n${output}\n`)
      agent.lastRunAt = new Date().toISOString()
      agent.updatedAt = new Date().toISOString()
      writeStore(store)
      writeRuntime(agent.id, {
        ...readRuntime(agent.id),
        id: agent.id,
        pid: process.pid,
        running: true,
        lastRunAt: agent.lastRunAt,
        lastHeartbeat: new Date().toISOString(),
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      appendLog(agent.id, `RUN ERR\n${err}\n`)
      writeRuntime(agent.id, {
        ...readRuntime(agent.id),
        id: agent.id,
        pid: process.pid,
        running: true,
        lastError: err,
        lastHeartbeat: new Date().toISOString(),
      })
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(30, agent.intervalSec) * 1000))
  }

  const finalState = readRuntime(agentId)
  writeRuntime(agentId, {
    ...finalState,
    id: agentId,
    pid: null,
    running: false,
    lastHeartbeat: new Date().toISOString(),
  })
}

async function runAgent(args: string[]) {
  const idOrName = args[0]
  const once = args.includes('--once')

  if (!idOrName) {
    console.log('Usage: rex agents run <id|name> [--once]')
    process.exit(1)
  }

  const store = readStore()
  const agent = findAgent(store, idOrName)
  if (!agent) {
    console.log(`Agent not found: ${idOrName}`)
    process.exit(1)
  }

  if (once) {
    const output = await runAgentOnce(agent)
    appendLog(agent.id, `RUN ONCE\n${output}\n`)
    agent.lastRunAt = new Date().toISOString()
    agent.updatedAt = new Date().toISOString()
    writeStore(store)
    console.log(output)
    return
  }

  const rt = readRuntime(agent.id)
  if (rt.pid && isPidRunning(rt.pid)) {
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, id: agent.id, pid: rt.pid }, null, 2))
    return
  }

  const script = process.argv[1]
  const child = spawn(process.execPath, [script, 'agents', 'daemon', agent.id], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  const pid = child.pid || null
  writeRuntime(agent.id, {
    id: agent.id,
    pid,
    running: pid !== null,
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
  })

  console.log(JSON.stringify({ ok: true, id: agent.id, pid }, null, 2))
}

async function runDaemon(args: string[]) {
  const id = args[0]
  if (!id) {
    console.error('Usage: rex agents daemon <id>')
    process.exit(1)
  }
  await daemonLoop(id)
}

function profiles(jsonMode: boolean) {
  const rows = Object.entries(PROFILE_TEMPLATES).map(([name, t]) => ({
    name,
    model: t.model,
    intervalSec: t.intervalSec,
    prompt: t.prompt,
  }))

  if (jsonMode) {
    console.log(JSON.stringify({ profiles: rows }, null, 2))
    return
  }

  for (const row of rows) {
    console.log(`${row.name}  model=${row.model}  interval=${row.intervalSec}s`)
  }
}

export async function agents(args: string[]) {
  ensureDirs()
  const sub = args[0] || 'list'
  const rest = args.slice(1)
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'list':
      listAgents(jsonMode)
      return
    case 'profiles':
      profiles(jsonMode)
      return
    case 'create':
      createAgent(rest)
      return
    case 'run':
      await runAgent(rest)
      return
    case 'daemon':
      await runDaemon(rest)
      return
    case 'stop':
      stopAgent(rest)
      return
    case 'status':
      statusAgent(rest, jsonMode)
      return
    case 'logs':
      showLogs(rest)
      return
    case 'enable':
      setEnabled(rest, true)
      return
    case 'disable':
      setEnabled(rest, false)
      return
    case 'delete':
      deleteAgent(rest)
      return
    default:
      console.log('Usage: rex agents <profiles|list|create|run|stop|status|logs|enable|disable|delete> ...')
  }
}
