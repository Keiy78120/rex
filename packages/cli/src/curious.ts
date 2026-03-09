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
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import { createLogger } from './logger.js'
import { REX_DIR, MEMORY_DB_PATH } from './paths.js'
import type { SignalType } from './signal-detector.js'

const log = createLogger('CURIOUS:discovery')

const CURIOUS_CACHE_PATH = join(REX_DIR, 'curious-cache.json')
const CURIOUS_LOG_PATH   = join(REX_DIR, 'curious.log')
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Discovery {
  type: 'model' | 'mcp' | 'news' | 'repo' | 'pattern' | 'open_loop'
  signalType?: SignalType   // DISCOVERY | PATTERN | OPEN_LOOP
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
  seenBlogUrls: string[]
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
    seenBlogUrls: [],
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

// ── Awesome-MCP-Servers source ────────────────────────────────────────────────

async function fetchAwesomeMcpServers(): Promise<Array<{ name: string; description: string; url: string; stars: number }>> {
  // Search GitHub for top MCP server repos (broader topic set)
  try {
    const url = 'https://api.github.com/search/repositories?q=topic:mcp+topic:mcp-server&sort=stars&order=desc&per_page=15'
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

// ── mcpservers.org source ─────────────────────────────────────────────────────

async function fetchMcpServersOrg(): Promise<Array<{ name: string; description: string; url: string }>> {
  try {
    // mcpservers.org exposes a JSON API at /api/servers
    const res = await fetch('https://mcpservers.org/api/servers', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'rex-curious/1.0', 'Accept': 'application/json' },
    })
    if (res.ok) {
      const data = await res.json() as Array<{ name?: string; title?: string; description?: string; url?: string; github?: string }>
      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, 20).map(s => ({
          name: s.name ?? s.title ?? 'unknown',
          description: s.description ?? '',
          url: s.url ?? s.github ?? 'https://mcpservers.org',
        }))
      }
    }

    // Fallback: parse HTML for server links
    const htmlRes = await fetch('https://mcpservers.org', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'rex-curious/1.0' },
    })
    if (!htmlRes.ok) return []
    const html = await htmlRes.text()

    const results: Array<{ name: string; description: string; url: string }> = []
    const linkRe = /href="(https?:\/\/github\.com\/[^"]+)"[^>]*>([^<]{3,80})</g
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(html)) !== null && results.length < 15) {
      const url = m[1]
      const name = m[2].trim()
      if (name && url && !results.some(r => r.url === url)) {
        results.push({ name, description: '', url })
      }
    }
    return results
  } catch {
    return []
  }
}

// ── RSS / Atom feed fetcher (HuggingFace blog, Simon Willison) ───────────────

async function fetchRssFeed(feedUrl: string, source: string): Promise<Array<{ title: string; url: string; summary: string; source: string }>> {
  try {
    const res = await fetch(feedUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'rex-curious/1.0', 'Accept': 'application/xml,application/atom+xml,text/xml' },
    })
    if (!res.ok) return []
    const text = await res.text()
    const items: Array<{ title: string; url: string; summary: string; source: string }> = []

    // Works for both RSS <item> and Atom <entry>
    const itemRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/g
    let m: RegExpExecArray | null
    while ((m = itemRe.exec(text)) !== null && items.length < 8) {
      const block = m[1]
      const titleMatch = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(block)
      const linkHrefMatch = /<link[^>]*href="([^"]+)"/i.exec(block)
      const linkTextMatch = /<link>([^<]+)<\/link>/i.exec(block)
      const summaryMatch = /<(?:summary|description)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:summary|description)>/i.exec(block)
      const title = (titleMatch?.[1] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
      const url = (linkHrefMatch?.[1] ?? linkTextMatch?.[1] ?? '').trim()
      const summary = (summaryMatch?.[1] ?? '').replace(/<[^>]+>/g, '').slice(0, 120).trim()
      if (title && url) items.push({ title, url, summary, source })
    }
    return items
  } catch {
    return []
  }
}

// ── r/LocalLLaMA Reddit API ───────────────────────────────────────────────────

async function fetchLocalLlama(): Promise<Array<{ title: string; url: string; score: number }>> {
  try {
    const res = await fetch('https://www.reddit.com/r/LocalLLaMA/new.json?limit=15', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'rex-curious/1.0' },
    })
    if (!res.ok) return []
    const data = await res.json() as {
      data?: { children?: Array<{ data: { title: string; url: string; permalink: string; score: number } }> }
    }
    return (data.data?.children ?? []).map(c => ({
      title: c.data.title,
      url: c.data.url.startsWith('https://www.reddit.com') ? c.data.url : `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
    }))
  } catch {
    return []
  }
}

// ── OPEN_LOOP detection (unresolved issues >7 days in memory) ─────────────────

const OPEN_LOOP_PATTERNS = [
  'TODO', 'FIXME', 'HACK', 'BUG', 'OPEN ISSUE', 'UNRESOLVED',
  'still broken', 'needs fix', "can't figure", 'stuck on', 'not working',
  'need to investigate', 'follow up', 'revisit',
]
const OPEN_LOOP_DAYS = 7

function detectOpenLoops(cache: CuriousCache): Discovery[] {
  if (!existsSync(MEMORY_DB_PATH)) return []
  const discoveries: Discovery[] = []
  const now = new Date()
  const cutoff = new Date(now.getTime() - OPEN_LOOP_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    const db = new Database(MEMORY_DB_PATH, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    const tableNames = new Set(tables.map(t => t.name))

    // Check memories table for old unresolved patterns
    if (tableNames.has('memories')) {
      for (const pattern of OPEN_LOOP_PATTERNS) {
        const rows = db.prepare(
          `SELECT content, created_at FROM memories WHERE content LIKE ? AND created_at < ? LIMIT 3`
        ).all(`%${pattern}%`, cutoff) as Array<{ content: string; created_at: string }>

        for (const row of rows) {
          const snippet = row.content.slice(0, 80).replace(/\n/g, ' ')
          const key = `open_loop:${pattern}:${row.created_at}`
          const isNew = !cache.seenPatterns.includes(key)
          if (isNew) {
            const daysAgo = Math.round((now.getTime() - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000))
            discoveries.push({
              type: 'open_loop',
              signalType: 'OPEN_LOOP',
              title: `Open loop: "${pattern}" (${daysAgo}d old)`,
              detail: snippet,
              source: 'memory',
              seenAt: now.toISOString(),
              isNew,
            })
            cache.seenPatterns.push(key)
          }
        }
      }
    }

    db.close()
  } catch {}

  return discoveries
}

// ── Telegram notification helper ──────────────────────────────────────────────

async function sendTelegramAlert(message: string): Promise<void> {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as { env?: Record<string, string> }
    const env = settings.env ?? {}
    const token = process.env.REX_TELEGRAM_BOT_TOKEN || env.REX_TELEGRAM_BOT_TOKEN
    const chatId = process.env.REX_TELEGRAM_CHAT_ID || env.REX_TELEGRAM_CHAT_ID
    if (!token || !chatId) return

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    })
  } catch {}
}

/**
 * Build and send Telegram notifications for new discoveries.
 * Groups by SignalType: DISCOVERY, PATTERN, OPEN_LOOP.
 */
export async function sendProactiveNotifications(discoveries: Discovery[]): Promise<void> {
  const newItems = discoveries.filter(d => d.isNew)
  if (newItems.length === 0) return

  const byType: Record<string, Discovery[]> = {}
  for (const d of newItems) {
    const bucket = d.signalType ?? (d.type === 'pattern' ? 'PATTERN' : d.type === 'open_loop' ? 'OPEN_LOOP' : 'DISCOVERY')
    if (!byType[bucket]) byType[bucket] = []
    byType[bucket].push(d)
  }

  const icons: Record<string, string> = { DISCOVERY: '🔭', PATTERN: '🔁', OPEN_LOOP: '🔓' }

  for (const [type, items] of Object.entries(byType)) {
    const icon = icons[type] ?? '·'
    const lines = items.slice(0, 5).map(d => {
      const urlLine = d.url ? `\n  🔗 ${d.url}` : ''
      return `• *${d.title}*\n  ${d.detail}${urlLine}`
    })
    const msg = `${icon} *REX ${type}* (${items.length} new)\n\n${lines.join('\n\n')}`
    await sendTelegramAlert(msg)
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
          signalType: 'PATTERN',
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

  // OPEN_LOOP: unresolved issues >7 days (sync, 0 LLM)
  const openLoops = detectOpenLoops(cache)
  discoveries.push(...openLoops)

  // Run all fetches in parallel
  const [ollamaLibrary, installedModels, mcpRepos, aiRepos, awesomeMcps, mcpServersOrg, hnStories, hfBlog, simonBlog, localLlama] = await Promise.all([
    fetchOllamaLibrary(),
    fetchInstalledOllamaModels(),
    fetchGitHubTrending('mcp-server'),
    fetchGitHubTrending('ai-agent'),
    fetchAwesomeMcpServers(),
    fetchMcpServersOrg(),
    fetchHackerNews(),
    fetchRssFeed('https://huggingface.co/blog/feed.xml', 'huggingface.co'),
    fetchRssFeed('https://simonwillison.net/atom/entries/', 'simonwillison.net'),
    fetchLocalLlama(),
  ])

  // ── Models: new popular models not yet installed ── [DISCOVERY]
  const installedSet = new Set(installedModels)
  for (const model of ollamaLibrary.slice(0, 20)) {
    const baseName = model.name.split(':')[0]
    const isInstalled = installedSet.has(baseName)
    const isNew = !cache.seenModels.includes(baseName)

    if (!isInstalled && model.pulls > 10000) {
      discoveries.push({
        type: 'model',
        signalType: 'DISCOVERY',
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

  // ── MCPs: trending repos + awesome-mcp-servers + mcpservers.org ── [DISCOVERY]
  const mcpServersOrgNormalized = mcpServersOrg.map(s => ({ name: s.name, description: s.description, url: s.url, stars: 0 }))
  const allMcpRepos = [...mcpRepos, ...aiRepos, ...awesomeMcps, ...mcpServersOrgNormalized]
  const seenRepoNames = new Set<string>()
  for (const repo of allMcpRepos) {
    if (seenRepoNames.has(repo.name)) continue
    seenRepoNames.add(repo.name)
    const isNew = !cache.seenRepos.includes(repo.name)
    if (repo.stars > 100 || isNew) {
      discoveries.push({
        type: repo.name.toLowerCase().includes('mcp') ? 'mcp' : 'repo',
        signalType: 'DISCOVERY',
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

  // ── HN: relevant stories not yet seen ── [DISCOVERY]
  for (const story of hnStories) {
    const isNew = !cache.seenNewsIds.includes(story.id)
    discoveries.push({
      type: 'news',
      signalType: 'DISCOVERY',
      title: story.title,
      detail: `${story.score} points on Hacker News`,
      url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
      source: 'hackernews',
      seenAt: new Date().toISOString(),
      isNew,
    })
  }
  cache.seenNewsIds = [...new Set([...cache.seenNewsIds, ...hnStories.map(s => s.id)]).values()].slice(-200)

  // ── Blog posts: HuggingFace + Simon Willison ── [DISCOVERY]
  const allBlogPosts = [...hfBlog, ...simonBlog]
  for (const post of allBlogPosts) {
    const isNew = !cache.seenBlogUrls.includes(post.url)
    if (isNew) {
      discoveries.push({
        type: 'news',
        signalType: 'DISCOVERY',
        title: post.title,
        detail: post.summary || `Article on ${post.source}`,
        url: post.url,
        source: post.source,
        seenAt: new Date().toISOString(),
        isNew: true,
      })
    }
  }
  cache.seenBlogUrls = [...new Set([...cache.seenBlogUrls, ...allBlogPosts.map(p => p.url)])].slice(-500)

  // ── r/LocalLLaMA: new posts ── [DISCOVERY]
  for (const post of localLlama) {
    const isNew = !cache.seenBlogUrls.includes(post.url)
    if (isNew) {
      discoveries.push({
        type: 'news',
        signalType: 'DISCOVERY',
        title: post.title,
        detail: `${post.score} upvotes on r/LocalLLaMA`,
        url: post.url,
        source: 'reddit.com/r/LocalLLaMA',
        seenAt: new Date().toISOString(),
        isNew: true,
      })
    }
  }
  cache.seenBlogUrls = [...new Set([...cache.seenBlogUrls, ...localLlama.map(p => p.url)])].slice(-500)

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

// ── Public API: contextual signal lookup (for REX Identity Layer) ─────────────

/**
 * Returns OPEN_LOOP signals from memory that are relevant to the given message.
 * Pure SQL query — no cache update, no LLM. Used by gateway before each response.
 */
export function getRelevantSignals(message: string): Discovery[] {
  if (!existsSync(MEMORY_DB_PATH)) return []

  // Extract meaningful keywords from message (>3 chars, unique, first 8)
  const keywords = [...new Set(
    message.toLowerCase().split(/\W+/).filter(w => w.length > 3),
  )].slice(0, 8)
  if (keywords.length === 0) return []

  const discoveries: Discovery[] = []
  const now = new Date()
  const cutoff = new Date(now.getTime() - OPEN_LOOP_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    const db = new Database(MEMORY_DB_PATH, { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    if (!tables.some(t => t.name === 'memories')) { db.close(); return [] }

    for (const keyword of keywords.slice(0, 5)) {
      for (const pattern of OPEN_LOOP_PATTERNS) {
        const rows = db.prepare(
          `SELECT content, created_at FROM memories WHERE content LIKE ? AND content LIKE ? AND created_at < ? LIMIT 2`
        ).all(`%${pattern}%`, `%${keyword}%`, cutoff) as Array<{ content: string; created_at: string }>

        for (const row of rows) {
          const snippet = row.content.slice(0, 100).replace(/\n/g, ' ')
          const daysAgo = Math.round(
            (now.getTime() - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000)
          )
          discoveries.push({
            type: 'open_loop',
            signalType: 'OPEN_LOOP',
            title: `"${pattern}" related to "${keyword}" (${daysAgo}d old)`,
            detail: snippet,
            source: 'memory',
            seenAt: now.toISOString(),
            isNew: false,
          })
        }
      }
    }

    db.close()
  } catch {}

  // Deduplicate by detail snippet
  const seen = new Set<string>()
  return discoveries.filter(d => {
    if (seen.has(d.detail)) return false
    seen.add(d.detail)
    return true
  }).slice(0, 5)
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
