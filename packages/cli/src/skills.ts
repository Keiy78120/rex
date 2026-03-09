// packages/cli/src/skills.ts — REX Skills System
import { homedir } from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// ─── Types ──────────────────────────────────────────────────

interface SkillMeta {
  name: string
  description: string
  requiredTools: string[]
  requiredMcp: string[]
}

interface SkillInfo extends SkillMeta {
  file: string
  path: string
}

// ─── Constants ──────────────────────────────────────────────

const HOME = homedir()
const SKILLS_DIR = join(HOME, '.claude', 'rex', 'skills')

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

// ─── Default Skills ─────────────────────────────────────────

const DEFAULT_SKILLS: Record<string, { description: string; requiredTools: string[]; requiredMcp: string[]; body: string }> = {
  'code-review': {
    description: 'Review code for bugs, security issues, and performance problems',
    requiredTools: ['Read', 'Grep', 'Glob', 'Bash'],
    requiredMcp: [],
    body: `# Code Review

## Objective

Review code for bugs, security issues, performance. Report findings with file:line references.

## Process

1. **Understand scope** — Identify the files and modules under review.
2. **Read thoroughly** — Use Read and Grep to examine implementation details.
3. **Check for bugs** — Logic errors, off-by-one, null/undefined access, race conditions.
4. **Check security** — SQL injection, XSS, secrets in code, missing auth checks (OWASP top 10).
5. **Check performance** — Unbounded loops, missing pagination, N+1 queries, large payloads.
6. **Report** — List each finding with severity (critical/high/medium/low), file:line, and suggested fix.

## Rules

- Never modify files during a review — read-only.
- Always provide file paths and line numbers for every finding.
- Group findings by severity, most critical first.
- If no issues found, say so explicitly — don't invent problems.`,
  },
  'bug-fix': {
    description: 'Identify root cause, implement fix, verify with tests',
    requiredTools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'],
    requiredMcp: [],
    body: `# Bug Fix

## Objective

Identify root cause, implement fix, verify with tests. Never delete tests to make them pass.

## Process

1. **Reproduce** — Understand the bug description. Locate relevant code with Grep/Glob.
2. **Root cause** — Trace the issue through the codebase. Read related files to understand context.
3. **Plan fix** — Identify the minimal change that fixes the root cause (not symptoms).
4. **Implement** — Edit the affected files. Keep changes focused and minimal.
5. **Verify** — Run the build. Run tests if they exist. Confirm the fix resolves the issue.
6. **Side effects** — Grep for other consumers of changed functions/state. Ensure nothing breaks.

## Rules

- Fix the root cause, not the symptoms.
- Never delete or skip tests to make them pass — fix the code instead.
- If stuck after 2 attempts at the same approach, stop and report what you tried.
- Always verify the build passes after your fix.`,
  },
  'refactor': {
    description: 'Improve code quality without changing behavior',
    requiredTools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash'],
    requiredMcp: [],
    body: `# Refactor

## Objective

Improve code quality without changing behavior. Verify builds and tests pass before and after.

## Process

1. **Baseline** — Run the build and tests BEFORE any changes. Record the results.
2. **Analyze** — Read the code to understand current structure, patterns, and pain points.
3. **Plan** — Identify specific improvements: extract functions, reduce duplication, improve naming, simplify logic.
4. **Implement** — Apply changes incrementally. One logical change at a time.
5. **Verify** — Run build and tests AFTER changes. Compare with baseline — behavior must be identical.
6. **Review** — Read back the changed files. Ensure consistency with existing codebase patterns.

## Rules

- Behavior must not change — refactoring is about structure, not features.
- Run build before AND after. Both must pass with zero errors.
- Follow existing codebase conventions (naming, formatting, patterns).
- Do not over-engineer. Only improve what is clearly problematic.
- If tests exist, they must all pass after refactoring without modification.`,
  },
  'deploy-check': {
    description: 'Pre-deploy checklist: build, secrets, env vars, migrations',
    requiredTools: ['Read', 'Grep', 'Glob', 'Bash'],
    requiredMcp: [],
    body: `# Deploy Check

## Objective

Pre-deploy checklist: build passes, no secrets in code, env vars configured, migrations ready.

## Checklist

### 1. Build
- [ ] \`npm run build\` (or equivalent) passes with zero errors
- [ ] No TypeScript/linter warnings in changed files

### 2. Secrets & Security
- [ ] No API keys, tokens, or passwords hardcoded in source
- [ ] \`.env\` files are in \`.gitignore\`
- [ ] No \`console.log\` with sensitive data
- [ ] SQL queries use parameterized statements

### 3. Environment Variables
- [ ] All required env vars are documented
- [ ] \`.env.example\` is up to date (if it exists)
- [ ] No references to localhost/dev URLs in production code

### 4. Database
- [ ] Migrations are ready and tested
- [ ] New queries have appropriate indexes
- [ ] No destructive migrations without rollback plan

### 5. Dependencies
- [ ] No vulnerable dependencies (\`npm audit\`)
- [ ] Lock file is committed
- [ ] No unnecessary new dependencies added

## Rules

- This is a read-only check — do not modify files.
- Report each item as PASS / FAIL / N/A with details.
- Any FAIL is a deploy blocker — state this clearly.`,
  },
}

// ─── Helpers ────────────────────────────────────────────────

function ensureDirs() {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
}

function installDefaults() {
  ensureDirs()
  for (const [name, skill] of Object.entries(DEFAULT_SKILLS)) {
    const filePath = join(SKILLS_DIR, `${name}.md`)
    if (existsSync(filePath)) continue

    const content = `---
name: ${name}
description: ${skill.description}
requiredTools: [${skill.requiredTools.join(', ')}]
requiredMcp: [${skill.requiredMcp.join(', ')}]
---

${skill.body}
`
    writeFileSync(filePath, content)
  }
}

function parseFrontmatter(content: string): { meta: SkillMeta; body: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!fmMatch) {
    return {
      meta: { name: 'unknown', description: '', requiredTools: [], requiredMcp: [] },
      body: content,
    }
  }

  const raw = fmMatch[1]
  const body = fmMatch[2].trim()

  const getString = (key: string): string => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : ''
  }

  const getArray = (key: string): string[] => {
    const m = raw.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'))
    if (!m) return []
    return m[1].split(',').map(s => s.trim()).filter(Boolean)
  }

  return {
    meta: {
      name: getString('name'),
      description: getString('description'),
      requiredTools: getArray('requiredTools'),
      requiredMcp: getArray('requiredMcp'),
    },
    body,
  }
}

function readSkill(name: string): { info: SkillInfo; body: string } | null {
  const filePath = join(SKILLS_DIR, `${name}.md`)
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)

  return {
    info: { ...meta, file: `${name}.md`, path: filePath },
    body,
  }
}

function getAllSkills(): SkillInfo[] {
  ensureDirs()
  installDefaults()

  const files = readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md')).sort()
  const skills: SkillInfo[] = []

  for (const file of files) {
    const filePath = join(SKILLS_DIR, file)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const { meta } = parseFrontmatter(content)
      skills.push({ ...meta, file, path: filePath })
    } catch { /* skip unreadable files */ }
  }

  return skills
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Load a skill's full content as a string (for agent system prompt injection).
 */
export function loadSkill(name: string): string | null {
  ensureDirs()
  installDefaults()

  const skill = readSkill(name)
  if (!skill) return null

  return skill.body
}

/**
 * List all skills with their metadata.
 */
export function listSkills(): SkillInfo[] {
  return getAllSkills()
}

// ─── CLI Commands ───────────────────────────────────────────

function cmdList(jsonMode: boolean) {
  const skills = getAllSkills()

  if (jsonMode) {
    console.log(JSON.stringify({ skills }, null, 2))
    return
  }

  if (skills.length === 0) {
    console.log('No skills found. They will be created on first use.')
    return
  }

  const line = '\u2500'.repeat(60)
  console.log(`\n${COLORS.bold}  REX Skills${COLORS.reset}  ${COLORS.dim}(${SKILLS_DIR})${COLORS.reset}\n${line}`)

  for (const s of skills) {
    const tools = s.requiredTools.length > 0 ? s.requiredTools.join(', ') : 'none'
    const mcp = s.requiredMcp.length > 0 ? s.requiredMcp.join(', ') : 'none'
    console.log(`  ${COLORS.cyan}${s.name}${COLORS.reset}`)
    console.log(`  ${COLORS.dim}${s.description}${COLORS.reset}`)
    console.log(`  ${COLORS.dim}tools: ${tools}  |  mcp: ${mcp}${COLORS.reset}`)
    console.log()
  }

  console.log(`${line}`)
  console.log(`${COLORS.dim}  ${skills.length} skill(s) in ${SKILLS_DIR}${COLORS.reset}\n`)
}

function cmdShow(args: string[]) {
  const name = args[0]
  if (!name) {
    console.log('Usage: rex skills show <name>')
    return
  }

  ensureDirs()
  installDefaults()

  const skill = readSkill(name)
  if (!skill) {
    console.log(`${COLORS.red}Skill not found:${COLORS.reset} ${name}`)
    console.log(`${COLORS.dim}Available: ${getAllSkills().map(s => s.name).join(', ')}${COLORS.reset}`)
    return
  }

  const s = skill.info
  const line = '\u2500'.repeat(60)
  console.log(`\n${COLORS.bold}  ${s.name}${COLORS.reset}\n${line}`)
  console.log(`  ${COLORS.dim}Description:${COLORS.reset} ${s.description}`)
  console.log(`  ${COLORS.dim}Tools:${COLORS.reset}       ${s.requiredTools.join(', ') || 'none'}`)
  console.log(`  ${COLORS.dim}MCP:${COLORS.reset}         ${s.requiredMcp.join(', ') || 'none'}`)
  console.log(`  ${COLORS.dim}Path:${COLORS.reset}        ${s.path}`)
  console.log(`${line}\n`)
  console.log(skill.body)
  console.log()
}

function cmdAdd(args: string[]) {
  const name = args[0]
  if (!name) {
    console.log('Usage: rex skills add <name>')
    console.log('Creates a new skill template in the skills directory.')
    return
  }

  ensureDirs()

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const filePath = join(SKILLS_DIR, `${slug}.md`)

  if (existsSync(filePath)) {
    console.log(`${COLORS.yellow}Skill already exists:${COLORS.reset} ${slug}`)
    console.log(`${COLORS.dim}Edit it at: ${filePath}${COLORS.reset}`)
    return
  }

  const content = `---
name: ${slug}
description: <describe this skill>
requiredTools: [Read, Grep]
requiredMcp: []
---

# ${slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}

## Objective

<what this skill does>

## Process

1. <step 1>
2. <step 2>
3. <step 3>

## Rules

- <constraints and guardrails>
`
  writeFileSync(filePath, content)

  console.log(`${COLORS.green}Skill created:${COLORS.reset} ${slug}`)
  console.log(`${COLORS.dim}Edit it at: ${filePath}${COLORS.reset}`)
}

function cmdDelete(args: string[]) {
  const name = args[0]
  if (!name) {
    console.log('Usage: rex skills delete <name>')
    return
  }

  ensureDirs()

  const filePath = join(SKILLS_DIR, `${name}.md`)
  if (!existsSync(filePath)) {
    console.log(`${COLORS.red}Skill not found:${COLORS.reset} ${name}`)
    return
  }

  unlinkSync(filePath)
  console.log(`${COLORS.green}Deleted:${COLORS.reset} ${name}`)
}

// ─── Entry Point ────────────────────────────────────────────

export async function skills(args: string[]) {
  ensureDirs()
  installDefaults()

  const sub = args[0] || 'list'
  const rest = args.slice(1)
  const jsonMode = args.includes('--json')

  switch (sub) {
    case 'list': cmdList(jsonMode); return
    case 'show': cmdShow(rest); return
    case 'add': cmdAdd(rest); return
    case 'delete': cmdDelete(rest); return
    default:
      console.log('Usage: rex skills <list|show|add|delete>')
      console.log('')
      console.log('  rex skills list              List all available skills')
      console.log('  rex skills show <name>       Show skill content')
      console.log('  rex skills add <name>        Create a new skill template')
      console.log('  rex skills delete <name>     Delete a skill')
      console.log('')
      console.log(`Skills directory: ${SKILLS_DIR}`)
  }
}
