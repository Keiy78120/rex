/**
 * Unit tests for docker.ts — generateDockerCompose.
 * FS mocked — no real file writes.
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
    readFileSync: vi.fn(() => JSON.stringify({ env: {} })),
    writeFileSync: vi.fn(),
  }
})

import { generateDockerCompose } from '../../src/docker.js'

// ── generateDockerCompose ─────────────────────────────────────────────────────

describe('generateDockerCompose', () => {
  it('does not throw when files do not exist', async () => {
    await expect(generateDockerCompose()).resolves.not.toThrow()
  })

  it('calls writeFileSync to create docker-compose.local.yml', async () => {
    const { writeFileSync } = await import('node:fs')
    vi.mocked(writeFileSync).mockClear()
    await generateDockerCompose()
    expect(vi.mocked(writeFileSync)).toHaveBeenCalled()
  })

  it('skips if docker-compose.local.yml already exists', async () => {
    const { existsSync, writeFileSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(writeFileSync).mockClear()
    await generateDockerCompose()
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled()
    vi.mocked(existsSync).mockReturnValue(false) // reset
  })
})

// ── generateDockerCompose — additional ───────────────────────────────────────

describe('generateDockerCompose — with settings', () => {
  it('works when settings has env vars', async () => {
    const { readFileSync } = await import('node:fs')
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({
      env: { REX_TELEGRAM_BOT_TOKEN: 'fake-token', REX_TELEGRAM_CHAT_ID: '12345' },
    }))
    await expect(generateDockerCompose()).resolves.not.toThrow()
  })

  it('handles malformed settings JSON gracefully', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    vi.mocked(existsSync).mockReturnValueOnce(false)  // docker-compose does not exist
    vi.mocked(readFileSync).mockReturnValueOnce('invalid-json')
    await expect(generateDockerCompose()).resolves.not.toThrow()
  })

  it('resolves to undefined', async () => {
    const result = await generateDockerCompose()
    expect(result).toBeUndefined()
  })
})
