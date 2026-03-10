/**
 * Unit tests for sandbox.ts — detectRuntime, getSandboxStatus.
 * Shell calls mocked.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execSync: vi.fn(() => { throw new Error('not found') }),
    spawn: vi.fn(() => ({ on: vi.fn(), stdin: { write: vi.fn(), end: vi.fn() } })),
  }
})

import { detectRuntime, getSandboxStatus } from '../../src/sandbox.js'

// ── detectRuntime ─────────────────────────────────────────────────────────────

describe('detectRuntime', () => {
  it('returns "none" for mode "off"', () => {
    expect(detectRuntime('off')).toBe('none')
  })

  it('returns a valid runtime string for "light"', () => {
    const runtime = detectRuntime('light')
    expect(['seatbelt', 'docker', 'none']).toContain(runtime)
  })

  it('returns a valid runtime string for "full"', () => {
    const runtime = detectRuntime('full')
    expect(['seatbelt', 'docker', 'none']).toContain(runtime)
  })

  it('returns "none" when docker and seatbelt are unavailable', () => {
    // existsSync returns false (no /usr/bin/sandbox-exec)
    // execSync throws (no docker)
    const runtime = detectRuntime('light')
    expect(runtime).toBe('none')
  })
})

// ── getSandboxStatus ──────────────────────────────────────────────────────────

describe('getSandboxStatus', () => {
  it('returns an object', () => {
    const status = getSandboxStatus()
    expect(typeof status).toBe('object')
    expect(status).not.toBeNull()
  })

  it('has mode property', () => {
    const status = getSandboxStatus('light')
    expect(status).toHaveProperty('mode')
    expect(status.mode).toBe('light')
  })

  it('has runtimes array', () => {
    const status = getSandboxStatus()
    expect(status).toHaveProperty('runtimes')
    expect(Array.isArray(status.runtimes)).toBe(true)
  })

  it('has activeRuntime string', () => {
    const status = getSandboxStatus()
    expect(status).toHaveProperty('activeRuntime')
    expect(typeof status.activeRuntime).toBe('string')
  })

  it('activeRuntime is none when no tools available', () => {
    const status = getSandboxStatus('light')
    // docker throws, seatbelt existsSync=false → none
    expect(status.activeRuntime).toBe('none')
  })

  it('accepts "full" mode', () => {
    const status = getSandboxStatus('full')
    expect(status.mode).toBe('full')
  })
})
