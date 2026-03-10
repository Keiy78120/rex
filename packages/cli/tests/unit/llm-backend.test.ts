/**
 * Unit tests for llm-backend.ts — createBackend, getBackend, BACKEND_INFO.
 * No network calls. LLM backend is created but not invoked.
 * @module LLM
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(() => ({ llm: { backend: 'ollama', backendUrl: 'http://localhost:11434' } })),
}))

import {
  createBackend,
  getBackend,
  resetBackendCache,
  BACKEND_INFO,
} from '../../src/llm-backend.js'

beforeEach(() => {
  resetBackendCache()
})

// ── createBackend ─────────────────────────────────────────────────────────────

describe('createBackend', () => {
  it('returns an object with generate method for ollama', () => {
    const backend = createBackend('ollama', 'http://localhost:11434')
    expect(typeof backend.generate).toBe('function')
  })

  it('returns an object with generate method for llamafile', () => {
    const backend = createBackend('llamafile', 'http://localhost:8080')
    expect(typeof backend.generate).toBe('function')
  })

  it('returns different instances for different calls', () => {
    const b1 = createBackend('ollama', 'http://localhost:11434')
    const b2 = createBackend('ollama', 'http://localhost:11434')
    expect(b1).not.toBe(b2)
  })
})

// ── getBackend ────────────────────────────────────────────────────────────────

describe('getBackend', () => {
  it('returns a backend object', () => {
    const backend = getBackend()
    expect(backend).toBeDefined()
    expect(typeof backend.generate).toBe('function')
  })

  it('returns same instance on repeated calls (cached)', () => {
    const b1 = getBackend()
    const b2 = getBackend()
    expect(b1).toBe(b2)
  })

  it('returns new instance after resetBackendCache', () => {
    const b1 = getBackend()
    resetBackendCache()
    const b2 = getBackend()
    expect(b1).not.toBe(b2)
  })
})

// ── BACKEND_INFO ──────────────────────────────────────────────────────────────

describe('BACKEND_INFO', () => {
  it('has entries for all supported backends', () => {
    const keys = Object.keys(BACKEND_INFO)
    expect(keys).toContain('ollama')
    expect(keys).toContain('llamafile')
    expect(keys).toContain('vllm')
    expect(keys).toContain('localai')
  })

  it('each entry has name, install, platform', () => {
    for (const [, info] of Object.entries(BACKEND_INFO)) {
      expect(typeof info.name).toBe('string')
      expect(info.name.length).toBeGreaterThan(0)
      expect(typeof info.install).toBe('string')
      expect(typeof info.platform).toBe('string')
    }
  })
})
