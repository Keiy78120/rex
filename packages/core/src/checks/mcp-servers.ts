import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { CheckGroup, CheckResult } from '../types.js'

export async function checkMcpServers(claudeDir: string): Promise<CheckGroup> {
  const results: CheckResult[] = []
  const settingsPath = join(claudeDir, 'settings.json')

  try {
    const content = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
    const servers = settings.mcpServers ?? {}

    const serverNames = Object.keys(servers)
    if (serverNames.length === 0) {
      results.push({ name: 'MCP Servers', status: 'warn', message: 'None configured' })
      return { name: 'MCP Servers', icon: '🔌', results }
    }

    for (const name of serverNames) {
      const server = servers[name]
      const command = server.command

      if (!command) {
        results.push({ name, status: 'warn', message: 'No command specified' })
        continue
      }

      try {
        execSync(`which ${command}`, { stdio: 'ignore' })
        results.push({ name, status: 'pass', message: `${command} found` })
      } catch {
        results.push({ name, status: 'warn', message: `${command} not found in PATH` })
      }
    }
  } catch {
    results.push({ name: 'settings.json', status: 'fail', message: 'Cannot read MCP config' })
  }

  return { name: 'MCP Servers', icon: '🔌', results }
}
