/**
 * Unit tests for dev-monitor.ts — formatDevStatusTelegram pure function.
 * No filesystem or git access required.
 * @module REX-MONITOR
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-dev-monitor-test',
  ensureRexDirs: vi.fn(),
  DAEMON_LOG_PATH: '/tmp/rex-dev-monitor-test/daemon.log',
  MEMORY_DB_PATH: '/tmp/rex-dev-monitor-test/rex.sqlite',
}))

import {
  formatDevStatusTelegram,
  type DevStatusReport,
  type CommitSummary,
} from '../../src/dev-monitor.js'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<DevStatusReport> = {}): DevStatusReport {
  return {
    generatedAt: '2026-03-10T22:00:00.000Z',
    period: '24h',
    commits: [],
    totalCommits: 0,
    sessionCount: 0,
    pendingMemories: 0,
    curiousNew: 0,
    topProjects: [],
    ...overrides,
  }
}

function makeCommit(overrides: Partial<CommitSummary> = {}): CommitSummary {
  return {
    repo: 'my-project',
    path: '/Users/dev/my-project',
    count: 3,
    lastMessage: 'feat: add new feature',
    branch: 'main',
    ...overrides,
  }
}

// ── formatDevStatusTelegram ───────────────────────────────────────────────────

describe('formatDevStatusTelegram', () => {
  it('returns a string', () => {
    expect(typeof formatDevStatusTelegram(makeReport())).toBe('string')
  })

  it('contains the "Dev Status" header', () => {
    const out = formatDevStatusTelegram(makeReport())
    expect(out).toContain('Dev Status')
  })

  it('includes session count in output', () => {
    const out = formatDevStatusTelegram(makeReport({ sessionCount: 7 }))
    expect(out).toContain('7')
  })

  it('includes total commits in output', () => {
    const out = formatDevStatusTelegram(makeReport({ totalCommits: 12 }))
    expect(out).toContain('12')
  })

  it('shows "Active repos" section when commits exist', () => {
    const report = makeReport({
      commits: [makeCommit()],
      totalCommits: 3,
    })
    const out = formatDevStatusTelegram(report)
    expect(out).toContain('Active repos')
  })

  it('does not show "Active repos" when no commits', () => {
    const out = formatDevStatusTelegram(makeReport({ commits: [], totalCommits: 0 }))
    expect(out).not.toContain('Active repos')
  })

  it('includes repo name in commit listing', () => {
    const report = makeReport({
      commits: [makeCommit({ repo: 'super-repo' })],
      totalCommits: 3,
    })
    const out = formatDevStatusTelegram(report)
    expect(out).toContain('super-repo')
  })

  it('truncates long commit messages at 50 chars', () => {
    const longMsg = 'x'.repeat(80)
    const report = makeReport({
      commits: [makeCommit({ lastMessage: longMsg })],
      totalCommits: 1,
    })
    const out = formatDevStatusTelegram(report)
    // Message should be truncated — the full 80-char string should not appear
    expect(out).not.toContain(longMsg)
    expect(out).toContain('x'.repeat(50))
  })

  it('shows pending memories when > 0', () => {
    const out = formatDevStatusTelegram(makeReport({ pendingMemories: 42 }))
    expect(out).toContain('42')
    expect(out).toContain('pending')
  })

  it('does not show pending memories line when pendingMemories = 0', () => {
    const out = formatDevStatusTelegram(makeReport({ pendingMemories: 0 }))
    expect(out).not.toContain('pending embed')
  })

  it('lists at most 5 repos', () => {
    const commits = Array.from({ length: 10 }, (_, i) =>
      makeCommit({ repo: `repo-${i}`, count: i + 1 })
    )
    const out = formatDevStatusTelegram(makeReport({ commits, totalCommits: 55 }))
    // Only first 5 repos should appear
    expect(out).toContain('repo-0')
    expect(out).toContain('repo-4')
    expect(out).not.toContain('repo-5')
  })

  it('handles empty report gracefully', () => {
    expect(() => formatDevStatusTelegram(makeReport())).not.toThrow()
  })

  it('Markdown: bold header uses asterisks', () => {
    const out = formatDevStatusTelegram(makeReport())
    // Telegram markdown uses *text* for bold
    expect(out).toContain('*Dev Status')
  })

  it('commit messages appear in code format (backticks)', () => {
    const report = makeReport({
      commits: [makeCommit({ repo: 'rex' })],
      totalCommits: 2,
    })
    const out = formatDevStatusTelegram(report)
    // Repo is wrapped in backticks: `repo`
    expect(out).toContain('`rex`')
  })
})
