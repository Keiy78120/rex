import { existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'

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

  const absPath = join(process.cwd(), targetPath === '.' ? '' : targetPath)
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
