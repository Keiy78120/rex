/**
 * REX Dev Monitor
 *
 * Proactive developer life monitoring: what did Kevin code today?
 * Aggregates git activity, session stats, memory growth, discoveries,
 * and produces a concise daily snapshot without LLM calls.
 *
 * Sources:
 *  - git log (last 24h) across ~/Documents/Developer
 *  - Claude session count from ~/.claude/projects/
 *  - Burn rate from rex burn-rate --json
 *  - Curious cache for discovery count
 *  - Memory pending queue depth
 *
 * §22 Token Economy — all script-based, zero LLM
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'
import { REX_DIR, PENDING_DIR } from './paths.js'

const log = createLogger('dev-monitor')

const DEV_DIR      = join(homedir(), 'Documents', 'Developer')
const SESSIONS_DIR = join(homedir(), '.claude', 'projects')
const CURIOUS_CACHE = join(REX_DIR, 'curious-cache.json')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommitSummary {
  repo: string
  path: string
  count: number
  lastMessage: string
  branch: string
}

export interface DevStatusReport {
  generatedAt: string
  period: '24h'
  commits: CommitSummary[]
  totalCommits: number
  sessionCount: number
  pendingMemories: number
  curiousNew: number
  topProjects: string[]
}

// ── Git activity ──────────────────────────────────────────────────────────────

function run(cmd: string, cwd?: string, timeout = 5000): string {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout,
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

function findGitRepos(rootDir: string, depth = 2): string[] {
  const repos: string[] = []
  if (!existsSync(rootDir)) return repos

  const walk = (dir: string, currentDepth: number) => {
    if (currentDepth > depth) return
    try {
      const entries = readdirSync(dir)
      if (currentDepth > 0 && entries.includes('.git')) {
        repos.push(dir)
        return  // don't recurse into git repos
      }
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue
        const sub = join(dir, entry)
        try {
          if (statSync(sub).isDirectory()) walk(sub, currentDepth + 1)
        } catch {}
      }
    } catch {}
  }

  walk(rootDir, 0)
  return repos
}

function getRepoActivity(repoPath: string): CommitSummary | null {
  const count = run(
    'git log --since="24 hours ago" --oneline --all | wc -l',
    repoPath,
  )
  const n = parseInt(count.trim(), 10)
  if (isNaN(n) || n === 0) return null

  const lastMsg = run(
    'git log --since="24 hours ago" --oneline -1 --format="%s"',
    repoPath,
  )
  const branch = run('git rev-parse --abbrev-ref HEAD', repoPath)
  const repoName = repoPath.split('/').pop() ?? repoPath

  return {
    repo: repoName,
    path: repoPath,
    count: n,
    lastMessage: lastMsg.slice(0, 100),
    branch: branch || 'unknown',
  }
}

// ── Session count ─────────────────────────────────────────────────────────────

function countTodaySessions(): number {
  if (!existsSync(SESSIONS_DIR)) return 0
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let count = 0

  const walk = (dir: string) => {
    try {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        try {
          const st = statSync(p)
          if (st.isDirectory()) walk(p)
          else if (entry.endsWith('.jsonl') && st.mtimeMs > cutoff) count++
        } catch {}
      }
    } catch {}
  }

  walk(SESSIONS_DIR)
  return count
}

// ── Curious cache ─────────────────────────────────────────────────────────────

function getCuriousNewCount(): number {
  try {
    if (!existsSync(CURIOUS_CACHE)) return 0
    const data = JSON.parse(readFileSync(CURIOUS_CACHE, 'utf-8')) as { seenModels?: string[] }
    // Just return size of seen models as a proxy for activity
    // (real "new" count resets on each run)
    return (data.seenModels ?? []).length > 0 ? 1 : 0
  } catch {
    return 0
  }
}

// ── Pending memories ──────────────────────────────────────────────────────────

function getPendingCount(): number {
  try {
    if (!existsSync(PENDING_DIR)) return 0
    return readdirSync(PENDING_DIR).filter(f => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function getDevStatus(): Promise<DevStatusReport> {
  // Find git repos and check activity (limit to 40 repos for speed)
  const repos = findGitRepos(DEV_DIR, 3).slice(0, 40)
  const commitResults = repos.map(getRepoActivity).filter((c): c is CommitSummary => c !== null)
  commitResults.sort((a, b) => b.count - a.count)

  const totalCommits = commitResults.reduce((sum, c) => sum + c.count, 0)
  const topProjects = commitResults.slice(0, 5).map(c => c.repo)

  return {
    generatedAt: new Date().toISOString(),
    period: '24h',
    commits: commitResults,
    totalCommits,
    sessionCount: countTodaySessions(),
    pendingMemories: getPendingCount(),
    curiousNew: getCuriousNewCount(),
    topProjects,
  }
}

// ── CLI display ───────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
}
const LINE = '─'.repeat(52)

export function printDevStatus(report: DevStatusReport): void {
  const now = new Date()
  const dayStr = now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

  console.log(`\n${C.bold}Dev Status${C.reset}  ${C.dim}${dayStr}${C.reset}`)
  console.log(LINE)
  console.log(`  Sessions today    ${C.bold}${report.sessionCount}${C.reset}`)
  console.log(`  Total commits     ${C.bold}${report.totalCommits}${C.reset}`)
  console.log(`  Memory pending    ${C.bold}${report.pendingMemories}${C.reset}`)

  if (report.commits.length > 0) {
    console.log(`\n  ${C.bold}Active repos (last 24h)${C.reset}`)
    for (const c of report.commits.slice(0, 8)) {
      const bar = '█'.repeat(Math.min(c.count, 10))
      console.log(`  ${C.green}${bar.padEnd(10)}${C.reset}  ${c.repo}  ${C.dim}${c.count} commit${c.count !== 1 ? 's' : ''} · ${c.lastMessage.slice(0, 50)}${C.reset}`)
    }
  } else {
    console.log(`\n  ${C.dim}No commits in the last 24h.${C.reset}`)
  }

  console.log(LINE)
  console.log()
}

// ── Telegram summary ──────────────────────────────────────────────────────────

export function formatDevStatusTelegram(report: DevStatusReport): string {
  const dayStr = new Date(report.generatedAt).toLocaleDateString('en', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  const lines = [
    `📊 *Dev Status — ${dayStr}*`,
    '',
    `Sessions: ${report.sessionCount}  ·  Commits: ${report.totalCommits}`,
  ]

  if (report.commits.length > 0) {
    lines.push('')
    lines.push('*Active repos:*')
    for (const c of report.commits.slice(0, 5)) {
      lines.push(`  \`${c.repo}\` ${c.count}c — ${c.lastMessage.slice(0, 50)}`)
    }
  }

  if (report.pendingMemories > 0) {
    lines.push('')
    lines.push(`📥 ${report.pendingMemories} memories pending embed`)
  }

  return lines.join('\n')
}
