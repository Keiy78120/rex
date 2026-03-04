import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkConfig(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []

  // CLAUDE.md
  const claudeMdPath = join(claudeDir, 'CLAUDE.md')
  try {
    const content = await readFile(claudeMdPath, 'utf-8')
    results.push(
      content.trim().length > 0
        ? { name: 'CLAUDE.md', status: 'pass', message: 'Present and non-empty' }
        : { name: 'CLAUDE.md', status: 'warn', message: 'File exists but is empty' }
    )
  } catch {
    results.push({ name: 'CLAUDE.md', status: 'fail', message: 'Not found' })
  }

  // settings.json
  const settingsPath = join(claudeDir, 'settings.json')
  try {
    const content = await readFile(settingsPath, 'utf-8')
    JSON.parse(content)
    results.push({ name: 'settings.json', status: 'pass', message: 'Valid JSON' })
  } catch (err) {
    const message = err instanceof SyntaxError ? 'Invalid JSON' : 'Not found'
    results.push({ name: 'settings.json', status: 'fail', message })
  }

  // vault.md
  const vaultPath = join(claudeDir, 'vault.md')
  try {
    await access(vaultPath)
    results.push({ name: 'vault.md', status: 'pass', message: 'Present' })
  } catch {
    results.push({ name: 'vault.md', status: 'warn', message: 'Not found (optional)' })
  }

  return { name: 'Config', icon: '⚙', results }
}
