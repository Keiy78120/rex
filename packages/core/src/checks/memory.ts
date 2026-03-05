import { readFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkMemory(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []

  // Find memory dirs in projects/
  const projectsDir = join(claudeDir, 'projects')
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(projectsDir, { recursive: true })
    const memoryFiles = entries.filter(e => typeof e === 'string' && e.endsWith('MEMORY.md'))

    if (memoryFiles.length === 0) {
      results.push({ name: 'MEMORY.md', status: 'warn', message: 'No memory files found' })
    }

    for (const memFile of memoryFiles) {
      const fullPath = join(projectsDir, memFile)
      try {
        const content = await readFile(fullPath, 'utf-8')
        if (content.trim().length === 0) {
          results.push({ name: memFile, status: 'warn', message: 'Empty' })
          continue
        }

        results.push({ name: memFile, status: 'pass', message: 'Present and non-empty' })

        // Check linked files
        const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g
        let match
        while ((match = linkRegex.exec(content)) !== null) {
          const linkedPath = join(dirname(fullPath), match[2])
          try {
            await access(linkedPath)
            results.push({ name: match[2], status: 'pass', message: 'Linked file exists' })
          } catch {
            results.push({ name: match[2], status: 'warn', message: 'Linked file missing' })
          }
        }
      } catch {
        results.push({ name: memFile, status: 'fail', message: 'Cannot read' })
      }
    }
  } catch {
    results.push({ name: 'Projects directory', status: 'warn', message: 'Not found' })
  }

  return { name: 'Memory', icon: '🧠', results }
}
