import { homedir } from 'node:os'
import { join } from 'node:path'
import { checkConfig } from './checks/config.js'
import { checkRules } from './checks/rules.js'
import { checkMemory } from './checks/memory.js'
import { checkMcpServers } from './checks/mcp-servers.js'
import { checkPlugins } from './checks/plugins.js'
import { checkHooks } from './checks/hooks.js'
import { checkDocsCache } from './checks/docs-cache.js'
import { checkEnvironment } from './checks/environment.js'
import type { CheckGroup, HealthReport, OverallStatus } from './types.js'

export type { CheckResult, CheckGroup, HealthReport, OverallStatus } from './types.js'

export async function runAllChecks(claudeDir?: string): Promise<HealthReport> {
  const dir = claudeDir ?? join(homedir(), '.claude')

  const groups = await Promise.all([
    checkConfig(dir),
    checkRules(dir),
    checkMemory(dir),
    checkMcpServers(dir),
    checkPlugins(dir),
    checkHooks(dir),
    checkDocsCache(dir),
    checkEnvironment(),
  ])

  const allResults = groups.flatMap(g => g.results)
  const failCount = allResults.filter(r => r.status === 'fail').length
  const warnCount = allResults.filter(r => r.status === 'warn').length

  let status: OverallStatus = 'healthy'
  if (failCount > 0) status = 'broken'
  else if (warnCount > 2) status = 'degraded'

  return {
    groups,
    status,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }
}
