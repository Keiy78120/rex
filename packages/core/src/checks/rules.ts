import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkRules(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const rulesDir = join(claudeDir, 'rules')

  try {
    const files = await readdir(rulesDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    for (const file of mdFiles) {
      try {
        const content = await readFile(join(rulesDir, file), 'utf-8')
        results.push(
          content.trim().length > 0
            ? { name: file, status: 'pass', message: 'Present and non-empty' }
            : { name: file, status: 'warn', message: 'Empty file' }
        )
      } catch {
        results.push({ name: file, status: 'fail', message: 'Cannot read' })
      }
    }

    if (mdFiles.length === 0) {
      results.push({ name: 'Rules directory', status: 'warn', message: 'No rule files found' })
    }
  } catch {
    results.push({ name: 'Rules directory', status: 'fail', message: 'Directory not found' })
  }

  return { name: 'Rules', icon: '📏', results }
}
