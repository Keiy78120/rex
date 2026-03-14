# REX Autonomous Babysitter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform REX into a self-managing babysitter for Claude Code — centralized memory in `~/.claude/rex/`, single daemon, smart pre-loading, self-improvement, proactive advisor.

**Architecture:** A persistent Node.js daemon (`rex daemon`) replaces the 3 LaunchAgents. It handles health checks, ingestion, categorization, project scanning, self-improvement, and auto-repair on scheduled intervals. The existing `~/.claude/rules/`, `skills/`, `docs/` stay untouched. New centralized hub at `~/.claude/rex/` holds memory DB, project index, config, and self-improvement data. SessionStart hook pre-loads relevant context. SessionEnd hook extracts lessons.

**Tech Stack:** TypeScript/Node (tsup), SQLite + sqlite-vec, Ollama (nomic-embed-text + qwen3.5:9b), Claude CLI (haiku fallback), LaunchAgent (single daemon)

---

## Task 1: Directory Structure + Config

Create the `~/.claude/rex/` hub and unified config system.

**Files:**
- Create: `packages/cli/src/paths.ts`
- Create: `packages/cli/src/config.ts`

**Step 1: Create `paths.ts` — single source of truth for all REX paths**

```typescript
// packages/cli/src/paths.ts
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const HOME = process.env.HOME || '~'

export const REX_DIR = join(HOME, '.claude', 'rex')
export const MEMORY_DIR = join(REX_DIR, 'memory')
export const MEMORY_DB_PATH = join(MEMORY_DIR, 'rex.sqlite')
export const PENDING_DIR = join(MEMORY_DIR, 'pending')
export const BACKUPS_DIR = join(MEMORY_DIR, 'backups')
export const PROJECTS_DIR = join(REX_DIR, 'projects')
export const SUMMARIES_DIR = join(PROJECTS_DIR, 'summaries')
export const SELF_IMPROVEMENT_DIR = join(REX_DIR, 'self-improvement')
export const CONFIG_PATH = join(REX_DIR, 'config.json')
export const VAULT_PATH = join(REX_DIR, 'vault.md')
export const DAEMON_LOG_PATH = join(REX_DIR, 'daemon.log')
export const REFERENCES_DIR = join(REX_DIR, 'references')
export const INSPIRATIONS_DIR = join(REX_DIR, 'inspirations')

// Legacy paths for backward compat
export const LEGACY_MEMORY_DIR = join(HOME, '.rex-memory')
export const LEGACY_DB_PATH = join(LEGACY_MEMORY_DIR, 'db', 'rex.sqlite')

export function ensureRexDirs(): void {
  const dirs = [
    REX_DIR, MEMORY_DIR, PENDING_DIR, BACKUPS_DIR,
    PROJECTS_DIR, SUMMARIES_DIR, SELF_IMPROVEMENT_DIR,
    REFERENCES_DIR, INSPIRATIONS_DIR,
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}
```

**Step 2: Create `config.ts` — unified config with fallback chain**

```typescript
// packages/cli/src/config.ts
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { CONFIG_PATH } from './paths.js'

export interface RexConfig {
  llm: {
    embedModel: string
    classifyModel: string     // 'auto' | specific model name
    routing: 'ollama-first' | 'claude-only' | 'ollama-only'
    claudeFallback: string    // 'haiku' | 'sonnet' | 'opus'
  }
  ingest: {
    scanPaths: string[]
    excludePaths: string[]
    autoIngestInterval: number  // seconds
  }
  selfImprovement: {
    enabled: boolean
    ruleThreshold: number       // occurrences before proposing rule
    reviewInterval: number      // seconds
  }
  daemon: {
    healthCheckInterval: number
    ingestInterval: number
    maintenanceInterval: number
    selfReviewInterval: number
  }
  notifications: {
    silent: string[]
    warn: string[]
    daily: boolean
    weekly: boolean
  }
}

const DEFAULTS: RexConfig = {
  llm: {
    embedModel: 'nomic-embed-text',
    classifyModel: 'auto',
    routing: 'ollama-first',
    claudeFallback: 'haiku',
  },
  ingest: {
    scanPaths: ['~/Documents/Developer/'],
    excludePaths: ['node_modules', '.git', '_archive', 'dist', 'build'],
    autoIngestInterval: 1800,
  },
  selfImprovement: {
    enabled: true,
    ruleThreshold: 3,
    reviewInterval: 86400,
  },
  daemon: {
    healthCheckInterval: 300,
    ingestInterval: 1800,
    maintenanceInterval: 3600,
    selfReviewInterval: 86400,
  },
  notifications: {
    silent: ['ollama-restart', 'pending-flush', 'categorize-batch'],
    warn: ['db-corrupt', 'disk-low', 'config-corrupt'],
    daily: true,
    weekly: true,
  },
}

export function loadConfig(): RexConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULTS
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    return { ...DEFAULTS, ...raw, llm: { ...DEFAULTS.llm, ...raw.llm }, ingest: { ...DEFAULTS.ingest, ...raw.ingest }, selfImprovement: { ...DEFAULTS.selfImprovement, ...raw.selfImprovement }, daemon: { ...DEFAULTS.daemon, ...raw.daemon }, notifications: { ...DEFAULTS.notifications, ...raw.notifications } }
  } catch {
    // Config corrupted — restore backup
    const bakPath = CONFIG_PATH + '.bak'
    if (existsSync(bakPath)) {
      try {
        const bak = JSON.parse(readFileSync(bakPath, 'utf-8'))
        writeFileSync(CONFIG_PATH, JSON.stringify(bak, null, 2))
        return { ...DEFAULTS, ...bak }
      } catch {}
    }
    return DEFAULTS
  }
}

export function saveConfig(config: RexConfig): void {
  // Backup before write
  if (existsSync(CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak')
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
```

**Step 3: Build and verify**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Expected: Build succeeds with new chunks for paths and config.

**Step 4: Commit**

```bash
git add packages/cli/src/paths.ts packages/cli/src/config.ts
git commit -m "feat(rex): add centralized paths and config system for ~/.claude/rex/"
```

---

## Task 2: DB Migration + Schema Update

Migrate `~/.rex-memory/db/rex.sqlite` to `~/.claude/rex/memory/rex.sqlite`. Add `needs_reprocess` and `summary` columns. Add `project` category. Create symlink for backward compat.

**Files:**
- Create: `packages/cli/src/migrate.ts`
- Modify: `packages/memory/src/ingest.ts:7-8` (DB_PATH + PENDING_DIR)
- Modify: `packages/memory/src/categorize.ts:8` (DB_PATH)

**Step 1: Create `migrate.ts`**

```typescript
// packages/cli/src/migrate.ts
import { existsSync, copyFileSync, mkdirSync, symlinkSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_DIR, MEMORY_DB_PATH, PENDING_DIR, BACKUPS_DIR, LEGACY_MEMORY_DIR, LEGACY_DB_PATH, ensureRexDirs } from './paths.js'

export async function migrate(): Promise<void> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m', dim: '\x1b[2m' }

  ensureRexDirs()

  // 1. Migrate DB if legacy exists and new doesn't
  if (existsSync(LEGACY_DB_PATH) && !existsSync(MEMORY_DB_PATH)) {
    console.log(`${COLORS.yellow}Migrating${COLORS.reset} rex.sqlite to ~/.claude/rex/memory/`)
    copyFileSync(LEGACY_DB_PATH, MEMORY_DB_PATH)

    // Copy WAL/SHM if they exist
    for (const ext of ['-wal', '-shm']) {
      const src = LEGACY_DB_PATH + ext
      if (existsSync(src)) copyFileSync(src, MEMORY_DB_PATH + ext)
    }
    console.log(`${COLORS.green}Done${COLORS.reset} — DB migrated`)
  }

  // 2. Migrate pending/ files
  const legacyPending = join(LEGACY_MEMORY_DIR, 'pending')
  if (existsSync(legacyPending)) {
    const { readdirSync } = await import('node:fs')
    const files = readdirSync(legacyPending).filter(f => f.endsWith('.json'))
    for (const f of files) {
      const src = join(legacyPending, f)
      const dest = join(PENDING_DIR, f)
      if (!existsSync(dest)) copyFileSync(src, dest)
    }
    if (files.length) console.log(`${COLORS.green}Migrated${COLORS.reset} ${files.length} pending files`)
  }

  // 3. Create symlink ~/.rex-memory -> ~/.claude/rex/memory for backward compat
  if (existsSync(LEGACY_MEMORY_DIR)) {
    // Check if it's already a symlink
    try {
      const stat = statSync(LEGACY_MEMORY_DIR, { throwIfNoEntry: false })
      if (stat && !stat.isSymbolicLink()) {
        // Rename old dir to .rex-memory.bak then symlink
        const { renameSync } = await import('node:fs')
        renameSync(LEGACY_MEMORY_DIR, LEGACY_MEMORY_DIR + '.bak')
        console.log(`${COLORS.dim}Renamed ~/.rex-memory/ to ~/.rex-memory.bak/${COLORS.reset}`)
      }
    } catch {}
  }

  if (!existsSync(LEGACY_MEMORY_DIR)) {
    // Need to create a symlink structure that matches old layout
    // Old: ~/.rex-memory/db/rex.sqlite
    // New: ~/.claude/rex/memory/rex.sqlite
    mkdirSync(LEGACY_MEMORY_DIR, { recursive: true })
    const legacyDbDir = join(LEGACY_MEMORY_DIR, 'db')
    if (!existsSync(legacyDbDir)) {
      symlinkSync(MEMORY_DIR, legacyDbDir)
      console.log(`${COLORS.green}Symlinked${COLORS.reset} ~/.rex-memory/db/ -> ~/.claude/rex/memory/`)
    }
  }

  // 4. Schema upgrade: add needs_reprocess and summary columns
  if (existsSync(MEMORY_DB_PATH)) {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(MEMORY_DB_PATH)
    db.pragma('journal_mode = WAL')

    // Add summary column if missing
    const cols = db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)

    if (!colNames.includes('summary')) {
      db.exec("ALTER TABLE memories ADD COLUMN summary TEXT")
      console.log(`${COLORS.green}Added${COLORS.reset} summary column to memories`)
    }
    if (!colNames.includes('needs_reprocess')) {
      db.exec("ALTER TABLE memories ADD COLUMN needs_reprocess INTEGER DEFAULT 0")
      console.log(`${COLORS.green}Added${COLORS.reset} needs_reprocess column to memories`)
    }

    // Add 'project' and 'reference' to valid categories check (no schema change needed, categories are just text)
    db.close()
  }

  console.log(`\n${COLORS.green}Migration complete.${COLORS.reset} REX hub at ~/.claude/rex/`)
}
```

**Step 2: Update DB_PATH in memory package**

In `packages/memory/src/ingest.ts`, change line 7-8:

```typescript
// Old:
const DB_PATH = join(import.meta.dirname, "..", "db", "rex.sqlite");

// New:
const REX_MEMORY_DIR = join(process.env.HOME || '~', '.claude', 'rex', 'memory')
const DB_PATH = existsSync(join(REX_MEMORY_DIR, 'rex.sqlite'))
  ? join(REX_MEMORY_DIR, 'rex.sqlite')
  : join(import.meta.dirname, '..', 'db', 'rex.sqlite')  // fallback to legacy
```

Same change in `packages/memory/src/categorize.ts` line 8.

Also update `PENDING_DIR` in `ingest.ts` line 231:

```typescript
// Old:
const PENDING_DIR = join(process.env.HOME || "~", ".rex-memory", "pending");

// New:
const PENDING_DIR = join(process.env.HOME || '~', '.claude', 'rex', 'memory', 'pending')
```

**Step 3: Add `rex migrate` command to `index.ts`**

Add after the `setup` case in `packages/cli/src/index.ts`:

```typescript
case 'migrate': {
  const { migrate } = await import('./migrate.js')
  await migrate()
  break
}
```

**Step 4: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex migrate`
Expected: DB copied, symlink created, schema upgraded, no errors.

Verify: `ls -la ~/.claude/rex/memory/rex.sqlite` exists.
Verify: `ls -la ~/.rex-memory/db/` is a symlink.
Verify: `sqlite3 ~/.claude/rex/memory/rex.sqlite "PRAGMA table_info(memories)" | grep summary` shows the new column.

**Step 5: Commit**

```bash
git add packages/cli/src/migrate.ts packages/cli/src/index.ts packages/memory/src/ingest.ts packages/memory/src/categorize.ts
git commit -m "feat(rex): DB migration to ~/.claude/rex/memory/ with schema upgrade"
```

---

## Task 3: Project Scanner

Auto-scan `~/Documents/Developer/` to generate `projects/index.json` with stack detection.

**Files:**
- Create: `packages/cli/src/projects.ts`

**Step 1: Create `projects.ts`**

```typescript
// packages/cli/src/projects.ts
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { PROJECTS_DIR, SUMMARIES_DIR, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'

export interface ProjectEntry {
  name: string
  path: string
  stack: string[]
  lastActive: string
  status: 'active' | 'archived' | 'template'
  repo?: string
  memoryCount?: number
}

function detectStack(projectPath: string): string[] {
  const stack: string[] = []

  // package.json
  const pkgPath = join(projectPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['next']) stack.push('next.js')
      else if (allDeps['react']) stack.push('react')
      if (allDeps['vue']) stack.push('vue')
      if (allDeps['angular'] || allDeps['@angular/core']) stack.push('angular')
      if (allDeps['@ionic/angular'] || allDeps['@ionic/react']) stack.push('ionic')
      if (allDeps['typescript']) stack.push('typescript')
      if (allDeps['tailwindcss']) stack.push('tailwind')
      if (allDeps['drizzle-orm']) stack.push('drizzle')
      if (allDeps['hono']) stack.push('hono')
      if (allDeps['wrangler'] || allDeps['@cloudflare/workers-types']) stack.push('cloudflare-workers')
      if (allDeps['better-sqlite3'] || allDeps['sqlite3']) stack.push('sqlite')
      if (allDeps['express']) stack.push('express')
      if (stack.length === 0) stack.push('node')
    } catch {}
  }

  // pubspec.yaml
  if (existsSync(join(projectPath, 'pubspec.yaml'))) {
    stack.push('flutter')
    const pubspec = readFileSync(join(projectPath, 'pubspec.yaml'), 'utf-8')
    if (pubspec.includes('macos_ui')) stack.push('macos')
  }

  // composer.json
  if (existsSync(join(projectPath, 'composer.json'))) {
    stack.push('php')
    try {
      const composer = JSON.parse(readFileSync(join(projectPath, 'composer.json'), 'utf-8'))
      if (composer.require?.['cakephp/cakephp']) stack.push('cakephp')
      if (composer.require?.['laravel/framework']) stack.push('laravel')
    } catch {}
  }

  // Cargo.toml
  if (existsSync(join(projectPath, 'Cargo.toml'))) stack.push('rust')

  // go.mod
  if (existsSync(join(projectPath, 'go.mod'))) stack.push('go')

  return stack
}

function getLastModified(projectPath: string): string {
  try {
    // Check git log first
    const { execSync } = require('node:child_process')
    const date = execSync('git log -1 --format=%ci 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim()
    if (date) return date.split(' ')[0]
  } catch {}
  try {
    return statSync(projectPath).mtime.toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

function getGitRemote(projectPath: string): string | undefined {
  try {
    const { execSync } = require('node:child_process')
    return execSync('git remote get-url origin 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim() || undefined
  } catch {
    return undefined
  }
}

export function scanProjects(): ProjectEntry[] {
  const config = loadConfig()
  const HOME = process.env.HOME || '~'
  const projects: ProjectEntry[] = []

  for (const scanPath of config.ingest.scanPaths) {
    const resolved = scanPath.replace('~', HOME)
    if (!existsSync(resolved)) continue

    const entries = readdirSync(resolved, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (config.ingest.excludePaths.includes(entry.name)) continue
      if (entry.name.startsWith('.')) continue

      const fullPath = join(resolved, entry.name)

      // Check if it's a direct project (has manifest) or a group folder
      const hasManifest = ['package.json', 'pubspec.yaml', 'composer.json', 'Cargo.toml', 'go.mod'].some(f => existsSync(join(fullPath, f)))

      if (hasManifest) {
        const status = entry.name.startsWith('_') ? (entry.name === '_templates' ? 'template' : 'archived') : 'active'
        projects.push({
          name: entry.name,
          path: fullPath,
          stack: detectStack(fullPath),
          lastActive: getLastModified(fullPath),
          status,
          repo: getGitRemote(fullPath),
        })
      } else {
        // It's a group folder (keiy/, dstudio/, bots/) — scan one level deeper
        try {
          const subEntries = readdirSync(fullPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (!sub.isDirectory() || sub.name.startsWith('.')) continue
            if (config.ingest.excludePaths.includes(sub.name)) continue
            const subPath = join(fullPath, sub.name)
            const subHasManifest = ['package.json', 'pubspec.yaml', 'composer.json', 'Cargo.toml', 'go.mod'].some(f => existsSync(join(subPath, f)))
            if (subHasManifest) {
              projects.push({
                name: sub.name,
                path: subPath,
                stack: detectStack(subPath),
                lastActive: getLastModified(subPath),
                status: 'active',
                repo: getGitRemote(subPath),
              })
            }
          }
        } catch {}
      }
    }
  }

  return projects.sort((a, b) => b.lastActive.localeCompare(a.lastActive))
}

export function saveProjectIndex(projects: ProjectEntry[]): void {
  ensureRexDirs()
  writeFileSync(join(PROJECTS_DIR, 'index.json'), JSON.stringify(projects, null, 2))
}

export function loadProjectIndex(): ProjectEntry[] {
  const indexPath = join(PROJECTS_DIR, 'index.json')
  if (!existsSync(indexPath)) return []
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8'))
  } catch {
    return []
  }
}

export function findProject(cwd: string): ProjectEntry | undefined {
  const projects = loadProjectIndex()
  // Exact match or cwd starts with project path
  return projects.find(p => cwd === p.path || cwd.startsWith(p.path + '/'))
}
```

**Step 2: Add `rex projects` command to `index.ts`**

```typescript
case 'projects': {
  const { scanProjects, saveProjectIndex } = await import('./projects.js')
  console.log(`${COLORS.cyan}Scanning projects...${COLORS.reset}`)
  const projects = scanProjects()
  saveProjectIndex(projects)
  console.log(`\n${COLORS.bold}${projects.length} projects found${COLORS.reset}\n`)
  for (const p of projects) {
    const dot = p.status === 'active' ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`
    console.log(`  ${dot} ${COLORS.bold}${p.name.padEnd(20)}${COLORS.reset} ${p.stack.join(', ').padEnd(30)} ${COLORS.dim}${p.lastActive}${COLORS.reset}`)
  }
  break
}
```

**Step 3: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex projects`
Expected: Lists all projects from ~/Documents/Developer/ with stack detection.

**Step 4: Commit**

```bash
git add packages/cli/src/projects.ts packages/cli/src/index.ts
git commit -m "feat(rex): project scanner with auto stack detection"
```

---

## Task 4: Recategorize Command

Bulk re-classify the 2661 "session" memories with proper categories.

**Files:**
- Create: `packages/cli/src/recategorize.ts`

**Step 1: Create `recategorize.ts`**

```typescript
// packages/cli/src/recategorize.ts
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { MEMORY_DB_PATH } from './paths.js'
import { loadConfig } from './config.js'
import { pickModel } from './router.js'
import { llm } from './llm.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const VALID_CATEGORIES = ['debug', 'fix', 'pattern', 'lesson', 'architecture', 'config', 'project', 'reference', 'session'] as const

const CLASSIFY_PROMPT = (content: string) =>
  `Classify this developer memory chunk. Output ONLY valid JSON, no markdown.

Categories: debug, fix, pattern, lesson, architecture, config, project, reference, session

- debug: debugging an issue, tracing errors
- fix: applying a fix or patch, solution found
- pattern: reusable code patterns, techniques
- lesson: lessons learned, mistakes to avoid
- architecture: system design, structure decisions
- config: configuration changes, setup steps
- project: project overview, stack, status
- reference: API docs, external knowledge, lib behavior
- session: general content (default fallback)

Content:
${content.slice(0, 1500)}

JSON output: {"category": "<one of the above>", "summary": "<1-2 sentence summary>"}`

async function classifyChunk(content: string, routing: string, claudeFallback: string): Promise<{ category: string; summary: string } | null> {
  const prompt = CLASSIFY_PROMPT(content)

  // Try Ollama first
  if (routing !== 'claude-only') {
    try {
      const model = await pickModel('categorize')
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3, num_ctx: 4096 } }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const data = await res.json() as { response: string }
        const parsed = parseJsonResponse(data.response)
        if (parsed) return parsed
      }
    } catch {}
  }

  // Fallback to Claude
  if (routing !== 'ollama-only') {
    try {
      const result = await llm(prompt, undefined, claudeFallback)
      return parseJsonResponse(result)
    } catch {}
  }

  return null
}

function parseJsonResponse(raw: string): { category: string; summary: string } | null {
  let parsed: any = null
  try { parsed = JSON.parse(raw) } catch {}
  if (!parsed) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) { try { parsed = JSON.parse(fence[1].trim()) } catch {} }
  }
  if (!parsed) {
    const brace = raw.match(/\{[\s\S]*\}/)
    if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
  }
  if (!parsed) return null

  const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'session'
  const summary = typeof parsed.summary === 'string' && parsed.summary.length > 5 ? parsed.summary : null
  if (!summary) return null
  return { category, summary }
}

export async function recategorize(options: { batch?: number; dryRun?: boolean } = {}): Promise<void> {
  const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' }
  const config = loadConfig()
  const batchSize = options.batch ?? 50

  const db = new Database(MEMORY_DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // Find memories that need recategorization:
  // category = 'session' OR category = 'general' OR needs_reprocess = 1
  const rows = db.prepare(
    "SELECT id, content FROM memories WHERE category IN ('session', 'general') OR needs_reprocess = 1 LIMIT ?"
  ).all(batchSize) as Array<{ id: number; content: string }>

  console.log(`\n${COLORS.bold}REX Recategorize${COLORS.reset}`)
  console.log(`${COLORS.dim}Found ${rows.length} memories to process (batch: ${batchSize})${COLORS.reset}\n`)

  if (rows.length === 0) {
    console.log(`${COLORS.green}All memories are already categorized.${COLORS.reset}`)
    db.close()
    return
  }

  if (options.dryRun) {
    console.log(`${COLORS.yellow}[dry-run] Would process ${rows.length} memories. Nothing saved.${COLORS.reset}`)
    db.close()
    return
  }

  const update = db.prepare("UPDATE memories SET category = ?, summary = ?, needs_reprocess = 0 WHERE id = ?")
  let processed = 0
  let failed = 0
  const stats: Record<string, number> = {}

  for (const row of rows) {
    const result = await classifyChunk(row.content, config.llm.routing, config.llm.claudeFallback)
    if (result) {
      update.run(result.category, result.summary, row.id)
      stats[result.category] = (stats[result.category] || 0) + 1
      processed++
      process.stdout.write(`\r  ${COLORS.cyan}${processed}/${rows.length}${COLORS.reset} processed`)
    } else {
      db.prepare("UPDATE memories SET needs_reprocess = 1 WHERE id = ?").run(row.id)
      failed++
    }
  }

  console.log(`\n\n${COLORS.green}Done:${COLORS.reset} ${processed} categorized, ${failed} failed (flagged for retry)\n`)
  for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(15)} ${count}`)
  }

  db.close()
}
```

**Step 2: Add `rex recategorize` command to `index.ts`**

```typescript
case 'recategorize': {
  const { recategorize } = await import('./recategorize.js')
  const batchArg = process.argv.find(a => a.startsWith('--batch='))
  const batch = batchArg ? parseInt(batchArg.split('=')[1]) : 50
  const dryRun = process.argv.includes('--dry-run')
  await recategorize({ batch, dryRun })
  break
}
```

**Step 3: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex recategorize --batch=5 --dry-run`
Expected: "Would process 5 memories. Nothing saved."
Run: `rex recategorize --batch=5`
Expected: 5 memories recategorized with proper categories.

**Step 4: Commit**

```bash
git add packages/cli/src/recategorize.ts packages/cli/src/index.ts
git commit -m "feat(rex): recategorize command for bulk memory classification"
```

---

## Task 5: Smart SessionStart Pre-loading

Enhance `rex-context.sh` to inject relevant memories at session start.

**Files:**
- Create: `packages/cli/src/preload.ts`
- Modify: `~/.claude/rex-context.sh`

**Step 1: Create `preload.ts` — smart context builder**

```typescript
// packages/cli/src/preload.ts
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync } from 'node:fs'
import { MEMORY_DB_PATH } from './paths.js'
import { findProject } from './projects.js'
import { embed, embeddingToBuffer } from '../../memory/src/embed.js'

const MAX_TOKENS = 200  // Hard limit for pre-loaded context

export async function preload(cwd: string): Promise<string> {
  if (!existsSync(MEMORY_DB_PATH)) return ''

  const project = findProject(cwd)
  const sections: string[] = []

  const db = new Database(MEMORY_DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // 1. Project-specific memories (most recent)
  if (project) {
    const projectName = project.name
    const recent = db.prepare(
      "SELECT summary, category FROM memories WHERE project LIKE ? AND category != 'session' AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 3"
    ).all(`%${projectName}%`) as Array<{ summary: string; category: string }>

    if (recent.length) {
      sections.push(`[REX Context] Project: ${project.name} | ${project.stack.join(', ')}`)
      sections.push(`Last: ${recent[0].summary.slice(0, 80)}`)
    }
  }

  // 2. Active lessons (cross-project)
  const lessons = db.prepare(
    "SELECT summary FROM memories WHERE category = 'lesson' AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 3"
  ).all() as Array<{ summary: string }>

  if (lessons.length) {
    sections.push('Lessons:')
    for (const l of lessons) {
      sections.push(`  - ${l.summary.slice(0, 100)}`)
    }
  }

  // 3. Relevant patterns (semantic search on project name/stack)
  if (project) {
    try {
      const queryText = `${project.name} ${project.stack.join(' ')}`
      const queryEmbed = await embed(queryText)
      const buf = embeddingToBuffer(queryEmbed)

      const patterns = db.prepare(
        `SELECT m.summary FROM memory_vec e
         JOIN memories m ON m.id = e.rowid
         WHERE m.category = 'pattern' AND m.summary IS NOT NULL
         ORDER BY vec_distance_cosine(e.embedding, ?) ASC
         LIMIT 2`
      ).all(buf) as Array<{ summary: string }>

      if (patterns.length) {
        sections.push('Patterns:')
        for (const p of patterns) {
          sections.push(`  - ${p.summary.slice(0, 100)}`)
        }
      }
    } catch {
      // Ollama might be down — degrade silently
    }
  }

  db.close()

  const output = sections.join('\n')
  // Rough token estimate: ~4 chars per token
  if (output.length > MAX_TOKENS * 4) {
    return output.slice(0, MAX_TOKENS * 4)
  }
  return output
}
```

**Step 2: Add `rex preload` command**

In `packages/cli/src/index.ts`:

```typescript
case 'preload': {
  const { preload } = await import('./preload.js')
  const cwd = process.argv[3] || process.cwd()
  const context = await preload(cwd)
  if (context) console.log(context)
  break
}
```

**Step 3: Update `rex-context.sh` to use preload**

```bash
#!/bin/bash
# REX Context Injection — runs at session start
if [ -z "$CLAUDE_ENV_FILE" ]; then exit 0; fi

PROJECT_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
echo "REX_MEMORY_AVAILABLE=true" >> "$CLAUDE_ENV_FILE"

# Smart pre-loading: inject relevant context
if command -v rex &>/dev/null; then
  CONTEXT=$(rex preload "$PROJECT_PATH" 2>/dev/null)
  if [ -n "$CONTEXT" ]; then
    echo "REX_CONTEXT<<EOF" >> "$CLAUDE_ENV_FILE"
    echo "$CONTEXT" >> "$CLAUDE_ENV_FILE"
    echo "EOF" >> "$CLAUDE_ENV_FILE"
  fi
  rex agents recommend "$PROJECT_PATH" --quiet --env-file "$CLAUDE_ENV_FILE" >/dev/null 2>&1 || true
fi
```

**Step 4: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex preload /Users/keiy/Documents/Developer/keiy/rex`
Expected: Outputs compact context with project info, lessons, patterns.

**Step 5: Commit**

```bash
git add packages/cli/src/preload.ts packages/cli/src/index.ts
git commit -m "feat(rex): smart SessionStart pre-loading with contextual memory injection"
```

---

## Task 6: Self-Improvement Engine

Extract lessons from sessions and detect recurring error patterns.

**Files:**
- Create: `packages/cli/src/self-improve.ts`

**Step 1: Create `self-improve.ts`**

```typescript
// packages/cli/src/self-improve.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { SELF_IMPROVEMENT_DIR, MEMORY_DB_PATH } from './paths.js'
import { loadConfig } from './config.js'
import { llm } from './llm.js'
import { pickModel } from './router.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

interface Lesson {
  id: string
  text: string
  category: string
  occurrences: number
  firstSeen: string
  lastSeen: string
  promoted: boolean
  dismissed: boolean
}

interface ErrorPattern {
  pattern: string
  count: number
  firstSeen: string
  lastSeen: string
  suggestedRule?: string
}

function loadLessons(): Lesson[] {
  const path = join(SELF_IMPROVEMENT_DIR, 'lessons.json')
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function saveLessons(lessons: Lesson[]): void {
  writeFileSync(join(SELF_IMPROVEMENT_DIR, 'lessons.json'), JSON.stringify(lessons, null, 2))
}

function loadErrorPatterns(): ErrorPattern[] {
  const path = join(SELF_IMPROVEMENT_DIR, 'error-patterns.json')
  if (!existsSync(path)) return []
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return [] }
}

function saveErrorPatterns(patterns: ErrorPattern[]): void {
  writeFileSync(join(SELF_IMPROVEMENT_DIR, 'error-patterns.json'), JSON.stringify(patterns, null, 2))
}

export async function selfReview(): Promise<{ newLessons: number; ruleCandidates: number }> {
  const config = loadConfig()
  if (!config.selfImprovement.enabled) return { newLessons: 0, ruleCandidates: 0 }
  if (!existsSync(MEMORY_DB_PATH)) return { newLessons: 0, ruleCandidates: 0 }

  const db = new Database(MEMORY_DB_PATH)
  sqliteVec.load(db)
  db.pragma('journal_mode = WAL')

  // Find recent lesson-type memories not yet extracted
  const recentLessons = db.prepare(
    "SELECT id, summary, content, created_at FROM memories WHERE category = 'lesson' AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 20"
  ).all() as Array<{ id: number; summary: string; content: string; created_at: string }>

  const existingLessons = loadLessons()
  const existingTexts = new Set(existingLessons.map(l => l.text.toLowerCase().trim()))
  let newCount = 0

  for (const mem of recentLessons) {
    const text = mem.summary.trim()
    if (existingTexts.has(text.toLowerCase())) {
      // Increment occurrences
      const existing = existingLessons.find(l => l.text.toLowerCase().trim() === text.toLowerCase())
      if (existing) {
        existing.occurrences++
        existing.lastSeen = mem.created_at
      }
      continue
    }
    existingLessons.push({
      id: `lesson-${Date.now()}-${mem.id}`,
      text,
      category: 'lesson',
      occurrences: 1,
      firstSeen: mem.created_at,
      lastSeen: mem.created_at,
      promoted: false,
      dismissed: false,
    })
    newCount++
  }

  saveLessons(existingLessons)

  // Check error patterns
  const errorMemories = db.prepare(
    "SELECT summary FROM memories WHERE category IN ('debug', 'fix') AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 50"
  ).all() as Array<{ summary: string }>

  const patterns = loadErrorPatterns()
  let ruleCandidates = 0

  // Detect recurring patterns via LLM
  if (errorMemories.length >= 5) {
    const errorSummaries = errorMemories.map(m => m.summary).join('\n')
    try {
      const model = await pickModel('reason')
      const analysis = await llm(
        `Analyze these error/fix summaries for recurring patterns. Output JSON array of patterns:\n\n${errorSummaries.slice(0, 3000)}\n\nJSON: [{"pattern": "description", "count": estimated_occurrences, "suggestedRule": "rule text"}]`,
        'You are a code pattern analyzer. Output ONLY valid JSON.',
        model
      )

      let parsed: any[] = []
      try { parsed = JSON.parse(analysis) } catch {
        const brace = analysis.match(/\[[\s\S]*\]/)
        if (brace) { try { parsed = JSON.parse(brace[0]) } catch {} }
      }

      for (const p of parsed) {
        if (p.count >= config.selfImprovement.ruleThreshold) {
          const exists = patterns.find(ep => ep.pattern === p.pattern)
          if (!exists) {
            patterns.push({
              pattern: p.pattern,
              count: p.count,
              firstSeen: new Date().toISOString(),
              lastSeen: new Date().toISOString(),
              suggestedRule: p.suggestedRule,
            })
            ruleCandidates++
          }
        }
      }
    } catch {}
  }

  saveErrorPatterns(patterns)

  // Write rule-candidates.md for human review
  const activePatterns = patterns.filter(p => p.count >= config.selfImprovement.ruleThreshold)
  if (activePatterns.length) {
    const md = `# Rule Candidates\n\nThese patterns were detected ${config.selfImprovement.ruleThreshold}+ times. Review and approve with \`rex promote-rule <index>\`.\n\n` +
      activePatterns.map((p, i) => `## ${i + 1}. ${p.pattern}\n\n- Count: ${p.count}\n- First seen: ${p.firstSeen}\n- Suggested rule: ${p.suggestedRule || 'N/A'}\n`).join('\n')
    writeFileSync(join(SELF_IMPROVEMENT_DIR, 'rule-candidates.md'), md)
  }

  db.close()
  return { newLessons: newCount, ruleCandidates }
}

export async function promoteRule(index: number): Promise<boolean> {
  const patterns = loadErrorPatterns()
  const active = patterns.filter(p => p.count >= loadConfig().selfImprovement.ruleThreshold)
  if (index < 1 || index > active.length) return false

  const pattern = active[index - 1]
  if (!pattern.suggestedRule) return false

  const HOME = process.env.HOME || '~'
  const rulesDir = join(HOME, '.claude', 'rules')
  const ruleName = pattern.pattern.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const rulePath = join(rulesDir, `${ruleName}.md`)

  writeFileSync(rulePath, `# ${pattern.pattern}\n\n${pattern.suggestedRule}\n\n<!-- Auto-generated by REX self-improvement on ${new Date().toISOString()} -->\n`)
  return true
}
```

**Step 2: Add commands to `index.ts`**

```typescript
case 'self-review': {
  const { selfReview } = await import('./self-improve.js')
  const result = await selfReview()
  console.log(`Self-review: ${result.newLessons} new lessons, ${result.ruleCandidates} rule candidates`)
  break
}

case 'promote-rule': {
  const { promoteRule } = await import('./self-improve.js')
  const idx = parseInt(process.argv[3])
  if (!idx) { console.log('Usage: rex promote-rule <index>'); process.exit(1) }
  const ok = await promoteRule(idx)
  console.log(ok ? `${COLORS.green}Rule promoted to ~/.claude/rules/${COLORS.reset}` : `${COLORS.red}Failed — invalid index or no suggested rule${COLORS.reset}`)
  break
}
```

**Step 3: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex self-review`
Expected: Analyzes memories, extracts lessons, outputs counts.

**Step 4: Commit**

```bash
git add packages/cli/src/self-improve.ts packages/cli/src/index.ts
git commit -m "feat(rex): self-improvement engine with lesson extraction and rule promotion"
```

---

## Task 7: Rex Daemon

Single persistent daemon that replaces the 3 LaunchAgents.

**Files:**
- Create: `packages/cli/src/daemon.ts`
- Modify: `packages/cli/src/init.ts` (new plist)

**Step 1: Create `daemon.ts`**

```typescript
// packages/cli/src/daemon.ts
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync, statSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { MEMORY_DB_PATH, PENDING_DIR, BACKUPS_DIR, DAEMON_LOG_PATH, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const COLORS = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m', bold: '\x1b[1m' }

function log(msg: string): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}`
  console.log(line)
  try { appendFileSync(DAEMON_LOG_PATH, line + '\n') } catch {}
}

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}

async function restartOllama(): Promise<boolean> {
  try {
    execSync('ollama serve &', { timeout: 5000, stdio: 'ignore' })
    await new Promise(r => setTimeout(r, 3000))
    return checkOllama()
  } catch { return false }
}

function checkDiskSpace(): number {
  try {
    const output = execSync("df -g ~ | tail -1 | awk '{print $4}'", { encoding: 'utf-8' }).trim()
    return parseInt(output) || 999
  } catch { return 999 }
}

function checkDbIntegrity(): boolean {
  if (!existsSync(MEMORY_DB_PATH)) return true
  try {
    const result = execSync(`sqlite3 "${MEMORY_DB_PATH}" "PRAGMA integrity_check"`, { encoding: 'utf-8' }).trim()
    return result === 'ok'
  } catch { return false }
}

function backupDb(): void {
  if (!existsSync(MEMORY_DB_PATH)) return
  const date = new Date().toISOString().split('T')[0]
  const backupPath = join(BACKUPS_DIR, `rex-${date}.sqlite`)
  if (existsSync(backupPath)) return // already backed up today
  copyFileSync(MEMORY_DB_PATH, backupPath)
  log(`Backup: ${backupPath}`)
}

function pruneBackups(retainDays: number = 7): void {
  if (!existsSync(BACKUPS_DIR)) return
  const cutoff = Date.now() - retainDays * 86400_000
  for (const f of readdirSync(BACKUPS_DIR)) {
    const fPath = join(BACKUPS_DIR, f)
    try {
      if (statSync(fPath).mtimeMs < cutoff) {
        unlinkSync(fPath)
        log(`Pruned backup: ${f}`)
      }
    } catch {}
  }
}

function countPending(): number {
  if (!existsSync(PENDING_DIR)) return 0
  return readdirSync(PENDING_DIR).filter(f => f.endsWith('.json')).length
}

async function runIngest(): Promise<void> {
  try {
    execSync('rex ingest 2>&1', { timeout: 120_000, encoding: 'utf-8' })
  } catch (e: any) {
    log(`Ingest error: ${e.message?.slice(0, 200)}`)
  }
}

async function runCategorize(batch: number = 50): Promise<void> {
  try {
    execSync(`rex categorize --batch=${batch} 2>&1`, { timeout: 180_000, encoding: 'utf-8' })
  } catch (e: any) {
    log(`Categorize error: ${e.message?.slice(0, 200)}`)
  }
}

async function runRecategorize(batch: number = 50): Promise<void> {
  try {
    execSync(`rex recategorize --batch=${batch} 2>&1`, { timeout: 180_000, encoding: 'utf-8' })
  } catch (e: any) {
    log(`Recategorize error: ${e.message?.slice(0, 200)}`)
  }
}

async function runSelfReview(): Promise<void> {
  try {
    execSync('rex self-review 2>&1', { timeout: 120_000, encoding: 'utf-8' })
  } catch (e: any) {
    log(`Self-review error: ${e.message?.slice(0, 200)}`)
  }
}

async function runProjectScan(): Promise<void> {
  try {
    execSync('rex projects 2>&1', { timeout: 30_000, encoding: 'utf-8' })
  } catch (e: any) {
    log(`Project scan error: ${e.message?.slice(0, 200)}`)
  }
}

async function sendTelegramNotify(message: string): Promise<void> {
  try {
    const token = process.env.REX_TELEGRAM_BOT_TOKEN
    const chatId = process.env.REX_TELEGRAM_CHAT_ID
    if (!token || !chatId) return
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {}
}

// ─── Health Check (every 5 min) ────────────────────────────
async function healthCheck(): Promise<void> {
  const ollamaUp = await checkOllama()

  // Auto-fix: restart Ollama if down
  if (!ollamaUp) {
    log('Ollama down — attempting restart')
    const restarted = await restartOllama()
    if (restarted) {
      log('Ollama restarted successfully')
    } else {
      log('Ollama restart failed')
    }
  }

  // Process pending if Ollama is now up
  if (await checkOllama()) {
    const pending = countPending()
    if (pending > 0) {
      log(`Processing ${pending} pending files`)
      await runIngest()
    }
  }

  // Check DB integrity
  if (!checkDbIntegrity()) {
    log('DB integrity check FAILED')
    // Restore from latest backup
    const backups = existsSync(BACKUPS_DIR) ? readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.sqlite')).sort().reverse() : []
    if (backups.length) {
      copyFileSync(join(BACKUPS_DIR, backups[0]), MEMORY_DB_PATH)
      log(`Restored DB from ${backups[0]}`)
      await sendTelegramNotify('⚠️ REX: DB integrity fail — restored from backup')
    }
  }

  // Check disk space
  const freeGb = checkDiskSpace()
  if (freeGb < 1) {
    log(`Disk low: ${freeGb}GB free`)
    pruneBackups(3) // Aggressive prune
    await sendTelegramNotify(`⚠️ REX: Disk low (${freeGb}GB free)`)
  }
}

// ─── Ingest Cycle (every 30 min) ──────────────────────────
async function ingestCycle(): Promise<void> {
  log('Ingest cycle start')
  await runIngest()
  await runCategorize(100)
  // Also recategorize any "session" memories in small batches
  await runRecategorize(20)
  log('Ingest cycle done')
}

// ─── Maintenance (every 60 min) ───────────────────────────
async function maintenanceCycle(): Promise<void> {
  log('Maintenance cycle start')
  backupDb()
  pruneBackups(7)
  await runProjectScan()

  // Rotate daemon log (keep last 10000 lines)
  if (existsSync(DAEMON_LOG_PATH)) {
    try {
      const content = readFileSync(DAEMON_LOG_PATH, 'utf-8')
      const lines = content.split('\n')
      if (lines.length > 10000) {
        writeFileSync(DAEMON_LOG_PATH, lines.slice(-5000).join('\n'))
      }
    } catch {}
  }
  log('Maintenance cycle done')
}

// ─── Self-Review (every 24h) ──────────────────────────────
async function selfReviewCycle(): Promise<void> {
  log('Self-review cycle start')
  await runSelfReview()

  // Daily summary
  const config = loadConfig()
  if (config.notifications.daily) {
    try {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(MEMORY_DB_PATH)
      const total = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c
      const today = new Date().toISOString().split('T')[0]
      const todayCount = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE created_at >= ?").get(today) as any).c
      const uncategorized = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE category IN ('session', 'general')").get() as any).c
      db.close()

      const msg = `🦖 *REX Daily*\n\nMemories: ${total} total, +${todayCount} today\nUncategorized: ${uncategorized}\nDisk: ${checkDiskSpace()}GB free`
      await sendTelegramNotify(msg)
    } catch {}
  }

  log('Self-review cycle done')
}

// ─── Main Loop ────────────────────────────────────────────
export async function daemon(): Promise<void> {
  ensureRexDirs()
  const config = loadConfig()

  log('REX Daemon started')
  log(`Health: ${config.daemon.healthCheckInterval}s | Ingest: ${config.daemon.ingestInterval}s | Maintenance: ${config.daemon.maintenanceInterval}s | Self-review: ${config.daemon.selfReviewInterval}s`)

  // Initial health check
  await healthCheck()

  // Schedule loops
  let lastHealth = Date.now()
  let lastIngest = Date.now()
  let lastMaintenance = Date.now()
  let lastSelfReview = Date.now()

  // Run maintenance immediately on start
  await maintenanceCycle()

  while (true) {
    const now = Date.now()

    if (now - lastHealth >= config.daemon.healthCheckInterval * 1000) {
      await healthCheck()
      lastHealth = now
    }

    if (now - lastIngest >= config.daemon.ingestInterval * 1000) {
      await ingestCycle()
      lastIngest = now
    }

    if (now - lastMaintenance >= config.daemon.maintenanceInterval * 1000) {
      await maintenanceCycle()
      lastMaintenance = now
    }

    if (now - lastSelfReview >= config.daemon.selfReviewInterval * 1000) {
      await selfReviewCycle()
      lastSelfReview = now
    }

    // Sleep 30 seconds between loop iterations
    await new Promise(r => setTimeout(r, 30_000))
  }
}
```

**Step 2: Add `rex daemon` command to `index.ts`**

```typescript
case 'daemon': {
  const { daemon } = await import('./daemon.js')
  await daemon()
  break
}
```

**Step 3: Update `init.ts` to install single daemon LaunchAgent**

Add to the `installStartup()` function in `packages/cli/src/init.ts`, replacing the 3 existing plist generators:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dstudio.rex-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>{rexBin}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{HOME}/.claude/rex/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>{HOME}/.claude/rex/daemon.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:{nodeBinDir}</string>
    <key>REX_TELEGRAM_BOT_TOKEN</key>
    <string>{token}</string>
    <key>REX_TELEGRAM_CHAT_ID</key>
    <string>{chatId}</string>
  </dict>
</dict>
</plist>
```

Keep old LaunchAgents (rex-gateway, rex-ingest) but mark them as deprecated. The daemon handles gateway restart via healthCheck, and ingest via ingestCycle.

**Step 4: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex daemon` (Ctrl+C after 30s to verify it starts correctly)
Expected: "REX Daemon started" + health check output + maintenance cycle runs.

**Step 5: Commit**

```bash
git add packages/cli/src/daemon.ts packages/cli/src/index.ts packages/cli/src/init.ts
git commit -m "feat(rex): unified daemon replacing 3 LaunchAgents"
```

---

## Task 8: Enhanced `rex doctor --fix`

Extend doctor to detect and auto-fix all the daemon can fix, but on demand.

**Files:**
- Modify: `packages/core/src/index.ts` (add new checks)
- Modify: `packages/cli/src/index.ts` (add --fix flag)

**Step 1: Add new health checks**

Add to the core health checks:
- `rex_hub_exists` — `~/.claude/rex/` directory structure
- `memory_categorized` — % of memories with proper category
- `pending_count` — number of pending chunks
- `db_integrity` — SQLite integrity check
- `disk_space` — free disk space
- `config_valid` — config.json parseable

**Step 2: Add `--fix` flag to doctor**

```typescript
case 'doctor': {
  const fixMode = process.argv.includes('--fix')
  if (fixMode) {
    const { ensureRexDirs } = await import('./paths.js')
    ensureRexDirs()
    // Run migrate if needed
    const { migrate } = await import('./migrate.js')
    await migrate()
    // Process pending
    const { execSync } = await import('node:child_process')
    try { execSync('rex ingest', { stdio: 'inherit', timeout: 120_000 }) } catch {}
    try { execSync('rex recategorize --batch=50', { stdio: 'inherit', timeout: 180_000 }) } catch {}
    console.log(`\n${COLORS.green}Auto-fix complete.${COLORS.reset} Running doctor again...\n`)
  }
  const report = await runAllChecks()
  console.log(formatReport(report))
  process.exit(report.status === 'broken' ? 1 : 0)
  break
}
```

**Step 3: Build and test**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build`
Run: `rex doctor --fix`
Expected: Migrates, processes pending, recategorizes, then shows health report.

**Step 4: Commit**

```bash
git add packages/core/src/index.ts packages/cli/src/index.ts
git commit -m "feat(rex): doctor --fix auto-repairs memory, migration, and categorization"
```

---

## Task 9: Update Help, Version, CLAUDE.md

**Files:**
- Modify: `packages/cli/src/index.ts` (help text + version bump)
- Modify: `packages/cli/package.json` (version)
- Modify: `/Users/keiy/Documents/Developer/keiy/rex/CLAUDE.md` (status update)

**Step 1: Update help text**

Add new commands to help output:
```
rex migrate          Migrate ~/.rex-memory/ to ~/.claude/rex/
rex projects         Scan and index all dev projects
rex recategorize     Bulk re-classify uncategorized memories
rex self-review      Extract lessons, detect error patterns
rex promote-rule N   Promote rule candidate to ~/.claude/rules/
rex preload [path]   Show pre-loaded context for a path
rex daemon           Start persistent background daemon
rex doctor --fix     Auto-fix common issues
```

**Step 2: Bump version to 5.0.0**

In `packages/cli/package.json`, change version to `5.0.0`.
In `index.ts`, update the version string.

**Step 3: Update CLAUDE.md**

Add to "Termine" section:
- `~/.claude/rex/` centralized hub with migration from `~/.rex-memory/`
- Unified config `config.json` replacing scattered env vars
- Project scanner with auto stack detection
- Recategorize command for bulk memory classification
- Smart SessionStart pre-loading (200 token budget)
- Self-improvement engine (lessons, error patterns, rule candidates)
- Unified daemon replacing 3 LaunchAgents
- `rex doctor --fix` auto-repair

**Step 4: Build, reinstall, verify**

Run: `cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build && npm i -g packages/cli`
Run: `rex --version` → expects `rex-claude v5.0.0`
Run: `rex help` → expects new commands listed
Run: `rex doctor` → expects all checks pass

**Step 5: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/package.json /Users/keiy/Documents/Developer/keiy/rex/CLAUDE.md
git commit -m "feat(rex): v5.0.0 — autonomous babysitter with centralized hub"
```

---

## Task 10: Full Integration Test

**Step 1: Run full migration + setup**

```bash
rex migrate           # Create ~/.claude/rex/, migrate DB
rex projects          # Scan all projects
rex recategorize --batch=10  # Test recategorization
rex preload .         # Test pre-loading
rex self-review       # Test self-improvement
rex doctor            # Verify everything
rex doctor --fix      # Auto-fix anything broken
```

**Step 2: Verify daemon**

```bash
rex daemon &          # Start daemon in background
sleep 35              # Wait for first health check
cat ~/.claude/rex/daemon.log | tail -20  # Check logs
kill %1               # Stop daemon
```

**Step 3: Install LaunchAgent**

```bash
rex init              # Installs new daemon plist
launchctl list | grep rex  # Verify daemon is loaded
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore(rex): v5.0.0 integration verified — autonomous babysitter live"
```

---

## Execution Order Summary

| Task | What | Depends On |
|------|------|-----------|
| 1 | paths.ts + config.ts | Nothing |
| 2 | DB migration + schema | Task 1 |
| 3 | Project scanner | Task 1 |
| 4 | Recategorize command | Tasks 1, 2 |
| 5 | Smart pre-loading | Tasks 1, 2, 3 |
| 6 | Self-improvement engine | Tasks 1, 2 |
| 7 | Rex daemon | Tasks 1-6 |
| 8 | Doctor --fix | Tasks 1, 2, 4 |
| 9 | Help, version, CLAUDE.md | Tasks 1-8 |
| 10 | Integration test | All |

Tasks 1-3 can be parallelized. Tasks 4-6 can be partially parallelized. Tasks 7-10 are sequential.
