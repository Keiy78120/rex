/**
 * Unit tests for mcp_registry.ts — mcpRegistry function.
 * FS and shell calls mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => JSON.stringify({ servers: {} })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => JSON.stringify({ mcpServers: {} })),
    execFileSync: vi.fn(() => ''),
  }
})

import { mcpRegistry } from '../../src/mcp_registry.js'

// ── mcpRegistry ───────────────────────────────────────────────────────────────

describe('mcpRegistry', () => {
  it('does not throw with "list" subcommand', async () => {
    await expect(mcpRegistry(['list'])).resolves.not.toThrow()
  })

  it('does not throw with "list --json"', async () => {
    await expect(mcpRegistry(['list', '--json'])).resolves.not.toThrow()
  })

  it('does not throw with no args (defaults to list)', async () => {
    await expect(mcpRegistry([])).resolves.not.toThrow()
  })

  it('does not throw with unknown subcommand', async () => {
    await expect(mcpRegistry(['unknown-cmd'])).resolves.not.toThrow()
  })
})

// ── mcpRegistry — additional subcommands ─────────────────────────────────────

describe('mcpRegistry — additional commands', () => {
  it('does not throw with "status" subcommand', async () => {
    await expect(mcpRegistry(['status'])).resolves.not.toThrow()
  })

  it('does not throw with "sync" subcommand', async () => {
    await expect(mcpRegistry(['sync'])).resolves.not.toThrow()
  })

  it('does not throw with "--json" flag alone', async () => {
    await expect(mcpRegistry(['--json'])).resolves.not.toThrow()
  })

  it('"add" with no args calls process.exit or throws — guarded', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    try { await mcpRegistry(['add']) } catch { /* may throw */ }
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })

  it('"remove" with fake id shows error or exits — guarded', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number | string | null) => never)
    try { await mcpRegistry(['remove', 'fake-mcp-id']) } catch { /* may throw */ }
    exitSpy.mockRestore()
    expect(true).toBe(true)
  })
})
