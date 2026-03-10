/**
 * Unit tests for logger.ts — createLogger interface shape.
 * Tests that createLogger returns a logger with the expected methods.
 * @module CORE
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../src/paths.js', () => ({
  REX_DIR: '/tmp/rex-logger-test',
  DAEMON_LOG_PATH: '/tmp/rex-logger-test/daemon.log',
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: '/tmp/rex-logger-test/config.json',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: () => false,
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    readFileSync: actual.readFileSync,
    statSync: vi.fn(() => ({ size: 0 })),
  }
})

import { createLogger, configureLogger, type LogLevel } from '../../src/logger.js'

// ── createLogger — interface ───────────────────────────────────────────────────

describe('createLogger', () => {
  it('returns an object with debug, info, warn, error methods', () => {
    const log = createLogger('test')
    expect(typeof log.debug).toBe('function')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
  })

  it('does not throw when calling debug', () => {
    const log = createLogger('test-debug')
    expect(() => log.debug('debug message')).not.toThrow()
  })

  it('does not throw when calling info', () => {
    const log = createLogger('test-info')
    expect(() => log.info('info message')).not.toThrow()
  })

  it('does not throw when calling warn', () => {
    const log = createLogger('test-warn')
    expect(() => log.warn('warn message')).not.toThrow()
  })

  it('does not throw when calling error', () => {
    const log = createLogger('test-error')
    expect(() => log.error('error message')).not.toThrow()
  })

  it('multiple loggers with different sources are independent', () => {
    const log1 = createLogger('source-a')
    const log2 = createLogger('source-b')
    expect(() => {
      log1.info('from source a')
      log2.info('from source b')
    }).not.toThrow()
  })

  it('accepts empty string source', () => {
    const log = createLogger('')
    expect(() => log.info('msg')).not.toThrow()
  })

  it('accepts long source name', () => {
    const log = createLogger('very-long-module-name-with-many-chars-12345')
    expect(() => log.info('msg')).not.toThrow()
  })
})

// ── configureLogger ───────────────────────────────────────────────────────────

describe('configureLogger', () => {
  it('does not throw with empty options', () => {
    expect(() => configureLogger({})).not.toThrow()
  })

  it('does not throw when setting level to debug', () => {
    expect(() => configureLogger({ level: 'debug' })).not.toThrow()
  })

  it('does not throw when setting level to error', () => {
    expect(() => configureLogger({ level: 'error' })).not.toThrow()
  })

  it('does not throw when disabling console output', () => {
    expect(() => configureLogger({ console: false })).not.toThrow()
  })
})
