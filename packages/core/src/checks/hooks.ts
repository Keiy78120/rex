import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

const EXPECTED_HOOKS = ['UserPromptSubmit', 'PreToolUse', 'Stop']

export async function checkHooks(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const settingsPath = join(claudeDir, 'settings.json')

  try {
    const content = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
    const hooks = settings.hooks ?? {}

    for (const hookName of EXPECTED_HOOKS) {
      if (hooks[hookName] && Array.isArray(hooks[hookName]) && hooks[hookName].length > 0) {
        results.push({ name: hookName, status: 'pass', message: `${hooks[hookName].length} handler(s)` })
      } else {
        results.push({ name: hookName, status: 'warn', message: 'Not configured' })
      }
    }

    // Check for additional hooks
    const extraHooks = Object.keys(hooks).filter(h => !EXPECTED_HOOKS.includes(h))
    for (const hook of extraHooks) {
      results.push({ name: hook, status: 'pass', message: 'Custom hook' })
    }
  } catch {
    results.push({ name: 'Hooks config', status: 'fail', message: 'Cannot read settings.json' })
  }

  return { name: 'Hooks', icon: '🪝', results }
}
