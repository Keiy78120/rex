import { runAllChecks } from '@rex/core'
import type { HealthReport, CheckGroup } from '@rex/core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
  const command = process.argv[2] ?? 'help'

  switch (command) {
    case 'doctor': {
      const report = await runAllChecks()
      console.log(formatReport(report))
      process.exit(report.status === 'broken' ? 1 : 0)
      break
    }

    case 'status': {
      const report = await runAllChecks()
      const allResults = report.groups.flatMap(g => g.results)
      const passed = allResults.filter(r => r.status === 'pass').length
      const total = allResults.length
      const dot = report.status === 'healthy' ? `${COLORS.green}●${COLORS.reset}` : report.status === 'degraded' ? `${COLORS.yellow}●${COLORS.reset}` : `${COLORS.red}○${COLORS.reset}`
      console.log(`REX ${dot} ${report.status.toUpperCase()} — ${passed}/${total} checks passed`)
      break
    }

    case 'init': {
      const { init } = await import('./init.js')
      await init()
      break
    }

    case 'ingest': {
      try {
        const { execSync } = await import('node:child_process')
        const memDir = findMemoryPackage()
        if (!memDir) {
          console.log(`${COLORS.yellow}Memory package not found.${COLORS.reset} This feature requires @rex/memory.`)
          console.log(`Run from the REX monorepo or install @rex/memory separately.`)
          process.exit(1)
        }
        console.log(`${COLORS.cyan}Ingesting sessions...${COLORS.reset}`)
        execSync('npx tsx src/ingest.ts', { cwd: memDir, stdio: 'inherit' })
      } catch {
        process.exit(1)
      }
      break
    }

    case 'search': {
      const query = process.argv.slice(3).join(' ')
      if (!query) {
        console.error('Usage: rex search <query>')
        process.exit(1)
      }
      try {
        const memDir = findMemoryPackage()
        if (!memDir) {
          console.log(`${COLORS.yellow}Memory package not found.${COLORS.reset} This feature requires @rex/memory + Ollama.`)
          process.exit(1)
        }
        const { execSync } = await import('node:child_process')
        execSync(`npx tsx src/cli-search.ts ${query.split(' ').map(w => JSON.stringify(w)).join(' ')}`, { cwd: memDir, stdio: 'inherit' })
      } catch { process.exit(1) }
      break
    }

    case 'optimize': {
      const { optimize } = await import('./optimize.js')
      const applyFlag = process.argv.includes('--apply')
      const modelIdx = process.argv.indexOf('--model')
      const modelFlag = modelIdx !== -1 ? process.argv[modelIdx + 1] : undefined
      await optimize(applyFlag, modelFlag)
      break
    }

    case 'prune': {
      const { prune } = await import('./prune.js')
      const statsFlag = process.argv.includes('--stats')
      await prune(statsFlag)
      break
    }

    case 'setup': {
      const { setup } = await import('./setup.js')
      await setup()
      break
    }

    case 'migrate': {
      const { migrate } = await import('./migrate.js')
      await migrate()
      break
    }

    case 'llm': {
      const prompt = process.argv.slice(3).join(' ')
      if (!prompt) {
        console.error('Usage: rex llm <prompt>')
        process.exit(1)
      }
      const { llm } = await import('./llm.js')
      const result = await llm(prompt)
      console.log(result)
      break
    }

    case 'context': {
      const targetPath = process.argv[3] || process.cwd()
      const { context } = await import('./context.js')
      await context(targetPath)
      break
    }

    case 'gateway': {
      const { gateway } = await import('./gateway.js')
      await gateway()
      break
    }

    case 'agents': {
      const { agents } = await import('./agents.js')
      await agents(process.argv.slice(3))
      break
    }

    case 'mcp': {
      const { mcp } = await import('./mcp.js')
      await mcp(process.argv.slice(3))
      break
    }

    case 'startup': {
      const { installStartup } = await import('./init.js')
      installStartup()
      break
    }

    case 'startup-remove': {
      const { uninstallStartup } = await import('./init.js')
      uninstallStartup()
      break
    }

    case 'categorize': {
      try {
        const memDir = findMemoryPackage()
        if (!memDir) {
          console.log(`Memory package not found. Run from the REX monorepo.`)
          process.exit(1)
        }
        const { execSync } = await import('node:child_process')
        const modelArg = process.argv.find(a => a.startsWith('--model='))
          ?? (process.argv.includes('--model') ? `--model=${process.argv[process.argv.indexOf('--model') + 1]}` : '')
        const batchArg = process.argv.find(a => a.startsWith('--batch='))
          ?? (process.argv.includes('--batch') ? `--batch=${process.argv[process.argv.indexOf('--batch') + 1]}` : '')
        execSync(`npx tsx src/categorize.ts ${modelArg} ${batchArg}`.trim(), { cwd: memDir, stdio: 'inherit' })
      } catch { process.exit(1) }
      break
    }

    case 'list-memories': {
      try {
        const memDir = findMemoryPackage()
        if (!memDir) { console.log(`Memory package not found.`); process.exit(1) }
        const { execSync } = await import('node:child_process')
        const extraArgs = process.argv.slice(3).join(' ')
        execSync(`npx tsx src/categorize.ts list ${extraArgs}`.trim(), { cwd: memDir, stdio: 'inherit' })
      } catch { process.exit(1) }
      break
    }

    case 'consolidate': {
      try {
        const memDir = findMemoryPackage()
        if (!memDir) { console.log(`Memory package not found. Run from the REX monorepo.`); process.exit(1) }
        const { execSync } = await import('node:child_process')
        const thresholdArg = process.argv.find(a => a.startsWith('--threshold=')) ?? ''
        const limitArg = process.argv.find(a => a.startsWith('--limit=')) ?? ''
        const modelArg = process.argv.find(a => a.startsWith('--model=')) ?? ''
        const dryRunArg = process.argv.includes('--dry-run') ? '--dry-run' : ''
        execSync(`npx tsx src/categorize.ts consolidate ${thresholdArg} ${limitArg} ${modelArg} ${dryRunArg}`.trim(), { cwd: memDir, stdio: 'inherit' })
      } catch { process.exit(1) }
      break
    }

    case 'models': {
      const { showModelRouter } = await import('./router.js')
      await showModelRouter()
      break
    }

    case 'projects': {
      const { scanProjects, saveProjectIndex } = await import('./projects.js')
      console.log(`${COLORS.cyan}Scanning projects...${COLORS.reset}`)
      const projects = scanProjects()
      saveProjectIndex(projects)
      console.log(`\n${COLORS.bold}${projects.length} projects found${COLORS.reset}\n`)
      for (const p of projects) {
        const dot = p.status === 'active' ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`
        console.log(`  ${dot} ${COLORS.bold}${p.name.padEnd(20)}${COLORS.reset} ${p.stack.join(', ').padEnd(30)} ${COLORS.dim}${p.lastActive}${COLORS.reset}`)
      }
      break
    }

    case '--version':
    case '-v':
      console.log('rex-claude v4.0.1')
      break

    case 'help':
    default:
      console.log(`
${COLORS.bold}REX${COLORS.reset} — Claude Code sous steroides

${COLORS.bold}Commands:${COLORS.reset}
  rex init            Setup REX (guards, hooks, MCP, startup)
  rex doctor          Full health check (9 categories)
  rex status          Quick one-line status
  rex startup         Install LaunchAgent (auto-start on login)
  rex startup-remove  Remove LaunchAgent

${COLORS.bold}Memory (requires Ollama):${COLORS.reset}
  rex migrate          Migrate ~/.rex-memory/ to ~/.claude/rex/ hub
  rex ingest           Sync session history to vector DB
  rex search <query>   Semantic search across past sessions
  rex categorize       Classify uncategorized memories
  rex consolidate      Merge similar memories (cosine clustering)
  rex optimize         Analyze CLAUDE.md with local LLM
  rex optimize --apply Apply optimizations (with backup)
  rex prune            Cleanup old/duplicate memories
  rex prune --stats    Show memory database stats

${COLORS.bold}LLM & Context:${COLORS.reset}
  rex setup            Install Ollama + models + Telegram gateway
  rex llm <prompt>     Query local LLM directly
  rex models           Show task-aware model routing table
  rex context [path]   Analyze project, recommend MCP/skills
  rex projects         Scan and index all dev projects

${COLORS.bold}Telegram Gateway:${COLORS.reset}
  rex gateway          Start Telegram bot (long-polling, interactive)

${COLORS.bold}Autonomous Agents:${COLORS.reset}
  rex agents ...       Create/list/run/start/stop autonomous agents

${COLORS.bold}MCP Servers:${COLORS.reset}
  rex mcp ...          Manage MCP servers (settings + registry sync)

${COLORS.bold}Info:${COLORS.reset}
  rex help             Show this help
  rex --version        Show version

${COLORS.dim}After install: rex init && rex setup — everything else is automatic.${COLORS.reset}
`)
  }
}

function findMemoryPackage(): string | null {
  const thisDir = new URL('.', import.meta.url).pathname
  const candidates = [
    join(thisDir, '..', '..', 'memory'),
    join(process.env.HOME || '~', '.rex-memory'),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, 'src', 'ingest.ts'))) return c
  }
  return null
}

main().catch(console.error)
