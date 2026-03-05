import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync } from 'node:fs'
import { MEMORY_DB_PATH } from './paths.js'
import { findProject } from './projects.js'

const MAX_TOKENS = 200  // Hard limit for pre-loaded context

export async function preload(cwd: string): Promise<string> {
  if (!existsSync(MEMORY_DB_PATH)) return ''

  const project = findProject(cwd)
  const sections: string[] = []

  let db: InstanceType<typeof Database>
  try {
    db = new Database(MEMORY_DB_PATH, { readonly: true })
    sqliteVec.load(db)
    db.pragma('journal_mode = WAL')
  } catch {
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

  const output = sections.join('\n')
  // Rough token estimate: ~4 chars per token
  if (output.length > MAX_TOKENS * 4) {
    return output.slice(0, MAX_TOKENS * 4)
  }
  return output
}
