import { runAllChecks } from '@rex/core'
import type { HealthReport, CheckGroup } from '@rex/core'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return `${COLORS.green}✓${COLORS.reset}`
    case 'fail': return `${COLORS.red}✗${COLORS.reset}`
    case 'warn': return `${COLORS.yellow}!${COLORS.reset}`
    default: return ' '
  }
}

function formatGroup(group: CheckGroup): string {
  const passed = group.results.filter(r => r.status === 'pass').length
  const total = group.results.length
  const allPass = passed === total

  let out = `\n  ${COLORS.bold}${group.icon} ${group.name}${COLORS.reset}`
  out += `  ${COLORS.dim}${passed}/${total}${COLORS.reset}\n`

  for (const result of group.results) {
    out += `    ${statusIcon(result.status)} ${result.name} ${COLORS.dim}— ${result.message}${COLORS.reset}\n`
  }

  return out
}

function formatReport(report: HealthReport): string {
  const line = '═'.repeat(45)
  const thinLine = '─'.repeat(45)

  let statusColor = COLORS.green
  if (report.status === 'degraded') statusColor = COLORS.yellow
  if (report.status === 'broken') statusColor = COLORS.red

  let out = `\n${line}\n`
  out += `${COLORS.bold}        REX DOCTOR — Health Check${COLORS.reset}\n`
  out += `${line}\n`

  for (const group of report.groups) {
    out += formatGroup(group)
  }

  const allResults = report.groups.flatMap(g => g.results)
  const passed = allResults.filter(r => r.status === 'pass').length
  const total = allResults.length

  out += `\n${thinLine}\n`
  out += `  Summary: ${COLORS.bold}${passed}/${total}${COLORS.reset} checks passed\n`
  out += `  Status:  ${statusColor}${COLORS.bold}${report.status.toUpperCase()}${COLORS.reset}\n`
  out += `${line}\n`

  return out
}

async function main() {
  const command = process.argv[2] ?? 'doctor'

  switch (command) {
    case 'doctor': {
      const report = await runAllChecks()
      console.log(formatReport(report))
      process.exit(report.status === 'broken' ? 1 : 0)
    }

    case 'status': {
      const report = await runAllChecks()
      const allResults = report.groups.flatMap(g => g.results)
      const passed = allResults.filter(r => r.status === 'pass').length
      const total = allResults.length
      const statusEmoji = report.status === 'healthy' ? '●' : report.status === 'degraded' ? '●' : '○'
      console.log(`REX ${statusEmoji} ${report.status.toUpperCase()} — ${passed}/${total} checks passed`)
      break
    }

    case 'help':
    default:
      console.log(`
${COLORS.bold}REX${COLORS.reset} — Claude Code productivity centralizer

${COLORS.bold}Commands:${COLORS.reset}
  rex doctor    Full health check
  rex status    Quick status summary
  rex install   Install menubar app
  rex help      Show this help
`)
  }
}

main().catch(console.error)
