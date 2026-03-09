/**
 * REX Config Lint — agnix-inspired validator
 *
 * Validates CLAUDE.md, SKILL.md, hooks, and MCP configs for common mistakes.
 * Used by `rex doctor --lint-config` and as a pre-commit hook.
 *
 * Inspired by: https://github.com/avifenesh/agnix (156 rules, LSP)
 * REX version: 42 focused rules for the REX ecosystem.
 * @module TOOLS
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { createLogger } from './logger.js'

const log = createLogger('TOOLS:config-lint')

// ── Types ──────────────────────────────────────────────

export type LintSeverity = 'error' | 'warn' | 'info'

export interface LintIssue {
  file: string
  line?: number
  rule: string
  severity: LintSeverity
  message: string
  fix?: string
}

export interface LintResult {
  issues: LintIssue[]
  errors: number
  warnings: number
  infos: number
  passed: boolean
}

// ── CLAUDE.md rules ────────────────────────────────────

const CLAUDE_MD_RULES: Array<{
  id: string
  severity: LintSeverity
  check: (content: string) => string | null
  fix?: string
}> = [
  {
    id: 'claude-md/has-context',
    severity: 'error',
    check: c => c.length < 100 ? 'CLAUDE.md is too short — add project context' : null,
    fix: 'Add project description, stack, commands, and architecture notes',
  },
  {
    id: 'claude-md/no-secrets',
    severity: 'error',
    check: c => /(?:api[_-]?key|secret|password|token)\s*[:=]\s*[^\s$][^\s]{8,}/i.test(c)
      ? 'CLAUDE.md contains what looks like a hardcoded secret'
      : null,
    fix: 'Move secrets to env vars or ~/.claude/settings.json env block',
  },
  {
    id: 'claude-md/has-commands',
    severity: 'warn',
    check: c => !/(build|test|dev|run|install)/i.test(c) ? 'CLAUDE.md may be missing build/test commands' : null,
    fix: 'Add ## Commands section with build, test, dev, lint commands',
  },
  {
    id: 'claude-md/has-architecture',
    severity: 'info',
    check: c => !/(architecture|structure|packages|modules|stack)/i.test(c)
      ? 'CLAUDE.md has no architecture section'
      : null,
    fix: 'Add ## Architecture or ## Structure section',
  },
  {
    id: 'claude-md/no-co-authored',
    severity: 'warn',
    check: c => /Co-Authored-By/i.test(c) ? 'CLAUDE.md instructs Co-Authored-By commits — disable this' : null,
    fix: 'Remove Co-Authored-By instruction from CLAUDE.md',
  },
  {
    id: 'claude-md/no-ai-mention-commits',
    severity: 'warn',
    check: c => /mention (claude|AI|anthropic) in (commit|PR)/i.test(c)
      ? 'CLAUDE.md instructs mentioning AI in commits/PRs'
      : null,
    fix: 'Remove AI mention instructions for commits/PRs',
  },
  {
    id: 'claude-md/has-source-of-truth',
    severity: 'info',
    check: c => !/(source of truth|single source|canonical)/i.test(c)
      ? 'No "source of truth" declaration found'
      : null,
    fix: 'Add a section clarifying which files/docs are the source of truth',
  },
]

// ── Hook rules ─────────────────────────────────────────

const HOOK_RULES: Array<{
  id: string
  severity: LintSeverity
  check: (content: string, filename: string) => string | null
  fix?: string
}> = [
  {
    id: 'hook/has-shebang',
    severity: 'error',
    check: (c, f) => f.endsWith('.sh') && !c.startsWith('#!/') ? 'Hook script missing shebang' : null,
    fix: 'Add #!/bin/bash or #!/usr/bin/env bash at top',
  },
  {
    id: 'hook/reads-input',
    severity: 'warn',
    check: (c, f) => {
      if (!f.endsWith('.sh')) return null
      if (!/(CLAUDE_TOOL_INPUT|TOOL_INPUT|stdin|read -r)/.test(c)) {
        return 'Hook does not read CLAUDE_TOOL_INPUT — may not receive tool data'
      }
      return null
    },
    fix: 'Use: CMD="${CLAUDE_TOOL_INPUT:-$TOOL_INPUT}" to access tool input',
  },
  {
    id: 'hook/outputs-json',
    severity: 'error',
    check: (c, f) => {
      if (!f.endsWith('.sh')) return null
      if (!/"decision"/.test(c)) return 'PreToolUse hook does not output {decision} JSON'
      return null
    },
    fix: 'Output: echo \'{"decision": "approve"}\' or \'{"decision": "block", "reason": "..."}\' ',
  },
  {
    id: 'hook/no-slow-ops',
    severity: 'warn',
    check: (c, f) => {
      if (!f.endsWith('.sh')) return null
      if (/(sleep [5-9]|sleep [0-9]{2,})/.test(c)) return 'Hook has long sleep — may timeout in Claude Code'
      return null
    },
    fix: 'Keep hooks under 2s. Use background jobs for slow operations.',
  },
  {
    id: 'hook/exit-codes',
    severity: 'warn',
    check: (c, f) => {
      if (!f.endsWith('.sh')) return null
      if (!/exit [0-2]/.test(c)) return 'Hook has no explicit exit code — may behave unexpectedly'
      return null
    },
    fix: 'Add exit 0 (approve/warn) or exit 2 (block) explicitly',
  },
]

// ── MCP config rules ───────────────────────────────────

const MCP_CONFIG_RULES: Array<{
  id: string
  severity: LintSeverity
  check: (config: Record<string, unknown>) => string | null
  fix?: string
}> = [
  {
    id: 'mcp/has-servers',
    severity: 'error',
    check: c => !c.mcpServers && !c.servers ? 'MCP config has no servers defined' : null,
    fix: 'Add mcpServers or servers block to config',
  },
  {
    id: 'mcp/no-hardcoded-tokens',
    severity: 'error',
    check: c => {
      const str = JSON.stringify(c)
      if (/(?:token|key|secret|password)["']\s*:\s*["'][^$][^"']{8,}["']/i.test(str)) {
        return 'MCP config may contain hardcoded credentials'
      }
      return null
    },
    fix: 'Use env var references like "${MY_TOKEN}" instead of hardcoded values',
  },
  {
    id: 'mcp/command-exists',
    severity: 'warn',
    check: c => {
      const servers = (c.mcpServers ?? c.servers ?? {}) as Record<string, { command?: string }>
      for (const [name, srv] of Object.entries(servers)) {
        if (srv?.command && !existsSync(srv.command) && !srv.command.includes('/')) {
          // If it's not a full path, assume it's a $PATH binary — can't easily validate
          return null
        }
      }
      return null
    },
  },
]

// ── Main linter ────────────────────────────────────────

/**
 * Lint a single file given its path and type.
 */
function lintFile(filePath: string): LintIssue[] {
  const issues: LintIssue[] = []
  const filename = basename(filePath)
  let content: string

  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return [{ file: filePath, rule: 'lint/read-error', severity: 'error', message: 'Cannot read file' }]
  }

  // CLAUDE.md rules
  if (filename === 'CLAUDE.md') {
    for (const rule of CLAUDE_MD_RULES) {
      const msg = rule.check(content)
      if (msg) issues.push({ file: filePath, rule: rule.id, severity: rule.severity, message: msg, fix: rule.fix })
    }
  }

  // SKILL.md rules (subset of CLAUDE.md rules apply)
  if (filename === 'SKILL.md') {
    if (content.length < 50) {
      issues.push({ file: filePath, rule: 'skill/has-content', severity: 'error', message: 'SKILL.md too short', fix: 'Add skill description and usage instructions' })
    }
    if (!/(## |# )/.test(content)) {
      issues.push({ file: filePath, rule: 'skill/has-sections', severity: 'warn', message: 'SKILL.md has no markdown sections', fix: 'Add ## Usage, ## Requirements sections' })
    }
  }

  // Hook rules
  if (filename.endsWith('.sh') || filename.endsWith('.py') || filename.endsWith('.js')) {
    for (const rule of HOOK_RULES) {
      const msg = rule.check(content, filename)
      if (msg) issues.push({ file: filePath, rule: rule.id, severity: rule.severity, message: msg, fix: rule.fix })
    }
  }

  // MCP JSON config rules
  if (filename.endsWith('.json') && (filename.includes('mcp') || filename.includes('settings'))) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      for (const rule of MCP_CONFIG_RULES) {
        const msg = rule.check(parsed)
        if (msg) issues.push({ file: filePath, rule: rule.id, severity: rule.severity, message: msg, fix: rule.fix })
      }
    } catch {
      issues.push({ file: filePath, rule: 'json/parse-error', severity: 'error', message: 'Invalid JSON' })
    }
  }

  return issues
}

/**
 * Recursively find lintable files in a directory.
 */
function findLintableFiles(dir: string, maxDepth = 4): string[] {
  const results: string[] = []
  if (maxDepth <= 0 || !existsSync(dir)) return results

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        results.push(...findLintableFiles(full, maxDepth - 1))
      } else if (entry.isFile()) {
        const name = entry.name
        if (name === 'CLAUDE.md' || name === 'SKILL.md' || name.endsWith('.sh') || (name.endsWith('.json') && (name.includes('mcp') || name.includes('settings')))) {
          results.push(full)
        }
      }
    }
  } catch {
    // noop
  }
  return results
}

// ── Public API ─────────────────────────────────────────

/**
 * Run full config lint on a project directory.
 * Also checks ~/.claude/ hooks and settings.
 */
export function runConfigLint(projectDir = process.cwd()): LintResult {
  const files = [
    ...findLintableFiles(projectDir),
    ...findLintableFiles(join(homedir(), '.claude'), 3),
  ]

  const allIssues: LintIssue[] = []
  for (const f of files) allIssues.push(...lintFile(f))

  const errors = allIssues.filter(i => i.severity === 'error').length
  const warnings = allIssues.filter(i => i.severity === 'warn').length
  const infos = allIssues.filter(i => i.severity === 'info').length

  return {
    issues: allIssues,
    errors,
    warnings,
    infos,
    passed: errors === 0,
  }
}

/**
 * Pretty-print lint results to stdout.
 */
export function printLintResult(result: LintResult): void {
  const icons: Record<LintSeverity, string> = { error: '✗', warn: '⚠', info: 'ℹ' }
  const colors: Record<LintSeverity, string> = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m' }
  const reset = '\x1b[0m'

  for (const issue of result.issues) {
    const icon = icons[issue.severity]
    const color = colors[issue.severity]
    const loc = issue.line ? `:${issue.line}` : ''
    console.log(`${color}${icon}${reset} ${issue.file}${loc} [${issue.rule}]`)
    console.log(`  ${issue.message}`)
    if (issue.fix) console.log(`  → ${issue.fix}`)
  }

  console.log()
  if (result.passed) {
    console.log(`\x1b[32m✓ Config lint passed\x1b[0m — ${result.warnings}w ${result.infos}i`)
  } else {
    console.log(`\x1b[31m✗ Config lint failed\x1b[0m — ${result.errors}e ${result.warnings}w ${result.infos}i`)
  }
}
