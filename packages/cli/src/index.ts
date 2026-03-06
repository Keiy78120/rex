import { runAllChecks } from '@rex/core'
import type { HealthReport, CheckGroup } from '@rex/core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger, configureLogger } from './logger.js'
import { DAEMON_LOG_PATH } from './paths.js'

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
  const verbose = process.argv.includes('--verbose')
  if (verbose) configureLogger({ level: 'debug' })
  const log = createLogger('cli')

  switch (command) {
    case 'doctor': {
      const fixMode = process.argv.includes('--fix')
      if (fixMode) {
        log.info('Doctor --fix started')
        console.log(`\n${COLORS.bold}REX Doctor — Auto-fix mode${COLORS.reset}\n`)
        const { ensureRexDirs } = await import('./paths.js')
        ensureRexDirs()
        log.info('Directory structure ensured')
        console.log(`  ${COLORS.green}✓${COLORS.reset} Directory structure ensured`)
        // Run migrate if needed
        try {
          const { migrate } = await import('./migrate.js')
          await migrate()
        } catch (e: any) {
          console.log(`  ${COLORS.yellow}!${COLORS.reset} Migration: ${e.message?.slice(0, 100)}`)
        }
        // Process pending
        const { execSync } = await import('node:child_process')
        try { execSync('rex ingest', { stdio: 'inherit', timeout: 120_000 }) } catch {}
        try { execSync('rex recategorize --batch=50', { stdio: 'inherit', timeout: 180_000 }) } catch {}
        log.info('Auto-fix complete, running doctor')
        console.log(`\n${COLORS.green}Auto-fix complete.${COLORS.reset} Running doctor...\n`)
      }
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

    case 'install': {
      const { install } = await import('./install.js')
      await install()
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
      const nonInteractive = process.argv.includes('--yes') || process.argv.includes('--non-interactive')
      const skipTelegram = process.argv.includes('--skip-telegram')
      await setup({ nonInteractive, skipTelegram, autoInstallDeps: nonInteractive })
      break
    }

    case 'audit': {
      const { audit } = await import('./audit.js')
      const json = process.argv.includes('--json')
      const strict = process.argv.includes('--strict')
      await audit({ json, strict })
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

    case 'app': {
      const { app } = await import('./app.js')
      await app(process.argv.slice(3))
      break
    }

    case 'update': {
      const { app } = await import('./app.js')
      await app(['update', ...process.argv.slice(3)])
      break
    }
    case 'agents': {
      const { agents } = await import('./agents.js')
      await agents(process.argv.slice(3))
      break
    }

    case 'skills': {
      const { skills } = await import('./skills.js')
      await skills(process.argv.slice(3))
      break
    }

    case 'mcp': {
      const { mcpRegistry } = await import('./mcp_registry.js')
      await mcpRegistry(process.argv.slice(3))
      break
    }

    case 'audio': {
      const { audio } = await import('./audio.js')
      await audio(process.argv.slice(3))
      break
    }

    case 'call': {
      const { call } = await import('./call.js')
      await call(process.argv.slice(3))
      break
    }

    case 'voice': {
      const { voice } = await import('./voice.js')
      await voice(process.argv.slice(3))
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

    case 'recategorize': {
      const { recategorize } = await import('./recategorize.js')
      const batchArg = process.argv.find(a => a.startsWith('--batch='))
      const batch = batchArg ? parseInt(batchArg.split('=')[1]) : 50
      const dryRun = process.argv.includes('--dry-run')
      await recategorize({ batch, dryRun })
      break
    }

    case 'preload': {
      const { preload } = await import('./preload.js')
      const cwd = process.argv[3] || process.cwd()
      const context = await preload(cwd)
      if (context) console.log(context)
      break
    }

    case 'self-review': {
      const { selfReview } = await import('./self-improve.js')
      await selfReview()
      break
    }

    case 'promote-rule': {
      const { promoteRule } = await import('./self-improve.js')
      const idx = parseInt(process.argv[3])
      if (!idx) { console.log('Usage: rex promote-rule <index>'); process.exit(1) }
      const ok = await promoteRule(idx)
      console.log(ok ? `${COLORS.green}Rule promoted to ~/.claude/rules/${COLORS.reset}` : `${COLORS.red}Failed — invalid index or no suggested rule${COLORS.reset}`)
      break
    }

    case 'daemon': {
      const { daemon } = await import('./daemon.js')
      await daemon()
      break
    }

    case 'logs': {
      const lines = process.argv.find(a => a.startsWith('--lines='))
      const n = lines ? parseInt(lines.split('=')[1]) : 50
      const follow = process.argv.includes('--follow') || process.argv.includes('-f')
      if (!existsSync(DAEMON_LOG_PATH)) {
        console.log(`${COLORS.dim}No log file found at ${DAEMON_LOG_PATH}${COLORS.reset}`)
        break
      }
      if (follow) {
        const { execSync: execSyncLocal } = await import('node:child_process')
        try { execSyncLocal(`tail -f "${DAEMON_LOG_PATH}"`, { stdio: 'inherit' }) } catch {}
      } else {
        const content = readFileSync(DAEMON_LOG_PATH, 'utf-8')
        const logLines = content.split('\n').filter(Boolean)
        const tail = logLines.slice(-n)
        for (const line of tail) console.log(line)
        console.log(`\n${COLORS.dim}Showing last ${tail.length} of ${logLines.length} lines. Use --follow/-f for live tail.${COLORS.reset}`)
      }
      break
    }

    case '--version':
    case '-v':
      console.log('rex-claude v6.0.0')
      break

    case 'help':
    default:
      console.log(`
${COLORS.bold}REX${COLORS.reset} — Claude Code sous steroides

${COLORS.bold}Commands:${COLORS.reset}
  rex install         One-command setup (init + setup + audit)
  rex init            Setup REX (guards, hooks, MCP, startup)
  rex audit           Run integration audit checks
  rex doctor          Full health check (9 categories)
  rex doctor --fix    Auto-fix common issues then check
  rex status          Quick one-line status
  rex startup         Install LaunchAgent (auto-start on login)
  rex startup-remove  Remove LaunchAgent

${COLORS.bold}Memory (requires Ollama):${COLORS.reset}
  rex migrate          Migrate ~/.rex-memory/ to ~/.claude/rex/ hub
  rex ingest           Sync session history to vector DB
  rex search <query>   Semantic search across past sessions
  rex categorize       Classify uncategorized memories
  rex consolidate      Merge similar memories (cosine clustering)
  rex recategorize     Re-classify session memories with AI
  rex optimize         Analyze CLAUDE.md with local LLM
  rex optimize --apply Apply optimizations (with backup)
  rex prune            Cleanup old/duplicate memories
  rex prune --stats    Show memory database stats
  rex self-review      Extract lessons, detect error patterns
  rex promote-rule N   Promote rule candidate to ~/.claude/rules/

${COLORS.bold}LLM & Context:${COLORS.reset}
  rex setup            Install Ollama + models + Telegram gateway (interactive)
  rex setup --yes      Non-interactive setup (auto-install deps, env-based Telegram)
  rex llm <prompt>     Query local LLM directly
  rex models           Show task-aware model routing table
  rex preload [path]   Show pre-loaded context for a path
  rex context [path]   Analyze project, recommend MCP/skills
  rex projects         Scan and index all dev projects

${COLORS.bold}Background:${COLORS.reset}
  rex daemon           Start persistent background daemon
  rex logs             Show recent daemon/CLI logs (--lines=N, --follow/-f)

${COLORS.bold}Telegram Gateway:${COLORS.reset}
  rex gateway          Start Telegram bot (long-polling, interactive)

${COLORS.bold}App:${COLORS.reset}
  rex app update [--debug|--release] [--no-launch]
                     Build + install + relaunch app from current repo
  rex app info        Show installed app path + source repo/commit
  rex app open        Open installed app
  rex update          Alias for: rex app update

${COLORS.bold}Autonomous Agents:${COLORS.reset}
  rex agents profiles          List built-in agent profiles
  rex agents create <profile>  Create agent (read/analysis/code-review/advanced/ultimate)
  rex agents run <id>          Start autonomous loop (daemon)
  rex agents run <id> --once   Run one cycle only
  rex agents stop <id>         Stop running agent
  rex agents status [id]       Show status
  rex agents logs <id>         Tail logs
  rex agents chat <message>   Chat with orchestrator
  rex agents team [name]      List teams / team members

${COLORS.bold}Skills:${COLORS.reset}
  rex skills list              List installed skills
  rex skills show <name>       Show skill content
  rex skills add <name>        Create a new skill
  rex skills delete <name>     Remove a skill

${COLORS.bold}MCP Registry:${COLORS.reset}
  rex mcp list                 List MCP servers
  rex mcp add <name> ...       Add stdio MCP server
  rex mcp add-url <name> <url> Add remote MCP server (sse/http)
  rex mcp check <id>           Check MCP connectivity
  rex mcp discover <id|name>   List tools exposed by an MCP server
  rex mcp search <query>       Search MCP marketplace cache
  rex mcp install <name>       Install MCP server from marketplace
  rex mcp sync-claude          Sync enabled stdio servers to ~/.claude/settings.json

${COLORS.bold}Voice & Calls:${COLORS.reset}
  rex call status             Current call detection status (Hammerspoon)
  rex call events --tail 20   Recent call start/end events
  rex call watch              Auto start/stop audio logger from call events
  rex voice status            Voice pipeline status (whisper + optimize)
  rex voice set-optimize on   Enable post-transcript optimize
  rex voice transcribe        Transcribe latest WAV recording
  rex audio status            Audio logger status
  rex audio start             Start audio capture (ffmpeg avfoundation)
  rex audio stop              Stop audio capture
  rex audio list              List saved recordings

${COLORS.bold}Info:${COLORS.reset}
  rex help             Show this help
  rex --version        Show version

${COLORS.dim}After install: rex install — everything else is automatic.${COLORS.reset}
`)
  }
}

function findMemoryPackage(): string | null {
  const thisDir = new URL('.', import.meta.url).pathname
  const candidates = [
    join(thisDir, '..', '..', 'memory'),
    join(process.env.HOME || '~', 'Documents', 'Developer', 'keiy', 'rex', 'packages', 'memory'),
    join(process.env.HOME || '~', '.rex-memory'),
  ]
  for (const c of candidates) {
    if (existsSync(join(c, 'src', 'ingest.ts'))) return c
  }
  return null
}

main().catch(console.error)
