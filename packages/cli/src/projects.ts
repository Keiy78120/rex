import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { PROJECTS_DIR, SUMMARIES_DIR, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'
import { createLogger } from './logger.js'

const log = createLogger('projects')

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

  const pkgPath = join(projectPath, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['next']) stack.push('next.js')
      else if (allDeps['react']) stack.push('react')
      if (allDeps['vue']) stack.push('vue')
      if (allDeps['@angular/core']) stack.push('angular')
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

  if (existsSync(join(projectPath, 'pubspec.yaml'))) {
    stack.push('flutter')
    try {
      const pubspec = readFileSync(join(projectPath, 'pubspec.yaml'), 'utf-8')
      if (pubspec.includes('macos_ui')) stack.push('macos')
    } catch {}
  }

  if (existsSync(join(projectPath, 'composer.json'))) {
    stack.push('php')
    try {
      const composer = JSON.parse(readFileSync(join(projectPath, 'composer.json'), 'utf-8'))
      if (composer.require?.['cakephp/cakephp']) stack.push('cakephp')
      if (composer.require?.['laravel/framework']) stack.push('laravel')
    } catch {}
  }

  if (existsSync(join(projectPath, 'Cargo.toml'))) stack.push('rust')
  if (existsSync(join(projectPath, 'go.mod'))) stack.push('go')

  return stack
}

function getLastModified(projectPath: string): string {
  try {
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
    return execSync('git remote get-url origin 2>/dev/null', { cwd: projectPath, encoding: 'utf-8' }).trim() || undefined
  } catch {
    return undefined
  }
}

const MANIFEST_FILES = ['package.json', 'pubspec.yaml', 'composer.json', 'Cargo.toml', 'go.mod']

export function scanProjects(): ProjectEntry[] {
  const config = loadConfig()
  const HOME = process.env.HOME || '~'
  const projects: ProjectEntry[] = []

  for (const scanPath of config.ingest.scanPaths) {
    const resolved = scanPath.replace('~', HOME)
    if (!existsSync(resolved)) continue

    const entries = readdirSync(resolved, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      if (config.ingest.excludePaths.includes(entry.name)) continue

      const fullPath = join(resolved, entry.name)
      const hasManifest = MANIFEST_FILES.some(f => existsSync(join(fullPath, f)))

      if (hasManifest) {
        const status = entry.name.startsWith('_')
          ? (entry.name === '_templates' ? 'template' as const : 'archived' as const)
          : 'active' as const
        projects.push({
          name: entry.name,
          path: fullPath,
          stack: detectStack(fullPath),
          lastActive: getLastModified(fullPath),
          status,
          repo: getGitRemote(fullPath),
        })
      } else {
        // Group folder — scan one level deeper
        try {
          const subEntries = readdirSync(fullPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (!sub.isDirectory() || sub.name.startsWith('.')) continue
            if (config.ingest.excludePaths.includes(sub.name)) continue
            const subPath = join(fullPath, sub.name)
            if (MANIFEST_FILES.some(f => existsSync(join(subPath, f)))) {
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

  log.info(`Scanned ${projects.length} projects across ${config.ingest.scanPaths.length} paths`)
  return projects.sort((a, b) => b.lastActive.localeCompare(a.lastActive))
}

export function saveProjectIndex(projects: ProjectEntry[]): void {
  ensureRexDirs()
  writeFileSync(join(PROJECTS_DIR, 'index.json'), JSON.stringify(projects, null, 2))
}

export function loadProjectIndex(): ProjectEntry[] {
  const indexPath = join(PROJECTS_DIR, 'index.json')
  if (!existsSync(indexPath)) return []
  try { return JSON.parse(readFileSync(indexPath, 'utf-8')) } catch { return [] }
}

export function findProject(cwd: string): ProjectEntry | undefined {
  const projects = loadProjectIndex()
  return projects.find(p => cwd === p.path || cwd.startsWith(p.path + '/'))
}
