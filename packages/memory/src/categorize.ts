import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'
import { embed, embeddingToBuffer } from './embed.js'

const REX_DB = join(process.env.HOME || '~', '.claude', 'rex', 'memory', 'rex.sqlite')
const DB_PATH = existsSync(REX_DB) ? REX_DB : join(import.meta.dirname, '..', 'db', 'rex.sqlite')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const VALID_CATEGORIES = ['debug', 'fix', 'idea', 'architecture', 'pattern', 'lesson', 'config', 'session'] as const
type Category = typeof VALID_CATEGORIES[number]

const CLASSIFY_PROMPT = (chunk: string) =>
  `Classify this developer session chunk. Output ONLY valid JSON, no markdown.

Categories: debug, fix, idea, architecture, pattern, lesson, config, session

- debug: debugging an issue, tracing errors
- fix: applying a fix or patch
- idea: new feature ideas, brainstorming
- architecture: system design, structure decisions
- pattern: code patterns, reusable solutions
- lesson: lessons learned, mistakes to avoid
- config: configuration changes, setup
- session: general session content (default)

Chunk:
${chunk.slice(0, 1500)}

JSON output: {"category": "<one of the above>", "summary": "<1-2 sentence summary>"}`

function openDb(): Database.Database {
  const dbDir = join(import.meta.dirname, '..', 'db')
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  const db = new Database(DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')
  db.defaultSafeIntegers(false)
  return db
}

async function classifyWithQwen(chunk: string): Promise<{ category: Category; summary: string } | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: await detectClassifyModel(),
        prompt: CLASSIFY_PROMPT(chunk),
        stream: false,
        options: { temperature: 0.3, num_ctx: 4096 },
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = await res.json() as { response: string }
    const rawResponse = data.response
    let parsed: any = null
    try { parsed = JSON.parse(rawResponse) } catch {}
    if (!parsed) {
      const fence = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) { try { parsed = JSON.parse(fence[1].trim()) } catch {} }
    }
    if (!parsed) {
      const brace = rawResponse.match(/\{[\s\S]*\}/)  // greedy — handles nested objects
      if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
    }
    if (!parsed) return null
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category as Category : 'session'
    const summary = typeof parsed.summary === 'string' && parsed.summary.length > 10 ? parsed.summary : chunk.slice(0, 200)
    return { category, summary }
  } catch {
    return null
  }
}

async function classifyWithClaude(chunk: string): Promise<{ category: Category; summary: string } | null> {
  try {
    const prompt = CLASSIFY_PROMPT(chunk)
    const escaped = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')
    const out = execSync(`claude -p "${escaped}" 2>/dev/null`, {
      timeout: 30000,
      encoding: 'utf-8',
      env: { ...process.env },
    }).trim()

    // Try parsing the whole output first (pure JSON)
    // Then strip markdown code fences, then greedy brace match
    let parsed: any = null
    try { parsed = JSON.parse(out) } catch {}
    if (!parsed) {
      const fence = out.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) { try { parsed = JSON.parse(fence[1].trim()) } catch {} }
    }
    if (!parsed) {
      const brace = out.match(/\{[\s\S]*\}/)  // greedy — handles nested objects
      if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
    }
    if (!parsed) return null

    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category as Category : 'session'
    const summary = typeof parsed.summary === 'string' && parsed.summary.length > 10 ? parsed.summary : chunk.slice(0, 200)
    return { category, summary }
  } catch {
    return null
  }
}

async function classify(
  chunk: string,
  preferredModel: 'qwen' | 'claude'
): Promise<{ category: Category; summary: string }> {
  const fallback = { category: 'session' as Category, summary: chunk.slice(0, 200) }

  if (preferredModel === 'qwen') {
    const result = await classifyWithQwen(chunk)
    if (result) return result
    // Fallback to Claude
    console.log('    Qwen unavailable, trying Claude CLI fallback...')
    return (await classifyWithClaude(chunk)) ?? fallback
  } else {
    const result = await classifyWithClaude(chunk)
    if (result) return result
    // Fallback to Qwen
    console.log('    Claude unavailable, trying Qwen fallback...')
    return (await classifyWithQwen(chunk)) ?? fallback
  }
}

export async function categorize(options: {
  model?: 'qwen' | 'claude'
  batch?: number
  dryRun?: boolean
}) {
  const { model = 'qwen', batch = 50, dryRun = false } = options

  if (!existsSync(DB_PATH)) {
    console.error('No memory database found. Run `rex ingest` first.')
    process.exit(1)
  }

  const db = openDb()

  const uncategorized = db
    .prepare(`SELECT id, content FROM memories WHERE category = 'session' ORDER BY created_at DESC LIMIT ?`)
    .all(batch) as Array<{ id: number; content: string }>

  if (uncategorized.length === 0) {
    console.log('No uncategorized memories found. All done!')
    db.close()
    return
  }

  console.log(`Found ${uncategorized.length} uncategorized memories (model: ${model})`)
  if (dryRun) { console.log('[dry-run] Nothing will be saved.'); db.close(); return }

  const updateStmt = db.prepare('UPDATE memories SET category = ?, content = ? WHERE id = ?')

  let updated = 0
  let failed = 0

  for (let i = 0; i < uncategorized.length; i++) {
    const mem = uncategorized[i]
    process.stdout.write(`  [${i + 1}/${uncategorized.length}] Classifying... `)

    const result = await classify(mem.content, model)

    if (result.category === 'session') {
      process.stdout.write(`skipped (no confident classification)\n`)
      failed++
      continue
    }

    updateStmt.run(result.category, result.summary, mem.id)
    process.stdout.write(`[${result.category}] ${result.summary.slice(0, 60)}...\n`)
    updated++
  }

  db.close()
  console.log(`\nDone: ${updated} categorized, ${failed} left as session`)
}

export function listMemories(options: {
  category?: string
  project?: string
  limit?: number
  format?: 'json' | 'text'
}) {
  const { category, project, limit = 50, format = 'text' } = options

  if (!existsSync(DB_PATH)) {
    if (format === 'json') console.log('[]')
    else console.error('No memory database found.')
    process.exit(1)
  }

  const db = openDb()

  let query = 'SELECT id, content, category, project, created_at FROM memories WHERE 1=1'
  const params: (string | number)[] = []

  if (category && category !== 'all') {
    query += ' AND category = ?'
    params.push(category)
  }
  if (project) {
    query += ' AND project LIKE ?'
    params.push(`%${project}%`)
  }
  query += ' ORDER BY created_at DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params) as Array<{
    id: number
    content: string
    category: string
    project: string | null
    created_at: string
  }>

  db.close()

  if (format === 'json') {
    console.log(JSON.stringify(rows))
    return
  }

  if (rows.length === 0) {
    console.log('No memories found.')
    return
  }

  for (const row of rows) {
    const proj = row.project ? ` [${row.project.split('-').slice(-2).join('/')}]` : ''
    console.log(`[${row.category}]${proj} ${row.content.slice(0, 120)}`)
    console.log(`  ${row.created_at}\n`)
  }
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

const CONSOLIDATE_PROMPT = (chunks: string[]) =>
  `Tu es un assistant qui consolide des fragments de mémoire développeur.
Voici ${chunks.length} fragments similaires:

${chunks.map((c, i) => `[${i + 1}] ${c.slice(0, 300)}`).join('\n\n')}

Produis une mémoire consolidée en 2-4 phrases qui capture l'essentiel.
Sois factuel, concis, technique. Réponds UNIQUEMENT avec la synthèse, sans introduction.`

// For consolidation we prefer fast/small models (not max quality)
const PREFERRED_MODELS = ['qwen2.5:1.5b', 'qwen3.5:4b', 'qwen3.5:latest', 'qwen3.5:9b', 'llama3.2', 'mistral']
// For categorization we prefer smarter models (accuracy > speed)
const CLASSIFY_MODELS = ['qwen3.5:9b', 'qwen3.5:latest', 'qwen3.5:4b', 'qwen2.5:1.5b', 'llama3.2', 'mistral']

let _classifyModel: string | null = null

async function detectClassifyModel(): Promise<string> {
  if (_classifyModel) return _classifyModel
  if (process.env.REX_LLM_MODEL) { _classifyModel = process.env.REX_LLM_MODEL; return _classifyModel }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map(m => m.name)
    for (const pref of CLASSIFY_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find(a => a.includes(base) && !a.includes('embed'))
      if (match) { _classifyModel = match; return match }
    }
    _classifyModel = available.find(a => !a.includes('embed')) ?? 'qwen3.5:latest'
    return _classifyModel
  } catch {
    _classifyModel = 'qwen3.5:latest'
    return _classifyModel
  }
}

async function detectGenerationModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map(m => m.name)
    for (const pref of PREFERRED_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find(a => a.includes(base) && !a.includes('embed'))
      if (match) return match
    }
    return available.find(a => !a.includes('embed')) ?? 'qwen3.5:latest'
  } catch {
    return 'qwen3.5:latest'
  }
}

async function summarizeCluster(chunks: string[], _modelHint: string): Promise<string> {
  const model = await detectGenerationModel()
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: CONSOLIDATE_PROMPT(chunks),
        stream: false,
        options: { temperature: 0.3, num_ctx: 4096 },
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) throw new Error(`Ollama error ${res.status}`)
    const data = await res.json() as { response: string }
    let text = data.response.trim()
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (text.length > 20) return text.slice(0, 600)
  } catch (e) {
    console.error(`    summarize failed (${model}): ${(e as Error).message}`)
  }
  return chunks.map(c => c.slice(0, 120)).join(' | ')
}

export async function consolidate(options: {
  model?: string
  threshold?: number
  minCluster?: number
  limit?: number
  dryRun?: boolean
}) {
  const { model = 'qwen3.5:4b', threshold = 0.82, minCluster = 3, limit = 300, dryRun = false } = options

  if (!existsSync(DB_PATH)) {
    console.error('No memory database found. Run `rex ingest` first.')
    process.exit(1)
  }

  const db = openDb()

  const memories = db.prepare(`
    SELECT m.id, m.content, m.category, m.project
    FROM memories m
    INNER JOIN memory_vec v ON v.rowid = m.id
    WHERE m.category NOT LIKE 'archived%'
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ id: number; content: string; category: string; project: string | null }>

  if (memories.length < minCluster) {
    console.log(`Only ${memories.length} memories found (need at least ${minCluster}).`)
    db.close()
    return
  }

  console.log(`Loading embeddings for ${memories.length} memories...`)

  const getEmbed = db.prepare('SELECT embedding FROM memory_vec WHERE rowid = ?')
  const embeddings: Float32Array[] = []
  const valid: typeof memories = []

  for (const mem of memories) {
    const row = getEmbed.get(mem.id) as { embedding: Buffer } | null
    if (!row?.embedding) continue
    const buf = row.embedding as Buffer
    embeddings.push(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
    valid.push(mem)
  }

  console.log(`  ${valid.length} embeddings loaded. Clustering (threshold=${threshold})...`)

  const assigned = new Set<number>()
  const clusters: number[][] = []

  for (let i = 0; i < valid.length; i++) {
    if (assigned.has(i)) continue
    const cluster = [i]
    for (let j = i + 1; j < valid.length; j++) {
      if (assigned.has(j)) continue
      if (cosineSim(embeddings[i], embeddings[j]) >= threshold) {
        cluster.push(j)
        assigned.add(j)
      }
    }
    if (cluster.length >= minCluster) {
      cluster.forEach(idx => assigned.add(idx))
      clusters.push(cluster)
    }
  }

  if (clusters.length === 0) {
    console.log(`No clusters found (threshold=${threshold}, minCluster=${minCluster}).`)
    db.close()
    return
  }

  const totalIn = clusters.reduce((s, c) => s + c.length, 0)
  console.log(`Found ${clusters.length} clusters (${totalIn} memories → ${clusters.length} consolidated)`)

  if (dryRun) {
    for (const cluster of clusters) {
      console.log(`  Cluster of ${cluster.length}: ${valid[cluster[0]].content.slice(0, 80)}...`)
    }
    db.close()
    return
  }

  const insertMem = db.prepare('INSERT INTO memories (content, category, source, project) VALUES (?, ?, ?, ?)')
  const insertVec = db.prepare('INSERT INTO memory_vec (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)')
  const archiveStmt = db.prepare("UPDATE memories SET category = 'archived' WHERE id = ?")

  let done = 0
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci]
    const mems = cluster.map(i => valid[i])
    process.stdout.write(`  [${ci + 1}/${clusters.length}] cluster=${cluster.length}... `)

    const summary = await summarizeCluster(mems.map(m => m.content), model)
    const info = insertMem.run(summary, mems[0].category, 'consolidated', mems[0].project)
    const newId = Number(info.lastInsertRowid)

    try {
      const newEmb = await embed(summary)
      insertVec.run(newId, embeddingToBuffer(newEmb))
    } catch {}

    for (const mem of mems) archiveStmt.run(mem.id)
    process.stdout.write(`done\n`)
    done++
  }

  db.close()
  console.log(`\nDone: ${done} consolidated memories created, ${totalIn} archived.`)
}

// CLI entry point
if (process.argv[1]?.endsWith('categorize.ts') || process.argv[1]?.endsWith('categorize.js')) {
  const args = process.argv.slice(2)
  const subCmd = args[0]

  const getArg = (name: string) =>
    args.find(a => a.startsWith(`--${name}=`))?.split('=')[1]
    ?? (args.indexOf(`--${name}`) !== -1 ? args[args.indexOf(`--${name}`) + 1] : undefined)

  if (subCmd === 'list') {
    listMemories({
      category: getArg('category'),
      project: getArg('project'),
      limit: getArg('limit') ? parseInt(getArg('limit')!) : 50,
      format: (getArg('format') as 'json' | 'text') ?? 'json',
    })
  } else if (subCmd === 'consolidate') {
    const threshold = getArg('threshold') ? parseFloat(getArg('threshold')!) : 0.82
    const limit = getArg('limit') ? parseInt(getArg('limit')!) : 300
    const dryRun = args.includes('--dry-run')
    const model = getArg('model') || 'qwen3.5:4b'
    consolidate({ model, threshold, minCluster: 3, limit, dryRun }).catch(console.error)
  } else {
    const model = (getArg('model') === 'claude' ? 'claude' : 'qwen') as 'qwen' | 'claude'
    const batch = getArg('batch') ? parseInt(getArg('batch')!) : 50
    const dryRun = args.includes('--dry-run')
    categorize({ model, batch, dryRun }).catch(console.error)
  }
}
