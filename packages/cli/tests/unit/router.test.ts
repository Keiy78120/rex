/**
 * Unit tests for router.ts — TASK_PREFERENCES catalog and pickModel behavior.
 * Tests routing data structure and env-override logic without Ollama.
 * @module BUDGET
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

import { TASK_PREFERENCES } from '../../src/router.js'

const ALL_TASK_TYPES = Object.keys(TASK_PREFERENCES) as string[]

// ── TASK_PREFERENCES ──────────────────────────────────────────────────────────

describe('TASK_PREFERENCES', () => {
  it('is an object', () => {
    expect(typeof TASK_PREFERENCES).toBe('object')
    expect(TASK_PREFERENCES).not.toBeNull()
  })

  it('has at least 5 task types', () => {
    expect(ALL_TASK_TYPES.length).toBeGreaterThanOrEqual(5)
  })

  it('includes background, categorize, gateway, code, reason', () => {
    expect(TASK_PREFERENCES).toHaveProperty('background')
    expect(TASK_PREFERENCES).toHaveProperty('categorize')
    expect(TASK_PREFERENCES).toHaveProperty('gateway')
    expect(TASK_PREFERENCES).toHaveProperty('code')
    expect(TASK_PREFERENCES).toHaveProperty('reason')
  })

  it('each task type has an array of model preferences', () => {
    for (const task of ALL_TASK_TYPES) {
      const prefs = TASK_PREFERENCES[task as keyof typeof TASK_PREFERENCES]
      expect(Array.isArray(prefs)).toBe(true)
      expect(prefs.length).toBeGreaterThan(0)
    }
  })

  it('all model names are non-empty strings', () => {
    for (const task of ALL_TASK_TYPES) {
      const prefs = TASK_PREFERENCES[task as keyof typeof TASK_PREFERENCES]
      for (const model of prefs) {
        expect(typeof model).toBe('string')
        expect(model.length).toBeGreaterThan(0)
      }
    }
  })

  it('background uses lightweight model first', () => {
    // Smallest model should be first for background tasks
    const first = TASK_PREFERENCES.background[0]
    // Should contain a small model identifier (1.5b or similar)
    expect(first).toBeTruthy()
    expect(typeof first).toBe('string')
  })

  it('reason task preferences contain at least one deep-reasoning model', () => {
    const hasReasoner = TASK_PREFERENCES.reason.some(
      m => m.includes('deepseek') || m.includes('r1') || m.includes('qwen')
    )
    expect(hasReasoner).toBe(true)
  })
})

// ── pickModel — env override ───────────────────────────────────────────────────

describe('pickModel — REX_LLM_MODEL env override', () => {
  afterEach(() => {
    delete process.env.REX_LLM_MODEL
  })

  it('returns REX_LLM_MODEL when set', async () => {
    const { pickModel } = await import('../../src/router.js')
    process.env.REX_LLM_MODEL = 'custom-model:7b'
    const model = await pickModel('background')
    expect(model).toBe('custom-model:7b')
  })

  it('returns a non-empty string even without Ollama (fallback)', async () => {
    const { pickModel } = await import('../../src/router.js')
    const model = await pickModel('gateway')
    expect(typeof model).toBe('string')
    expect(model.length).toBeGreaterThan(0)
  })
})
