/**
 * Unit tests for activitywatch-bridge.ts — pure categorizeApp function.
 * No network calls — ActivityWatch is mocked out.
 * @module REX-MONITOR
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { categorizeApp } from '../../src/activitywatch-bridge.js'

// ── categorizeApp ─────────────────────────────────────────────────────────────

describe('categorizeApp', () => {
  it('returns a string', () => {
    expect(typeof categorizeApp('Safari')).toBe('string')
  })

  // Dev tools
  it('classifies VS Code as dev', () => {
    expect(categorizeApp('Code')).toBe('dev')
    expect(categorizeApp('Visual Studio Code')).toBe('dev')
  })

  it('classifies Cursor as dev', () => {
    expect(categorizeApp('Cursor')).toBe('dev')
  })

  it('classifies Terminal as dev', () => {
    expect(categorizeApp('Terminal')).toBe('dev')
    expect(categorizeApp('iTerm2')).toBe('dev')
  })

  it('classifies Xcode as dev', () => {
    expect(categorizeApp('Xcode')).toBe('dev')
  })

  it('classifies Zed as dev', () => {
    expect(categorizeApp('Zed')).toBe('dev')
  })

  // Browsers
  it('classifies Safari as browser', () => {
    expect(categorizeApp('Safari')).toBe('browser')
  })

  it('classifies Chrome as browser', () => {
    expect(categorizeApp('Google Chrome')).toBe('browser')
  })

  it('classifies Firefox as browser', () => {
    expect(categorizeApp('Firefox')).toBe('browser')
  })

  it('classifies Arc as browser', () => {
    expect(categorizeApp('Arc')).toBe('browser')
  })

  it('classifies Brave as browser', () => {
    expect(categorizeApp('Brave Browser')).toBe('browser')
  })

  // Communication
  it('classifies Slack as communication', () => {
    expect(categorizeApp('Slack')).toBe('communication')
  })

  it('classifies Discord as communication', () => {
    expect(categorizeApp('Discord')).toBe('communication')
  })

  it('classifies Zoom as communication', () => {
    expect(categorizeApp('Zoom')).toBe('communication')
  })

  it('classifies Telegram as communication', () => {
    expect(categorizeApp('Telegram')).toBe('communication')
  })

  it('classifies Mail as communication', () => {
    expect(categorizeApp('Mail')).toBe('communication')
  })

  // Other
  it('classifies unknown app as other', () => {
    expect(categorizeApp('Spotify')).toBe('other')
    expect(categorizeApp('Figma')).toBe('other')
    expect(categorizeApp('Finder')).toBe('other')
    expect(categorizeApp('')).toBe('other')
  })

  // Case insensitivity
  it('is case-insensitive', () => {
    expect(categorizeApp('SAFARI')).toBe('browser')
    expect(categorizeApp('CODE')).toBe('dev')
    expect(categorizeApp('SLACK')).toBe('communication')
  })

  // All 4 categories covered
  it('covers all 4 possible return values', () => {
    const values = new Set([
      categorizeApp('Code'),
      categorizeApp('Safari'),
      categorizeApp('Slack'),
      categorizeApp('Spotify'),
    ])
    expect(values).toContain('dev')
    expect(values).toContain('browser')
    expect(values).toContain('communication')
    expect(values).toContain('other')
  })
})
