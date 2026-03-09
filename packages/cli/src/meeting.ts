/** @module MEETING */
// packages/cli/src/meeting.ts — Meeting transcript ingestion + memory integration
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { REX_DIR, MEMORY_DB_PATH } from './paths.js'
import { llm } from './llm.js'
import { pickModel } from './router.js'
import { createLogger } from './logger.js'

const log = createLogger('MEETING')
const MEETINGS_DIR = join(REX_DIR, 'meetings')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MeetingRecord {
  id: string
  title: string
  date: string
  source: string        // 'zoom' | 'meet' | 'teams' | 'file' | 'manual'
  durationMin?: number
  participants: string[]
  transcript: string
  summary: string
  actionItems: string[]
  tags: string[]
  memoryIds: number[]   // IDs stored in REX memory DB
  createdAt: string
}

export interface IngestResult {
  meetingId: string
  title: string
  summary: string
  actionItems: string[]
  memoryIds: number[]
  error?: string
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function ensureMeetingsDir(): void {
  if (!existsSync(MEETINGS_DIR)) mkdirSync(MEETINGS_DIR, { recursive: true })
}

function loadMeetings(): MeetingRecord[] {
  const path = join(MEETINGS_DIR, 'index.json')
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function saveMeetings(meetings: MeetingRecord[]): void {
  ensureMeetingsDir()
  writeFileSync(join(MEETINGS_DIR, 'index.json'), JSON.stringify(meetings, null, 2))
}

function saveMeetingFile(meeting: MeetingRecord): void {
  ensureMeetingsDir()
  const fname = `${meeting.id}.json`
  writeFileSync(join(MEETINGS_DIR, fname), JSON.stringify(meeting, null, 2))
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

async function summarizeTranscript(transcript: string, model: string): Promise<string> {
  const prompt = `Summarize this meeting transcript concisely. Include:
- Main topics discussed
- Key decisions made
- Important context

Transcript:
${transcript.slice(0, 6000)}

Write a 3-5 sentence summary.`

  return (await llm(prompt, 'You are a meeting summarizer. Be concise and factual.', model)).trim()
}

async function extractActionItems(transcript: string, summary: string, model: string): Promise<string[]> {
  const prompt = `Extract all action items from this meeting.

Summary: ${summary}

Transcript excerpt:
${transcript.slice(0, 4000)}

Output ONLY a JSON array of action item strings. Each item should be a complete sentence starting with a verb.
Example: ["Review the API design by Friday", "Set up a follow-up meeting with design team"]
JSON:`

  const raw = await llm(prompt, 'You are a meeting assistant. Output ONLY valid JSON.', model)
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0]) as string[]
  } catch { /* fallback below */ }
  return []
}

async function extractParticipants(transcript: string): Promise<string[]> {
  // Simple regex-based extraction — no LLM needed
  const patterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+):/gm,          // "John Smith: text"
    /\[([A-Z][a-z]+ [A-Z][a-z]+)\]/gm,         // "[John Smith]"
    /Speaker:\s*([A-Z][a-z]+ [A-Z][a-z]+)/gm,  // "Speaker: John Smith"
  ]
  const names = new Set<string>()
  for (const re of patterns) {
    for (const m of transcript.matchAll(re)) {
      names.add(m[1].trim())
    }
  }
  return [...names].slice(0, 20)
}

function guessTitle(filePath: string, transcript: string): string {
  const ext = extname(filePath)
  const base = basename(filePath, ext)
  // If filename looks auto-generated (all digits or generic), use transcript first line
  if (/^\d+$/.test(base) || base === 'transcript' || base === 'meeting') {
    const firstLine = transcript.split('\n').find(l => l.trim().length > 10)?.trim()
    return firstLine ? firstLine.slice(0, 60) : base
  }
  return base.replace(/[-_]/g, ' ')
}

// ─── Memory integration ───────────────────────────────────────────────────────

async function storeInMemory(meeting: MeetingRecord): Promise<number[]> {
  if (!existsSync(MEMORY_DB_PATH)) {
    log.warn('No memory DB found — skipping memory storage')
    return []
  }

  const db = new Database(MEMORY_DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // Ensure memories table has required columns
  const cols = (db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map(c => c.name)
  if (!cols.includes('id')) {
    db.close()
    log.warn('Memory DB schema not ready')
    return []
  }

  const ids: number[] = []
  const now = new Date().toISOString()

  const insertStmt = db.prepare(`
    INSERT INTO memories (summary, content, category, created_at, tags)
    VALUES (?, ?, 'meeting', ?, ?)
  `)

  // Store summary as primary memory entry
  const summaryContent = [
    `Meeting: ${meeting.title}`,
    `Date: ${meeting.date}`,
    meeting.participants.length > 0 ? `Participants: ${meeting.participants.join(', ')}` : '',
    '',
    meeting.summary,
    '',
    meeting.actionItems.length > 0
      ? `Action items:\n${meeting.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n')

  try {
    const result = insertStmt.run(
      meeting.summary.slice(0, 200),
      summaryContent,
      now,
      JSON.stringify(['meeting', ...meeting.tags])
    ) as { lastInsertRowid: number }
    ids.push(Number(result.lastInsertRowid))
    log.debug(`Stored meeting summary in memory #${ids[0]}`)
  } catch (err) {
    log.warn(`Failed to store meeting summary: ${String(err)}`)
  }

  // Store action items as separate memory entry for better searchability
  if (meeting.actionItems.length > 0) {
    const actionContent = `Action items from "${meeting.title}" (${meeting.date}):\n${meeting.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
    try {
      const result = insertStmt.run(
        `Action items: ${meeting.title}`,
        actionContent,
        now,
        JSON.stringify(['meeting', 'action-items', ...meeting.tags])
      ) as { lastInsertRowid: number }
      ids.push(Number(result.lastInsertRowid))
    } catch (err) {
      log.warn(`Failed to store action items: ${String(err)}`)
    }
  }

  db.close()
  return ids
}

// ─── Core API ─────────────────────────────────────────────────────────────────

export async function ingestMeetingTranscript(
  filePath: string,
  options: { title?: string; source?: string; silent?: boolean } = {}
): Promise<IngestResult> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m' }
  const print = (msg: string) => { if (!options.silent) console.log(msg) }

  if (!existsSync(filePath)) {
    return { meetingId: '', title: '', summary: '', actionItems: [], memoryIds: [], error: `File not found: ${filePath}` }
  }

  const transcript = readFileSync(filePath, 'utf-8').trim()
  if (transcript.length < 50) {
    return { meetingId: '', title: '', summary: '', actionItems: [], memoryIds: [], error: 'Transcript too short (< 50 chars)' }
  }

  const title = options.title ?? guessTitle(filePath, transcript)
  const date = new Date().toISOString().split('T')[0]
  const meetingId = `mtg-${Date.now()}`

  print(`\n${COLORS.bold}Meeting Ingest${COLORS.reset}`)
  print(`  Title    : ${title}`)
  print(`  File     : ${filePath}`)
  print(`  Length   : ${transcript.length} chars`)

  const model = await pickModel('reason').catch(() => 'qwen2.5:7b')
  print(`  Model    : ${COLORS.dim}${model}${COLORS.reset}`)

  print(`\n  ${COLORS.dim}Summarizing transcript…${COLORS.reset}`)
  let summary = ''
  let actionItems: string[] = []

  try {
    summary = await summarizeTranscript(transcript, model)
    print(`  ${COLORS.green}✓${COLORS.reset} Summary generated`)
  } catch (err) {
    log.warn(`Summary failed: ${String(err)}`)
    summary = transcript.split('\n').slice(0, 5).join(' ').slice(0, 300)
    print(`  ${COLORS.yellow}!${COLORS.reset} Summary fallback (LLM unavailable)`)
  }

  try {
    actionItems = await extractActionItems(transcript, summary, model)
    print(`  ${COLORS.green}✓${COLORS.reset} ${actionItems.length} action items extracted`)
  } catch (err) {
    log.warn(`Action items failed: ${String(err)}`)
  }

  const participants = await extractParticipants(transcript)

  const meeting: MeetingRecord = {
    id: meetingId,
    title,
    date,
    source: options.source ?? 'file',
    participants,
    transcript,
    summary,
    actionItems,
    tags: [],
    memoryIds: [],
    createdAt: new Date().toISOString(),
  }

  print(`\n  ${COLORS.dim}Storing in REX memory…${COLORS.reset}`)
  const memoryIds = await storeInMemory(meeting)
  meeting.memoryIds = memoryIds
  print(`  ${COLORS.green}✓${COLORS.reset} Stored ${memoryIds.length} memory entries`)

  // Save meeting record
  ensureMeetingsDir()
  saveMeetingFile(meeting)
  const all = loadMeetings()
  all.unshift({
    id: meetingId,
    title,
    date,
    source: meeting.source,
    participants,
    transcript: '',  // don't duplicate in index
    summary,
    actionItems,
    tags: [],
    memoryIds,
    createdAt: meeting.createdAt,
  })
  saveMeetings(all.slice(0, 200))

  print(`\n${COLORS.green}Done.${COLORS.reset} Meeting "${title}" ingested (id: ${meetingId})\n`)

  if (actionItems.length > 0 && !options.silent) {
    console.log(`${COLORS.bold}Action Items:${COLORS.reset}`)
    actionItems.forEach((a, i) => console.log(`  ${COLORS.cyan}${i + 1}.${COLORS.reset} ${a}`))
    console.log()
  }

  return { meetingId, title, summary, actionItems, memoryIds }
}

export function listMeetings(limit = 20): MeetingRecord[] {
  return loadMeetings().slice(0, limit)
}

export function getMeeting(id: string): MeetingRecord | null {
  const meetingPath = join(MEETINGS_DIR, `${id}.json`)
  if (!existsSync(meetingPath)) return null
  try { return JSON.parse(readFileSync(meetingPath, 'utf-8')) } catch { return null }
}

export async function searchMeetings(query: string): Promise<MeetingRecord[]> {
  const all = loadMeetings()
  const q = query.toLowerCase()
  return all.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.summary.toLowerCase().includes(q) ||
    m.actionItems.some(a => a.toLowerCase().includes(q)) ||
    m.participants.some(p => p.toLowerCase().includes(q))
  )
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

export async function meeting(args: string[]): Promise<void> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', red: '\x1b[31m' }
  const sub = args[0] ?? 'list'
  const jsonFlag = args.includes('--json')

  switch (sub) {
    case 'ingest': {
      const filePath = args[1]
      if (!filePath) {
        console.error('Usage: rex meeting ingest <transcript-file> [--title="Meeting Title"] [--source=zoom|meet|teams|file]')
        process.exit(1)
      }
      const titleArg = args.find(a => a.startsWith('--title='))?.split('=').slice(1).join('=')
      const sourceArg = (args.find(a => a.startsWith('--source='))?.split('=')[1] ?? 'file') as MeetingRecord['source']
      const result = await ingestMeetingTranscript(filePath, { title: titleArg, source: sourceArg, silent: jsonFlag })
      if (jsonFlag) console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'list': {
      const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 20)
      const meetings = listMeetings(limit)
      if (jsonFlag) {
        console.log(JSON.stringify({ meetings, total: meetings.length }, null, 2))
        break
      }
      if (meetings.length === 0) {
        console.log(`\n${COLORS.dim}No meetings ingested yet. Use: rex meeting ingest <file>${COLORS.reset}\n`)
        break
      }
      console.log(`\n${COLORS.bold}Meetings (${meetings.length}):${COLORS.reset}\n`)
      for (const m of meetings) {
        const participants = m.participants.length > 0 ? ` — ${m.participants.slice(0, 3).join(', ')}` : ''
        console.log(`  ${COLORS.cyan}${m.id}${COLORS.reset}  ${m.title}${COLORS.dim}${participants}${COLORS.reset}`)
        console.log(`  ${COLORS.dim}${m.date}  ${m.source}  ${m.actionItems.length} actions  ${m.memoryIds.length} memories${COLORS.reset}`)
        console.log()
      }
      break
    }

    case 'show': {
      const id = args[1]
      if (!id) { console.error('Usage: rex meeting show <id>'); process.exit(1) }
      const m = getMeeting(id)
      if (!m) { console.error(`Meeting not found: ${id}`); process.exit(1) }
      if (jsonFlag) { console.log(JSON.stringify(m, null, 2)); break }
      console.log(`\n${COLORS.bold}${m.title}${COLORS.reset}`)
      console.log(`${COLORS.dim}${m.date} | ${m.source} | ${m.participants.join(', ')}${COLORS.reset}\n`)
      console.log(`${COLORS.bold}Summary:${COLORS.reset}`)
      console.log(`  ${m.summary}\n`)
      if (m.actionItems.length > 0) {
        console.log(`${COLORS.bold}Action Items:${COLORS.reset}`)
        m.actionItems.forEach((a, i) => console.log(`  ${COLORS.cyan}${i + 1}.${COLORS.reset} ${a}`))
        console.log()
      }
      console.log(`${COLORS.dim}Memory IDs: ${m.memoryIds.join(', ')} | Created: ${m.createdAt}${COLORS.reset}\n`)
      break
    }

    case 'search': {
      const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ')
      if (!query) { console.error('Usage: rex meeting search <query>'); process.exit(1) }
      const results = await searchMeetings(query)
      if (jsonFlag) { console.log(JSON.stringify({ results, total: results.length }, null, 2)); break }
      if (results.length === 0) {
        console.log(`${COLORS.dim}No meetings match "${query}"${COLORS.reset}`)
        break
      }
      console.log(`\n${COLORS.bold}Results for "${query}" (${results.length}):${COLORS.reset}\n`)
      for (const m of results) {
        console.log(`  ${COLORS.cyan}${m.id}${COLORS.reset}  ${m.title}  ${COLORS.dim}${m.date}${COLORS.reset}`)
        const excerpt = m.summary.slice(0, 120).replace(/\n/g, ' ')
        console.log(`  ${COLORS.dim}${excerpt}${COLORS.reset}\n`)
      }
      break
    }

    case 'actions': {
      // List all action items across recent meetings
      const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 10)
      const meetings = listMeetings(limit)
      const actions: Array<{ meeting: string; date: string; action: string }> = []
      for (const m of meetings) {
        for (const a of m.actionItems) {
          actions.push({ meeting: m.title, date: m.date, action: a })
        }
      }
      if (jsonFlag) { console.log(JSON.stringify({ actions, total: actions.length }, null, 2)); break }
      if (actions.length === 0) {
        console.log(`${COLORS.dim}No action items found in recent meetings${COLORS.reset}`)
        break
      }
      console.log(`\n${COLORS.bold}Action Items (last ${limit} meetings):${COLORS.reset}\n`)
      for (const a of actions) {
        console.log(`  ${COLORS.cyan}•${COLORS.reset} ${a.action}`)
        console.log(`    ${COLORS.dim}${a.meeting} — ${a.date}${COLORS.reset}`)
      }
      console.log()
      break
    }

    default:
      console.log(`
${COLORS.bold}rex meeting — Meeting transcript integration${COLORS.reset}

  rex meeting ingest <file>           Ingest a transcript file into REX memory
  rex meeting ingest <file> \\
    --title="Weekly Sync" \\
    --source=zoom                     Ingest with explicit title and source
  rex meeting list [--limit=N]        List ingested meetings
  rex meeting show <id>               Show meeting details
  rex meeting search <query>          Search meetings by title, summary, or action items
  rex meeting actions [--limit=N]     List all action items from recent meetings

${COLORS.dim}Sources: zoom | meet | teams | file | manual${COLORS.reset}
${COLORS.dim}Transcripts are stored in ${MEETINGS_DIR} and indexed in REX memory${COLORS.reset}
`)
  }
}
