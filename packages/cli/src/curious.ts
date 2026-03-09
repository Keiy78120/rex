/**
 * REX Curious — Proactive discovery module
 *
 * REX checks for new models, trending MCPs, and relevant news
 * without being asked. Also scans memory for recurring error patterns.
 *
 * Sources:
 *  - Memory DB (recurring errors, bug patterns — 0 LLM, pure SQL)
 *  - Ollama registry (new models available vs installed)
 *  - GitHub trending repos tagged mcp/llm/ai-agent
 *  - Hacker News top stories (AI/dev filter)
 *
 * Rules:
 *  §22 Token Economy — HTTP fetch only, no LLM for discovery itself
 *  §23 REX uses REX  — summaries via orchestrate() if needed
 * @module CURIOUS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { createLogger } from './logger.js'
import { REX_DIR, MEMORY_DB_PATH } from './paths.js'

const log = createLogger('CURIOUS:discovery')

const CURIOUS_CACHE_PATH = join(REX_DIR, 'curious-cache.json')
const CURIOUS_LOG_PATH   = join(REX_DIR, 'curious.log')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Discovery {
  type: 'model' | 'mcp' | 'news' | 'repo' | 'pattern'
  title: string
  detail: string
  url?: string
  source: string
  seenAt: string
  isNew: boolean
}

interface CuriousCache {
  lastRun: string
  seenModels: string[]
  seenMcps: string[]
  seenRepos: string[]
  seenNewsIds: number[]
  seenPatterns: string[]
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function loadCache(): CuriousCache {
  try {
    if (existsSync(CURIOUS_CACHE_PATH)) {
      return JSON.parse(readFileSync(CURIOUS_CACHE_PATH, 'utf-8'))
    }
  } catch {}
  return {
    lastRun: new Date(0).toISOString(),
    seenModels: [],
    seenMcps: [],
    seenRepos: [],
    seenNewsIds: [],
    seenPatterns: [],
  }
}

function saveCache(cache: CuriousCache): void {
  if (!existsSync(REX_DIR)) mkdirSync(REX_DIR, { recursive: true })
  writeFileSync(CURIOUS_CACHE_PATH, JSON.stringify(cache, null, 2))
}

function appendLog(lines: string[]): void {
  const now = new Date().toISOString()
  const entry = lines.map(l => `[${now}] ${l}`).join('\n') + '\n'
  const existing = existsSync(CURIOUS_LOG_PATH) ? readFileSync(CURIOUS_LOG_PATH, 'utf-8') : ''
  // Keep last 500 lines max
  const allLines = (existing + entry).split('\n')
  const trimmed = allLines.slice(Math.max(0, allLines.length - 500)).join('\n')
  writeFileSync(CURIOUS_LOG_PATH, trimmed)
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchOllamaLibrary(): Promise<Array<{ name: string; pulls: number; tags: number }>> {
  try {
    const res = await fetch('https://ollama.com/api/tags?sort=newest&limit=50', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'rex-curious/1.0' },
    })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string; pulls: number; tags: number }> }
    return data.models ?? []
  } catch {
    return []
  }
}

async function fetchInstalledOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models ?? []).map(m => m.name.split(':')[0])
  } catch {
    return []
  }
}

async function fetchGitHubTrending(topic: string): Promise<Array<{ name: string; description: string; url: string; stars: number }>> {
  try {
    const url = `https://api.github.com/search/repositories?q=topic:${topic}+created:>2026-01-01&sort=stars&order=desc&per_page=10`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'rex-curious/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    })
    if (!res.ok) return []
    const data = await res.json() as { items?: Array<{ full_name: string; description: string; html_url: string; stargazers_count: number }> }
    return (data.items ?? []).map(r => ({
      name: r.full_name,
      description: r.description ?? '',
      url: r.html_url,
      stars: r.stargazers_count,
    }))
  } catch {
    return []
  }
}

async function fetchHackerNews(): Promise<Array<{ id: number; title: string; url?: string; score: number }>> {
  try {
    const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=30&orderBy="$key"', {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const ids = (await res.json() as number[]).slice(0, 20)

    const stories = await Promise.all(
      ids.map(async id => {
        try {
          const s = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(5000),
          })
          return await s.json() as { id: number; title: string; url?: string; score: number; type?: string }
        } catch {
          return null
        }
      })
    )

    const AI_KEYWORDS = /\b(llm|claude|gpt|gemini|ollama|mcp|agent|embedding|rag|fine.?tun|open.?source|model|ai|inference|vector|typescript|rust|bun|deno|node\.?js)\b/i

    return stories
      .filter((s): s is { id: number; title: string; url?: string; score: number; type?: string } =>
        s != null && s.type === 'story' && s.score > 50 && AI_KEYWORDS.test(s.title)
      )
      .map(s => ({ id: s.id, title: s.title, url: s.url, score: s.score }))
  } catch {
    return []
  }
}

// ── Memory pattern detection (0 LLM, pure SQL) ───────────────────────────────

const ERROR_PATTERNS = [
  { keyword: 'TypeError',           label: 'TypeError' },
  { keyword: 'ReferenceError',      label: 'ReferenceError' },
  { keyword: 'Cannot find module',  label: 'Cannot find module' },
  { keyword: 'ENOENT',              label: 'File not found (ENOENT)' },
  { keyword: 'ECONNREFUSED',        label: 'Connection refused (ECONNREFUSED)' },
  { keyword: 'EADDRINUSE',          label: 'Port in use (EADDRINUSE)' },
  { keyword: 'null is not',         label: 'Null dereference' },
  { keyword: 'undefined is not',    label: 'Undefined dereference' },
  { keyword: '.cast<',              label: 'Unsafe .cast<>() in Flutter' },
  { keyword: 'notifyListeners',     label: 'notifyListeners during build' },
  { keyword: 'require(',            label: 'CommonJS require() in ESM' },
  { keyword: 'waitUntilReadyToShow',label: 'waitUntilReadyToShow crash' },
  { keyword: 'silent fail',         label: 'Silent failure pattern' },
  { keyword: 'app-sandbox',         label: 'Sandbox entitlement issue' },
]

const MIN_OCCURRENCES = 3

function detectMemoryPatterns(cache: CuriousCache): Discovery[] {
  if (!existsSync(MEMORY_DB_PATH)) return []
  const discoveries: Discovery[] = []
  const now = new Date().toISOString()

  try {
    const db = new Database(MEMORY_DB_PATH, { readonly: true })

    for (const { keyword, label } of ERROR_PATTERNS) {
      const row = db.prepare(
        `SELECT COUNT(*) AS cnt FROM memories WHERE content LIKE ? LIMIT 1`
      ).get(`%${keyword}%`) as { cnt: number }

      if (row.cnt >= MIN_OCCURRENCES) {
        const isNew = !cache.seenPatterns.includes(keyword)
        discoveries.push({
          type: 'pattern',
          title: label,
          detail: `Found ${row.cnt} times in memory — consider adding a rule`,
          source: 'memory',
          seenAt: now,
          isNew,
        })
      }
    }

    db.close()
  } catch {
    // DB not accessible — skip silently
  }

  return discoveries
}

// ── Main discovery ────────────────────────────────────────────────────────────

export interface CuriousResult {
  discoveries: Discovery[]
  newCount: number
  checkedAt: string
}

export async function runCurious(opts: { silent?: boolean } = {}): Promise<CuriousResult> {
  const { silent = false } = opts
  const cache = loadCache()
  const discoveries: Discovery[] = []

  if (!silent) log.info('Starting proactive discovery...')

  // Memory pattern detection (sync, 0 LLM)
  const memoryPatterns = detectMemoryPatterns(cache)
  discoveries.push(...memoryPatterns)
  cache.seenPatterns = [
    ...new Set([...cache.seenPatterns, ...memoryPatterns.map(p => p.title)]),
  ]

  // Run all fetches in parallel
  const [ollamaLibrary, installedModels, mcpRepos, aiRepos, hnStories] = await Promise.all([
    fetchOllamaLibrary(),
    fetchInstalledOllamaModels(),
    fetchGitHubTrending('mcp-server'),
    fetchGitHubTrending('ai-agent'),
    fetchHackerNews(),
  ])

  // ── Models: new popular models not yet installed ──
  const installedSet = new Set(installedModels)
  for (const model of ollamaLibrary.slice(0, 20)) {
    const baseName = model.name.split(':')[0]
    const isInstalled = installedSet.has(baseName)
    const isNew = !cache.seenModels.includes(baseName)

    if (!isInstalled && model.pulls > 10000) {
      discoveries.push({
        type: 'model',
        title: `New model available: ${baseName}`,
        detail: `${(model.pulls / 1000).toFixed(0)}k pulls on Ollama library`,
        url: `https://ollama.com/library/${baseName}`,
        source: 'ollama.com',
        seenAt: new Date().toISOString(),
        isNew,
      })
    }
  }
  cache.seenModels = [...new Set([...cache.seenModels, ...ollamaLibrary.map(m => m.name.split(':')[0])])]

  // ── MCPs: trending repos not in cache ──
  const allMcpRepos = [...mcpRepos, ...aiRepos]
  for (const repo of allMcpRepos) {
    const isNew = !cache.seenRepos.includes(repo.name)
    if (repo.stars > 100 || isNew) {
      discoveries.push({
        type: repo.name.toLowerCase().includes('mcp') ? 'mcp' : 'repo',
        title: repo.name,
        detail: repo.description.slice(0, 120) || `${repo.stars}★ on GitHub`,
        url: repo.url,
        source: 'github.com',
        seenAt: new Date().toISOString(),
        isNew,
      })
    }
  }
  cache.seenRepos = [...new Set([...cache.seenRepos, ...allMcpRepos.map(r => r.name)])]

  // ── HN: relevant stories not yet seen ──
  for (const story of hnStories) {
    const isNew = !cache.seenNewsIds.includes(story.id)
    discoveries.push({
      type: 'news',
      title: story.title,
      detail: `${story.score} points on Hacker News`,
      url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
      source: 'hackernews',
      seenAt: new Date().toISOString(),
      isNew,
    })
  }
  cache.seenNewsIds = [...new Set([...cache.seenNewsIds, ...hnStories.map(s => s.id)]).values()].slice(-200)

  const newCount = discoveries.filter(d => d.isNew).length
  cache.lastRun = new Date().toISOString()
  saveCache(cache)

  // Append to log
  if (discoveries.length > 0) {
    appendLog([
      `Discovered ${discoveries.length} items (${newCount} new)`,
      ...discoveries.filter(d => d.isNew).map(d => `  [${d.type}] ${d.title}`),
    ])
  }

  if (!silent) log.info(`Discovery complete: ${discoveries.length} items, ${newCount} new`)

  return { discoveries, newCount, checkedAt: cache.lastRun }
}

// ── CLI display ───────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
}
const LINE = '─'.repeat(56)

const TYPE_ICON: Record<string, string> = {
  model:   '🤖',
  mcp:     '🔌',
  repo:    '📦',
  news:    '📰',
  pattern: '🔁',
}

export function printDiscoveries(result: CuriousResult): void {
  const { discoveries, newCount } = result

  console.log(`\n${C.bold}REX Discoveries${C.reset}`)
  console.log(LINE)

  if (discoveries.length === 0) {
    console.log(`  ${C.dim}Nothing new today.${C.reset}`)
    console.log(LINE)
    return
  }

  const grouped: Record<string, Discovery[]> = {}
  for (const d of discoveries) {
    if (!grouped[d.type]) grouped[d.type] = []
    grouped[d.type].push(d)
  }

  for (const [type, items] of Object.entries(grouped)) {
    const icon = TYPE_ICON[type] ?? '·'
    const label = type === 'model' ? 'Models' : type === 'mcp' ? 'MCP Servers' : type === 'repo' ? 'Repos' : type === 'pattern' ? 'Recurring Patterns' : 'News'
    console.log(`\n  ${icon}  ${C.bold}${label}${C.reset}`)

    for (const d of items.slice(0, 5)) {
      const badge = d.isNew ? `${C.green}NEW${C.reset}  ` : `      `
      console.log(`  ${badge}${d.title}`)
      console.log(`         ${C.dim}${d.detail}${C.reset}`)
      if (d.url) console.log(`         ${C.cyan}${d.url}${C.reset}`)
    }

    if (items.length > 5) {
      console.log(`  ${C.dim}  … and ${items.length - 5} more${C.reset}`)
    }
  }

  console.log(`\n${LINE}`)
  console.log(`  ${newCount} new discoveries  ·  checked ${new Date(result.checkedAt).toLocaleString()}`)
  console.log()
}
