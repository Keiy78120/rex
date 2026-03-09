/** @module OPTIMIZE */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { REX_DIR, MEMORY_DB_PATH } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('training')
const execFileAsync = promisify(execFile)

// ── Types ─────────────────────────────────────────────────────

interface TrainingConfig {
  model: string
  adapterPath: string
  dataPath: string
  steps: number
  loraLayers: number
  maxSeqLength: number
  backend: 'mlx-lm' | 'unsloth' | 'openai' | 'auto'
}

interface TrainingExample {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
}

interface TrainingJob {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  backend: string
  model: string
  startedAt: Date
  completedAt?: Date
  examples: number
  steps: number
  adapterPath?: string
  openaiJobId?: string
  error?: string
}

// ── Paths ─────────────────────────────────────────────────────

const TRAINING_DIR = join(REX_DIR, 'training')
const JOBS_PATH = join(TRAINING_DIR, 'jobs.json')

function ensureTrainingDir(): void {
  if (!existsSync(TRAINING_DIR)) {
    mkdirSync(TRAINING_DIR, { recursive: true })
  }
}

// ── Job persistence ───────────────────────────────────────────

function loadJobs(): TrainingJob[] {
  try {
    if (!existsSync(JOBS_PATH)) return []
    return JSON.parse(readFileSync(JOBS_PATH, 'utf-8')) as TrainingJob[]
  } catch {
    return []
  }
}

function saveJobs(jobs: TrainingJob[]): void {
  ensureTrainingDir()
  writeFileSync(JOBS_PATH, JSON.stringify(jobs, null, 2))
}

function upsertJob(job: TrainingJob): void {
  const jobs = loadJobs()
  const idx = jobs.findIndex(j => j.id === job.id)
  if (idx >= 0) {
    jobs[idx] = job
  } else {
    jobs.unshift(job)
  }
  saveJobs(jobs)
}

// ── Collect training data ─────────────────────────────────────

export async function collectTrainingData(minLength: number = 100): Promise<TrainingExample[]> {
  const dbPath = existsSync(MEMORY_DB_PATH) ? MEMORY_DB_PATH : join(homedir(), '.rex-memory', 'rex-memory.db')

  if (!existsSync(dbPath)) {
    log.warn(`[training] DB not found at ${dbPath}`)
    return []
  }

  // Dynamic import to avoid top-level dependency issue
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath, { readonly: true })

  try {
    const examples: TrainingExample[] = []

    // Try sessions table with JSON messages
    let rows: Array<Record<string, unknown>> = []
    try {
      rows = db.prepare(`SELECT content, summary FROM memories WHERE LENGTH(content) > ? ORDER BY created_at DESC LIMIT 2000`).all(minLength) as Array<Record<string, unknown>>
    } catch {
      // Table might have a different schema
      try {
        rows = db.prepare(`SELECT * FROM memories WHERE LENGTH(content) > ? LIMIT 2000`).all(minLength) as Array<Record<string, unknown>>
      } catch (err) {
        log.warn(`[training] Could not query memories: ${err}`)
      }
    }

    // Build user/assistant pairs from memory rows
    for (const row of rows) {
      const content = typeof row['content'] === 'string' ? row['content'] : ''
      const summary = typeof row['summary'] === 'string' ? row['summary'] : ''
      if (content.length < minLength) continue

      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'user', content: content.slice(0, 2048) },
      ]
      if (summary && summary.length > 20) {
        messages.push({ role: 'assistant', content: summary })
      }
      examples.push({ messages })
    }

    log.info(`[training] Collected ${examples.length} training examples from ${rows.length} rows`)
    return examples
  } finally {
    db.close()
  }
}

// ── Export dataset as JSONL ───────────────────────────────────

export async function exportDataset(
  examples: TrainingExample[],
  outPath?: string,
): Promise<void> {
  ensureTrainingDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const resolvedPath = outPath ?? join(TRAINING_DIR, `dataset-${timestamp}.jsonl`)

  const lines = examples.map(ex => JSON.stringify(ex)).join('\n')
  writeFileSync(resolvedPath, lines + '\n', 'utf-8')
  log.info(`[training] Exported ${examples.length} examples to ${resolvedPath}`)
}

// ── Backend detection ─────────────────────────────────────────

export async function detectBackend(): Promise<'mlx-lm' | 'unsloth' | 'openai' | 'none'> {
  // 1. mlx-lm (macOS Apple Silicon preferred)
  try {
    await execFileAsync('python3', ['-m', 'mlx_lm.lora', '--help'], { timeout: 5000 })
    return 'mlx-lm'
  } catch {
    // not available
  }

  // 2. unsloth (GPU node)
  try {
    await execFileAsync('python3', ['-c', 'import unsloth'], { timeout: 5000 })
    return 'unsloth'
  } catch {
    // not available
  }

  // 3. OpenAI API key present
  if (process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  return 'none'
}

// ── MLX-LM training ───────────────────────────────────────────

export async function runMlxTraining(config: TrainingConfig): Promise<TrainingJob> {
  ensureTrainingDir()

  const jobId = randomUUID()
  const adapterPath = config.adapterPath || join(TRAINING_DIR, `adapter-${jobId}`)

  const mlxConfig = {
    model: config.model,
    data: config.dataPath,
    adapter_path: adapterPath,
    num_layers: config.loraLayers,
    max_seq_length: config.maxSeqLength,
    batch_size: 4,
    iters: config.steps,
    save_every: Math.max(10, Math.floor(config.steps / 5)),
  }

  const configPath = join(TRAINING_DIR, `mlx-config-${jobId}.yaml`)
  const yamlLines = Object.entries(mlxConfig).map(([k, v]) => `${k}: ${String(v)}`)
  writeFileSync(configPath, yamlLines.join('\n') + '\n')

  const job: TrainingJob = {
    id: jobId,
    status: 'running',
    backend: 'mlx-lm',
    model: config.model,
    startedAt: new Date(),
    examples: 0,
    steps: config.steps,
    adapterPath,
  }
  upsertJob(job)
  log.info(`[training] Starting MLX-LM job ${jobId} — model=${config.model} steps=${config.steps}`)

  try {
    const { stdout, stderr } = await execFileAsync(
      'python3',
      ['-m', 'mlx_lm.lora', '-c', configPath],
      { timeout: 3_600_000 },
    )
    log.info(`[training] MLX stdout: ${stdout.slice(0, 500)}`)
    if (stderr) log.debug(`[training] MLX stderr: ${stderr.slice(0, 200)}`)

    job.status = 'completed'
    job.completedAt = new Date()
    upsertJob(job)
    return job
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`[training] MLX-LM failed: ${msg.slice(0, 300)}`)
    job.status = 'failed'
    job.error = msg.slice(0, 500)
    job.completedAt = new Date()
    upsertJob(job)
    return job
  }
}

// ── OpenAI fine-tuning ────────────────────────────────────────

export async function runOpenAIFineTune(examples: TrainingExample[]): Promise<TrainingJob> {
  ensureTrainingDir()

  const jobId = randomUUID()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dataPath = join(TRAINING_DIR, `openai-dataset-${timestamp}.jsonl`)

  const job: TrainingJob = {
    id: jobId,
    status: 'pending',
    backend: 'openai',
    model: 'gpt-4o-mini-2024-07-18',
    startedAt: new Date(),
    examples: examples.length,
    steps: 0,
  }
  upsertJob(job)

  // Export JSONL
  await exportDataset(examples, dataPath)

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  log.info(`[training] Uploading dataset to OpenAI (${examples.length} examples)`)

  try {
    const { createReadStream } = await import('node:fs')
    const file = await client.files.create({
      file: createReadStream(dataPath),
      purpose: 'fine-tune',
    })

    log.info(`[training] File uploaded: ${file.id}`)

    const ftJob = await client.fineTuning.jobs.create({
      training_file: file.id,
      model: 'gpt-4o-mini-2024-07-18',
    })

    job.status = 'running'
    job.openaiJobId = ftJob.id
    upsertJob(job)
    log.info(`[training] OpenAI fine-tune job created: ${ftJob.id}`)

    // Poll until done
    let pollJob = ftJob
    while (pollJob.status !== 'succeeded' && pollJob.status !== 'failed' && pollJob.status !== 'cancelled') {
      await new Promise(res => setTimeout(res, 30_000))
      pollJob = await client.fineTuning.jobs.retrieve(ftJob.id)
      log.debug(`[training] Poll status: ${pollJob.status}`)
      job.status = pollJob.status === 'succeeded' ? 'completed' : 'running'
      upsertJob(job)
    }

    job.status = pollJob.status === 'succeeded' ? 'completed' : 'failed'
    if (pollJob.status !== 'succeeded') {
      job.error = `OpenAI job ended with status: ${pollJob.status}`
    }
    job.completedAt = new Date()
    upsertJob(job)
    return job
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`[training] OpenAI fine-tune failed: ${msg.slice(0, 300)}`)
    job.status = 'failed'
    job.error = msg.slice(0, 500)
    job.completedAt = new Date()
    upsertJob(job)
    return job
  }
}

// ── Training status ───────────────────────────────────────────

export async function getTrainingStatus(jobId?: string): Promise<TrainingJob[]> {
  const jobs = loadJobs()

  if (!jobId) return jobs

  const job = jobs.find(j => j.id === jobId)
  if (!job) {
    log.warn(`[training] Job not found: ${jobId}`)
    return []
  }

  // If it's an OpenAI job still running, poll for update
  if (job.backend === 'openai' && job.openaiJobId && job.status === 'running' && process.env.OPENAI_API_KEY) {
    try {
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const ftJob = await client.fineTuning.jobs.retrieve(job.openaiJobId)
      job.status = ftJob.status === 'succeeded' ? 'completed'
        : ftJob.status === 'failed' || ftJob.status === 'cancelled' ? 'failed'
        : 'running'
      if (job.status !== 'running') {
        job.completedAt = new Date()
      }
      upsertJob(job)
    } catch (err) {
      log.warn(`[training] Could not poll OpenAI job: ${err}`)
    }
  }

  return jobs.filter(j => j.id === jobId)
}

// ── CLI colors ────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

function jobStatusColor(status: string): string {
  if (status === 'completed') return COLORS.green
  if (status === 'failed') return COLORS.red
  if (status === 'running') return COLORS.cyan
  return COLORS.dim
}

// ── CLI entry point ───────────────────────────────────────────

export async function training(args: string[]): Promise<void> {
  const sub = args[0]
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'collect': {
      const minLengthArg = args.find(a => a.startsWith('--min-length='))
      const minLength = minLengthArg ? parseInt(minLengthArg.split('=')[1], 10) : 100
      const examples = await collectTrainingData(minLength)
      if (jsonMode) {
        console.log(JSON.stringify({ count: examples.length, examples: examples.slice(0, 3) }, null, 2))
      } else {
        console.log(`\n${COLORS.bold}Training data collected${COLORS.reset}`)
        console.log(`  Examples: ${COLORS.cyan}${examples.length}${COLORS.reset}`)
        console.log(`  Min length: ${COLORS.dim}${minLength} chars${COLORS.reset}`)
        if (examples.length > 0) {
          const preview = examples[0]?.messages[0]?.content ?? ''
          console.log(`  Preview: ${COLORS.dim}${preview.slice(0, 80).replace(/\n/g, ' ')}...${COLORS.reset}`)
        }
      }
      break
    }

    case 'export': {
      const outArg = args.find(a => a.startsWith('--out='))
      const outPath = outArg?.split('=')[1]
      const minLengthArg = args.find(a => a.startsWith('--min-length='))
      const minLength = minLengthArg ? parseInt(minLengthArg.split('=')[1], 10) : 100
      const examples = await collectTrainingData(minLength)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const resolvedPath = outPath ?? join(TRAINING_DIR, `dataset-${timestamp}.jsonl`)
      await exportDataset(examples, resolvedPath)
      if (jsonMode) {
        console.log(JSON.stringify({ count: examples.length, path: resolvedPath }, null, 2))
      } else {
        console.log(`\n${COLORS.green}✓${COLORS.reset} Dataset exported`)
        console.log(`  Count: ${COLORS.cyan}${examples.length}${COLORS.reset}`)
        console.log(`  Path:  ${COLORS.dim}${resolvedPath}${COLORS.reset}`)
      }
      break
    }

    case 'run': {
      const backendArg = args.find(a => a.startsWith('--backend='))
      const requestedBackend = backendArg?.split('=')[1] as TrainingConfig['backend'] | undefined
      const modelArg = args.find(a => a.startsWith('--model='))
      const stepsArg = args.find(a => a.startsWith('--steps='))

      const detectedBackend = await detectBackend()

      const effectiveBackend = requestedBackend === 'auto' || !requestedBackend
        ? detectedBackend
        : requestedBackend

      if (!jsonMode) {
        console.log(`\n${COLORS.bold}REX Training${COLORS.reset}`)
        console.log(`  Backend: ${COLORS.cyan}${effectiveBackend}${COLORS.reset}`)
      }

      if (effectiveBackend === 'none') {
        console.error(`${COLORS.red}✗${COLORS.reset} No training backend available.`)
        console.error(`  Install mlx-lm (macOS), unsloth (GPU), or set OPENAI_API_KEY.`)
        process.exit(1)
      }

      const examples = await collectTrainingData(100)

      if (effectiveBackend === 'openai') {
        const job = await runOpenAIFineTune(examples)
        if (jsonMode) {
          console.log(JSON.stringify(job, null, 2))
        } else {
          console.log(`\n  ${jobStatusColor(job.status)}${job.status}${COLORS.reset} — Job ${COLORS.dim}${job.id}${COLORS.reset}`)
          if (job.openaiJobId) console.log(`  OpenAI job: ${COLORS.dim}${job.openaiJobId}${COLORS.reset}`)
        }
      } else if (effectiveBackend === 'mlx-lm') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const dataPath = join(TRAINING_DIR, `dataset-${timestamp}.jsonl`)
        await exportDataset(examples, dataPath)
        const config: TrainingConfig = {
          model: modelArg?.split('=')[1] ?? 'Llama-3.2-3B-Instruct-4bit',
          adapterPath: join(TRAINING_DIR, 'adapters'),
          dataPath,
          steps: stepsArg ? parseInt(stepsArg.split('=')[1], 10) : 100,
          loraLayers: 16,
          maxSeqLength: 2048,
          backend: 'mlx-lm',
        }
        const job = await runMlxTraining(config)
        if (jsonMode) {
          console.log(JSON.stringify(job, null, 2))
        } else {
          console.log(`\n  ${jobStatusColor(job.status)}${job.status}${COLORS.reset} — Job ${COLORS.dim}${job.id}${COLORS.reset}`)
          if (job.adapterPath) console.log(`  Adapter: ${COLORS.dim}${job.adapterPath}${COLORS.reset}`)
        }
      } else {
        console.error(`${COLORS.yellow}!${COLORS.reset} Backend '${effectiveBackend}' is detected but not yet implemented for direct run.`)
        console.error(`  Use --backend=openai or --backend=mlx-lm.`)
        process.exit(1)
      }
      break
    }

    case 'status': {
      const jobIdArg = args.find(a => a.startsWith('--job='))
      const jobId = jobIdArg?.split('=')[1]
      const jobs = await getTrainingStatus(jobId)

      if (jsonMode) {
        console.log(JSON.stringify({ jobs }, null, 2))
        break
      }

      if (jobs.length === 0) {
        console.log(`${COLORS.dim}No training jobs found.${COLORS.reset}`)
        break
      }

      console.log(`\n${COLORS.bold}Training Jobs${COLORS.reset} (${jobs.length})`)
      console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`)
      for (const job of jobs.slice(0, 20)) {
        const sc = jobStatusColor(job.status)
        const ts = new Date(job.startedAt).toLocaleString()
        console.log(`  ${sc}${job.status.padEnd(10)}${COLORS.reset} ${COLORS.cyan}${job.backend.padEnd(8)}${COLORS.reset} ${job.model.slice(0, 30).padEnd(30)} ${COLORS.dim}${ts}${COLORS.reset}`)
        console.log(`    ${COLORS.dim}id=${job.id.slice(0, 8)} examples=${job.examples} steps=${job.steps}${COLORS.reset}`)
        if (job.error) console.log(`    ${COLORS.red}error: ${job.error.slice(0, 80)}${COLORS.reset}`)
      }
      console.log()
      break
    }

    default: {
      const detectedBackend = await detectBackend()
      const examples = await collectTrainingData(100)
      console.log(`\n${COLORS.bold}rex train${COLORS.reset} — Fine-tuning pipeline`)
      console.log(`${COLORS.dim}${'─'.repeat(40)}${COLORS.reset}`)
      console.log(`  Backend detected: ${COLORS.cyan}${detectedBackend}${COLORS.reset}`)
      console.log(`  Dataset size:     ${COLORS.cyan}${examples.length}${COLORS.reset} examples available`)
      console.log()
      console.log(`  rex train collect [--min-length=N]         Collect training examples`)
      console.log(`  rex train export [--out=path]              Export dataset as JSONL`)
      console.log(`  rex train run [--backend=auto|mlx-lm|openai] [--model=name] [--steps=N]`)
      console.log(`  rex train status [--job=id]                Show training jobs`)
      console.log()
    }
  }
}
