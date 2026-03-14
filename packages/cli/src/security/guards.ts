/** @module TOOLS */
import { readdirSync, readFileSync, writeFileSync, chmodSync, renameSync, existsSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '../logger.js'
import { DAEMON_LOG_PATH } from '../paths.js'

const log = createLogger('TOOLS:guards')
const HOME = process.env.HOME || '~'
const GUARDS_DIR = join(HOME, '.claude', 'rex-guards')

export interface GuardInfo {
  name: string
  file: string
  description: string
  hook: string
  enabled: boolean
}

function parseGuardFile(filePath: string): Omit<GuardInfo, 'enabled'> | null {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').slice(0, 6)
    const descLine = lines.find(l => l.startsWith('# REX Guard:'))
    const hookLine = lines.find(l => l.startsWith('# Hook:'))
    return {
      name: basename(filePath).replace(/\.(sh|disabled)$/g, ''),
      file: basename(filePath),
      description: descLine ? descLine.replace('# REX Guard:', '').trim() : 'No description',
      hook: hookLine ? hookLine.replace('# Hook:', '').trim() : 'unknown',
    }
  } catch {
    return null
  }
}

export function listGuards(): GuardInfo[] {
  if (!existsSync(GUARDS_DIR)) {
    log.warn(`Guards directory not found: ${GUARDS_DIR}`)
    return []
  }

  const files = readdirSync(GUARDS_DIR)
  const guards: GuardInfo[] = []

  for (const file of files) {
    const isScript = file.endsWith('.sh') || file.endsWith('.sh.disabled')
    if (!isScript) continue

    const filePath = join(GUARDS_DIR, file)
    const info = parseGuardFile(filePath)
    if (!info) continue

    const stat = statSync(filePath)
    const isExecutable = (stat.mode & 0o111) !== 0
    const isDisabled = file.endsWith('.disabled')

    guards.push({
      ...info,
      enabled: isExecutable && !isDisabled,
    })
  }

  return guards.sort((a, b) => a.name.localeCompare(b.name))
}

export function enableGuard(name: string): boolean {
  const guards = listGuards()
  const guard = guards.find(g => g.name === name)
  if (!guard) {
    log.error(`Guard not found: ${name}`)
    return false
  }

  const filePath = join(GUARDS_DIR, guard.file)

  if (guard.file.endsWith('.disabled')) {
    const newPath = filePath.replace(/\.disabled$/, '')
    renameSync(filePath, newPath)
    chmodSync(newPath, 0o755)
    log.info(`Guard enabled: ${name}`)
  } else {
    chmodSync(filePath, 0o755)
    log.info(`Guard enabled: ${name}`)
  }

  return true
}

export function disableGuard(name: string): boolean {
  const guards = listGuards()
  const guard = guards.find(g => g.name === name)
  if (!guard) {
    log.error(`Guard not found: ${name}`)
    return false
  }

  const filePath = join(GUARDS_DIR, guard.file)

  if (!guard.file.endsWith('.disabled')) {
    const newPath = filePath + '.disabled'
    renameSync(filePath, newPath)
    chmodSync(newPath, 0o644)
    log.info(`Guard disabled: ${name}`)
  } else {
    chmodSync(filePath, 0o644)
    log.info(`Guard disabled: ${name}`)
  }

  return true
}

// ── Registry ─────────────────────────────────────────────────────────────────

/** Directory of built-in guard templates (co-located with this source file). */
function getRegistryDir(): string {
  // Works both from source (src/guards/) and installed (dist/../src/guards/)
  const thisFile = fileURLToPath(import.meta.url)
  const candidates = [
    join(dirname(thisFile), '..', 'src', 'guards'),   // installed: dist/ → src/guards/
    join(dirname(thisFile), 'guards'),                  // source: src/guards/
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fallback: installed rex-claude package
  return join(HOME, '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', 'rex-claude', 'src', 'guards')
}

export function listRegistry(): string[] {
  const dir = getRegistryDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.sh'))
    .map(f => f.replace(/\.sh$/, ''))
    .sort()
}

/** Copy a guard from the built-in registry to ~/.claude/rex-guards/ */
export function addGuard(name: string): { ok: boolean; message: string } {
  const registryDir = getRegistryDir()
  const src = join(registryDir, `${name}.sh`)

  if (!existsSync(src)) {
    const available = listRegistry().join(', ')
    return { ok: false, message: `Guard '${name}' not found in registry. Available: ${available}` }
  }

  if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })

  const dest = join(GUARDS_DIR, `${name}.sh`)
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  log.info(`Guard added: ${name} → ${dest}`)
  return { ok: true, message: `Guard '${name}' installed to ${dest}` }
}

const GUARD_TEMPLATE = (name: string) => `#!/bin/bash
# REX Guard: ${name}
# Hook: PostToolUse (matcher: Edit|Write)
# Detects: <describe what this guard checks>
# Action: WARNING

INPUT="\${CLAUDE_TOOL_INPUT:-\$TOOL_INPUT}"

# Only check relevant file types
if ! echo "\$INPUT" | grep -qE '\\.(ts|tsx|js|jsx)'; then
  exit 0
fi

# Extract file path from tool input
FILE_PATH=\$(echo "\$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\\.(ts|tsx|js|jsx)' | head -1)
if [ -z "\$FILE_PATH" ] || [ ! -f "\$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""

# TODO: Add your grep checks here
# Example:
# if grep -qE 'some_pattern' "\$FILE_PATH" 2>/dev/null; then
#   ISSUES="\${ISSUES}\\n  - Found problematic pattern"
# fi

if [ -n "\$ISSUES" ]; then
  echo "REX Guard [${name}]: Issues found in \${FILE_PATH}:"
  echo -e "\$ISSUES"
fi

exit 0
`

/** Create a new custom guard from a template */
export function createGuard(name: string): { ok: boolean; message: string; path?: string } {
  if (!name.match(/^[a-z0-9-]+$/)) {
    return { ok: false, message: 'Guard name must be lowercase letters, numbers, and hyphens only' }
  }

  if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })

  const dest = join(GUARDS_DIR, `${name}.sh`)
  if (existsSync(dest)) {
    return { ok: false, message: `Guard '${name}' already exists at ${dest}` }
  }

  writeFileSync(dest, GUARD_TEMPLATE(name))
  chmodSync(dest, 0o755)
  log.info(`Guard created: ${name} → ${dest}`)
  return { ok: true, message: `Guard '${name}' created at ${dest}. Edit it to add your logic.`, path: dest }
}

export function getGuardLogs(name?: string, limit = 30): string[] {
  if (!existsSync(DAEMON_LOG_PATH)) return []

  try {
    const content = readFileSync(DAEMON_LOG_PATH, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    const filtered = name
      ? lines.filter(l => l.toLowerCase().includes('guard') && l.toLowerCase().includes(name.toLowerCase()))
      : lines.filter(l => l.toLowerCase().includes('guard'))

    return filtered.slice(-limit)
  } catch {
    return []
  }
}

// ── Guard AST — Dippy-inspired bash command safety analyzer ──────────────────
//
// Parses bash commands structurally (token-level AST) rather than regex-only.
// Used by PreToolUse hooks and `rex doctor` to analyze command safety.
//
// Inspired by: https://github.com/ldayton/Dippy
// Auto-approves safe commands, blocks/warns destructive ones.

// ── Types ──────────────────────────────────────────────

export type SafetyLevel = 'safe' | 'warn' | 'block'

export interface CommandAnalysis {
  level: SafetyLevel
  reason: string
  command: string
  tokens: string[]
  flags: string[]
  subcommands: string[]
}

// ── Destructive patterns (structured) ─────────────────

/** Commands that are ALWAYS blocked regardless of flags */
const BLOCKED_COMMANDS: Array<{ cmd: string; args?: string[]; flags?: string[]; reason: string }> = [
  { cmd: 'rm', args: ['-rf', '/'], reason: 'Deletes entire filesystem' },
  { cmd: 'rm', args: ['-rf', '~'], reason: 'Deletes home directory' },
  { cmd: 'rm', args: ['-rf', '$HOME'], reason: 'Deletes home directory' },
  { cmd: 'git', args: ['push', '--force', 'origin', 'main'], reason: 'Force push to main branch' },
  { cmd: 'git', args: ['push', '--force', 'origin', 'master'], reason: 'Force push to master branch' },
  { cmd: 'git', args: ['push', '-f', 'origin', 'main'], reason: 'Force push to main branch' },
  { cmd: 'git', args: ['push', '-f', 'origin', 'master'], reason: 'Force push to master branch' },
  { cmd: 'git', args: ['reset', '--hard', 'HEAD~'], reason: 'Destructive history rewrite' },
  { cmd: 'git', args: ['clean', '-fd'], reason: 'Deletes untracked files' },
  { cmd: 'git', args: ['clean', '-fxd'], reason: 'Deletes all untracked + ignored files' },
  { cmd: 'npx', args: ['--yes'], reason: 'Auto-executes remote code without review' },
  { cmd: 'curl', flags: ['|', 'bash'], reason: 'Pipe remote script to bash' },
  { cmd: 'curl', flags: ['|', 'sh'], reason: 'Pipe remote script to sh' },
  { cmd: 'wget', flags: ['|', 'bash'], reason: 'Pipe remote script to bash' },
]

/** SQL statements that are always destructive */
const BLOCKED_SQL = ['DROP TABLE', 'DROP DATABASE', 'DROP SCHEMA', 'TRUNCATE ', 'DELETE FROM .*WHERE 1=1']

/** Commands that require a warning (not blocked) */
const WARN_COMMANDS: Array<{ cmd: string; args?: string[]; reason: string }> = [
  { cmd: 'rm', args: ['-rf'], reason: 'Recursive forced delete — verify target carefully' },
  { cmd: 'git', args: ['push', '--force'], reason: 'Force push — verify branch is not protected' },
  { cmd: 'chmod', args: ['777'], reason: 'World-writable permissions — security risk' },
  { cmd: 'npm', args: ['publish'], reason: 'Publishing to npm registry' },
  { cmd: 'git', args: ['rebase', '--onto'], reason: 'Complex history rewrite' },
  { cmd: 'sudo', reason: 'Elevated privileges' },
  { cmd: 'kill', args: ['-9'], reason: 'Force kill process' },
]

/** Commands that are always safe (fast-approve) */
const SAFE_PREFIXES = [
  'cat ', 'ls ', 'pwd', 'echo ', 'grep ', 'head ', 'tail ', 'wc ', 'sort ', 'uniq ',
  'git status', 'git log', 'git diff', 'git show', 'git branch', 'git remote',
  'git fetch', 'git stash list', 'npm list', 'pnpm list', 'node --version',
  'which ', 'type ', 'file ', 'stat ', 'du ', 'df ', 'uname ', 'date',
]

// ── Parser ─────────────────────────────────────────────

/**
 * Tokenize a shell command, handling pipes, semicolons, &&, ||
 * Returns the list of individual subcommands.
 */
function tokenizeCommand(raw: string): string[][] {
  // Split on pipe, semicolon, &&, || to get individual commands
  const parts = raw.split(/\s*(?:\||;|&&|\|\|)\s*/g).filter(Boolean)
  return parts.map(p => p.trim().split(/\s+/).filter(Boolean))
}

/**
 * Check if tokens include all required args (subset match).
 */
function tokensMatch(tokens: string[], required: string[]): boolean {
  return required.every(r => tokens.some(t => t === r || t.includes(r)))
}

/**
 * Analyze a single tokenized command.
 */
function analyzeTokens(tokens: string[]): CommandAnalysis {
  const [cmd, ...rest] = tokens
  const rawCmd = tokens.join(' ')

  // Fast-approve safe prefixes
  for (const safe of SAFE_PREFIXES) {
    if (rawCmd.startsWith(safe) || rawCmd === safe.trim()) {
      return { level: 'safe', reason: 'Known safe command', command: rawCmd, tokens, flags: rest, subcommands: [] }
    }
  }

  // Check SQL patterns
  for (const sql of BLOCKED_SQL) {
    if (new RegExp(sql, 'i').test(rawCmd)) {
      return { level: 'block', reason: `Destructive SQL: ${sql}`, command: rawCmd, tokens, flags: rest, subcommands: [] }
    }
  }

  // Check blocked command patterns
  for (const rule of BLOCKED_COMMANDS) {
    if (cmd === rule.cmd) {
      const argsMatch = !rule.args || tokensMatch(tokens, rule.args)
      const flagMatch = !rule.flags || tokensMatch(tokens, rule.flags)
      if (argsMatch && flagMatch) {
        return { level: 'block', reason: rule.reason, command: rawCmd, tokens, flags: rest, subcommands: [] }
      }
    }
  }

  // Check warn patterns
  for (const rule of WARN_COMMANDS) {
    if (cmd === rule.cmd) {
      const argsMatch = !rule.args || tokensMatch(tokens, rule.args)
      if (argsMatch) {
        return { level: 'warn', reason: rule.reason, command: rawCmd, tokens, flags: rest, subcommands: [] }
      }
    }
  }

  return { level: 'safe', reason: 'No dangerous patterns found', command: rawCmd, tokens, flags: rest, subcommands: [] }
}

// ── Guard AST Public API ─────────────────────────────────────────

/**
 * Analyze a full bash command string (may contain pipes, semicolons, etc.)
 * Returns the worst safety level found across all subcommands.
 */
export function analyzeCommand(raw: string): CommandAnalysis {
  const subcommands = tokenizeCommand(raw)
  let worst: CommandAnalysis = {
    level: 'safe',
    reason: 'No dangerous patterns found',
    command: raw,
    tokens: [],
    flags: [],
    subcommands: subcommands.map(s => s.join(' ')),
  }

  for (const tokens of subcommands) {
    const result = analyzeTokens(tokens)
    if (result.level === 'block') return { ...result, command: raw, subcommands: worst.subcommands }
    if (result.level === 'warn' && worst.level === 'safe') worst = { ...result, command: raw, subcommands: worst.subcommands }
  }

  return worst
}

/**
 * Format result as Claude Code hook JSON (PreToolUse format).
 */
export function toHookResponse(analysis: CommandAnalysis): string {
  if (analysis.level === 'block') {
    return JSON.stringify({ decision: 'block', reason: `REX Guard: ${analysis.reason}` })
  }
  if (analysis.level === 'warn') {
    return JSON.stringify({ decision: 'approve', note: `REX Guard ⚠️ ${analysis.reason}` })
  }
  return JSON.stringify({ decision: 'approve' })
}

/**
 * CLI entry point — reads CLAUDE_TOOL_INPUT env var and outputs hook JSON.
 */
export function runGuardCli(): void {
  const cmd = process.env.CLAUDE_TOOL_INPUT ?? process.env.TOOL_INPUT ?? ''
  if (!cmd) {
    process.stdout.write(JSON.stringify({ decision: 'approve' }) + '\n')
    return
  }
  const analysis = analyzeCommand(cmd)
  process.stdout.write(toHookResponse(analysis) + '\n')
  if (analysis.level === 'block') process.exit(2)
}
