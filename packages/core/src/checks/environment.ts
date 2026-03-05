import { execSync } from 'node:child_process'
import { platform, release, arch } from 'node:os'
import type { CheckGroup, CheckResult } from '../types.js'

function getVersion(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return null
  }
}

export async function checkEnvironment(): Promise<CheckGroup> {
  const results: CheckResult[] = []

  // Claude Code
  const claudeVersion = getVersion('claude --version 2>/dev/null')
  results.push(
    claudeVersion
      ? { name: 'Claude Code', status: 'pass', message: claudeVersion }
      : { name: 'Claude Code', status: 'fail', message: 'Not found' }
  )

  // Node.js
  const nodeVersion = getVersion('node --version')
  results.push(
    nodeVersion
      ? { name: 'Node.js', status: 'pass', message: nodeVersion }
      : { name: 'Node.js', status: 'fail', message: 'Not found' }
  )

  // Git
  const gitVersion = getVersion('git --version')
  results.push(
    gitVersion
      ? { name: 'Git', status: 'pass', message: gitVersion }
      : { name: 'Git', status: 'fail', message: 'Not found' }
  )

  // OS
  results.push({
    name: 'OS',
    status: 'pass',
    message: `${platform()} ${release()} (${arch()})`,
  })

  // Shell
  const shell = process.env.SHELL ?? 'unknown'
  results.push({ name: 'Shell', status: 'pass', message: shell })

  return { name: 'Environment', icon: '💻', results }
}
