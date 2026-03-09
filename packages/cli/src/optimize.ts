/** @module OPTIMIZE */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { llm, detectModel } from './llm.js'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

function collectImports(content: string, baseDir: string): string {
  // Find @import references in CLAUDE.md
  const imports: string[] = []
  const importRegex = /@import\s+["']([^"']+)["']/g
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = join(baseDir, match[1])
    if (existsSync(importPath)) {
      imports.push(`\n--- ${match[1]} ---\n${readFileSync(importPath, 'utf-8')}`)
    }
  }
  // Also check rules/ directory
  const rulesDir = join(baseDir, 'rules')
  if (existsSync(rulesDir)) {
    try {
      const rules = readdirSync(rulesDir).filter(f => f.endsWith('.md'))
      for (const rule of rules) {
        imports.push(`\n--- rules/${rule} ---\n${readFileSync(join(rulesDir, rule), 'utf-8')}`)
      }
    } catch {}
  }
  return imports.join('\n')
}

export async function optimize(apply: boolean = false) {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX OPTIMIZE${apply ? ' --apply' : ''}${COLORS.reset}`)
  console.log(`${line}\n`)

  // Check Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!res.ok) throw new Error()
  } catch {
    console.error(`${COLORS.red}Ollama not running.${COLORS.reset} Start it: ollama serve`)
    process.exit(1)
  }

  // Find CLAUDE.md
  const cwd = process.cwd()
  const projectClaudeMd = join(cwd, 'CLAUDE.md')
  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md')
  const target = existsSync(projectClaudeMd) ? projectClaudeMd : globalClaudeMd
  if (!existsSync(target)) {
    console.error(`${COLORS.red}No CLAUDE.md found.${COLORS.reset}`)
    process.exit(1)
  }

  const content = readFileSync(target, 'utf-8')
  const baseDir = join(target, '..')
  const importedContent = collectImports(content, baseDir)
  const fullContent = content + importedContent

  const lines = content.split('\n').length
  const chars = fullContent.length
  const tokens = Math.ceil(chars / 4)

  console.log(`  ${COLORS.cyan}Target:${COLORS.reset} ${target}`)
  console.log(`  ${COLORS.cyan}Size:${COLORS.reset} ${lines} lines, ~${tokens} tokens (with imports)`)
  console.log()

  const model = await detectModel()
  console.log(`  ${COLORS.dim}Analyzing with ${model}...${COLORS.reset}`)

  if (!apply) {
    // Analysis mode
    const analysis = await llm(
      `Analyze this CLAUDE.md file and all its imported rules. Provide specific suggestions to reduce token count while keeping all important instructions. Focus on:
1. Redundant or duplicate instructions (across main file AND imported rules)
2. Overly verbose sections that could be shortened
3. Content that could be moved to separate @import files
4. Dead or outdated references
5. Contradictions between files

CLAUDE.md + imports:
---
${fullContent.slice(0, 8000)}
---

Provide a concise analysis with specific, actionable suggestions. Format each suggestion as:
- [SECTION] What to change and why (estimated savings: N tokens)`,
      'You are a technical editor that optimizes AI instruction files. Be direct and specific. Output only the analysis, no preamble.',
      model
    )

    console.log(`\n${COLORS.bold}  Analysis:${COLORS.reset}\n`)
    for (const l of analysis.split('\n')) {
      console.log(`  ${l}`)
    }

    console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}`)
    console.log(`\n  ${COLORS.dim}Run ${COLORS.cyan}rex optimize --apply${COLORS.reset}${COLORS.dim} to auto-apply suggestions${COLORS.reset}`)
  } else {
    // Apply mode
    const backupPath = target + '.bak'
    writeFileSync(backupPath, content)
    console.log(`  ${COLORS.green}✓${COLORS.reset} Backup saved to ${backupPath}`)

    const optimized = await llm(
      `Rewrite this CLAUDE.md to be more concise while keeping ALL important instructions. Rules:
- Remove redundancy and duplication
- Shorten verbose explanations to bullet points
- Keep all actionable rules, security requirements, and workflow steps
- Preserve @import references
- Use tables instead of verbose lists where possible
- Remove filler words and unnecessary context
- Output ONLY the rewritten CLAUDE.md content, nothing else

Original:
---
${content.slice(0, 8000)}
---`,
      'You rewrite AI instruction files to be maximally concise. Output only the rewritten file, no commentary.',
      model
    )

    writeFileSync(target, optimized)

    const oldTokens = Math.ceil(content.length / 4)
    const newTokens = Math.ceil(optimized.length / 4)
    const saved = oldTokens - newTokens
    const pct = Math.round((saved / oldTokens) * 100)

    console.log(`  ${COLORS.green}✓${COLORS.reset} CLAUDE.md rewritten`)
    console.log(`\n  ${COLORS.bold}Before:${COLORS.reset} ~${oldTokens} tokens`)
    console.log(`  ${COLORS.bold}After:${COLORS.reset}  ~${newTokens} tokens`)
    console.log(`  ${COLORS.bold}Saved:${COLORS.reset}  ~${saved} tokens (${pct}%)`)
    console.log(`\n  ${COLORS.dim}Review changes: diff ${backupPath} ${target}${COLORS.reset}`)
  }
  console.log()
}
