/**
 * Unit tests for skills.ts — listSkills, loadSkill.
 * All filesystem ops mocked — no real disk/homedir access.
 * @module TOOLS
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => '/tmp/rex-skills-test' }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
  }
})

import { loadSkill, listSkills } from '../../src/skills.js'

// ── listSkills ────────────────────────────────────────────────────────────────

describe('listSkills', () => {
  it('returns an array', () => {
    expect(Array.isArray(listSkills())).toBe(true)
  })

  it('returns empty array when skills dir is empty', () => {
    expect(listSkills()).toHaveLength(0)
  })

  it('does not throw', () => {
    expect(() => listSkills()).not.toThrow()
  })
})

// ── loadSkill ─────────────────────────────────────────────────────────────────

describe('loadSkill', () => {
  it('returns null for a skill that does not exist', () => {
    expect(loadSkill('nonexistent-skill-xyz')).toBeNull()
  })

  it('does not throw for any string input', () => {
    expect(() => loadSkill('some-skill')).not.toThrow()
    expect(() => loadSkill('')).not.toThrow()
  })
})
