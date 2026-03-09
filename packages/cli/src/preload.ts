/** @module AGENTS */
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_DB_PATH, SNAPSHOTS_DIR } from './paths.js'
import { findProject } from './projects.js'
import { createLogger } from './logger.js'
import { detectIntent } from './project-intent.js'
import { buildContextProfile, profileToPreloadLine } from './context-loader.js'

const log = createLogger('AGENTS:preload')

const MAX_TOKENS = 300  // Hard limit for pre-loaded context

// ─── Skill detection ─────────────────────────────────────────

interface SkillRule {
  deps?: string[]        // match any of these in package.json deps
  files?: string[]       // match any of these file paths in project root
  skills: string[]       // skills to suggest
}

const SKILL_RULES: SkillRule[] = [
  // Frontend frameworks → UI/UX skills
  { deps: ['next', 'react', 'vue', 'nuxt', '@angular/core'], skills: ['ux-flow', 'ui-craft', 'ui-review'] },
  // API layers → API design
  { deps: ['express', 'fastify', 'hono', 'koa', '@hapi/hapi'], skills: ['api-design', 'error-handling'] },
  // Database ORMs → DB design
  { deps: ['drizzle-orm', 'prisma', 'typeorm', 'mongoose', 'sequelize', 'knex'], skills: ['db-design'] },
  // Auth libraries → auth patterns
  { deps: ['next-auth', 'lucia', 'passport', 'jose', 'jsonwebtoken', '@auth/core'], skills: ['auth-patterns'] },
  // i18n
  { deps: ['next-intl', 'i18next', 'react-i18next', 'vue-i18n'], skills: ['i18n'] },
  // Testing
  { deps: ['vitest', 'jest', '@testing-library/react', 'playwright', 'cypress'], skills: ['test-strategy'] },
  // Next.js specifically → SEO worth mentioning
  { deps: ['next'], skills: ['seo', 'perf'] },
  // Any project → performance
  { deps: ['react', 'vue', 'angular'], skills: ['perf'] },
]

function detectRelevantSkills(projectRoot: string): string[] {
  const pkgPath = join(projectRoot, 'package.json')
  if (!existsSync(pkgPath)) return []

  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) } catch { return [] }

  const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  const suggested = new Set<string>()

  for (const rule of SKILL_RULES) {
    if (rule.deps && rule.deps.some(d => allDeps.includes(d))) {
      rule.skills.forEach(s => suggested.add(s))
    }
    if (rule.files) {
      const matched = rule.files.some(f => existsSync(join(projectRoot, f)))
      if (matched) rule.skills.forEach(s => suggested.add(s))
    }
  }

  return [...suggested]
}

export async function preload(cwd: string): Promise<string> {
  if (!existsSync(MEMORY_DB_PATH)) {
    log.debug('No memory DB found, skipping preload')
    return ''
  }

  const project = findProject(cwd)
  const sections: string[] = []

  let db: InstanceType<typeof Database>
  try {
    db = new Database(MEMORY_DB_PATH, { readonly: true })
    sqliteVec.load(db)
    db.pragma('journal_mode = WAL')
  } catch (e: any) {
    log.error(`Failed to open memory DB: ${e.message?.slice(0, 100)}`)
    return ''
  }

  try {
    // 1. Project-specific memories (most recent)
    if (project) {
      const recent = db.prepare(
        "SELECT summary, category FROM memories WHERE content LIKE ? AND category != 'session' AND summary IS NOT NULL ORDER BY created_at DESC LIMIT 3"
      ).all(`%${project.name}%`) as Array<{ summary: string; category: string }>

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

    // 3. Relevant patterns via text match (no embed needed -- keeps it fast and Ollama-independent)
    if (project) {
      const patterns = db.prepare(
        "SELECT summary FROM memories WHERE category = 'pattern' AND summary IS NOT NULL AND content LIKE ? ORDER BY created_at DESC LIMIT 2"
      ).all(`%${project.name}%`) as Array<{ summary: string }>

      if (patterns.length) {
        sections.push('Patterns:')
        for (const p of patterns) {
          sections.push(`  - ${p.summary.slice(0, 100)}`)
        }
      }
    }
  } finally {
    db.close()
  }

  // 4. Skill suggestions based on project stack
  if (project?.path) {
    const skills = detectRelevantSkills(project.path)
    if (skills.length > 0) {
      sections.push(`Skills: ${skills.join(', ')}`)
    }
  }

  // 5. Compact signal — warn if context was high in last session
  try {
    const { readCompactSignal } = await import('./session-guard.js')
    const signal = readCompactSignal()
    if (signal) {
      const age = Date.now() - new Date(signal.ts).getTime()
      if (age < 2 * 3600_000) { // only surface if <2h old
        sections.push(`⚠ Context was at ${signal.contextPercent.toFixed(0)}% (${signal.reason}) — ${signal.hint}`)
      }
    }
  } catch { /* non-blocking */ }

  // 6. Context profile: intent → guards + MCPs + skills (0 LLM)
  try {
    const intent = detectIntent(project?.path ?? cwd)
    const profile = buildContextProfile(intent)
    const line = profileToPreloadLine(profile)
    if (line) sections.push(line)
    if (profile.note) sections.push(`  ${profile.note.slice(0, 120)}`)
  } catch {
    // non-blocking — intent detection is best-effort
  }

  // 7. BLOC 19.2 — Inject latest snapshot for this project (restoreOnStart)
  try {
    if (existsSync(SNAPSHOTS_DIR)) {
      const files = readdirSync(SNAPSHOTS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()

      interface SessionSnapshot {
        sessionId: string; timestamp: string; project: string; branch: string
        pr?: number; modifiedFiles: string[]; buildCommands: string[]; taskContext: string; errors: string[]
      }

      const projectName = project?.name ?? ''
      let latest: SessionSnapshot | null = null
      for (const f of files.slice(0, 20)) {
        try {
          const snap = JSON.parse(readFileSync(join(SNAPSHOTS_DIR, f), 'utf-8')) as SessionSnapshot
          if (!projectName || snap.project === projectName || snap.project.includes(projectName) || projectName.includes(snap.project)) {
            latest = snap
            break
          }
        } catch { /* skip malformed */ }
      }

      if (latest) {
        const age = Math.floor((Date.now() - new Date(latest.timestamp).getTime()) / 3600_000)
        if (age < 72) { // only inject if snapshot is <72h old
          const snapParts: string[] = [`[Snapshot ${age}h ago] branch: ${latest.branch}`]
          if (latest.taskContext) snapParts.push(`Task: ${latest.taskContext.slice(0, 120)}`)
          if (latest.modifiedFiles?.length) snapParts.push(`Files: ${latest.modifiedFiles.slice(0, 4).join(', ')}`)
          if (latest.errors?.length) snapParts.push(`Errors: ${latest.errors[0].slice(0, 80)}`)
          sections.push(snapParts.join(' | '))
        }
      }
    }
  } catch { /* non-blocking */ }

  const output = sections.join('\n')
  log.info(`Preloaded ${sections.length} sections for ${project?.name || cwd} (${output.length} chars)`)
  // Rough token estimate: ~4 chars per token
  if (output.length > MAX_TOKENS * 4) {
    return output.slice(0, MAX_TOKENS * 4)
  }
  return output
}
