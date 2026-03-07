/**
 * REX Preload — SessionStart context injector
 *
 * Runs at Claude Code session start (SessionStart hook).
 * Stdout is injected directly into Claude's context window.
 *
 * Principles:
 * - Max 500 tokens (~2000 chars) — zero bloat
 * - Inject ONLY skills relevant to this specific stack
 * - Memory queries: fast SQL text search (no embeddings, no Ollama)
 * - GitHub setup: fire-and-forget background task
 * - Graceful degradation: works without DB, without gh, without git
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MEMORY_DB_PATH } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('preload')

const MAX_CHARS = 2000  // ~500 tokens (4 chars/token avg)

// ─── Stack detection ─────────────────────────────────────────────────────────

interface StackInfo {
  labels: string[]           // human-readable: ['next.js', 'typescript', 'drizzle']
  keys: string[]             // internal keys for skill lookup: ['next', 'drizzle', 'typescript']
}

type PkgJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readJson<T>(filePath: string): T | null {
  try { return JSON.parse(readFileSync(filePath, 'utf-8')) as T } catch { return null }
}

function hasDep(deps: Record<string, string>, ...names: string[]): boolean {
  return names.some(n => n in deps)
}

function detectStack(projectRoot: string): StackInfo {
  const labels: string[] = []
  const keys: string[] = []

  // ── Node / JS ecosystem ──────────────────────────────────────────────────
  const pkgPath = join(projectRoot, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = readJson<PkgJson>(pkgPath)
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }

      // Framework (order matters — more specific first)
      if (hasDep(deps, 'next'))                        { keys.push('next');    labels.push('next.js') }
      else if (hasDep(deps, 'nuxt', '@nuxt/core'))     { keys.push('nuxt');    labels.push('nuxt') }
      else if (hasDep(deps, 'react'))                  { keys.push('react');   labels.push('react') }
      else if (hasDep(deps, 'vue'))                    { keys.push('vue');     labels.push('vue') }
      else if (hasDep(deps, '@angular/core'))          { keys.push('angular'); labels.push('angular') }
      else if (hasDep(deps, 'svelte'))                 { keys.push('svelte');  labels.push('svelte') }

      // Backend
      if (hasDep(deps, 'express'))                     { keys.push('express');  labels.push('express') }
      if (hasDep(deps, 'fastify'))                     { keys.push('fastify');  labels.push('fastify') }
      if (hasDep(deps, 'hono'))                        { keys.push('hono');     labels.push('hono') }
      if (hasDep(deps, 'elysia'))                      { keys.push('elysia');   labels.push('elysia') }

      // Database
      if (hasDep(deps, 'drizzle-orm'))                 { keys.push('drizzle');  labels.push('drizzle') }
      if (hasDep(deps, '@prisma/client', 'prisma'))    { keys.push('prisma');   labels.push('prisma') }
      if (hasDep(deps, 'mongoose'))                    { keys.push('mongoose'); labels.push('mongoose') }

      // Auth
      if (hasDep(deps, 'next-auth', '@auth/core'))     { keys.push('next-auth'); labels.push('next-auth') }
      if (hasDep(deps, 'lucia'))                       { keys.push('lucia');    labels.push('lucia') }
      if (hasDep(deps, 'passport'))                    { keys.push('passport'); labels.push('passport') }

      // Testing
      if (hasDep(deps, 'vitest', 'jest'))              { keys.push('test');     labels.push('vitest') }
      if (hasDep(deps, 'playwright', 'cypress'))       { keys.push('e2e');      labels.push('playwright') }

      // i18n
      if (hasDep(deps, 'next-intl', 'i18next'))        { keys.push('i18n');     labels.push('i18n') }

      // Infra
      if (hasDep(deps, 'wrangler'))                    { keys.push('cf-workers'); labels.push('cf-workers') }

      // Language
      if (hasDep(deps, 'typescript'))                  { keys.push('typescript'); labels.push('typescript') }

      if (labels.length === 0)                         { keys.push('node');     labels.push('node') }
    }
  }

  // ── Flutter / Dart ───────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'pubspec.yaml'))) {
    keys.push('flutter')
    labels.push('flutter')
    const pubspec = existsSync(join(projectRoot, 'pubspec.yaml'))
      ? readFileSync(join(projectRoot, 'pubspec.yaml'), 'utf-8')
      : ''
    if (pubspec.includes('macos_ui') || pubspec.includes('platform: macos')) {
      keys.push('flutter-macos')
      labels.push('macos')
    }
  }

  // ── Rust ─────────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'Cargo.toml'))) {
    keys.push('rust')
    labels.push('rust')
  }

  // ── Go ───────────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'go.mod'))) {
    keys.push('go')
    labels.push('go')
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'pyproject.toml')) ||
      existsSync(join(projectRoot, 'requirements.txt')) ||
      existsSync(join(projectRoot, 'setup.py'))) {
    keys.push('python')
    labels.push('python')
    if (existsSync(join(projectRoot, 'manage.py'))) { keys.push('django'); labels.push('django') }
  }

  // ── PHP ──────────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'composer.json'))) {
    const composer = readJson<{ require?: Record<string, string> }>(join(projectRoot, 'composer.json'))
    if (composer?.require?.['laravel/framework']) { keys.push('laravel');  labels.push('laravel') }
    else                                           { keys.push('php');     labels.push('php') }
  }

  // ── Ruby ─────────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'Gemfile'))) {
    keys.push('ruby')
    labels.push('ruby')
  }

  // ── Elixir ───────────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'mix.exs'))) {
    keys.push('elixir')
    labels.push('elixir')
  }

  // ── Java / Kotlin ────────────────────────────────────────────────────────
  if (existsSync(join(projectRoot, 'pom.xml')) || existsSync(join(projectRoot, 'build.gradle'))) {
    keys.push('java')
    labels.push('java')
  }

  return { labels, keys }
}

// ─── Skill mapping ───────────────────────────────────────────────────────────
// Stack key → skills. Order matters: most important first.
// Skills are capped to stay within the 500 token budget.

const SKILL_MAP: Record<string, string[]> = {
  // Frontend
  'next':       ['ui-craft', 'perf', 'seo', 'api-design', 'ux-flow'],
  'nuxt':       ['ui-craft', 'perf', 'seo', 'ux-flow'],
  'react':      ['ui-craft', 'perf', 'ux-flow'],
  'vue':        ['ui-craft', 'perf', 'ux-flow'],
  'angular':    ['ui-craft', 'perf', 'ux-flow'],
  'svelte':     ['ui-craft', 'perf'],
  // Mobile
  'flutter':    ['ui-craft', 'ui-review'],
  'flutter-macos': ['ui-craft', 'ui-review'],
  // Backend
  'express':    ['api-design', 'error-handling', 'auth-patterns'],
  'fastify':    ['api-design', 'error-handling'],
  'hono':       ['api-design', 'error-handling'],
  'elysia':     ['api-design', 'error-handling'],
  'go':         ['api-design', 'error-handling', 'perf'],
  'rust':       ['error-handling', 'perf'],
  'python':     ['error-handling', 'test-strategy'],
  'django':     ['api-design', 'error-handling', 'auth-patterns'],
  'laravel':    ['api-design', 'error-handling', 'auth-patterns'],
  'php':        ['api-design', 'error-handling'],
  'ruby':       ['api-design', 'error-handling'],
  'elixir':     ['api-design', 'error-handling', 'perf'],
  'java':       ['api-design', 'error-handling', 'test-strategy'],
  'node':       ['api-design', 'error-handling'],
  // Cross-cutting (additive)
  'drizzle':    ['db-design'],
  'prisma':     ['db-design'],
  'mongoose':   ['db-design'],
  'next-auth':  ['auth-patterns'],
  'lucia':      ['auth-patterns'],
  'passport':   ['auth-patterns'],
  'test':       ['test-strategy'],
  'e2e':        ['test-strategy'],
  'i18n':       ['i18n'],
  // Fallback
  'default':    ['code-review', 'debug-assist'],
}

const MAX_SKILLS = 6  // Hard cap to stay within token budget

function selectSkills(stackKeys: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const key of stackKeys) {
    const mapped = SKILL_MAP[key] ?? []
    for (const skill of mapped) {
      if (!seen.has(skill) && result.length < MAX_SKILLS) {
        seen.add(skill)
        result.push(skill)
      }
    }
    if (result.length >= MAX_SKILLS) break
  }

  if (result.length === 0) {
    return SKILL_MAP['default']
  }

  return result
}

// ─── Memory queries ───────────────────────────────────────────────────────────

interface Memory { summary: string; category: string }

function queryMemories(db: InstanceType<typeof Database>, projectName: string): {
  recent: Memory[]
  lessons: Memory[]
  patterns: Memory[]
} {
  const recent = db.prepare(
    `SELECT summary, category FROM memories
     WHERE content LIKE ? AND category != 'session' AND summary IS NOT NULL
     ORDER BY created_at DESC LIMIT 2`
  ).all(`%${projectName}%`) as Memory[]

  const lessons = db.prepare(
    `SELECT summary FROM memories
     WHERE category = 'lesson' AND summary IS NOT NULL
     ORDER BY created_at DESC LIMIT 2`
  ).all() as Memory[]

  const patterns = db.prepare(
    `SELECT summary FROM memories
     WHERE category = 'pattern' AND summary IS NOT NULL AND content LIKE ?
     ORDER BY created_at DESC LIMIT 1`
  ).all(`%${projectName}%`) as Memory[]

  return { recent, lessons, patterns }
}

// ─── Background GitHub setup ──────────────────────────────────────────────────

function spawnGithubSetup(projectRoot: string): void {
  // Resolve the github_setup module path relative to this file
  const thisDir = join(fileURLToPath(import.meta.url), '..')
  const setupScript = join(thisDir, '..', 'dist', 'github_setup.js')
  if (!existsSync(setupScript)) return  // not built yet, skip

  const child = spawn(
    process.execPath,
    ['-e', `import('${setupScript}').then(m => m.runGithubSetup(${JSON.stringify(projectRoot)}))`],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
}

// ─── Output assembly ──────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export async function preload(cwd: string): Promise<string> {
  const projectName = cwd.split('/').pop() ?? 'project'
  const stack = detectStack(cwd)

  // Fire-and-forget GitHub setup (non-blocking)
  spawnGithubSetup(cwd)

  // Build output sections
  const sections: string[] = []

  // Header: project + stack
  const stackLabel = stack.labels.length > 0
    ? stack.labels.slice(0, 5).join(' + ')
    : 'unknown stack'
  sections.push(`[REX] ${projectName} | ${stackLabel}`)

  // Skills
  const skills = selectSkills(stack.keys)
  if (skills.length > 0) {
    sections.push(`Skills: ${skills.join(', ')}`)
  }

  // Memory (optional — graceful degradation if DB absent)
  if (existsSync(MEMORY_DB_PATH)) {
    let db: InstanceType<typeof Database> | null = null
    try {
      db = new Database(MEMORY_DB_PATH, { readonly: true })
      sqliteVec.load(db)
      db.pragma('journal_mode = WAL')

      const { recent, lessons, patterns } = queryMemories(db, projectName)

      if (recent[0]) {
        sections.push(`Last: ${truncate(recent[0].summary, 90)}`)
      }
      if (lessons.length > 0) {
        sections.push(`Lessons:\n${lessons.map(l => `  - ${truncate(l.summary, 80)}`).join('\n')}`)
      }
      if (patterns[0]) {
        sections.push(`Pattern: ${truncate(patterns[0].summary, 80)}`)
      }
    } catch (e: any) {
      log.debug(`Memory query skipped: ${e.message?.slice(0, 60)}`)
    } finally {
      db?.close()
    }
  }

  const output = sections.join('\n')
  log.info(`Preloaded for ${projectName}: ${stack.labels.join(',')} | skills: ${skills.join(',')} | ${output.length} chars`)

  // Hard token cap
  return output.length > MAX_CHARS ? output.slice(0, MAX_CHARS) : output
}
