import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

const EXPECTED_GUARDS = [
  'completion-guard.sh',
  'dangerous-cmd-guard.sh',
  'test-protect-guard.sh',
  'session-summary.sh',
  'ui-checklist-guard.sh',
  'scope-guard.sh',
]

export async function checkGuards(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const guardsDir = join(claudeDir, 'rex-guards')

  for (const guard of EXPECTED_GUARDS) {
    const guardPath = join(guardsDir, guard)
    try {
      await access(guardPath)
      results.push({ name: guard, status: 'pass', message: 'Installed' })
    } catch {
      results.push({ name: guard, status: 'warn', message: 'Not installed — run rex init' })
    }
  }

  return { name: 'Guards', icon: '🛡', results }
}
