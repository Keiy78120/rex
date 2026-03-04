import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkPlugins(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const pluginsDir = join(claudeDir, 'plugins', 'cache')

  try {
    const entries = await readdir(pluginsDir)

    if (entries.length === 0) {
      results.push({ name: 'Plugins', status: 'warn', message: 'No plugins installed' })
    }

    for (const entry of entries) {
      results.push({ name: entry, status: 'pass', message: 'Installed' })
    }
  } catch {
    results.push({ name: 'Plugins directory', status: 'warn', message: 'Not found' })
  }

  return { name: 'Plugins', icon: '🧩', results }
}
