/** @module OPTIMIZE — REX ↔ Codex config synchronization */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createLogger } from '../logger.js'

const log = createLogger('codex-sync')

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/**
 * Returns the ~/.codex directory path, or null if Codex is not installed.
 */
export function getCodexDir(): string | null {
  const codexDir = join(homedir(), '.codex')
  return existsSync(codexDir) ? codexDir : null
}

/**
 * Locate the REX repo root by traversing up from __dirname.
 * Falls back to REX_DIR env var (without the .claude/rex suffix).
 */
function findRexRoot(): string | null {
  // 1. Walk up from current file
  const thisFile = fileURLToPath(import.meta.url)
  let dir = dirname(thisFile)
  for (let i = 0; i < 8; i++) {
    // packages/cli/src → packages/cli → packages → repo-root (has dotfiles/)
    const candidate = join(dir, 'dotfiles', 'AGENTS.md')
    if (existsSync(candidate)) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // 2. Fallback via REX_HOME env
  const rexHome = process.env.REX_HOME
  if (rexHome) {
    const candidate = join(rexHome, 'dotfiles', 'AGENTS.md')
    if (existsSync(candidate)) return rexHome
  }

  return null
}

/**
 * Locate the bundled skills directory (packages/cli/skills/).
 * This is the same source synced to ~/.claude/skills/ during `rex init`.
 */
function findSkillsDir(): string | null {
  const thisFile = fileURLToPath(import.meta.url)
  // In dev: src/ → cli/ → cli/skills/
  const devCandidate = join(dirname(thisFile), '..', 'skills')
  if (existsSync(devCandidate)) return devCandidate

  // In dist: dist/ → cli/ → cli/skills/
  const distCandidate = join(dirname(thisFile), '..', '..', 'skills')
  if (existsSync(distCandidate)) return distCandidate

  return null
}

/**
 * Locate the memory server path — mirrors the same logic used in init.ts.
 */
function findMemoryServerPath(): string | null {
  const thisFile = fileURLToPath(import.meta.url)
  const thisDir = dirname(thisFile)
  const candidates = [
    join(thisDir, '..', '..', 'memory', 'src', 'server.ts'),
    join(homedir(), '.rex-memory', 'src', 'server.ts'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

// ── Skills sync ────────────────────────────────────────────────────────────

function syncSkills(codexDir: string): boolean {
  const skillsSrc = findSkillsDir()
  if (!skillsSrc) {
    log.info('Bundled skills directory not found — skipping Codex skills sync')
    return false
  }

  const codexSkillsDir = join(codexDir, 'skills')
  ensureDir(codexSkillsDir)

  const linkTarget = join(codexSkillsDir, 'rex')

  // Already linked — nothing to do
  if (existsSync(linkTarget)) {
    log.info('~/.codex/skills/rex already exists — skipping')
    return false
  }

  try {
    symlinkSync(skillsSrc, linkTarget)
    log.info(`Symlinked skills: ${linkTarget} → ${skillsSrc}`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not symlink skills to ~/.codex/skills/rex: ${msg}`)
    return false
  }
}

// ── AGENTS.md sync ─────────────────────────────────────────────────────────

function syncAgentsMd(codexDir: string): boolean {
  const rexRoot = findRexRoot()
  if (!rexRoot) {
    log.info('REX repo root not found — skipping AGENTS.md sync')
    return false
  }

  const agentsSrc = join(rexRoot, 'dotfiles', 'AGENTS.md')
  if (!existsSync(agentsSrc)) {
    log.info(`dotfiles/AGENTS.md not found at ${agentsSrc} — skipping`)
    return false
  }

  const agentsDest = join(codexDir, 'AGENTS.md')

  if (existsSync(agentsDest)) {
    log.info('~/.codex/AGENTS.md already exists — skipping')
    return false
  }

  try {
    symlinkSync(agentsSrc, agentsDest)
    log.info(`Symlinked AGENTS.md: ${agentsDest} → ${agentsSrc}`)
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not symlink AGENTS.md to ~/.codex/AGENTS.md: ${msg}`)
    return false
  }
}

// ── MCP rex-memory in config.toml ──────────────────────────────────────────

function syncMcpConfig(codexDir: string): boolean {
  const configPath = join(codexDir, 'config.toml')
  const memoryServerPath = findMemoryServerPath()

  if (!memoryServerPath) {
    log.info('Memory server not found — skipping MCP rex-memory sync for Codex')
    return false
  }

  const serverDir = join(memoryServerPath, '..', '..')
  const mcpBlock = `
[mcp_servers.rex-memory]
command = "npx"
args = ["tsx", "${memoryServerPath}"]
cwd = "${serverDir}"
`

  // Read existing config or start fresh
  let existing = ''
  try {
    if (existsSync(configPath)) {
      existing = readFileSync(configPath, 'utf-8')
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not read ~/.codex/config.toml: ${msg}`)
    return false
  }

  if (existing.includes('rex-memory')) {
    log.info('rex-memory already present in ~/.codex/config.toml — skipping')
    return false
  }

  try {
    const updated = existing.trimEnd() + '\n' + mcpBlock
    writeFileSync(configPath, updated)
    log.info('Added [mcp_servers.rex-memory] to ~/.codex/config.toml')
    return true
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not update ~/.codex/config.toml: ${msg}`)
    return false
  }
}

// ── Rules converter (bonus) ────────────────────────────────────────────────

const GIT_CMD_PATTERN = /git\s+(push|commit|add|rebase|reset|force|merge|checkout)/gi

/**
 * Reads ~/.claude/rules/*.md files and generates ~/.codex/rules/rex.rules
 * with prefix_rule() entries for git commands found in the rules.
 */
export function syncCodexRules(rulesDir: string): void {
  if (!existsSync(rulesDir)) {
    log.info(`Rules directory not found: ${rulesDir}`)
    return
  }

  let files: string[] = []
  try {
    files = readdirSync(rulesDir).filter(f => f.endsWith('.md'))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not list rules directory: ${msg}`)
    return
  }

  const seen = new Set<string>()
  const rules: string[] = [
    '# Generated by rex codex-sync — do not edit manually',
    '# Source: ~/.claude/rules/',
    '',
  ]

  for (const file of files) {
    const filePath = join(rulesDir, file)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const matches = content.match(GIT_CMD_PATTERN) ?? []
      for (const m of matches) {
        const normalized = m.toLowerCase().trim()
        if (!seen.has(normalized)) {
          seen.add(normalized)
          rules.push(`prefix_rule("${normalized}")`)
        }
      }
    } catch {
      // Non-critical — skip unreadable files
    }
  }

  if (seen.size === 0) {
    log.info('No git commands found in rules — skipping rex.rules generation')
    return
  }

  const codexDir = getCodexDir()
  if (!codexDir) return

  const codexRulesDir = join(codexDir, 'rules')
  ensureDir(codexRulesDir)

  const destPath = join(codexRulesDir, 'rex.rules')
  try {
    writeFileSync(destPath, rules.join('\n') + '\n')
    log.info(`Generated ${destPath} (${seen.size} git rules)`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`Could not write rex.rules: ${msg}`)
  }
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Synchronize REX config into ~/.codex/ (skills, AGENTS.md, MCP, rules).
 * Called during `rex init`. Returns a summary string, or null if Codex is not
 * installed.
 */
export async function syncCodexConfig(): Promise<string | null> {
  const codexDir = getCodexDir()
  if (!codexDir) {
    log.info('~/.codex/ not found — Codex not installed, skipping sync')
    return null
  }

  const results: string[] = []

  if (syncSkills(codexDir)) results.push('skills')
  if (syncAgentsMd(codexDir)) results.push('AGENTS.md')
  if (syncMcpConfig(codexDir)) results.push('MCP rex-memory')

  // Bonus: rules converter
  const rulesDir = join(homedir(), '.claude', 'rules')
  syncCodexRules(rulesDir)

  if (results.length === 0) {
    return 'Codex already in sync (skills, AGENTS.md, MCP)'
  }

  return `Codex synced: ${results.join(', ')}`
}
