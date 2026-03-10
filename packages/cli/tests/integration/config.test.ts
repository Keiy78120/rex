/**
 * Integration tests for config.ts — loadConfig and saveConfig.
 * Uses a real temp file to test config read/write cycle with defaults.
 * @module CORE
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { TEST_DIR, CONFIG_FILE } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os')
  const dir = join(tmpdir(), `rex-config-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return { TEST_DIR: dir, CONFIG_FILE: join(dir, 'config.json') }
})

vi.mock('../../src/paths.js', () => ({
  REX_DIR: TEST_DIR,
  ensureRexDirs: vi.fn(),
  CONFIG_PATH: CONFIG_FILE,
  MEMORY_DB_PATH: join(TEST_DIR, 'memory.sqlite'),
}))

import {
  loadConfig,
  saveConfig,
  type RexConfig,
} from '../../src/config.js'

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── loadConfig — defaults ─────────────────────────────────────────────────────

describe('loadConfig — defaults when no file', () => {
  it('returns a RexConfig with all required sections', () => {
    const cfg = loadConfig()
    expect(cfg).toHaveProperty('llm')
    expect(cfg).toHaveProperty('ingest')
    expect(cfg).toHaveProperty('selfImprovement')
    expect(cfg).toHaveProperty('daemon')
    expect(cfg).toHaveProperty('notifications')
  })

  it('default routing is ollama-first', () => {
    expect(loadConfig().llm.routing).toBe('ollama-first')
  })

  it('default embedModel is nomic-embed-text', () => {
    expect(loadConfig().llm.embedModel).toBe('nomic-embed-text')
  })

  it('default daemon.healthCheckInterval is 300', () => {
    expect(loadConfig().daemon.healthCheckInterval).toBe(300)
  })

  it('default notifications.daily is true', () => {
    expect(loadConfig().notifications.daily).toBe(true)
  })

  it('default selfImprovement.enabled is true', () => {
    expect(loadConfig().selfImprovement.enabled).toBe(true)
  })

  it('default ingest.excludePaths includes node_modules', () => {
    expect(loadConfig().ingest.excludePaths).toContain('node_modules')
  })
})

// ── saveConfig / loadConfig — round trip ──────────────────────────────────────

describe('saveConfig / loadConfig — round trip', () => {
  it('saves and reloads a custom routing value', () => {
    const cfg = loadConfig()
    cfg.llm.routing = 'claude-only'
    saveConfig(cfg)
    const reloaded = loadConfig()
    expect(reloaded.llm.routing).toBe('claude-only')
  })

  it('saves and reloads a custom embedModel', () => {
    const cfg = loadConfig()
    cfg.llm.embedModel = 'custom-model'
    saveConfig(cfg)
    const reloaded = loadConfig()
    expect(reloaded.llm.embedModel).toBe('custom-model')
  })

  it('saves and reloads daemon intervals', () => {
    const cfg = loadConfig()
    cfg.daemon.healthCheckInterval = 120
    saveConfig(cfg)
    const reloaded = loadConfig()
    expect(reloaded.daemon.healthCheckInterval).toBe(120)
  })

  it('saves and reloads notifications.daily', () => {
    const cfg = loadConfig()
    cfg.notifications.daily = false
    saveConfig(cfg)
    const reloaded = loadConfig()
    expect(reloaded.notifications.daily).toBe(false)
  })
})

// ── loadConfig — fallback for invalid JSON ────────────────────────────────────

describe('loadConfig — fallback for invalid JSON', () => {
  it('returns defaults when config file contains invalid JSON', () => {
    writeFileSync(CONFIG_FILE, 'not-valid-json{{{')
    const cfg = loadConfig()
    // Should fall back to defaults
    expect(cfg.llm.routing).toBeDefined()
    expect(typeof cfg.llm.routing).toBe('string')
  })
})
