import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

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
const PREFERRED_MODELS = ['deepseek-r1:8b', 'qwen2.5:1.5b', 'llama3.2', 'mistral']

async function detectModel(): Promise<string> {
  if (process.env.REX_OPTIMIZE_MODEL) return process.env.REX_OPTIMIZE_MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map((m: any) => m.name)
    for (const pref of PREFERRED_MODELS) {
      if (available.some((a: string) => a.includes(pref.split(':')[0]))) {
        return available.find((a: string) => a.includes(pref.split(':')[0]))!
      }
    }
    // Fallback to first non-embedding model
    return available.find((a: string) => !a.includes('embed')) || available[0]
  } catch {
    return 'llama3.2'
  }
}

async function llm(prompt: string, system?: string, model?: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'qwen2.5:1.5b',
      prompt,
      system,
      stream: false,
    }),
  })

  if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`)
  const data = await res.json() as { response: string }
  return data.response
}

export async function optimize() {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX OPTIMIZE${COLORS.reset}`)
  console.log(`${line}\n`)

  // Check Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!res.ok) throw new Error()
  } catch {
    console.error(`${COLORS.red}Ollama not running.${COLORS.reset} Start it: ollama serve`)
    process.exit(1)
  }

  // Find CLAUDE.md (project-level first, then global)
  const cwd = process.cwd()
  const projectClaudeMd = join(cwd, 'CLAUDE.md')
  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md')

  const target = existsSync(projectClaudeMd) ? projectClaudeMd : globalClaudeMd
  if (!existsSync(target)) {
    console.error(`${COLORS.red}No CLAUDE.md found.${COLORS.reset}`)
    process.exit(1)
  }

  const content = readFileSync(target, 'utf-8')
  const lines = content.split('\n').length
  const chars = content.length
  const tokens = Math.ceil(chars / 4) // rough estimate

  console.log(`  ${COLORS.cyan}Target:${COLORS.reset} ${target}`)
  console.log(`  ${COLORS.cyan}Size:${COLORS.reset} ${lines} lines, ~${tokens} tokens`)
  console.log()

  // Analyze with local LLM
  const model = await detectModel()
  console.log(`  ${COLORS.dim}Analyzing with ${model}...${COLORS.reset}`)

  const analysis = await llm(
    `Analyze this CLAUDE.md file and provide specific suggestions to reduce its token count while keeping all important instructions. Focus on:
1. Redundant or duplicate instructions
2. Overly verbose sections that could be shortened
3. Content that could be moved to separate files and @imported
4. Dead or outdated references

CLAUDE.md content:
---
${content.slice(0, 6000)}
---

Provide a concise analysis with specific, actionable suggestions. Format each suggestion as:
- [SECTION] What to change and why (estimated savings: N tokens)`,
    'You are a technical editor that optimizes AI instruction files. Be direct and specific. Output only the analysis, no preamble.',
    model
  )

  console.log(`\n${COLORS.bold}  Analysis:${COLORS.reset}\n`)
  for (const line of analysis.split('\n')) {
    console.log(`  ${line}`)
  }

  console.log(`\n${COLORS.dim}─────────────────────────────────────────────${COLORS.reset}`)
  console.log(`\n  ${COLORS.dim}Tip: Run ${COLORS.cyan}rex optimize --apply${COLORS.reset}${COLORS.dim} to auto-apply suggestions${COLORS.reset}`)
  console.log()
}
