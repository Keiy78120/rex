/**
 * Unit tests for platform-warnings.ts — detectPlatform and getPlatformReport.
 * Tests structure and shape of platform detection results.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-platform-test',
  ensureRexDirs: vi.fn(),
}))

import {
  detectPlatform,
  getPlatformReport,
  type PlatformProfile,
} from '../../src/platform-warnings.js'

// ── detectPlatform ────────────────────────────────────────────────────────────

describe('detectPlatform', () => {
  it('returns a string', () => {
    expect(typeof detectPlatform()).toBe('string')
  })

  it('returns a known PlatformProfile value', () => {
    const valid: PlatformProfile[] = ['macos', 'linux-gpu', 'linux-no-gpu', 'docker', 'windows-wsl2', 'unknown']
    expect(valid).toContain(detectPlatform())
  })

  it('returns "macos" on this machine (darwin)', () => {
    // This test runs on Kevin's Mac — darwin → macos
    expect(detectPlatform()).toBe('macos')
  })
})

// ── getPlatformReport ─────────────────────────────────────────────────────────

describe('getPlatformReport', () => {
  it('returns an object with required fields', () => {
    const report = getPlatformReport()
    expect(report).toHaveProperty('profile')
    expect(report).toHaveProperty('os')
    expect(report).toHaveProperty('arch')
    expect(report).toHaveProperty('cpuCores')
    expect(report).toHaveProperty('appleM')
    expect(report).toHaveProperty('hasGpu')
    expect(report).toHaveProperty('isDocker')
    expect(report).toHaveProperty('warnings')
  })

  it('warnings is an array', () => {
    expect(Array.isArray(getPlatformReport().warnings)).toBe(true)
  })

  it('cpuCores is a positive integer', () => {
    const { cpuCores } = getPlatformReport()
    expect(typeof cpuCores).toBe('number')
    expect(cpuCores).toBeGreaterThan(0)
    expect(Number.isInteger(cpuCores)).toBe(true)
  })

  it('os string is non-empty', () => {
    expect(getPlatformReport().os.length).toBeGreaterThan(0)
  })

  it('arch string is non-empty', () => {
    expect(getPlatformReport().arch.length).toBeGreaterThan(0)
  })

  it('profile matches detectPlatform()', () => {
    expect(getPlatformReport().profile).toBe(detectPlatform())
  })

  it('appleM is boolean', () => {
    expect(typeof getPlatformReport().appleM).toBe('boolean')
  })

  it('isDocker is false in CI/local (not running in container)', () => {
    // On Kevin's mac: not docker
    expect(getPlatformReport().isDocker).toBe(false)
  })

  it('each warning has feature, reason, alternative fields', () => {
    for (const w of getPlatformReport().warnings) {
      expect(w).toHaveProperty('feature')
      expect(w).toHaveProperty('reason')
      expect(w).toHaveProperty('alternative')
    }
  })

  it('macos profile has no warnings', () => {
    // macOS is the "happy path" — no warnings expected
    const report = getPlatformReport()
    if (report.profile === 'macos') {
      expect(report.warnings).toHaveLength(0)
    }
  })
})
