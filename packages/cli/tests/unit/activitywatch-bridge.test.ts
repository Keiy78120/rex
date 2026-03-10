/**
 * Unit tests for activitywatch-bridge.ts — categorizeApp pure function.
 * Tests app categorization logic without network calls.
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
    expect(typeof categorizeApp('code')).toBe('string')
  })

  it('categorizes VS Code as dev', () => {
    expect(categorizeApp('Code')).toBe('dev')
    expect(categorizeApp('Visual Studio Code')).toBe('dev')
  })

  it('categorizes Terminal as dev', () => {
    expect(categorizeApp('Terminal')).toBe('dev')
    expect(categorizeApp('iTerm2')).toBe('dev')
    expect(categorizeApp('iterm')).toBe('dev')
  })

  it('categorizes Cursor as dev', () => {
    expect(categorizeApp('Cursor')).toBe('dev')
  })

  it('categorizes Xcode as dev', () => {
    expect(categorizeApp('Xcode')).toBe('dev')
  })

  it('categorizes Safari as browser', () => {
    expect(categorizeApp('Safari')).toBe('browser')
  })

  it('categorizes Chrome as browser', () => {
    expect(categorizeApp('Google Chrome')).toBe('browser')
    expect(categorizeApp('chrome')).toBe('browser')
  })

  it('categorizes Arc as browser', () => {
    expect(categorizeApp('Arc')).toBe('browser')
  })

  it('categorizes Slack as communication', () => {
    expect(categorizeApp('Slack')).toBe('communication')
  })

  it('categorizes Telegram as communication', () => {
    expect(categorizeApp('Telegram')).toBe('communication')
  })

  it('categorizes Zoom as communication', () => {
    expect(categorizeApp('Zoom')).toBe('communication')
  })

  it('categorizes unknown app as other', () => {
    expect(categorizeApp('Spotify')).toBe('other')
    expect(categorizeApp('Figma')).toBe('other')
    expect(categorizeApp('Notion')).toBe('communication') // notion is in COMM_APPS
  })

  it('is case-insensitive', () => {
    expect(categorizeApp('CODE')).toBe('dev')
    expect(categorizeApp('SAFARI')).toBe('browser')
    expect(categorizeApp('SLACK')).toBe('communication')
  })

  it('unknown apps return other', () => {
    expect(categorizeApp('')).toBe('other')
    expect(categorizeApp('RandomApp')).toBe('other')
    expect(categorizeApp('Minecraft')).toBe('other')
  })
})
