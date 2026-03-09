/**
 * REX Guard AST — Dippy-inspired bash command safety analyzer
 *
 * Parses bash commands structurally (token-level AST) rather than regex-only.
 * Used by PreToolUse hooks and `rex doctor` to analyze command safety.
 *
 * Inspired by: https://github.com/ldayton/Dippy
 * Auto-approves safe commands, blocks/warns destructive ones.
 */

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

// ── Public API ─────────────────────────────────────────

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
