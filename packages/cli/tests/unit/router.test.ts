/**
 * Unit tests for router.ts — TASK_PREFERENCES catalog and pickModel env override.
 * Tests the routing table structure without Ollama network calls.
 * @module BUDGET
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  TASK_PREFERENCES,
  pickModel,
  type TaskType,
} from '../../src/router.js'

const ALL_TASK_TYPES: TaskType[] = ['background', 'categorize', 'consolidate', 'reason', 'code', 'gateway', 'optimize']

// ── TASK_PREFERENCES catalog ─────────────────────────────────────────────────

describe('TASK_PREFERENCES', () => {
  it('is an object', () => {
    expect(typeof TASK_PREFERENCES).toBe('object')
  })

  it('has an entry for every TaskType', () => {
    for (const t of ALL_TASK_TYPES) {
      expect(TASK_PREFERENCES).toHaveProperty(t)
    }
  })

  it('each entry is a non-empty array of strings', () => {
    for (const t of ALL_TASK_TYPES) {
      const prefs = TASK_PREFERENCES[t]
      expect(Array.isArray(prefs)).toBe(true)
      expect(prefs.length).toBeGreaterThan(0)
      for (const model of prefs) {
        expect(typeof model).toBe('string')
        expect(model.length).toBeGreaterThan(0)
      }
    }
  })

  it('background task prefers a small fast model first', () => {
    // background should prefer a small model (qwen2.5:1.5b)
    expect(TASK_PREFERENCES.background[0]).toContain('qwen')
  })

  it('code task includes a coder model', () => {
    const codeModels = TASK_PREFERENCES.code
    const hasCoderModel = codeModels.some(m => m.includes('coder'))
    expect(hasCoderModel).toBe(true)
  })

  it('reason task includes deepseek-r1 (reasoning specialist)', () => {
    expect(TASK_PREFERENCES.reason.some(m => m.includes('deepseek'))).toBe(true)
  })

  it('no task entry contains empty string', () => {
    for (const t of ALL_TASK_TYPES) {
      for (const model of TASK_PREFERENCES[t]) {
        expect(model.trim()).not.toBe('')
      }
    }
  })

  it('all model names follow name:tag format or name:qualifier format', () => {
    for (const t of ALL_TASK_TYPES) {
      for (const model of TASK_PREFERENCES[t]) {
        // Should have at least one character on each side of ':'
        expect(model).toMatch(/^[a-z0-9._-]+:[a-z0-9._-]+$/i)
      }
    }
  })
})

// ── pickModel — env override ──────────────────────────────────────────────────

describe('pickModel — REX_LLM_MODEL override', () => {
  afterEach(() => {
    delete process.env.REX_LLM_MODEL
  })

  it('returns REX_LLM_MODEL when env is set', async () => {
    process.env.REX_LLM_MODEL = 'custom-model:latest'
    const model = await pickModel('gateway')
    expect(model).toBe('custom-model:latest')
  })

  it('returns REX_LLM_MODEL regardless of task type', async () => {
    process.env.REX_LLM_MODEL = 'override-model:7b'
    for (const t of ALL_TASK_TYPES) {
      expect(await pickModel(t)).toBe('override-model:7b')
    }
  })

  it('returns a string when Ollama is unavailable (no override)', async () => {
    // Without network, pickModel falls back — should still return a string (empty string or fallback)
    delete process.env.REX_LLM_MODEL
    const model = await pickModel('background')
    expect(typeof model).toBe('string')
  })
})
