/**
 * REX Project Init
 *
 * Bootstraps a new project with REX-aware config:
 * - Detects stack from existing files
 * - Creates CLAUDE.md from template
 * - Inits git if absent
 * - Installs skills from SKILL_MAP based on detected stack
 * - Optional GitHub repo creation via `gh`
 *
 * §11 REX Master Plan — Project Bootstrap
 * @module PROJETS
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, basename } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('PROJETS:init')

// Skills to install per detected stack dependency/framework
// Refs §11.2 SKILL_MAP
const SKILL_MAP: Record<string, string[]> = {
  next:       ['ux-flow', 'ui-craft', 'seo', 'perf'],
  react:      ['ux-flow', 'ui-craft'],
  drizzle:    ['db-design'],
  prisma:     ['db-design'],
  vitest:     ['test-strategy'],
  playwright: ['test-strategy'],
  tailwind:   ['ui-craft'],
  express:    ['api-design', 'auth-patterns'],
  fastify:    ['api-design', 'auth-patterns'],
  flutter:    ['ui-craft'],
  python:     ['test-strategy'],
  go:         ['test-strategy', 'api-design'],
}

// Skills always injected regardless of stack (via superpowers plugin)
const ALWAYS_SKILLS = [
  'brainstorming', 'writing-plans', 'test-driven-development',
  'systematic-debugging', 'verification-before-completion',
  'code-review', 'build-validate',
]

export interface StackInfo {
  name: string         // Human-readable stack name
  keys: string[]       // Keys into SKILL_MAP
  language: 'typescript' | 'javascript' | 'python' | 'dart' | 'go' | 'unknown'
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'pip' | 'go' | 'pub' | 'none'
  testRunner?: string
  buildCmd?: string
  devCmd?: string
}

function whichExists(cmd: string): boolean {
  try { execSync(`which ${cmd}`, { stdio: 'ignore', timeout: 2000 }); return true } catch { return false }
}

function gitRun(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { encoding: 'utf-8', timeout: 30_000, cwd, stdio: 'pipe' }).trim()
}

/** Detect the project stack from the file tree */
export function detectStack(cwd: string): StackInfo {
  const pkg = join(cwd, 'package.json')
  const pyproject = join(cwd, 'pyproject.toml')
  const goMod = join(cwd, 'go.mod')
  const pubspec = join(cwd, 'pubspec.yaml')
  const requirementsTxt = join(cwd, 'requirements.txt')

  // --- Go ---
  if (existsSync(goMod)) {
    return {
      name: 'Go',
      keys: ['go'],
      language: 'go',
      packageManager: 'go',
      testRunner: 'go test ./...',
      buildCmd: 'go build ./...',
    }
  }

  // --- Flutter ---
  if (existsSync(pubspec)) {
    return {
      name: 'Flutter',
      keys: ['flutter'],
      language: 'dart',
      packageManager: 'pub',
      buildCmd: 'flutter build apk',
      testRunner: 'flutter test',
    }
  }

  // --- Python ---
  if (existsSync(pyproject) || existsSync(requirementsTxt)) {
    return {
      name: 'Python',
      keys: ['python'],
      language: 'python',
      packageManager: 'pip',
      testRunner: 'pytest',
    }
  }

  // --- Node/TypeScript ---
  if (existsSync(pkg)) {
    let pkgJson: Record<string, any> = {}
    try { pkgJson = JSON.parse(readFileSync(pkg, 'utf-8')) } catch {}

    const deps = {
      ...pkgJson.dependencies ?? {},
      ...pkgJson.devDependencies ?? {},
    }
    const keys: string[] = []

    if (deps['next'] || deps['next.js']) keys.push('next', 'react')
    else if (deps['react']) keys.push('react')
    if (deps['@drizzle-orm/better-sqlite3'] || deps['drizzle-orm'] || deps['drizzle-kit']) keys.push('drizzle')
    if (deps['@prisma/client'] || deps['prisma']) keys.push('prisma')
    if (deps['vitest']) keys.push('vitest')
    if (deps['playwright'] || deps['@playwright/test']) keys.push('playwright')
    if (deps['tailwindcss']) keys.push('tailwind')
    if (deps['express']) keys.push('express')
    if (deps['fastify']) keys.push('fastify')

    // Detect package manager
    let packageManager: StackInfo['packageManager'] = 'npm'
    if (existsSync(join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (existsSync(join(cwd, 'yarn.lock'))) packageManager = 'yarn'

    // Build/test/dev commands from scripts
    const scripts = pkgJson.scripts ?? {}
    const testRunner = scripts.test ? `${packageManager} test` : undefined
    const buildCmd = scripts.build ? `${packageManager} run build` : undefined
    const devCmd = scripts.dev ? `${packageManager} run dev` : undefined

    // Stack name
    let name = 'Node.js'
    if (keys.includes('next')) name = 'Next.js'
    else if (keys.includes('react')) name = 'React'
    else if (keys.includes('express')) name = 'Express'
    else if (keys.includes('fastify')) name = 'Fastify'

    const hasTS = existsSync(join(cwd, 'tsconfig.json'))

    return {
      name: hasTS ? `${name} + TypeScript` : name,
      keys,
      language: hasTS ? 'typescript' : 'javascript',
      packageManager,
      testRunner,
      buildCmd,
      devCmd,
    }
  }

  return {
    name: 'Unknown',
    keys: [],
    language: 'unknown',
    packageManager: 'none',
  }
}

/** Resolve skills for a detected stack (deduped) */
export function resolveSkills(stack: StackInfo): string[] {
  const seen = new Set<string>()
  const skills: string[] = []
  for (const key of stack.keys) {
    for (const skill of SKILL_MAP[key] ?? []) {
      if (!seen.has(skill)) { seen.add(skill); skills.push(skill) }
    }
  }
  return skills
}

/** Generate CLAUDE.md content for the detected stack */
function generateClaudeMd(cwd: string, stack: StackInfo, skills: string[]): string {
  const projectName = basename(cwd)
  const now = new Date().toISOString().split('T')[0]

  const buildSection = [
    stack.buildCmd ? `- Build: \`${stack.buildCmd}\`` : '',
    stack.testRunner ? `- Test: \`${stack.testRunner}\`` : '',
    stack.devCmd ? `- Dev: \`${stack.devCmd}\`` : '',
  ].filter(Boolean).join('\n')

  const skillsSection = skills.length > 0
    ? `\n## Skills\n\n${skills.map(s => `- ${s}`).join('\n')}`
    : ''

  return `# ${projectName}

> Initialized by REX on ${now}

## Stack

- **Framework**: ${stack.name}
- **Language**: ${stack.language}
- **Package manager**: ${stack.packageManager}
${buildSection ? `\n## Commands\n\n${buildSection}` : ''}
${skillsSection}

## Notes

<!-- Add project-specific notes, gotchas, and conventions here -->

`
}

export interface InitOptions {
  github?: boolean    // create GitHub repo via `gh`
  skills?: boolean    // install stack-specific skills (default: true)
  dryRun?: boolean    // print what would be done, no writes
  force?: boolean     // overwrite existing CLAUDE.md
}

/** Bootstrap a project with REX config */
export async function initProject(cwd: string, opts: InitOptions = {}): Promise<void> {
  const { github = false, skills: installSkills = true, dryRun = false, force = false } = opts

  console.log()

  // --- Detect stack ---
  const stack = detectStack(cwd)
  console.log(`  Stack detected: ${stack.name}`)

  // --- Git init ---
  const isGitRepo = existsSync(join(cwd, '.git'))
  if (!isGitRepo) {
    if (dryRun) {
      console.log(`  [dry-run] Would run: git init`)
    } else {
      gitRun('init', cwd)
      log.info('git init')
      console.log(`  ✓ git init`)
    }
  } else {
    console.log(`  ✓ git (already initialized)`)
  }

  // --- Create CLAUDE.md ---
  const claudeMdPath = join(cwd, 'CLAUDE.md')
  const claudeMdExists = existsSync(claudeMdPath)

  if (claudeMdExists && !force) {
    console.log(`  ! CLAUDE.md already exists (use --force to overwrite)`)
  } else {
    const skills = installSkills ? resolveSkills(stack) : []
    const content = generateClaudeMd(cwd, stack, skills)
    if (dryRun) {
      console.log(`  [dry-run] Would create CLAUDE.md (${content.length} chars)`)
      console.log(`  [dry-run] Skills: ${skills.join(', ') || 'none'}`)
    } else {
      writeFileSync(claudeMdPath, content)
      log.info(`Created CLAUDE.md`)
      console.log(`  ✓ CLAUDE.md created`)
      if (skills.length > 0) {
        console.log(`  ✓ Skills: ${skills.join(', ')}`)
      }
    }
  }

  // --- Create docs/ skeleton ---
  const docsDir = join(cwd, 'docs')
  const plansDir = join(docsDir, 'plans')
  if (!existsSync(plansDir)) {
    if (dryRun) {
      console.log(`  [dry-run] Would create docs/plans/`)
    } else {
      mkdirSync(plansDir, { recursive: true })
      console.log(`  ✓ docs/plans/ created`)
    }
  }

  // --- .gitignore ---
  const gitignorePath = join(cwd, '.gitignore')
  if (!existsSync(gitignorePath)) {
    const gitignoreContent = `.env\n.env.local\n.env.*.local\nnode_modules/\n.DS_Store\ndist/\nbuild/\n`
    if (dryRun) {
      console.log(`  [dry-run] Would create .gitignore`)
    } else {
      writeFileSync(gitignorePath, gitignoreContent)
      console.log(`  ✓ .gitignore created`)
    }
  }

  // --- GitHub repo ---
  if (github) {
    if (!whichExists('gh')) {
      console.log(`  ! gh CLI not found — skipping GitHub repo creation`)
      console.log(`    Install: brew install gh && gh auth login`)
    } else {
      const projectName = basename(cwd)
      if (dryRun) {
        console.log(`  [dry-run] Would run: gh repo create ${projectName} --private --source=. --push`)
      } else {
        try {
          execSync(`gh repo create "${projectName}" --private --source=. --push`, {
            cwd,
            stdio: 'inherit',
            timeout: 60_000,
          })
          log.info(`GitHub repo created: ${projectName}`)
          console.log(`  ✓ GitHub repo created (private)`)
        } catch (e: any) {
          console.log(`  ! GitHub repo creation failed: ${e.message?.slice(0, 100)}`)
        }
      }
    }
  }

  console.log()
  if (!dryRun) {
    console.log(`  Project initialized. Next steps:`)
    console.log(`  1. Edit CLAUDE.md — add project context`)
    if (stack.devCmd) console.log(`  2. ${stack.devCmd} — start dev server`)
    console.log(`  ${stack.devCmd ? 3 : 2}. rex ingest — index this project in REX memory`)
  }
  console.log()
}

/** Print what initProject would do without making changes */
export async function previewInit(cwd: string): Promise<void> {
  const stack = detectStack(cwd)
  const skills = resolveSkills(stack)

  console.log(`\n  Stack:   ${stack.name}`)
  console.log(`  Skills:  ${skills.join(', ') || 'none'}`)
  console.log(`  Always:  ${ALWAYS_SKILLS.join(', ')}`)
  console.log(`  CLAUDE.md: ${existsSync(join(cwd, 'CLAUDE.md')) ? 'exists (use --force to overwrite)' : 'will be created'}`)
  console.log(`  git: ${existsSync(join(cwd, '.git')) ? 'already initialized' : 'will run git init'}`)
  console.log()
}
