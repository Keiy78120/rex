import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkDocsCache(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const docsDir = join(claudeDir, 'docs')

  try {
    const files = await readdir(docsDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    if (mdFiles.length === 0) {
      results.push({ name: 'Docs cache', status: 'warn', message: 'No cached docs' })
    }

    for (const file of mdFiles) {
      const fileStat = await stat(join(docsDir, file))
      const sizeKb = Math.round(fileStat.size / 1024)
      results.push({ name: file, status: 'pass', message: `${sizeKb}KB` })
    }
  } catch {
    results.push({ name: 'Docs directory', status: 'warn', message: 'Not found' })
  }

  return { name: 'Docs Cache', icon: '📚', results }
}
