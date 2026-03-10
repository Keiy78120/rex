/**
 * Unit tests for guard-ast.ts — bash command safety analyzer.
 * Tests analyzeCommand and toHookResponse with no external dependencies.
 * @module TOOLS
 */
import { describe, it, expect } from 'vitest'

import {
  analyzeCommand,
  toHookResponse,
  type CommandAnalysis,
} from '../../src/guard-ast.js'

// ── analyzeCommand — BLOCKED commands ────────────────────────────────────────

describe('analyzeCommand — blocked commands', () => {
  it('blocks rm -rf /', () => {
    const r = analyzeCommand('rm -rf /')
    expect(r.level).toBe('block')
  })

  it('blocks rm -rf ~', () => {
    const r = analyzeCommand('rm -rf ~')
    expect(r.level).toBe('block')
  })

  it('blocks git push --force origin main', () => {
    const r = analyzeCommand('git push --force origin main')
    expect(r.level).toBe('block')
  })

  it('blocks git push -f origin master', () => {
    const r = analyzeCommand('git push -f origin master')
    expect(r.level).toBe('block')
  })

  it('blocks git reset --hard HEAD~', () => {
    const r = analyzeCommand('git reset --hard HEAD~')
    expect(r.level).toBe('block')
  })

  it('blocks git clean -fd', () => {
    const r = analyzeCommand('git clean -fd')
    expect(r.level).toBe('block')
  })

  it('blocks npx --yes', () => {
    const r = analyzeCommand('npx --yes some-package')
    expect(r.level).toBe('block')
  })

  it('returns reason for blocked command', () => {
    const r = analyzeCommand('rm -rf /')
    expect(r.reason.length).toBeGreaterThan(0)
  })

  it('returns correct command in result', () => {
    const cmd = 'rm -rf /'
    const r = analyzeCommand(cmd)
    expect(r.command).toBe(cmd)
  })
})

// ── analyzeCommand — WARN commands ───────────────────────────────────────────

describe('analyzeCommand — warn commands', () => {
  it('warns for sudo', () => {
    const r = analyzeCommand('sudo apt install something')
    expect(r.level).toBe('warn')
  })

  it('warns for npm publish', () => {
    const r = analyzeCommand('npm publish')
    expect(r.level).toBe('warn')
  })

  it('warns for chmod 777', () => {
    const r = analyzeCommand('chmod 777 myfile.txt')
    expect(r.level).toBe('warn')
  })

  it('warns for kill -9', () => {
    const r = analyzeCommand('kill -9 12345')
    expect(r.level).toBe('warn')
  })

  it('warns for git push --force (without protected branch)', () => {
    const r = analyzeCommand('git push --force')
    expect(r.level).toBe('warn')
  })

  it('warns for git rebase --onto', () => {
    const r = analyzeCommand('git rebase --onto main feature')
    expect(r.level).toBe('warn')
  })

  it('returns reason for warned command', () => {
    const r = analyzeCommand('sudo ls')
    expect(r.reason.length).toBeGreaterThan(0)
  })
})

// ── analyzeCommand — SAFE commands ───────────────────────────────────────────

describe('analyzeCommand — safe commands', () => {
  it('approves git status', () => {
    expect(analyzeCommand('git status').level).toBe('safe')
  })

  it('approves git log', () => {
    expect(analyzeCommand('git log --oneline').level).toBe('safe')
  })

  it('approves cat file.txt', () => {
    expect(analyzeCommand('cat package.json').level).toBe('safe')
  })

  it('approves ls -la', () => {
    expect(analyzeCommand('ls -la').level).toBe('safe')
  })

  it('approves grep pattern file', () => {
    expect(analyzeCommand('grep "pattern" file.txt').level).toBe('safe')
  })

  it('approves node --version', () => {
    expect(analyzeCommand('node --version').level).toBe('safe')
  })

  it('approves pnpm list', () => {
    expect(analyzeCommand('pnpm list').level).toBe('safe')
  })

  it('approves echo text', () => {
    expect(analyzeCommand('echo hello world').level).toBe('safe')
  })

  it('approves git diff', () => {
    expect(analyzeCommand('git diff').level).toBe('safe')
  })
})

// ── analyzeCommand — structure ────────────────────────────────────────────────

describe('analyzeCommand — result structure', () => {
  it('always returns CommandAnalysis with required fields', () => {
    const r = analyzeCommand('ls -la')
    expect(r).toHaveProperty('level')
    expect(r).toHaveProperty('reason')
    expect(r).toHaveProperty('command')
    expect(r).toHaveProperty('tokens')
    expect(r).toHaveProperty('flags')
    expect(r).toHaveProperty('subcommands')
  })

  it('level is one of: safe | warn | block', () => {
    const levels = new Set(['safe', 'warn', 'block'])
    expect(levels.has(analyzeCommand('ls').level)).toBe(true)
    expect(levels.has(analyzeCommand('sudo rm').level)).toBe(true)
    expect(levels.has(analyzeCommand('rm -rf /').level)).toBe(true)
  })

  it('handles empty string gracefully', () => {
    expect(() => analyzeCommand('')).not.toThrow()
  })

  it('handles piped command — worst subcommand wins (rm -rf / after echo)', () => {
    // A safe echo piped into rm -rf / should still block
    const r = analyzeCommand('echo hello; rm -rf /')
    expect(r.level).toBe('block')
  })
})

// ── toHookResponse ────────────────────────────────────────────────────────────

describe('toHookResponse', () => {
  const makeAnalysis = (level: CommandAnalysis['level']): CommandAnalysis => ({
    level,
    reason: `Test reason for ${level}`,
    command: 'test command',
    tokens: ['test', 'command'],
    flags: [],
    subcommands: ['test command'],
  })

  it('returns valid JSON string', () => {
    expect(() => JSON.parse(toHookResponse(makeAnalysis('safe')))).not.toThrow()
  })

  it('returns decision:approve for safe', () => {
    const parsed = JSON.parse(toHookResponse(makeAnalysis('safe')))
    expect(parsed.decision).toBe('approve')
  })

  it('returns decision:block for block', () => {
    const parsed = JSON.parse(toHookResponse(makeAnalysis('block')))
    expect(parsed.decision).toBe('block')
  })

  it('returns decision:approve with note for warn', () => {
    const parsed = JSON.parse(toHookResponse(makeAnalysis('warn')))
    expect(parsed.decision).toBe('approve')
    expect(parsed.note).toBeDefined()
    expect(parsed.note).toContain('REX Guard')
  })

  it('block response includes reason', () => {
    const parsed = JSON.parse(toHookResponse(makeAnalysis('block')))
    expect(parsed.reason).toContain('REX Guard')
  })

  it('safe response has no note or reason', () => {
    const parsed = JSON.parse(toHookResponse(makeAnalysis('safe')))
    expect(parsed.note).toBeUndefined()
    expect(parsed.reason).toBeUndefined()
  })
})
