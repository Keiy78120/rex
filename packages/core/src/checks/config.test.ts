import { describe, it, expect } from 'vitest'
import { checkConfig } from './config.js'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('checkConfig', () => {
  it('should pass when all config files exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rex-test-'))
    await writeFile(join(dir, 'CLAUDE.md'), '# REX')
    await writeFile(join(dir, 'settings.json'), '{"mcpServers": {}}')
    await writeFile(join(dir, 'vault.md'), '# Vault')

    const result = await checkConfig(dir)
    expect(result.results.every(r => r.status === 'pass')).toBe(true)

    await rm(dir, { recursive: true })
  })

  it('should fail when CLAUDE.md is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rex-test-'))
    const result = await checkConfig(dir)
    const claudeCheck = result.results.find(r => r.name === 'CLAUDE.md')
    expect(claudeCheck?.status).toBe('fail')

    await rm(dir, { recursive: true })
  })

  it('should fail when settings.json is invalid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rex-test-'))
    await writeFile(join(dir, 'settings.json'), 'not json')

    const result = await checkConfig(dir)
    const settingsCheck = result.results.find(r => r.name === 'settings.json')
    expect(settingsCheck?.status).toBe('fail')

    await rm(dir, { recursive: true })
  })
})
