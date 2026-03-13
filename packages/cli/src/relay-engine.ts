/**
 * REX Relay Engine — Sequential multi-model relay document pattern
 *
 * Each model reads the full relay document written by previous models,
 * adds its analysis, and either concludes or passes to the next model.
 *
 * Stage order:
 *   1. ollama       — local, free, 0 cost (qwen2.5:7b or first available)
 *   2. groq-free    — Groq free tier if GROQ_API_KEY set (llama-3.3-70b-versatile)
 *   3. claude-haiku — only if ANTHROPIC_API_KEY set AND previous confidence < 0.7
 *   4. mentor       — Opus extended thinking, ONLY if mentorEnabled AND all confidence < 0.6
 *
 * @module BUDGET
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { RELAY_DIR, relayFilePath, ensureRexDirs } from './paths.js'

const log = createLogger('relay-engine')

const HOME = process.env.HOME || '~'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ───────────────────────────────────────────────

export interface RelayContribution {
  model: string
  timestamp: string
  analysis: string
  confidence: number      // 0-1, self-reported by model
  passReason?: string     // why it passes to next model
}

export interface RelayDocument {
  task: string
  context: string
  contributions: RelayContribution[]
  conclusion?: string
  totalMs: number
  mentorUsed: boolean
}

export interface RelayOptions {
  maxStages?: number          // default 3 (no mentor)
  mentorEnabled?: boolean     // default false (must be explicit)
  onProgress?: (stage: string, contribution: RelayContribution) => void
}

interface ModelResponse {
  analysis: string
  conclusion: string
  confidence: number
  passReason?: string
}

// ── API key resolution (same pattern as free-tiers.ts) ─

function getApiKey(envKey: string): string | null {
  if (!envKey) return null
  if (process.env[envKey]) return process.env[envKey]!
  try {
    const settingsPath = join(HOME, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.env?.[envKey] ?? null
    }
  } catch {}
  return null
}

// ── JSON parsing helper ─────────────────────────────────

function parseModelJson(raw: string): ModelResponse {
  // Strip markdown fences if present
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Try to find the outermost JSON object
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1)
  }

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : String(parsed.analysis ?? ''),
      conclusion: typeof parsed.conclusion === 'string' ? parsed.conclusion : '',
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      passReason: typeof parsed.passReason === 'string' ? parsed.passReason : undefined,
    }
  } catch {
    // Fallback: treat entire response as analysis with medium confidence
    return {
      analysis: raw.slice(0, 2000),
      conclusion: '',
      confidence: 0.5,
      passReason: 'JSON parse failed — treated as plain text analysis',
    }
  }
}

// ── Relay document rendering ────────────────────────────

function renderDocument(doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>): string {
  const lines: string[] = []
  lines.push(`# REX Relay: ${doc.task.slice(0, 120)}`)
  lines.push('')
  lines.push('## Context')
  lines.push(doc.context)
  lines.push('')

  for (const c of doc.contributions) {
    const shortModel = c.model.split(':')[0]
    lines.push(`## ${shortModel} Analysis (${c.model} · ${c.timestamp})`)
    lines.push(c.analysis)
    lines.push(`Confidence: ${c.confidence}`)
    if (c.passReason) lines.push(`Pass reason: ${c.passReason}`)
    lines.push('')
  }

  if (doc.conclusion) {
    lines.push('## Conclusion')
    lines.push(doc.conclusion)
  }

  return lines.join('\n')
}

function buildRelayPrompt(currentDoc: string): string {
  return `You are participating in a REX Relay chain.
Previous analysts have contributed to this document:

${currentDoc}

Your role: Read the above, add your analysis, and either:
a) Provide a final conclusion if you are confident (confidence >= 0.8)
b) Add your perspective and pass to the next analyst with a reason

Respond in JSON:
{
  "analysis": "your analysis",
  "conclusion": "final answer if confident, empty string if passing",
  "confidence": 0.0-1.0,
  "passReason": "why you're passing to next (if confidence < 0.8)"
}`
}

// ── Stage 1: Ollama ─────────────────────────────────────

async function detectOllamaModel(): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return 'qwen2.5:1.5b'
    const data = await res.json() as { models?: Array<{ name: string }> }
    const models = data.models ?? []
    // Exclude embedding-only models
    const chatModels = models.filter(m => !m.name.includes('embed') && !m.name.includes('nomic') && !m.name.includes('minilm'))
    // Prefer smallest qwen model first (fast + free), cascade to bigger via relay stages
    const small = chatModels.find(m => m.name.includes('qwen2.5:1.5b'))
    if (small) return small.name
    // Then any small qwen
    const qwen = chatModels.find(m => m.name.includes('qwen'))
    if (qwen) return qwen.name
    return chatModels[0]?.name ?? 'qwen2.5:1.5b'
  } catch {
    return 'qwen2.5:1.5b'
  }
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_ctx: 4096 },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = await res.json() as { message?: { content?: string } }
  return data.message?.content ?? ''
}

async function runOllamaStage(
  doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>,
): Promise<RelayContribution> {
  const model = await detectOllamaModel()
  log.info(`relay stage 1/ollama — model: ${model}`)

  let prompt: string
  if (doc.contributions.length === 0) {
    // First stage: initial analysis prompt
    prompt = `You are an expert analyst. Analyze the following task and context.
IMPORTANT: Always respond in the same language as the task. If the task is in French, respond in French.

Task: ${doc.task}

Context:
${doc.context}

Respond in JSON:
{
  "analysis": "your detailed analysis",
  "conclusion": "final answer if you are highly confident (>= 0.8), otherwise empty string",
  "confidence": 0.0-1.0,
  "passReason": "why you're passing to next analyst (if confidence < 0.8)"
}`
  } else {
    prompt = buildRelayPrompt(renderDocument(doc))
  }

  const raw = await callOllama(prompt, model)
  const parsed = parseModelJson(raw)

  return {
    model,
    timestamp: new Date().toISOString(),
    analysis: parsed.analysis,
    confidence: parsed.confidence,
    passReason: parsed.passReason,
  }
}

// ── Stage 2: Groq free tier ─────────────────────────────

async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

async function runGroqStage(
  doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>,
): Promise<RelayContribution> {
  const apiKey = getApiKey('GROQ_API_KEY')
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const model = 'llama-3.3-70b-versatile'
  log.info(`relay stage 2/groq — model: ${model}`)

  const prompt = buildRelayPrompt(renderDocument(doc))
  const raw = await callGroq(prompt, apiKey)
  const parsed = parseModelJson(raw)

  return {
    model,
    timestamp: new Date().toISOString(),
    analysis: parsed.analysis,
    confidence: parsed.confidence,
    passReason: parsed.passReason,
  }
}

// ── Stage 3: Claude Haiku ───────────────────────────────

async function callClaudeHaiku(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Claude Haiku HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as {
    content?: Array<{ text?: string }>
  }
  return data.content?.[0]?.text ?? ''
}

async function runHaikuStage(
  doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>,
): Promise<RelayContribution> {
  const apiKey = getApiKey('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const model = 'claude-haiku-4-5-20251001'
  log.info(`relay stage 3/claude-haiku — model: ${model}`)

  const prompt = buildRelayPrompt(renderDocument(doc))
  const raw = await callClaudeHaiku(prompt, apiKey)
  const parsed = parseModelJson(raw)

  return {
    model,
    timestamp: new Date().toISOString(),
    analysis: parsed.analysis,
    confidence: parsed.confidence,
    passReason: parsed.passReason,
  }
}

// ── Stage 4: Mentor (Opus extended thinking) ────────────

async function callMentor(prompt: string, apiKey: string, task: string): Promise<string> {
  log.warn(`⚠️ MENTOR CALL: Opus extended thinking — high cost. Task: ${task.slice(0, 80)}`)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: 10000,
      },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Mentor (Opus) HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as {
    content?: Array<{ type?: string; text?: string }>
  }
  // Interleaved thinking returns multiple blocks — extract text blocks only
  const textBlocks = (data.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n')
  return textBlocks
}

async function runMentorStage(
  doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>,
): Promise<RelayContribution> {
  const apiKey = getApiKey('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const model = 'claude-opus-4-6'
  const prompt = buildRelayPrompt(renderDocument(doc))
  const raw = await callMentor(prompt, apiKey, doc.task)
  const parsed = parseModelJson(raw)

  return {
    model,
    timestamp: new Date().toISOString(),
    analysis: parsed.analysis,
    confidence: parsed.confidence,
    passReason: parsed.passReason,
  }
}

// ── Stage definitions ───────────────────────────────────

interface StageDefinition {
  id: string
  available: () => boolean
  run: (doc: Pick<RelayDocument, 'task' | 'context' | 'contributions' | 'conclusion'>) => Promise<RelayContribution>
  /** Minimum confidence threshold from previous stage to trigger this stage */
  triggerBelowConfidence?: number
}

function buildStages(opts: RelayOptions): StageDefinition[] {
  const stages: StageDefinition[] = [
    {
      id: 'ollama',
      available: () => true, // always attempt; will fail fast if Ollama is down
      run: runOllamaStage,
    },
    {
      id: 'groq-free',
      available: () => !!getApiKey('GROQ_API_KEY'),
      run: runGroqStage,
    },
    {
      id: 'claude-haiku',
      available: () => !!getApiKey('ANTHROPIC_API_KEY'),
      run: runHaikuStage,
      triggerBelowConfidence: 0.7,
    },
  ]

  if (opts.mentorEnabled) {
    stages.push({
      id: 'mentor',
      available: () => !!getApiKey('ANTHROPIC_API_KEY'),
      run: runMentorStage,
      triggerBelowConfidence: 0.6,
    })
  }

  return stages
}

// ── Main entry ──────────────────────────────────────────

export async function runRelay(
  task: string,
  context: string,
  opts?: RelayOptions,
): Promise<RelayDocument> {
  const options: Required<Omit<RelayOptions, 'onProgress'>> & Pick<RelayOptions, 'onProgress'> = {
    maxStages: opts?.maxStages ?? 3,
    mentorEnabled: opts?.mentorEnabled ?? false,
    onProgress: opts?.onProgress,
  }

  const startMs = Date.now()
  const doc: RelayDocument = {
    task,
    context,
    contributions: [],
    conclusion: undefined,
    totalMs: 0,
    mentorUsed: false,
  }

  const allStages = buildStages(options)
  // Respect maxStages (mentor always excluded unless mentorEnabled)
  const stagesToRun = allStages.slice(0, options.maxStages + (options.mentorEnabled ? 1 : 0))
  let successCount = 0

  for (const stage of stagesToRun) {
    // Check if stage should be skipped
    if (!stage.available()) {
      log.debug(`relay: stage ${stage.id} skipped — not available`)
      continue
    }

    // Check trigger threshold: skip if previous contributions meet confidence bar
    if (stage.triggerBelowConfidence !== undefined && doc.contributions.length > 0) {
      const maxConf = Math.max(...doc.contributions.map(c => c.confidence))
      if (maxConf >= stage.triggerBelowConfidence) {
        log.info(`relay: stage ${stage.id} skipped — max confidence ${maxConf.toFixed(2)} >= ${stage.triggerBelowConfidence}`)
        continue
      }
    }

    // Stop if we already have a high-confidence conclusion
    if (doc.contributions.length > 0) {
      const last = doc.contributions[doc.contributions.length - 1]
      if (last.confidence >= 0.8) {
        log.info(`relay: stopping after ${stage.id} predecessor — confidence ${last.confidence} >= 0.8`)
        break
      }
    }

    try {
      const contribution = await stage.run({
        task: doc.task,
        context: doc.context,
        contributions: doc.contributions,
        conclusion: doc.conclusion,
      })

      doc.contributions.push(contribution)
      successCount++

      if (stage.id === 'mentor') {
        doc.mentorUsed = true
      }

      log.info(`relay: ${stage.id} done — confidence ${contribution.confidence.toFixed(2)}`)

      // Incremental persist after each stage — zero data loss on crash
      doc.totalMs = Date.now() - startMs
      persistRelay(doc, new Date(startMs))

      // Notify progress callback
      if (options.onProgress) {
        options.onProgress(stage.id, contribution)
      }

      // Check if this stage produced a final conclusion
      // We need to re-parse the raw response to get conclusion — reconstruct from contribution
      // Since we only store analysis + confidence, re-call parseModelJson won't work here.
      // Instead we rely on the contribution's confidence >= 0.8 as the conclusion signal.
      // The conclusion text is extracted from the last contribution's analysis when confidence is high.
      if (contribution.confidence >= 0.8) {
        // Stage is confident enough — treat analysis as conclusion
        doc.conclusion = contribution.analysis
        log.info(`relay: concluded at stage ${stage.id} with confidence ${contribution.confidence.toFixed(2)}`)
        break
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.warn(`relay: stage ${stage.id} failed — ${msg.slice(0, 120)}`)
    }
  }

  if (successCount === 0) {
    throw new Error('All relay stages failed')
  }

  // If no high-confidence conclusion was set, take the best contribution's analysis
  if (!doc.conclusion && doc.contributions.length > 0) {
    const best = doc.contributions.reduce((a, b) => a.confidence >= b.confidence ? a : b)
    doc.conclusion = best.analysis
  }

  doc.totalMs = Date.now() - startMs

  // Final persist (atomic write: temp → rename for crash safety)
  persistRelay(doc, new Date(startMs))

  return doc
}

/**
 * Atomic write: temp file → rename. Prevents data loss on crash/kill.
 * Fleet sync picks up files from RELAY_DIR automatically.
 */
function persistRelay(doc: RelayDocument, startDate: Date): string | null {
  try {
    ensureRexDirs()
    const filePath = relayFilePath(startDate)
    const tmpPath = filePath + '.tmp'
    writeFileSync(tmpPath, formatRelayDocument(doc))
    renameSync(tmpPath, filePath)
    log.info(`relay: persisted to ${filePath}`)
    return filePath
  } catch (err) {
    log.warn(`relay: failed to persist — ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

// ── Utility exports ─────────────────────────────────────

export function formatRelayDocument(doc: RelayDocument): string {
  const lines: string[] = []
  lines.push(`# REX Relay: ${doc.task.slice(0, 120)}`)
  lines.push('')
  lines.push('## Context')
  lines.push(doc.context)
  lines.push('')

  for (const c of doc.contributions) {
    const shortModel = c.model.split(':')[0]
    lines.push(`## ${shortModel} Analysis (${c.model} · ${c.timestamp})`)
    lines.push(c.analysis)
    lines.push(`Confidence: ${c.confidence}`)
    if (c.passReason) lines.push(`Pass reason: ${c.passReason}`)
    lines.push('')
  }

  if (doc.conclusion) {
    lines.push('## Conclusion')
    lines.push(doc.conclusion)
    lines.push('')
  }

  lines.push('---')
  lines.push(`Total: ${doc.totalMs}ms | Stages: ${doc.contributions.length} | Mentor: ${doc.mentorUsed}`)

  return lines.join('\n')
}

export function extractConclusion(doc: RelayDocument): string {
  if (doc.conclusion) return doc.conclusion
  if (doc.contributions.length === 0) return ''
  // Fallback: last contribution's analysis
  return doc.contributions[doc.contributions.length - 1].analysis
}

// ── Relay file management ────────────────────────────────

/**
 * List all relay files, newest first.
 * Returns { name, path, date } for each relay.
 */
export function listRelays(limit = 20): Array<{ name: string; path: string; date: string }> {
  try {
    ensureRexDirs()
    const files = readdirSync(RELAY_DIR)
      .filter(f => f.startsWith('RELAY-') && f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, limit)

    return files.map(f => {
      // RELAY-2026-03-13-14h30.md → extract date
      const match = f.match(/RELAY-(\d{4}-\d{2}-\d{2})-(\d{2})h(\d{2})/)
      const date = match ? `${match[1]} ${match[2]}:${match[3]}` : 'unknown'
      return { name: f, path: join(RELAY_DIR, f), date }
    })
  } catch {
    return []
  }
}

/**
 * Load a relay file's content for injection into context.
 * Returns null if not found. Truncates to maxChars for context safety.
 */
export function loadRelay(nameOrPath: string, maxChars = 8000): string | null {
  const filePath = nameOrPath.startsWith('/') ? nameOrPath : join(RELAY_DIR, nameOrPath)
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf-8')
  return content.length > maxChars ? content.slice(0, maxChars) + '\n\n[... truncated]' : content
}

/**
 * Get the most recent relay for a given topic (fuzzy match on task line).
 */
export function findRelay(query: string, limit = 5): Array<{ name: string; path: string; preview: string }> {
  const relays = listRelays(50)
  const results: Array<{ name: string; path: string; preview: string }> = []
  const q = query.toLowerCase()

  for (const r of relays) {
    if (results.length >= limit) break
    try {
      const content = readFileSync(r.path, 'utf-8')
      if (content.toLowerCase().includes(q)) {
        const firstLine = content.split('\n').find(l => l.startsWith('# ')) ?? r.name
        results.push({ name: r.name, path: r.path, preview: firstLine.slice(0, 120) })
      }
    } catch { /* skip unreadable */ }
  }

  return results
}
