/** @module PROJETS */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

interface StackDetection {
  name: string
  detected: boolean
  mcpServers: string[]
  skills: string[]
}

function detectStack(projectPath: string): StackDetection[] {
  const pkgPath = join(projectPath, 'package.json')
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  const stacks: StackDetection[] = [
    {
      name: 'Next.js',
      detected: !!deps?.next,
      mcpServers: ['next-devtools'],
      skills: ['build-validate', 'one-shot'],
    },
    {
      name: 'React',
      detected: !!deps?.react,
      mcpServers: [],
      skills: ['figma-workflow', 'dstudio-design-system'],
    },
    {
      name: 'Tailwind',
      detected: !!deps?.tailwindcss || !!deps?.['@tailwindcss/vite'],
      mcpServers: [],
      skills: ['figma-workflow'],
    },
    {
      name: 'Playwright',
      detected: !!deps?.['@playwright/test'] || !!deps?.playwright,
      mcpServers: ['playwright'],
      skills: [],
    },
    {
      name: 'Cloudflare Workers',
      detected: !!deps?.wrangler || existsSync(join(projectPath, 'wrangler.toml')),
      mcpServers: [],
      skills: ['deploy-checklist'],
    },
    {
      name: 'Flutter',
      detected: existsSync(join(projectPath, 'pubspec.yaml')),
      mcpServers: [],
      skills: [],
    },
    {
      name: 'CakePHP',
      detected: existsSync(join(projectPath, 'composer.json')) && readFileSync(join(projectPath, 'composer.json'), 'utf-8').includes('cakephp'),
      mcpServers: [],
      skills: [],
    },
  ]

  return stacks
}

export async function context(targetPath: string) {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX CONTEXT${COLORS.reset}`)
  console.log(`${line}\n`)

  const absPath = targetPath.startsWith('/') ? targetPath : join(process.cwd(), targetPath === '.' ? '' : targetPath)
  const projectName = basename(absPath)

  console.log(`  ${COLORS.cyan}Project:${COLORS.reset} ${projectName}`)
  console.log(`  ${COLORS.cyan}Path:${COLORS.reset} ${absPath}\n`)

  const stacks = detectStack(absPath)
  const detected = stacks.filter(s => s.detected)

  if (detected.length === 0) {
    console.log(`  ${COLORS.yellow}No known stack detected.${COLORS.reset}`)
    console.log()
    return
  }

  console.log(`  ${COLORS.bold}Detected stack:${COLORS.reset}`)
  for (const s of detected) {
    console.log(`    ${COLORS.green}✓${COLORS.reset} ${s.name}`)
  }

  const recommendedMcp = [...new Set(detected.flatMap(s => s.mcpServers))]
  const recommendedSkills = [...new Set(detected.flatMap(s => s.skills))]

  if (recommendedMcp.length > 0) {
    console.log(`\n  ${COLORS.bold}Recommended MCP servers:${COLORS.reset}`)
    for (const mcp of recommendedMcp) {
      console.log(`    ${COLORS.cyan}→${COLORS.reset} ${mcp}`)
    }
  }

  if (recommendedSkills.length > 0) {
    console.log(`\n  ${COLORS.bold}Recommended skills:${COLORS.reset}`)
    for (const skill of recommendedSkills) {
      console.log(`    ${COLORS.cyan}→${COLORS.reset} ${skill}`)
    }
  }

  // Check for CLAUDE.md
  const hasClaudeMd = existsSync(join(absPath, 'CLAUDE.md'))
  if (!hasClaudeMd) {
    console.log(`\n  ${COLORS.yellow}!${COLORS.reset} No project CLAUDE.md found — consider running ${COLORS.cyan}/project-init${COLORS.reset}`)
  }

  console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}\n`)
}

/**
 * rex context --inject
 * Reads recent last-session.md files from ~/.claude/projects/<hash>/memory/ and
 * injects a CONTEXT.md summary section into the project's CLAUDE.md.
 */
export function injectContext(projectDir = process.cwd()): void {
  const claudeMdPath = join(projectDir, 'CLAUDE.md')
  if (!existsSync(claudeMdPath)) {
    console.log(`  ${COLORS.yellow}!${COLORS.reset} No CLAUDE.md found in ${projectDir}`)
    return
  }

  // Locate last-session files — either in .claude/memory/ or ~/.claude/projects/*/memory/
  const sessionLines: string[] = []

  // 1) Check project-local memory dir
  const localMemory = join(projectDir, '.claude', 'memory')
  if (existsSync(localMemory)) {
    for (const f of readdirSync(localMemory)) {
      if (f === 'last-session.md' || f.startsWith('last-session')) {
        try {
          sessionLines.push(readFileSync(join(localMemory, f), 'utf-8').slice(0, 500))
        } catch {}
      }
    }
  }

  // 2) Check global ~/.claude/projects/ for project matching this path
  const projectsBase = join(homedir(), '.claude', 'projects')
  if (existsSync(projectsBase)) {
    // Encode path the same way Claude Code does: replace / with -
    const encoded = projectDir.replace(/\//g, '-').replace(/^-/, '')
    const candidate = join(projectsBase, encoded, 'memory')
    if (existsSync(candidate)) {
      for (const f of readdirSync(candidate)) {
        if (f === 'last-session.md' || f.startsWith('last-session')) {
          try {
            sessionLines.push(readFileSync(join(candidate, f), 'utf-8').slice(0, 500))
          } catch {}
        }
      }
    }
  }

  // Build CONTEXT.md block
  const now = new Date().toISOString().slice(0, 10)
  const projectName = basename(projectDir)
  const separator = '\n\n<!-- REX CONTEXT INJECTION — auto-updated -->'
  const block = [
    separator,
    `## REX Context — ${projectName} (${now})`,
    '',
    sessionLines.length > 0
      ? sessionLines.map((s, i) => `### Session ${i + 1}\n${s.trim()}`).join('\n\n')
      : '_No session summaries found. Run `rex ingest` to build memory._',
    '',
    `> Generated by \`rex context --inject\``,
    '<!-- END REX CONTEXT -->',
  ].join('\n')

  // Read existing CLAUDE.md and strip any previous injection
  let existing = readFileSync(claudeMdPath, 'utf-8')
  const injectStart = existing.indexOf('\n\n<!-- REX CONTEXT INJECTION')
  if (injectStart !== -1) {
    existing = existing.slice(0, injectStart)
  }

  writeFileSync(claudeMdPath, existing.trimEnd() + block + '\n')
  console.log(`  ${COLORS.green}✓${COLORS.reset} Injected REX context into CLAUDE.md (${sessionLines.length} session(s))`)
}
