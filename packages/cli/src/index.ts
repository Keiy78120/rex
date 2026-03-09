import { runAllChecks } from '@rex/core'
import type { HealthReport, CheckGroup } from '@rex/core'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger, configureLogger } from './logger.js'
import { DAEMON_LOG_PATH } from './paths.js'
import { FREE_TIER_PROVIDERS, getApiKey, validateProvider, getProvidersSnapshot } from './free-tiers.js'

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
  const command = process.argv[2]
  const verbose = process.argv.includes('--verbose')
  if (verbose) configureLogger({ level: 'debug' })
  const log = createLogger('cli')

  switch (command) {
    case 'doctor': {
      const fixMode = process.argv.includes('--fix')
      if (process.argv.includes('--lint-config')) {
        const { runConfigLint, printLintResult } = await import('./config-lint.js')
        const result = runConfigLint(process.cwd())
        printLintResult(result)
        process.exit(result.passed ? 0 : 1)
        break
      }
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
      if (process.argv.includes('--platform')) {
        const { getPlatformReport, printPlatformDetail } = await import('./platform-warnings.js')
        printPlatformDetail(getPlatformReport())
        break
      }
      const report = await runAllChecks()
      if (process.argv.includes('--json')) {
        const { getPlatformReport } = await import('./platform-warnings.js')
        const pr = getPlatformReport()
        const allResults = report.groups.flatMap(g => g.results)
        const output = {
          status: report.status,
          passed: allResults.filter(r => r.status === 'pass').length,
          total: allResults.length,
          groups: report.groups.map(g => ({
            name: g.name,
            results: g.results.map(r => ({ name: r.name, status: r.status, message: r.message })),
          })),
          platform: {
            profile: pr.profile,
            os: pr.os,
            cpuCores: pr.cpuCores,
            hasGpu: pr.hasGpu,
            isDocker: pr.isDocker,
            warnings: pr.warnings.length,
          },
        }
        console.log(JSON.stringify(output))
        process.exit(report.status === 'broken' ? 1 : 0)
        break
      }
      console.log(formatReport(report))
      // Memory integrity check
      try {
        const { showMemoryHealth } = await import('./memory-check.js')
        showMemoryHealth()
      } catch {}
      // Platform limitations summary
      try {
        const { getPlatformReport, printPlatformSummary } = await import('./platform-warnings.js')
        const pr = getPlatformReport()
        if (pr.warnings.length > 0) printPlatformSummary(pr)
      } catch {}
      process.exit(report.status === 'broken' ? 1 : 0)
      break
    }

    case 'memory-check': {
      const { showMemoryHealth } = await import('./memory-check.js')
      showMemoryHealth(process.argv.includes('--json'))
      break
    }

    case 'status': {
      const report = await runAllChecks()
      const allResults = report.groups.flatMap(g => g.results)
      const passed = allResults.filter(r => r.status === 'pass').length
      const total = allResults.length
      const dot = report.status === 'healthy' ? `${COLORS.green}●${COLORS.reset}` : report.status === 'degraded' ? `${COLORS.yellow}●${COLORS.reset}` : `${COLORS.red}○${COLORS.reset}`
      console.log(`REX ${dot} ${report.status.toUpperCase()} — ${passed}/${total} checks passed`)
      try {
        const { printBurnRateDashboard } = await import('./burn-rate.js')
        printBurnRateDashboard()
      } catch {}
      break
    }

    case 'init': {
      if (process.argv.includes('--docker')) {
        const { generateDockerCompose } = await import('./docker.js')
        await generateDockerCompose()
      } else {
        const { init } = await import('./init.js')
        await init()
      }
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
        // Forward --max=N flag as REX_MAX_EMBED_PER_RUN env var
        const maxArg = process.argv.find(a => a.startsWith('--max='))
        const maxEnv = maxArg ? { REX_MAX_EMBED_PER_RUN: maxArg.split('=')[1] } : {}
        console.log(`${COLORS.cyan}Ingesting sessions...${COLORS.reset}`)
        execSync('npx tsx src/ingest.ts', { cwd: memDir, stdio: 'inherit', env: { ...process.env, ...maxEnv } })
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
      if (process.argv.includes('--quick')) {
        const { quickSetup } = await import('./quick-setup.js')
        await quickSetup()
        break
      }
      // Default: full interactive wizard (the "wow moment" experience)
      const { setupWizard } = await import('./setup-wizard.js')
      await setupWizard()
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

    case 'reindex': {
      // rex reindex — re-embed all memories with current Ollama model
      try {
        const memDir = findMemoryPackage()
        if (!memDir) { console.log('Memory package not found. Run from the REX monorepo.'); process.exit(1) }
        const { execSync } = await import('node:child_process')
        const dryRun = process.argv.includes('--dry-run') ? '--dry-run' : ''
        execSync(`npx tsx src/reindex.ts ${dryRun}`.trim(), { cwd: memDir, stdio: 'inherit' })
      } catch { process.exit(1) }
      break
    }

    case 'inventory':
    case 'resources': {
      const { showInventory, collectInventory, saveInventoryCache } = await import('./inventory.js')
      const jsonFlag = process.argv.includes('--json')
      const inv = await collectInventory()
      await saveInventoryCache(inv)
      if (jsonFlag) {
        console.log(JSON.stringify(inv, null, 2))
      } else {
        await showInventory()
      }
      break
    }

    case 'models': {
      const subCmd = process.argv[3]
      if (subCmd === 'setup') {
        // rex models setup — zero-LLM RAM-aware Ollama model recommender
        const { totalmem } = await import('node:os')
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const execFileAsync = promisify(execFile)
        const BOLD = '\x1b[1m', RESET = '\x1b[0m', DIM = '\x1b[2m'
        const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m', RED = '\x1b[31m'

        const ramGb = Math.round(totalmem() / (1024 ** 3))
        const pullFlag = process.argv.includes('--pull')

        // RAM tiers → recommended models
        const TIERS: Array<{ minGb: number; label: string; models: string[] }> = [
          { minGb: 0,  label: '< 8 GB',   models: ['nomic-embed-text'] },
          { minGb: 8,  label: '8–12 GB',  models: ['nomic-embed-text', 'qwen2.5:3b'] },
          { minGb: 12, label: '12–16 GB', models: ['nomic-embed-text', 'qwen2.5-coder:7b', 'deepseek-r1:8b'] },
          { minGb: 16, label: '16–24 GB', models: ['nomic-embed-text', 'qwen2.5-coder:7b', 'deepseek-r1:8b', 'qwen2.5:14b'] },
          { minGb: 24, label: '24–32 GB', models: ['nomic-embed-text', 'qwen2.5-coder:14b', 'deepseek-r1:14b', 'qwen3:14b'] },
          { minGb: 32, label: '32 GB+',   models: ['nomic-embed-text', 'qwen3-coder:30b', 'deepseek-r1:32b', 'qwen3:30b-a3b'] },
        ]
        const tier = [...TIERS].reverse().find(t => ramGb >= t.minGb) ?? TIERS[0]

        console.log(`\n${BOLD}REX Model Setup${RESET}`)
        console.log(DIM + '─'.repeat(48) + RESET)
        console.log(`  RAM detected:  ${CYAN}${ramGb} GB${RESET}`)
        console.log(`  RAM tier:      ${CYAN}${tier.label}${RESET}`)

        // Check Ollama
        let ollamaRunning = false
        let pulledModels: string[] = []
        try {
          const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
          if (res.ok) {
            ollamaRunning = true
            const data = await res.json() as { models?: Array<{ name: string }> }
            pulledModels = (data.models ?? []).map(m => m.name.split(':')[0] + ':' + (m.name.split(':')[1] ?? 'latest'))
          }
        } catch { /* Ollama not running */ }

        console.log(`  Ollama:        ${ollamaRunning ? `${GREEN}running${RESET}` : `${RED}not running${RESET}`}`)
        console.log()
        console.log(`${BOLD}Recommended models for ${tier.label}:${RESET}`)
        console.log(DIM + '─'.repeat(48) + RESET)

        const missing: string[] = []
        for (const model of tier.models) {
          const base = model.split(':')[0]
          const tag = model.split(':')[1] ?? 'latest'
          const fullName = `${base}:${tag}`
          const pulled = pulledModels.some(p => p === fullName || p.startsWith(base + ':'))
          const dot = pulled ? `${GREEN}●${RESET}` : `${YELLOW}○${RESET}`
          const status = pulled ? `${DIM}already pulled${RESET}` : `${YELLOW}not installed${RESET}`
          console.log(`  ${dot} ${model.padEnd(30)} ${status}`)
          if (!pulled) missing.push(model)
        }

        if (missing.length === 0) {
          console.log(`\n${GREEN}✓ All recommended models are already installed.${RESET}`)
        } else {
          console.log(`\n${YELLOW}${missing.length} model(s) missing.${RESET}`)
          if (pullFlag) {
            if (!ollamaRunning) {
              console.log(`${RED}Ollama is not running. Start it first: ollama serve${RESET}`)
              process.exit(1)
            }
            console.log(`\nPulling missing models...`)
            for (const model of missing) {
              console.log(`\n  ${CYAN}→ ollama pull ${model}${RESET}`)
              try {
                await execFileAsync('ollama', ['pull', model], { timeout: 300_000 })
                console.log(`  ${GREEN}✓ ${model} pulled${RESET}`)
              } catch (e: unknown) {
                const err = e as { message?: string }
                console.log(`  ${RED}✗ Failed: ${err.message?.slice(0, 80)}${RESET}`)
              }
            }
          } else {
            console.log(`\nRun ${CYAN}rex models setup --pull${RESET} to install them automatically.`)
          }
        }
        console.log()
        break
      }

      const catalogFlag = process.argv.includes('--catalog')
      if (catalogFlag) {
        const { FREE_MODELS, getModelsSummary } = await import('./free-models.js')
        const jsonFlag = process.argv.includes('--json')
        if (jsonFlag) {
          console.log(JSON.stringify(FREE_MODELS, null, 2))
        } else {
          const summary = getModelsSummary()
          const BOLD = '\x1b[1m', RESET = '\x1b[0m', DIM = '\x1b[2m'
          const GREEN = '\x1b[32m', CYAN = '\x1b[36m', YELLOW = '\x1b[33m'
          console.log(`\n${BOLD}REX Free Model Catalog${RESET}`)
          console.log(DIM + '─'.repeat(72) + RESET)
          let lastProvider = ''
          for (const m of summary) {
            if (m.provider !== lastProvider) {
              console.log(`\n  ${CYAN}${m.provider}${RESET}`)
              lastProvider = m.provider
            }
            const tierColor = m.tier === 'local' ? GREEN : m.tier === 'free-tier' ? YELLOW : DIM
            const rpm = m.rpm === '∞' ? `${GREEN}∞${RESET}` : `${m.rpm} rpm`
            const cost = m.costPerMToken > 0 ? `$${m.costPerMToken}/M` : `${GREEN}free${RESET}`
            console.log(`    ${tierColor}●${RESET} ${m.model.padEnd(35)} ${DIM}ctx:${(m.context/1000).toFixed(0)}k${RESET}  ${rpm.padEnd(12)}  ${cost}`)
          }
          console.log()
        }
      } else {
        const { showModelRouter, getRouterSnapshot } = await import('./router.js')
        if (process.argv.includes('--json')) {
          const snap = await getRouterSnapshot()
          console.log(JSON.stringify(snap, null, 2))
        } else {
          await showModelRouter()
        }
      }
      break
    }

    case 'projects': {
      const { scanProjects, saveProjectIndex } = await import('./projects.js')
      const jsonFlag = process.argv.includes('--json')
      if (!jsonFlag) console.log(`${COLORS.cyan}Scanning projects...${COLORS.reset}`)
      const projects = scanProjects()
      saveProjectIndex(projects)
      if (jsonFlag) {
        console.log(JSON.stringify({ projects, total: projects.length }, null, 2))
      } else {
        console.log(`\n${COLORS.bold}${projects.length} projects found${COLORS.reset}\n`)
        for (const p of projects) {
          const dot = p.status === 'active' ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`
          console.log(`  ${dot} ${COLORS.bold}${p.name.padEnd(20)}${COLORS.reset} ${p.stack.join(', ').padEnd(30)} ${COLORS.dim}${p.lastActive}${COLORS.reset}`)
        }
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

    case 'hub': {
      const sub = process.argv[3]
      const jsonFlag = process.argv.includes('--json')
      if (sub === 'token' || process.argv.includes('--generate-token')) {
        // Show existing token from settings or generate a new one
        const { join: joinPath } = await import('node:path')
        const { homedir: homedirFn } = await import('node:os')
        const { existsSync: existsFn, readFileSync: readFn, writeFileSync: writeFn } = await import('node:fs')
        const settingsPath = joinPath(homedirFn(), '.claude', 'settings.json')
        const regenerate = process.argv.includes('--generate-token') || process.argv.includes('--new')

        let token: string | null = process.env.REX_HUB_TOKEN ?? null
        if (!token && existsFn(settingsPath)) {
          try {
            const s = JSON.parse(readFn(settingsPath, 'utf-8'))
            token = s.env?.REX_HUB_TOKEN ?? null
          } catch {}
        }

        if (!token || regenerate) {
          const { generateHubToken } = await import('./hub.js')
          token = generateHubToken()
          let settings: Record<string, unknown> = {}
          if (existsFn(settingsPath)) {
            try { settings = JSON.parse(readFn(settingsPath, 'utf-8')) } catch {}
          }
          const env = (settings.env ?? {}) as Record<string, string>
          env.REX_HUB_TOKEN = token
          settings.env = env
          writeFn(settingsPath, JSON.stringify(settings, null, 2) + '\n')
          console.log(`\n  ${COLORS.green}✓${COLORS.reset} Generated new hub token and saved to settings.json`)
        } else {
          console.log(`\n  ${COLORS.dim}(existing token)${COLORS.reset}`)
        }
        console.log(`\n  Commander token: ${COLORS.green}${token}${COLORS.reset}`)
        console.log(`  ${COLORS.dim}Use --new to regenerate${COLORS.reset}\n`)
        break
      }
      if (sub === 'status' || (jsonFlag && sub !== 'start' && sub !== 'stop')) {
        const { getHubStatus } = await import('./hub.js')
        const status = await getHubStatus()
        if (jsonFlag) {
          console.log(JSON.stringify(status))
        } else {
          const runColor = status.running ? COLORS.green : COLORS.red
          console.log(`\n  Commander: ${runColor}${status.running ? 'running' : 'stopped'}${COLORS.reset}  port=${status.port}  specialists=${status.nodesCount}`)
        }
        break
      }
      if (sub === 'stop') {
        const { execSync } = await import('node:child_process')
        try { execSync(`pkill -f "rex hub"`) } catch {}
        if (!jsonFlag) console.log(`${COLORS.green}✓${COLORS.reset} Commander stopped`)
        if (jsonFlag) console.log(JSON.stringify({ stopped: true }))
        break
      }
      if (sub === 'start') {
        // Start hub as detached background process
        const { spawn } = await import('node:child_process')
        const portArg2 = process.argv.find(a => a.startsWith('--port='))
        const hubArgs = ['hub']
        if (portArg2) hubArgs.push(portArg2)
        const child = spawn(process.execPath, [process.argv[1], ...hubArgs], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        // Wait a moment then check if it's running
        await new Promise(r => setTimeout(r, 1000))
        const { getHubStatus } = await import('./hub.js')
        const status = await getHubStatus()
        if (jsonFlag) {
          console.log(JSON.stringify(status))
        } else {
          console.log(status.running
            ? `${COLORS.green}✓${COLORS.reset} Commander started on port ${status.port}`
            : `${COLORS.red}✗${COLORS.reset} Commander failed to start`)
        }
        break
      }
      // Default: run hub in foreground (for daemon / manual use)
      const { startHub } = await import('./hub.js')
      const portArg = process.argv.find(a => a.startsWith('--port='))
      const port = portArg ? parseInt(portArg.split('=')[1]) : undefined
      await startHub(port)
      break
    }

    case 'tools': {
      const toolSub = process.argv[3] ?? 'list'
      const { loadRegistry, syncAvailability, enableTool, disableTool, printRegistry } = await import('./tool-registry.js')
      switch (toolSub) {
        case 'list':
        default: {
          const tools = loadRegistry()
          printRegistry(tools)
          break
        }
        case 'check': {
          console.log('Checking tool availability...')
          const tools = syncAvailability()
          printRegistry(tools)
          break
        }
        case 'enable': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex tools enable <id>'); process.exit(1) }
          const ok = enableTool(id)
          if (ok) console.log(`${COLORS.green}✓${COLORS.reset} Enabled: ${id}`)
          else console.error(`${COLORS.red}✗${COLORS.reset} Tool not found: ${id}`)
          break
        }
        case 'disable': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex tools disable <id>'); process.exit(1) }
          const ok = disableTool(id)
          if (ok) console.log(`${COLORS.green}✓${COLORS.reset} Disabled: ${id}`)
          else console.error(`${COLORS.red}✗${COLORS.reset} Cannot disable: ${id}`)
          break
        }
      }
      break
    }

    case 'backend': {
      const sub = process.argv[3] ?? 'list'
      const { getBackend, switchBackend, BACKEND_INFO, createBackend } = await import('./llm-backend.js')
      const jsonFlag = process.argv.includes('--json')

      if (sub === 'list' || sub === 'status') {
        const backend = getBackend()
        const healthy = await backend.isHealthy()
        const models = healthy ? await backend.listModels().catch(() => []) : []
        if (jsonFlag) {
          console.log(JSON.stringify({ type: backend.type, url: backend.url, apiFormat: backend.apiFormat, healthy, models }))
        } else {
          const statusIcon = healthy ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`
          console.log(`\n  ${COLORS.bold}LLM Backend${COLORS.reset}`)
          console.log(`  ${statusIcon} ${backend.type.padEnd(12)} ${COLORS.dim}${backend.url}${COLORS.reset}  ${COLORS.dim}(${backend.apiFormat} API)${COLORS.reset}`)
          if (models.length > 0) {
            console.log(`\n  ${COLORS.dim}Models (${models.length}):${COLORS.reset}`)
            models.slice(0, 10).forEach(m => console.log(`    ${COLORS.cyan}•${COLORS.reset} ${m}`))
            if (models.length > 10) console.log(`    ${COLORS.dim}... and ${models.length - 10} more${COLORS.reset}`)
          } else if (healthy) {
            console.log(`  ${COLORS.dim}No models listed${COLORS.reset}`)
          } else {
            console.log(`  ${COLORS.yellow}Backend unreachable${COLORS.reset}`)
          }
          console.log()
        }
      } else if (sub === 'switch') {
        const type = process.argv[4] as import('./llm-backend.js').BackendType
        const url = process.argv[5] ?? 'http://localhost:11434'
        if (!type || !BACKEND_INFO[type]) {
          console.error(`Usage: rex backend switch <type> [url]`)
          console.error(`Types: ollama | llama-cpp | localai | vllm | llamafile`)
          process.exit(1)
        }
        console.log(`Testing ${type} @ ${url}...`)
        const result = await switchBackend(type, url)
        if (result.ok) {
          console.log(`${COLORS.green}✓${COLORS.reset} Backend switched to ${type}`)
        } else {
          console.error(`${COLORS.red}✗${COLORS.reset} ${result.error}`)
          process.exit(1)
        }
      } else if (sub === 'info') {
        const type = process.argv[4] as import('./llm-backend.js').BackendType
        if (!type || !BACKEND_INFO[type]) {
          console.log(`\n  ${COLORS.bold}Available backends:${COLORS.reset}\n`)
          for (const [t, info] of Object.entries(BACKEND_INFO)) {
            const cur = getBackend().type === t ? ` ${COLORS.green}← active${COLORS.reset}` : ''
            console.log(`  ${COLORS.cyan}${t.padEnd(12)}${COLORS.reset} ${info.name}${cur}`)
            console.log(`    ${COLORS.dim}${info.platform}${COLORS.reset}`)
          }
          console.log()
        } else {
          const info = BACKEND_INFO[type]
          const b = createBackend(type, 'http://localhost:11434')
          const healthy = await b.isHealthy()
          console.log(`\n  ${COLORS.bold}${info.name}${COLORS.reset}`)
          console.log(`  Platform : ${info.platform}`)
          console.log(`  Install  : ${COLORS.dim}${info.install}${COLORS.reset}`)
          console.log(`  Status   : ${healthy ? `${COLORS.green}reachable${COLORS.reset}` : `${COLORS.red}not running${COLORS.reset} (localhost:11434)`}`)
          console.log()
        }
      } else if (sub === 'test') {
        const backend = getBackend()
        console.log(`Testing ${backend.type} @ ${backend.url}...`)
        const healthy = await backend.isHealthy()
        if (!healthy) { console.error(`${COLORS.red}✗ Unreachable${COLORS.reset}`); process.exit(1) }
        try {
          const models = await backend.listModels()
          const testModel = models.find(m => !m.includes('embed')) ?? models[0]
          if (!testModel) { console.error(`${COLORS.yellow}No models available${COLORS.reset}`); process.exit(1) }
          console.log(`Testing generate with model: ${testModel}`)
          const reply = await backend.generate('Say "pong" and nothing else.', testModel, { maxTokens: 20 })
          console.log(`${COLORS.green}✓ Response:${COLORS.reset} ${reply.trim()}`)
        } catch (err) {
          console.error(`${COLORS.red}✗ Test failed:${COLORS.reset} ${String(err)}`)
          process.exit(1)
        }
      } else {
        console.log(`Usage: rex backend [list|switch|info|test]`)
      }
      break
    }

    case 'node': {
      const sub = process.argv[3]
      const { registerWithHub, showNodeStatus, getNodeStatus } = await import('./node.js')
      const jsonFlag = process.argv.includes('--json')
      switch (sub) {
        case 'register': {
          const hubUrl = process.argv[4] || undefined
          const ok = await registerWithHub(hubUrl)
          if (ok) console.log(`${COLORS.green}✓${COLORS.reset} Registered with hub`)
          else console.log(`${COLORS.yellow}!${COLORS.reset} No hub found — running in solo mode`)
          break
        }
        case 'status':
        default:
          if (jsonFlag) {
            const status = await getNodeStatus()
            console.log(JSON.stringify({ ...status, mode: status.hubConnected ? 'cluster' : 'solo' }))
          } else {
            await showNodeStatus()
          }
          break
      }
      break
    }

    case 'mesh':
    case 'nodes': {
      const { printMeshStatus } = await import('./node-mesh.js')
      await printMeshStatus()
      break
    }

    case 'metrics': {
      const { collectMetrics, toPrometheus, printMetrics } = await import('./metrics.js')
      const prometheusFlag = process.argv.includes('--prometheus')
      const jsonFlag = process.argv.includes('--json')
      const m = await collectMetrics()
      if (prometheusFlag) {
        process.stdout.write(toPrometheus(m))
      } else if (jsonFlag) {
        console.log(JSON.stringify(m, null, 2))
      } else {
        printMetrics(m)
      }
      break
    }

    case 'tunnel': {
      // rex tunnel <user@host> [--port=7420] [--remote-port=7420]
      // Creates reverse SSH tunnel: remote:port → localhost:port (expose local hub to VPS)
      const host = process.argv[3]
      if (!host) {
        console.log('Usage: rex tunnel <user@host> [--port=7420] [--remote-port=7420]')
        console.log('       Exposes local REX hub to a remote host via SSH reverse tunnel.')
        process.exit(1)
      }
      const portArg = process.argv.find(a => a.startsWith('--port='))
      const remotePortArg = process.argv.find(a => a.startsWith('--remote-port='))
      const localPort = portArg ? portArg.split('=')[1] : '7420'
      const remotePort = remotePortArg ? remotePortArg.split('=')[1] : localPort

      const { execFile } = await import('node:child_process')
      const BOLD = '\x1b[1m', RESET = '\x1b[0m', CYAN = '\x1b[36m', DIM = '\x1b[2m'

      console.log(`\n${BOLD}REX SSH Tunnel${RESET}`)
      console.log(`${DIM}${'─'.repeat(40)}${RESET}`)
      console.log(`  Local:  localhost:${localPort}`)
      console.log(`  Remote: ${host}:${remotePort}`)
      console.log(`${DIM}Press Ctrl+C to close tunnel${RESET}\n`)
      console.log(`${CYAN}→ ssh -R ${remotePort}:localhost:${localPort} -N -o ServerAliveInterval=30 ${host}${RESET}\n`)

      const child = execFile('ssh', [
        '-R', `${remotePort}:localhost:${localPort}`,
        '-N',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ServerAliveCountMax=3',
        '-o', 'ExitOnForwardFailure=yes',
        host,
      ])

      child.on('error', (err) => {
        console.error(`Tunnel error: ${err.message}`)
        process.exit(1)
      })
      child.on('exit', (code) => {
        console.log(`\nTunnel closed (exit ${code})`)
        process.exit(code ?? 0)
      })

      process.on('SIGINT', () => {
        child.kill('SIGTERM')
      })

      // Keep alive indefinitely
      await new Promise(() => {})
      break
    }

    case 'vps': {
      const sub = process.argv[3]
      if (sub === 'setup') {
        const host = process.argv[4]
        if (!host) {
          console.log('Usage: rex vps setup <user@host> [--node=22] [--skip-install] [--dry-run]')
          process.exit(1)
        }
        const nodeArg = process.argv.find(a => a.startsWith('--node='))
        const nodeVersion = nodeArg ? nodeArg.split('=')[1] : '22'
        const skipInstall = process.argv.includes('--skip-install')
        const dryRun = process.argv.includes('--dry-run')
        const { deployVps } = await import('./vps-deploy.js')
        const ok = await deployVps({ host, nodeVersion, skipInstall, dryRun })
        process.exit(ok ? 0 : 1)
      } else if (sub === 'status') {
        const host = process.argv[4]
        if (!host) { console.log('Usage: rex vps status <user@host>'); process.exit(1) }
        const { checkVpsStatus } = await import('./vps-deploy.js')
        await checkVpsStatus(host)
      } else {
        console.log('Commands: rex vps setup <user@host>  rex vps status <user@host>')
      }
      break
    }

    case 'queue': {
      const sub = process.argv[3]
      const { getQueueStats, replayUnacked, getEventLog } = await import('./sync-queue.js')
      const jsonFlag = process.argv.includes('--json')
      switch (sub) {
        case 'stats': {
          const stats = getQueueStats()
          if (jsonFlag) {
            console.log(JSON.stringify({ total: stats.total, pending: stats.unacked, acked: stats.total - stats.unacked, byType: stats.byType }))
          } else {
            console.log(`\n${COLORS.bold}REX Queue Stats${COLORS.reset}`)
            console.log(`  Total events: ${stats.total}`)
            console.log(`  Unacked:      ${stats.unacked}`)
            for (const [type, count] of Object.entries(stats.byType)) {
              console.log(`  ${COLORS.dim}${type.padEnd(22)}${COLORS.reset} ${count}`)
            }
          }
          break
        }
        case 'replay': {
          console.log(`${COLORS.cyan}Replaying unacked events...${COLORS.reset}`)
          const result = await replayUnacked()
          console.log(`  Processed: ${result.processed}, Failed: ${result.failed}`)
          break
        }
        case 'log': {
          const linesArg = process.argv.find(a => a.startsWith('--lines='))
          const n = linesArg ? parseInt(linesArg.split('=')[1]) : 20
          const events = getEventLog(n)
          console.log(`\n${COLORS.bold}Recent Events${COLORS.reset} (${events.length})\n`)
          for (const e of events) {
            const dot = e.acked ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.yellow}○${COLORS.reset}`
            const ts = e.timestamp.split('T')[1]?.slice(0, 8) || ''
            console.log(`  ${dot} ${COLORS.dim}${ts}${COLORS.reset} ${e.type.padEnd(22)} ${COLORS.dim}${e.source}${COLORS.reset}`)
          }
          break
        }
        default:
          console.log(`Usage: rex queue [stats|replay|log]`)
      }
      break
    }

    case 'journal': {
      const sub = process.argv[3]
      const { getJournalStats, replayUnacked } = await import('./event-journal.js')
      const jsonFlag = process.argv.includes('--json')
      if (sub === 'replay') {
        console.log(`${COLORS.cyan}Replaying unacked journal events...${COLORS.reset}`)
        const result = replayUnacked()
        console.log(`  Replayed: ${result.replayed} / ${result.total}`)
      } else {
        const stats = getJournalStats()
        if (jsonFlag) {
          console.log(JSON.stringify(stats, null, 2))
        } else {
          console.log(`\n${COLORS.bold}REX Event Journal${COLORS.reset}`)
          console.log(`  Total events: ${stats.total}`)
          console.log(`  Unacked:      ${stats.unacked}`)
          if (stats.oldest) console.log(`  Oldest:       ${COLORS.dim}${stats.oldest}${COLORS.reset}`)
          if (stats.newest) console.log(`  Newest:       ${COLORS.dim}${stats.newest}${COLORS.reset}`)
          if (Object.keys(stats.byType).length > 0) {
            console.log(`\n  ${COLORS.bold}By Type${COLORS.reset}`)
            for (const [type, count] of Object.entries(stats.byType)) {
              console.log(`    ${type.padEnd(22)} ${count}`)
            }
          }
          if (Object.keys(stats.bySource).length > 0) {
            console.log(`\n  ${COLORS.bold}By Source${COLORS.reset}`)
            for (const [source, count] of Object.entries(stats.bySource)) {
              console.log(`    ${source.padEnd(22)} ${count}`)
            }
          }
        }
      }
      break
    }

    case 'cache': {
      const sub = process.argv[3]
      const { cacheStats, cacheClean } = await import('./semantic-cache.js')
      const jsonFlag = process.argv.includes('--json')
      if (sub === 'clean') {
        const removed = cacheClean()
        console.log(`${COLORS.green}✓${COLORS.reset} Removed ${removed} expired cache entries`)
      } else {
        const stats = cacheStats()
        if (jsonFlag) {
          console.log(JSON.stringify(stats, null, 2))
        } else {
          console.log(`\n${COLORS.bold}REX Semantic Cache${COLORS.reset}`)
          console.log(`  Entries:       ${stats.totalEntries}`)
          console.log(`  Total hits:    ${stats.totalHits}`)
          console.log(`  Tokens saved:  ${stats.totalTokensSaved}`)
          console.log(`  Hit rate:      ${(stats.hitRate).toFixed(1)}x per entry`)
          if (Object.keys(stats.byModel).length > 0) {
            console.log(`\n  ${COLORS.bold}By Model${COLORS.reset}`)
            for (const [model, count] of Object.entries(stats.byModel)) {
              console.log(`    ${model.padEnd(22)} ${count}`)
            }
          }
          if (Object.keys(stats.byTaskType).length > 0) {
            console.log(`\n  ${COLORS.bold}By Task Type${COLORS.reset}`)
            for (const [task, count] of Object.entries(stats.byTaskType)) {
              console.log(`    ${task.padEnd(22)} ${count}`)
            }
          }
        }
      }
      break
    }

    case 'providers': {
      const { createDefaultRegistry, showProviders } = await import('./providers.js')
      const jsonFlag = process.argv.includes('--json')
      const registry = createDefaultRegistry()
      await registry.checkAll({ silent: jsonFlag })
      if (jsonFlag) {
        console.log(JSON.stringify(registry.listAll(), null, 2))
      } else {
        await showProviders()
      }
      break
    }

    case 'budget': {
      const { showBudget, getBudgetSummary } = await import('./budget.js')
      const jsonFlag = process.argv.includes('--json')
      if (jsonFlag) {
        console.log(JSON.stringify(getBudgetSummary(), null, 2))
      } else {
        showBudget()
      }
      break
    }

    case 'runbooks': {
      const sub = process.argv[3]
      const { showRunbooks, saveRunbook, deleteRunbook, listRunbooks } = await import('./observer.js')
      const jsonFlag = process.argv.includes('--json')
      if (jsonFlag && sub !== 'add' && sub !== 'delete') {
        console.log(JSON.stringify({ runbooks: listRunbooks() }))
        break
      }
      switch (sub) {
        case 'add': {
          const name = process.argv[4]
          const triggerArg = process.argv.find(a => a.startsWith('--trigger='))
          const stepsArg = process.argv.find(a => a.startsWith('--steps='))
          if (!name || !triggerArg || !stepsArg) {
            console.log('Usage: rex runbooks add <name> --trigger="..." --steps="step1,step2,step3"')
            break
          }
          const trigger = triggerArg.split('=').slice(1).join('=')
          const steps = stepsArg.split('=').slice(1).join('=').split(',')
          const id = saveRunbook(name, trigger, steps)
          console.log(`${COLORS.green}✓${COLORS.reset} Runbook #${id} saved: ${name}`)
          break
        }
        case 'delete': {
          const id = parseInt(process.argv[4])
          if (!id) { console.log('Usage: rex runbooks delete <id>'); break }
          const ok = deleteRunbook(id)
          console.log(ok ? `${COLORS.green}✓${COLORS.reset} Runbook #${id} deleted` : `${COLORS.red}✗${COLORS.reset} Runbook #${id} not found`)
          break
        }
        default:
          showRunbooks()
      }
      break
    }

    case 'orchestrate': {
      const providerArg = process.argv.find(a => a.startsWith('--provider='))
      const promptArgs = process.argv.slice(3).filter(a => !a.startsWith('--'))
      const prompt = promptArgs.join(' ')
      if (!prompt) {
        console.log('Usage: rex orchestrate <prompt> [--provider=ollama]')
        break
      }
      const { orchestrate } = await import('./orchestrator.js')
      try {
        const result = await orchestrate(prompt, {
          preferProvider: providerArg ? providerArg.split('=')[1] : undefined,
        })
        console.log(result.response)
        console.log(`\n${COLORS.dim}[${result.provider}${result.fallbackUsed ? ' (fallback)' : ''} — ${result.durationMs}ms]${COLORS.reset}`)
      } catch (e: any) {
        console.log(`${COLORS.red}✗${COLORS.reset} ${e.message}`)
      }
      break
    }

    case 'reflect': {
      const logPath = process.argv[3]
      const { reflectOnSession, showReflection, suggestRunbooks } = await import('./reflector.js')
      const jsonFlag = process.argv.includes('--json')
      if (logPath) {
        const result = await reflectOnSession(logPath)
        if (jsonFlag) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          showReflection(result)
        }
      } else {
        // Suggest runbooks for current context
        const cwd = process.cwd()
        const suggestions = suggestRunbooks(cwd)
        if (jsonFlag) {
          console.log(JSON.stringify({ suggestions }))
        } else if (suggestions.length > 0) {
          console.log(`\n${COLORS.bold}Suggested Runbooks${COLORS.reset} for ${COLORS.dim}${cwd}${COLORS.reset}\n`)
          for (const r of suggestions) {
            console.log(`  ${COLORS.cyan}#${r.id}${COLORS.reset} ${r.name}`)
            console.log(`  ${COLORS.dim}trigger: ${r.trigger}${COLORS.reset}\n`)
          }
        } else {
          console.log(`No runbook suggestions for current context.\nUsage: rex reflect <session-log-path>`)
        }
      }
      break
    }

    case 'curious': {
      // rex curious [--json] [--silent]
      const jsonFlag = process.argv.includes('--json')
      const { runCurious, printDiscoveries } = await import('./curious.js')
      const result = await runCurious({ silent: jsonFlag })
      if (jsonFlag) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        printDiscoveries(result)
      }
      break
    }

    case 'monitor': {
      // rex monitor [--json]
      const jsonFlag = process.argv.includes('--json')
      const { getDevStatus, printDevStatus } = await import('./dev-monitor.js')
      const report = await getDevStatus()
      if (jsonFlag) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        printDevStatus(report)
      }
      break
    }

    case 'observe': {
      const type = process.argv[3]
      const content = process.argv.slice(4).join(' ')
      if (!type || !content) {
        console.log('Usage: rex observe <type> <content>')
        console.log('Types: decision, blocker, solution, error, pattern, habit')
        break
      }
      const validTypes = ['decision', 'blocker', 'solution', 'error', 'pattern', 'habit']
      if (!validTypes.includes(type)) {
        console.log(`Invalid type "${type}". Valid: ${validTypes.join(', ')}`)
        break
      }
      const { addObservation } = await import('./observer.js')
      const id = addObservation('manual', process.cwd(), type as any, content)
      console.log(id > 0 ? `${COLORS.green}\u2713${COLORS.reset} Observation #${id} recorded (${type})` : `${COLORS.red}\u2717${COLORS.reset} Failed to record observation`)
      break
    }

    case 'observations': {
      const { showObservations, getObservationStats } = await import('./observer.js')
      const jsonFlag = process.argv.includes('--json')
      const typeArg = process.argv.find(a => a.startsWith('--type='))
      const projectArg = process.argv.find(a => a.startsWith('--project='))
      const opts: any = {}
      if (typeArg) opts.type = typeArg.split('=')[1]
      if (projectArg) opts.project = projectArg.split('=')[1]
      if (jsonFlag) {
        const { getObservations } = await import('./observer.js')
        const stats = getObservationStats()
        const obs = getObservations(opts)
        console.log(JSON.stringify({ observations: obs, stats }, null, 2))
      } else {
        showObservations(opts)
      }
      break
    }

    case 'habits': {
      const { showHabits, recordHabit, getHabits } = await import('./observer.js')
      const jsonFlag = process.argv.includes('--json')
      const sub = process.argv[3]
      if (sub === 'add') {
        const pattern = process.argv.slice(4).join(' ')
        if (!pattern) { console.log('Usage: rex habits add <pattern>'); break }
        const id = recordHabit(pattern)
        console.log(id > 0 ? `${COLORS.green}\u2713${COLORS.reset} Habit recorded (id=${id})` : `${COLORS.red}\u2717${COLORS.reset} Failed`)
      } else if (jsonFlag) {
        const minArg = process.argv.find(a => a.startsWith('--min='))
        const min = minArg ? parseInt(minArg.split('=')[1]) : 1
        console.log(JSON.stringify({ habits: getHabits(min) }, null, 2))
      } else {
        const minArg = process.argv.find(a => a.startsWith('--min='))
        const min = minArg ? parseInt(minArg.split('=')[1]) : 1
        showHabits(min)
      }
      break
    }

    case 'facts': {
      const { showFacts, addFact, getFacts, factStats } = await import('./observer.js')
      const jsonFlag = process.argv.includes('--json')
      const sub = process.argv[3]
      if (sub === 'add') {
        const category = process.argv[4]
        const content = process.argv.slice(5).join(' ')
        if (!category || !content) { console.log('Usage: rex facts add <category> <content>'); break }
        const sourceArg = process.argv.find(a => a.startsWith('--source='))
        const source = sourceArg ? sourceArg.split('=').slice(1).join('=') : ''
        const id = addFact(category, content, source)
        console.log(id > 0 ? `${COLORS.green}\u2713${COLORS.reset} Fact #${id} stored (${category})` : `${COLORS.red}\u2717${COLORS.reset} Failed`)
      } else if (jsonFlag) {
        const category = sub && sub !== '--json' ? sub : undefined
        const stats = factStats()
        const facts = getFacts(category)
        console.log(JSON.stringify({ facts, stats }, null, 2))
      } else {
        const category = sub || undefined
        showFacts(category)
      }
      break
    }

    case 'archive': {
      const { archiveOld, showArchiveResult, promotePatterns, getPromotedRules } = await import('./reflector.js')
      const jsonFlag = process.argv.includes('--json')
      const sub = process.argv[3]
      if (sub === 'promote') {
        const minArg = process.argv.find(a => a.startsWith('--min='))
        const min = minArg ? parseInt(minArg.split('=')[1]) : 3
        const promoted = promotePatterns(min)
        if (jsonFlag) {
          console.log(JSON.stringify({ promoted, existing: getPromotedRules() }, null, 2))
        } else if (promoted.length > 0) {
          console.log(`\n${COLORS.bold}Promoted Patterns${COLORS.reset}\n`)
          for (const p of promoted) {
            console.log(`  ${COLORS.green}\u2713${COLORS.reset} [${p.occurrences}x] ${p.pattern.slice(0, 70)}`)
          }
          console.log(`\n  ${promoted.length} new rule candidate${promoted.length === 1 ? '' : 's'}`)
        } else {
          console.log(`No new patterns to promote (min ${min} occurrences).`)
          const existing = getPromotedRules()
          if (existing.length > 0) {
            console.log(`\n${COLORS.bold}Existing Promoted Rules${COLORS.reset}\n`)
            for (const r of existing) {
              const dot = r.status === 'promoted' ? `${COLORS.green}\u25cf${COLORS.reset}` : r.status === 'rejected' ? `${COLORS.red}\u25cb${COLORS.reset}` : `${COLORS.yellow}\u25cb${COLORS.reset}`
              console.log(`  ${dot} #${r.id} [${r.occurrences}x] ${r.pattern.slice(0, 60)} — ${r.status}`)
            }
          }
        }
      } else {
        const result = archiveOld()
        if (jsonFlag) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          showArchiveResult(result)
        }
      }
      break
    }

    case 'sync': {
      const sub = process.argv[3]
      const { syncPush, syncPull, syncBidirectional, showSyncStatus, getSyncStatusData } = await import('./sync.js')
      const jsonFlag = process.argv.includes('--json')
      if (jsonFlag && sub !== 'push' && sub !== 'pull') {
        console.log(JSON.stringify(getSyncStatusData()))
        break
      }
      switch (sub) {
        case 'push': {
          const r = await syncPush()
          console.log(`${COLORS.green}✓${COLORS.reset} Pushed ${r.pushed} events${r.failed ? `, ${r.failed} failed` : ''}`)
          break
        }
        case 'pull': {
          const r = await syncPull()
          console.log(`${COLORS.green}✓${COLORS.reset} Pulled ${r.pulled} events`)
          break
        }
        case 'status':
          await showSyncStatus()
          break
        default: {
          const r = await syncBidirectional()
          console.log(`${COLORS.green}✓${COLORS.reset} Sync: pushed ${r.pushed}, pulled ${r.pulled}${r.failed ? `, ${r.failed} failed` : ''}`)
        }
      }
      break
    }

    case 'backup': {
      const sub = process.argv[3]
      const { backupNow, listBackups, restoreBackup, rotateBackups } = await import('./backup.js')
      switch (sub) {
        case 'list': {
          const backups = listBackups()
          const jsonFlag = process.argv.includes('--json')
          if (jsonFlag) {
            console.log(JSON.stringify({ backups }, null, 2))
          } else if (backups.length === 0) {
            console.log(`${COLORS.dim}No backups found.${COLORS.reset}`)
          } else {
            console.log(`\n${COLORS.bold}REX Backups${COLORS.reset}\n`)
            for (const b of backups) {
              console.log(`  ${COLORS.cyan}${b.filename}${COLORS.reset}  ${COLORS.dim}${b.sizeHuman}${COLORS.reset}`)
            }
            console.log()
          }
          break
        }
        case 'restore': {
          const path = process.argv[4]
          if (!path) { console.log('Usage: rex backup restore <path> --confirm'); break }
          const confirm = process.argv.includes('--confirm')
          const ok = restoreBackup(path, confirm)
          if (ok) console.log(`${COLORS.green}✓${COLORS.reset} Backup restored`)
          else if (!confirm) console.log(`${COLORS.yellow}!${COLORS.reset} Add --confirm to proceed with restore`)
          else console.log(`${COLORS.red}✗${COLORS.reset} Restore failed`)
          break
        }
        default: {
          const jsonFlag2 = process.argv.includes('--json')
          if (!jsonFlag2) console.log(`${COLORS.cyan}Creating backup...${COLORS.reset}`)
          const path = backupNow()
          if (path) {
            const removed = rotateBackups(7)
            if (jsonFlag2) {
              console.log(JSON.stringify({ success: true, path, rotated: removed }))
            } else {
              console.log(`${COLORS.green}✓${COLORS.reset} Backup saved: ${path}`)
              if (removed > 0) console.log(`${COLORS.dim}Rotated ${removed} old backups${COLORS.reset}`)
            }
          } else {
            if (jsonFlag2) {
              console.log(JSON.stringify({ success: false, path: null }))
            } else {
              console.log(`${COLORS.red}✗${COLORS.reset} Backup failed`)
            }
          }
        }
      }
      break
    }

    case 'workflow': {
      const sub = process.argv[3]
      switch (sub) {
        case 'feature': {
          const name = process.argv.slice(4).join(' ')
          if (!name) { console.log('Usage: rex workflow feature <name>'); break }
          const { startFeature } = await import('./workflow.js')
          startFeature(name)
          break
        }
        case 'bugfix': {
          const desc = process.argv.slice(4).join(' ')
          if (!desc) { console.log('Usage: rex workflow bugfix <description>'); break }
          const { startBugfix } = await import('./workflow.js')
          startBugfix(desc)
          break
        }
        case 'pr': {
          const { workflowPR } = await import('./workflow.js')
          workflowPR()
          break
        }
        case 'deploy': {
          const env = (process.argv[4] === 'prod' ? 'prod' : 'staging') as 'staging' | 'prod'
          const { workflowDeploy } = await import('./workflow.js')
          workflowDeploy(env)
          break
        }
        default:
          console.log(`Usage: rex workflow [feature|bugfix|pr|deploy [staging|prod]]`)
      }
      break
    }

    case 'guard': {
      const sub = process.argv[3]
      const { listGuards, enableGuard, disableGuard, getGuardLogs } = await import('./guard-manager.js')
      switch (sub) {
        case 'enable': {
          const name = process.argv[4]
          if (!name) { console.log('Usage: rex guard enable <name>'); break }
          const ok = enableGuard(name)
          console.log(ok ? `${COLORS.green}✓${COLORS.reset} Guard enabled: ${name}` : `${COLORS.red}✗${COLORS.reset} Guard not found: ${name}`)
          break
        }
        case 'disable': {
          const name = process.argv[4]
          if (!name) { console.log('Usage: rex guard disable <name>'); break }
          const ok = disableGuard(name)
          console.log(ok ? `${COLORS.green}✓${COLORS.reset} Guard disabled: ${name}` : `${COLORS.red}✗${COLORS.reset} Guard not found: ${name}`)
          break
        }
        case 'logs': {
          const name = process.argv[4] || undefined
          const logs = getGuardLogs(name)
          if (logs.length === 0) {
            console.log(`${COLORS.dim}No guard log entries found${name ? ` for ${name}` : ''}.${COLORS.reset}`)
          } else {
            console.log(`\n${COLORS.bold}Guard Logs${COLORS.reset}${name ? ` (${name})` : ''}\n`)
            for (const line of logs) console.log(`  ${line}`)
            console.log('')
          }
          break
        }
        case 'analyze': {
          const cmd = process.argv.slice(4).join(' ')
          if (!cmd) { console.log('Usage: rex guard analyze <command>'); break }
          const { analyzeCommand } = await import('./guard-ast.js')
          const result = analyzeCommand(cmd)
          const lc = result.level === 'block' ? COLORS.red : result.level === 'warn' ? COLORS.yellow : COLORS.green
          console.log(`\n${lc}${result.level.toUpperCase()}${COLORS.reset} — ${result.reason}`)
          console.log(`  Command: ${COLORS.dim}${result.command}${COLORS.reset}`)
          if (result.subcommands.length > 1) console.log(`  Subcommands: ${result.subcommands.join(' | ')}`)
          break
        }
        case 'list':
        default: {
          const guards = listGuards()
          if (guards.length === 0) {
            console.log(`${COLORS.dim}No guards found in ~/.claude/rex-guards/${COLORS.reset}`)
          } else {
            console.log(`\n${COLORS.bold}REX Guards${COLORS.reset}\n`)
            for (const g of guards) {
              const dot = g.enabled ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`
              console.log(`  ${dot} ${COLORS.bold}${g.name.padEnd(24)}${COLORS.reset} ${COLORS.dim}${g.hook.padEnd(30)}${COLORS.reset} ${g.description}`)
            }
            console.log('')
          }
          break
        }
      }
      break
    }

    case 'guard-ast': {
      // PreToolUse hook entry point — reads CLAUDE_TOOL_INPUT env, outputs hook JSON
      const { runGuardCli } = await import('./guard-ast.js')
      runGuardCli()
      break
    }

    case 'review': {
      const { runReview, printReviewResults } = await import('./review.js')
      const jsonFlag = process.argv.includes('--json')
      const mode = process.argv.includes('--ai') ? 'ai' as const
        : process.argv.includes('--full') ? 'full' as const
        : 'quick' as const
      const results = runReview(mode)
      printReviewResults(results, jsonFlag)
      break
    }

    case 'lint-loop': {
      const targetPath = process.argv[3] ?? process.cwd()
      const maxIterations = Number(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? 5)
      const analyzerType = process.argv.includes('--eslint') ? 'eslint'
        : process.argv.includes('--secrets') ? 'secrets'
        : 'tsc'

      const { lintLoop, tscAnalyzer, eslintAnalyzer, secretScanAnalyzer } = await import('./lint-loop.js')
      const analyzer = analyzerType === 'eslint' ? eslintAnalyzer(targetPath)
        : analyzerType === 'secrets' ? secretScanAnalyzer(targetPath)
        : tscAnalyzer(targetPath)

      console.log(`Running lint loop (${analyzerType}, max ${maxIterations} iterations)...`)
      const result = await lintLoop({ targetPath, analyzer, maxIterations, verbose: true })

      if (result.converged) {
        console.log(`\x1b[32m✓\x1b[0m Converged in ${result.iterations} iteration(s) — clean.`)
      } else {
        console.log(`\x1b[33m!\x1b[0m Stopped after ${result.iterations} iteration(s) (${result.reason})`)
        if (result.finalReport) console.log(result.finalReport.slice(0, 500))
      }
      break
    }

    case 'debt': {
      // List TODO / FIXME / HACK comments across the project (zero LLM)
      const cwd = process.cwd()
      const jsonFlag = process.argv.includes('--json')
      const { execSync: debtExec } = await import('node:child_process')

      interface DebtItem { file: string; line: number; kind: string; text: string; ageDays: number }
      const items: DebtItem[] = []

      try {
        const grepOut = debtExec(
          `git grep -n -E "(TODO|FIXME|HACK|XXX)[:()]?" -- "*.ts" "*.js" "*.dart" "*.py" "*.sh" 2>/dev/null || true`,
          { cwd, encoding: 'utf-8', timeout: 10_000 }
        )
        for (const raw of grepOut.trim().split('\n').filter(Boolean)) {
          const m = raw.match(/^(.+?):(\d+):(.*)$/)
          if (!m) continue
          const [, file, lineStr, text] = m
          const kind = (/FIXME/i.test(text) ? 'FIXME' : /HACK/i.test(text) ? 'HACK' : /XXX/i.test(text) ? 'XXX' : 'TODO')
          let ageDays = 0
          try {
            const logOut = debtExec(
              `git log -1 --format="%ct" -- "${file}" 2>/dev/null`,
              { cwd, encoding: 'utf-8', timeout: 3000 }
            ).trim()
            if (logOut) ageDays = Math.floor((Date.now() / 1000 - parseInt(logOut)) / 86400)
          } catch {}
          items.push({ file, line: parseInt(lineStr), kind, text: text.trim().slice(0, 120), ageDays })
        }
      } catch {}

      if (jsonFlag) { console.log(JSON.stringify(items)); break }

      const debtBold = '\x1b[1m', debtReset = '\x1b[0m', debtDim = '\x1b[2m'
      const debtRed = '\x1b[31m', debtYellow = '\x1b[33m', debtCyan = '\x1b[36m'
      console.log(`\n${debtBold}REX Tech Debt — ${items.length} item(s)${debtReset}`)
      console.log('─'.repeat(72))
      const byKind: Record<string, DebtItem[]> = { FIXME: [], HACK: [], TODO: [], XXX: [] }
      for (const it of items) { byKind[it.kind]?.push(it) }
      for (const [kind, list] of Object.entries(byKind)) {
        if (!list.length) continue
        const color = kind === 'FIXME' ? debtRed : kind === 'HACK' ? debtYellow : debtCyan
        console.log(`\n${color}${debtBold}${kind} (${list.length})${debtReset}`)
        for (const it of list.sort((a, b) => b.ageDays - a.ageDays)) {
          const stale = it.ageDays > 7 ? `${debtRed}${it.ageDays}d old${debtReset}` : `${debtDim}${it.ageDays}d${debtReset}`
          console.log(`  ${debtBold}${it.file}:${it.line}${debtReset}  ${stale}`)
          console.log(`    ${debtDim}${it.text}${debtReset}`)
        }
      }
      console.log(`\n${debtDim}Stale items (>7d) shown in red. Use --json for machine output.${debtReset}\n`)
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

    case 'launch': {
      const { launchRex } = await import('./rex-launcher.js')
      const pathArg = process.argv.find(a => a.startsWith('--path='))?.split('=')[1]
      await launchRex(pathArg ?? process.cwd())
      break
    }

    case 'kill': {
      const { killRex } = await import('./rex-launcher.js')
      killRex()
      break
    }

    case 'relaunch': {
      const { relaunchRex } = await import('./rex-launcher.js')
      await relaunchRex(process.cwd())
      break
    }

    case 'free-tiers': {
      const testMode = process.argv.includes('--test')
      const jsonMode = process.argv.includes('--json')

      if (jsonMode) {
        console.log(JSON.stringify(getProvidersSnapshot()))
        break
      }

      const line = '─'.repeat(54)
      console.log(`\n${COLORS.bold}REX Free Tiers${COLORS.reset}  ${COLORS.dim}(Vercel AI SDK)${COLORS.reset}`)
      console.log(line)

      let configured = 0

      for (const p of FREE_TIER_PROVIDERS) {
        const hasKey = p.name === 'Ollama' ? true : !!getApiKey(p.envKey)
        if (hasKey) configured++
        const dot = hasKey ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`
        const keyStatus = p.name === 'Ollama'
          ? `${COLORS.green}local${COLORS.reset}`
          : hasKey
            ? `${COLORS.green}configured${COLORS.reset}`
            : `${COLORS.dim}set ${p.envKey}${COLORS.reset}`

        if (testMode && hasKey) {
          process.stdout.write(`  ${dot}  ${p.name.padEnd(14)} validating...`)
          const valid = await validateProvider(p)
          const validStr = valid ? `${COLORS.green}✓ valid${COLORS.reset}` : `${COLORS.red}✗ failed${COLORS.reset}`
          console.log(`\r  ${dot}  ${p.name.padEnd(14)} ${validStr.padEnd(20)} ${COLORS.dim}${p.rpmLimit} RPM · ${p.defaultModel}${COLORS.reset}`)
        } else {
          console.log(`  ${dot}  ${p.name.padEnd(14)} ${keyStatus.padEnd(25)} ${COLORS.dim}${p.rpmLimit} RPM · ${p.defaultModel}${COLORS.reset}`)
        }
      }

      console.log(`\n${line}`)
      console.log(`  ${configured}/${FREE_TIER_PROVIDERS.length} providers available`)

      if (configured <= 1) {
        console.log(`\n  ${COLORS.yellow}!${COLORS.reset} Add API keys to ${COLORS.dim}~/.claude/settings.json${COLORS.reset} under ${COLORS.dim}"env"${COLORS.reset}:`)
        console.log(`  ${COLORS.dim}GROQ_API_KEY, CEREBRAS_API_KEY, TOGETHER_API_KEY, MISTRAL_API_KEY${COLORS.reset}`)
        console.log(`  ${COLORS.dim}OPENROUTER_API_KEY, DEEPSEEK_API_KEY${COLORS.reset}`)
      }
      console.log()
      break
    }

    case 'pool':
    case 'accounts': {
      const { printPool, printSetupHint } = await import('./account-pool.js')
      const sub = process.argv[3] ?? 'list'
      if (sub === 'setup' || sub === 'add') { printSetupHint(); break }
      printPool()
      break
    }

    case 'llm-usage': {
      const { getUsageStats, getProviderUsageSummary, resetUsage } = await import('./litellm.js')
      const jsonFlag = process.argv.includes('--json')
      const resetFlag = process.argv.includes('--reset')

      if (resetFlag) {
        resetUsage()
        if (!jsonFlag) console.log(`${COLORS.green}✓${COLORS.reset} LLM usage stats reset`)
        break
      }

      const stats = getUsageStats()
      if (jsonFlag) {
        console.log(JSON.stringify(stats, null, 2))
        break
      }

      const summary = getProviderUsageSummary()
      const { DIM, BOLD, RESET, GREEN, YELLOW, CYAN, RED } = {
        DIM: '\x1b[2m', BOLD: '\x1b[1m', RESET: '\x1b[0m',
        GREEN: '\x1b[32m', YELLOW: '\x1b[33m', CYAN: '\x1b[36m', RED: '\x1b[31m',
      }
      console.log(`\n${BOLD}REX LLM Usage${RESET}`)
      console.log(DIM + '─'.repeat(60) + RESET)
      console.log(`  Total requests: ${CYAN}${stats.totalRequests}${RESET}  Errors: ${stats.totalErrors > 0 ? RED : DIM}${stats.totalErrors}${RESET}`)
      console.log(`  Since: ${DIM}${stats.lastResetAt}${RESET}`)

      if (summary.length > 0) {
        console.log(`\n  ${BOLD}By Provider${RESET}`)
        for (const u of summary) {
          const dot = u.errors === 0 ? `${GREEN}●${RESET}` : u.errors > u.requests / 2 ? `${RED}●${RESET}` : `${YELLOW}●${RESET}`
          console.log(`  ${dot} ${u.provider.padEnd(16)} ${CYAN}${u.requests}${RESET} req  ${DIM}~${Math.round(u.estimatedTokens / 1000)}k tokens${RESET}  ${u.rateLimits > 0 ? `${YELLOW}${u.rateLimits} RL${RESET}` : ''}`)
        }
      } else {
        console.log(`\n  ${DIM}No LLM calls recorded yet${RESET}`)
      }

      const cooldowns = stats.cooldowns
      if (cooldowns.length > 0) {
        console.log(`\n  ${YELLOW}Active cooldowns:${RESET}`)
        for (const c of cooldowns) {
          console.log(`    ${c.provider}: ${DIM}until ${c.cooldownUntil} (${c.reason})${RESET}`)
        }
      }

      if (stats.queueLength > 0) {
        console.log(`\n  ${YELLOW}Queued requests: ${stats.queueLength}${RESET}`)
      }
      console.log()
      break
    }

    case 'intent': {
      const { detectIntent, printIntent } = await import('./project-intent.js')
      const targetPath = process.argv[3] ?? process.cwd()
      const debugMode = process.argv.includes('--debug')
      const jsonMode = process.argv.includes('--json')
      const ctx = detectIntent(targetPath)
      if (jsonMode) {
        console.log(JSON.stringify(ctx, null, 2))
      } else {
        printIntent(ctx, debugMode)
      }
      break
    }

    case 'litellm-config': {
      const { generateLiteLLMConfig } = await import('./litellm-config.js')
      const outputArg = process.argv.find(a => a.startsWith('--output='))
      const output = outputArg?.split('=')[1]
      const print = process.argv.includes('--print')
      await generateLiteLLMConfig({ output, print })
      break
    }

    case 'ask': {
      // rex ask "<prompt>" [--task=<type>] [--skip-cache] [--json]
      const prompt = process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ')
      if (!prompt) {
        console.error('Usage: rex ask "<prompt>" [--task=code|classify|general] [--skip-cache] [--json]')
        process.exit(1)
      }
      const taskArg = process.argv.find(a => a.startsWith('--task='))
      const taskType = taskArg ? taskArg.split('=')[1] : 'general'
      const skipCache = process.argv.includes('--skip-cache')
      const jsonOut = process.argv.includes('--json')
      const { runPrompt } = await import('./backend-runner.js')
      const result = await runPrompt(prompt, { taskType, skipCache })
      if (jsonOut) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(result.response)
        console.error(`\n[${result.source} · ${result.latencyMs}ms]`)
      }
      break
    }

    // ── Agent Factory ──────────────────────────────────────────────────────
    case 'session-guard': {
      // rex session-guard         → check + print status (no Telegram)
      // rex session-guard --alert → check + send Telegram if thresholds hit
      // rex session-guard --clear → clear compact signal
      const { printSessionGuardStatus, checkSessionGuard, clearCompactSignal, readCompactSignal } = await import('./session-guard.js')
      const subAction = process.argv[3]
      const jsonOut = process.argv.includes('--json')
      if (subAction === '--clear' || subAction === 'clear') {
        clearCompactSignal()
        if (!jsonOut) console.log('Compact signal cleared.')
      } else if (subAction === '--alert' || subAction === 'alert') {
        const report = await checkSessionGuard({ silent: false })
        if (jsonOut) {
          console.log(JSON.stringify({ ...report, signal: readCompactSignal() }, null, 2))
        } else if (report.alerted.length > 0) {
          console.log(`Alerts sent: ${report.alerted.join(', ')}`)
        } else {
          console.log(`No thresholds hit. ctx=${report.contextPercent.toFixed(0)}% daily=${report.dailyPercent.toFixed(0)}%`)
        }
      } else if (jsonOut) {
        const report = await checkSessionGuard({ silent: true })
        console.log(JSON.stringify({ ...report, signal: readCompactSignal() }, null, 2))
      } else {
        await printSessionGuardStatus()
      }
      break
    }

    case 'burn-rate': {
      // rex burn-rate          → print dashboard
      // rex burn-rate --json   → JSON output for Flutter
      const { getBurnRateStats, printBurnRateDashboard } = await import('./burn-rate.js')
      const jsonOut = process.argv.includes('--json')
      if (jsonOut) {
        const stats = getBurnRateStats(true)
        console.log(JSON.stringify({
          sessionTokensIn: stats.sessionTokensIn,
          sessionTokensOut: stats.sessionTokensOut,
          sessionTotal: stats.sessionTotal,
          sessionDurationMs: stats.sessionDurationMs,
          burnRatePerMin: stats.burnRatePerMin,
          burnRatePerHour: stats.burnRatePerHour,
          contextUsed: stats.contextUsed,
          contextTotal: stats.contextTotal,
          contextPercent: stats.contextPercent,
          dailyTokensIn: stats.dailyTokensIn,
          dailyTokensOut: stats.dailyTokensOut,
          dailyTotal: stats.dailyTotal,
          dailyLimit: stats.dailyLimit,
          dailyPercent: stats.dailyPercent,
          estimatedMinutesLeft: stats.estimatedMinutesLeft,
          estimatedDepletionAt: stats.estimatedDepletionAt?.toISOString() ?? null,
        }, null, 2))
      } else {
        printBurnRateDashboard()
      }
      break
    }

    case 'create-client': {
      // rex create-client --name "Jean Martin" --trade "plombier" [--plan=pro] [--phone=...] [--email=...] [--dry-run]
      const { createClient, printClientDetail } = await import('./client-factory.js')
      const nameArg  = process.argv.find(a => a.startsWith('--name='))?.split('=').slice(1).join('=')
          || (process.argv.indexOf('--name')  !== -1 ? process.argv[process.argv.indexOf('--name') + 1]  : undefined)
      const tradeArg = process.argv.find(a => a.startsWith('--trade='))?.split('=').slice(1).join('=')
          || (process.argv.indexOf('--trade') !== -1 ? process.argv[process.argv.indexOf('--trade') + 1] : undefined)
      const planArg  = (process.argv.find(a => a.startsWith('--plan='))?.split('=')[1] ?? 'pro') as 'starter' | 'pro' | 'enterprise'
      const phoneArg = process.argv.find(a => a.startsWith('--phone='))?.split('=').slice(1).join('=')
      const emailArg = process.argv.find(a => a.startsWith('--email='))?.split('=').slice(1).join('=')
      const dryRun   = process.argv.includes('--dry-run')
      if (!nameArg || !tradeArg) {
        console.error('Usage: rex create-client --name "Jean Martin" --trade "plombier" [--plan=pro] [--phone=+33...] [--email=...] [--dry-run]')
        process.exit(1)
      }
      const client = await createClient({ name: nameArg, trade: tradeArg, plan: planArg, phone: phoneArg, email: emailArg, dryRun })
      printClientDetail(client)
      break
    }

    case 'clients': {
      // rex clients [list|status <id>|pause <id>|resume <id>|remove <id> [--purge]]
      const { listClients, getClient, pauseClient, resumeClient, removeClient, printClients, printClientDetail } = await import('./client-factory.js')
      const sub = process.argv[3]
      switch (sub) {
        case 'status': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex clients status <id>'); process.exit(1) }
          const c = getClient(id)
          if (!c) { console.error(`Client not found: ${id}`); process.exit(1) }
          printClientDetail(c)
          break
        }
        case 'pause': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex clients pause <id>'); process.exit(1) }
          await pauseClient(id)
          console.log(`Paused: ${id}`)
          break
        }
        case 'resume': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex clients resume <id>'); process.exit(1) }
          await resumeClient(id)
          console.log(`Resumed: ${id}`)
          break
        }
        case 'remove': {
          const id = process.argv[4]
          if (!id) { console.error('Usage: rex clients remove <id> [--purge]'); process.exit(1) }
          await removeClient(id, { purge: process.argv.includes('--purge') })
          console.log(`Removed: ${id}`)
          break
        }
        case 'list':
        default: {
          const jsonOut = process.argv.includes('--json')
          const cs = listClients()
          if (jsonOut) {
            console.log(JSON.stringify(cs, null, 2))
          } else {
            printClients(cs)
          }
        }
      }
      break
    }

    // ── Sandbox ────────────────────────────────────────────────────────────
    case 'sandbox': {
      const { sandboxRun, sandboxShell, sandboxClaude, sandboxCodex, printSandboxStatus, detectRisk } = await import('./sandbox.js')
      const sub = process.argv[3]
      const modeArg = process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] as 'light' | 'full' | 'off' | undefined
      const mode = modeArg ?? 'light'
      const noNetwork = process.argv.includes('--no-network')

      switch (sub) {
        case 'status': {
          printSandboxStatus(mode)
          break
        }
        case 'shell': {
          await sandboxShell({ mode })
          break
        }
        case 'run': {
          const cmd = process.argv.slice(4).join(' ')
          if (!cmd) { console.error('Usage: rex sandbox run "<command>"'); process.exit(1) }
          const risk = detectRisk(cmd)
          if (risk.level === 'full' && mode === 'light') {
            console.log(`\x1b[33m! Risk detected: ${risk.reason}\x1b[0m`)
            console.log(`  Consider: rex sandbox run "${cmd}" --mode=full`)
          }
          await sandboxRun(cmd, { mode, network: !noNetwork })
          break
        }
        case 'claude': {
          const task = process.argv.slice(4).join(' ')
          if (!task) { console.error('Usage: rex sandbox claude "<task>"'); process.exit(1) }
          await sandboxClaude(task, { mode, network: !noNetwork })
          break
        }
        case 'codex': {
          const task = process.argv.slice(4).join(' ')
          if (!task) { console.error('Usage: rex sandbox codex "<task>"'); process.exit(1) }
          await sandboxCodex(task, { mode, network: !noNetwork })
          break
        }
        default: {
          printSandboxStatus(mode)
          console.log('Usage:')
          console.log('  rex sandbox status              Show sandbox runtime status')
          console.log('  rex sandbox shell               Interactive shell in sandbox')
          console.log('  rex sandbox run "<cmd>"         Run command in sandbox')
          console.log('  rex sandbox claude "<task>"     Run Claude Code in sandbox')
          console.log('  rex sandbox codex "<task>"      Run Codex in sandbox')
          console.log()
          console.log('Flags:')
          console.log('  --mode=light|full|off           Isolation level (default: light)')
          console.log('  --no-network                    Block network access in sandbox')
        }
      }
      break
    }

    // ── Project Init ────────────────────────────────────────────────────────
    case 'project': {
      const sub = process.argv[3]
      if (sub === 'init') {
        const { initProject, previewInit } = await import('./project-init.js')
        const targetPath = process.argv.find(a => a.startsWith('--path='))?.split('=')[1] ?? process.cwd()
        const dryRun = process.argv.includes('--dry-run')
        const force = process.argv.includes('--force')
        const github = process.argv.includes('--github')

        if (dryRun) {
          console.log(`\n\x1b[1mREX Project Init\x1b[0m  \x1b[2m(dry-run)\x1b[0m\n`)
          await previewInit(targetPath)
        } else {
          console.log(`\n\x1b[1mREX Project Init\x1b[0m\n`)
          await initProject(targetPath, { github, dryRun, force })
        }
      } else {
        console.log('Usage:')
        console.log('  rex project init             Bootstrap project (CLAUDE.md + git + skills)')
        console.log('  rex project init --github    + create GitHub repo via gh')
        console.log('  rex project init --force     Overwrite existing CLAUDE.md')
        console.log('  rex project init --dry-run   Preview without changes')
      }
      break
    }

    case undefined: {
      // First run? Run the wizard so the user gets the "wow moment" before launching
      const { isFirstRun, setupWizard } = await import('./setup-wizard.js')
      if (isFirstRun()) {
        await setupWizard()
        break
      }
      // Normal launch: spawn Claude Code with intent-driven profile
      const { launchRex } = await import('./rex-launcher.js')
      await launchRex(process.cwd())
      break
    }

    case 'help':
    default:
      console.log(`
${COLORS.bold}REX${COLORS.reset} — Claude Code sous steroides

${COLORS.bold}Launch:${COLORS.reset}
  rex                 Launch Claude Code with intent-driven profile (default)
  rex kill            SIGTERM the active Claude session
  rex relaunch        Kill + restart with fresh intent profile

${COLORS.bold}Commands:${COLORS.reset}
  rex install         One-command setup (init + setup + audit)
  rex init            Setup REX (guards, hooks, MCP, startup)
  rex init --docker   Generate docker-compose.local.yml + .env.docker for VPS deployment
  rex audit           Run integration audit checks
  rex doctor          Full health check (9 categories)
  rex doctor --fix    Auto-fix common issues then check
  rex status          Quick one-line status
  rex startup         Install LaunchAgent (auto-start on login)
  rex startup-remove  Remove LaunchAgent

${COLORS.bold}Guards:${COLORS.reset}
  rex guard list              List all guards with status
  rex guard enable <name>     Enable a guard
  rex guard disable <name>    Disable a guard
  rex guard logs [name]       Show guard trigger logs
  rex guard analyze <cmd>     Analyze command safety (AST-level)
  rex guard-ast               Hook entry point (reads CLAUDE_TOOL_INPUT)
  rex doctor --lint-config    Lint CLAUDE.md, hooks, and MCP configs

${COLORS.bold}Review:${COLORS.reset}
  rex review                  Quick review (TypeScript + secrets)
  rex review --full           Full review (+ lint + tests)
  rex review --ai             AI-assisted review (requires provider)
  rex review --json           JSON output
  rex debt                    List TODO/FIXME/HACK with age (stale >7d in red)
  rex debt --json             Machine-readable debt list

${COLORS.bold}Memory (requires Ollama):${COLORS.reset}
  rex migrate          Migrate ~/.rex-memory/ to ~/.claude/rex/ hub
  rex ingest           Sync session history to vector DB
  rex search <query>   Semantic search across past sessions
  rex categorize       Classify uncategorized memories
  rex consolidate      Merge similar memories (cosine clustering)
  rex recategorize     Re-classify session memories with AI
  rex reindex          Re-embed all memories with current Ollama model
  rex reindex --dry-run  Preview without re-embedding
  rex optimize         Analyze CLAUDE.md with local LLM
  rex optimize --apply Apply optimizations (with backup)
  rex memory-check     Memory integrity & health report
  rex memory-check --json  Output as JSON
  rex prune            Cleanup old/duplicate memories
  rex prune --stats    Show memory database stats
  rex curious          Discover new models, MCPs, and AI news (--json)
  rex monitor          Dev status snapshot: git activity, sessions, memory (--json)
  rex self-review      Extract lessons, detect error patterns
  rex promote-rule N   Promote rule candidate to ~/.claude/rules/
  rex reflect <log>    Extract success patterns from session log
  rex reflect          Suggest runbooks for current context
  rex observe <t> <c>  Record observation (decision/blocker/solution/error/pattern/habit)
  rex observations     List observations (--type=, --project=, --json)
  rex habits           Show detected habits (--min=N, --json)
  rex habits add <p>   Record a habit pattern
  rex facts [category] Show stored facts (--json)
  rex facts add <c> <t> Store a fact (--source=)
  rex archive          Run forgetting curve (compress/archive old observations)
  rex archive promote  Promote recurring patterns to rules (--min=N)

${COLORS.bold}LLM & Context:${COLORS.reset}
  rex setup            Install Ollama + models + Telegram gateway (interactive)
  rex setup --quick    Zero-question setup: auto-detect everything, write optimal config
  rex setup --yes      Non-interactive setup (auto-install deps, env-based Telegram)
  rex llm <prompt>     Query local LLM directly
  rex inventory       Scan local resources (CLIs, services, hardware, models) [alias: resources]
  rex models           Show task-aware model routing table (--catalog for full list)
  rex preload [path]   Show pre-loaded context for a path
  rex context [path]   Analyze project, recommend MCP/skills
  rex projects         Scan and index all dev projects
  rex intent [path]    Detect project intent from git signals (new/feature/fix/refactor)
  rex intent --debug   Show raw signals used for detection
  rex intent --json    JSON output

${COLORS.bold}Agent Factory (B2B):${COLORS.reset}
  rex create-client --name "..." --trade "plombier" [--plan=pro] [--phone=...] [--email=...] [--dry-run]
                     Provision a client agent stack (Dify + n8n + Twenty CRM)
  rex clients list             List all client agents
  rex clients status <id>      Show client detail + URLs
  rex clients pause <id>       Stop client docker stack
  rex clients resume <id>      Restart client docker stack
  rex clients remove <id>      Mark removed (--purge to delete all data)

${COLORS.bold}Account Pool:${COLORS.reset}
  rex pool             List Claude accounts in the pool
  rex pool setup       Show instructions to add more accounts
  rex accounts         Alias for rex pool (list/add)

${COLORS.bold}Sandbox:${COLORS.reset}
  rex sandbox status           Show isolation runtime status (seatbelt/docker)
  rex sandbox shell            Interactive shell in sandbox
  rex sandbox run "<cmd>"      Run command with OS-level isolation
  rex sandbox claude "<task>"  Run Claude Code in sandbox
  rex sandbox codex "<task>"   Run Codex in sandbox
  Flags: --mode=light|full|off  --no-network

${COLORS.bold}Project Bootstrap:${COLORS.reset}
  rex project init             Detect stack, create CLAUDE.md, init git, install skills
  rex project init --github    + create private GitHub repo via gh
  rex project init --force     Overwrite existing CLAUDE.md
  rex project init --dry-run   Preview without changes

${COLORS.bold}Providers & Budget:${COLORS.reset}
  rex providers        Show available providers (owned-first order)
  rex budget           Show usage tracking and costs
  rex llm-usage        Show per-provider LLM call stats (--reset to clear)
  rex orchestrate <p>  Run prompt through best provider
  rex runbooks         List saved workflow runbooks
  rex runbooks add     Save a new runbook

${COLORS.bold}Event Journal & Cache:${COLORS.reset}
  rex journal          Show event journal stats (--json)
  rex journal replay   Replay unacked journal events
  rex cache            Show semantic cache stats (--json)
  rex cache clean      Remove expired cache entries

${COLORS.bold}LLM Backend:${COLORS.reset}
  rex backend          Show active LLM backend + models
  rex backend switch <type> [url]  Switch backend (ollama|llama-cpp|localai|vllm|llamafile)
  rex backend info [type]  Describe a backend (install + platform notes)
  rex backend test     Run live generate test against active backend

${COLORS.bold}Tool Registry:${COLORS.reset}
  rex tools            List all tools with tier and status
  rex tools check      Re-check tool availability, sync
  rex tools enable <id>   Enable a tool
  rex tools disable <id>  Disable a tool

${COLORS.bold}LiteLLM:${COLORS.reset}
  rex litellm-config         Generate litellm_config.yaml from detected providers
  rex litellm-config --print Print config to stdout (no file write)
  rex litellm-config --output=<path>  Write to custom path

${COLORS.bold}Fleet: Commander & Specialists:${COLORS.reset}
  rex hub              Start Fleet Commander API server (port 7420)
  rex hub token        Generate a secure Commander token
  rex hub --port=N     Start Commander on custom port
  rex mesh             Show all Specialists + capabilities (alias: rex nodes)
  rex nodes            Alias for rex mesh
  rex node status      Show Specialist identity and Commander connection
  rex node register    Register this Specialist with Commander
  rex sync             Bidirectional sync with Commander
  rex sync push/pull   One-way sync
  rex sync status      Show sync state
  rex queue stats      Show event queue statistics
  rex queue replay     Replay unacked events
  rex queue log        Show recent events (--lines=N)

${COLORS.bold}Backup & Recovery:${COLORS.reset}
  rex backup           Create full backup (SQLite DBs + config)
  rex backup list      List available backups
  rex backup restore   Restore from backup (requires --confirm)

${COLORS.bold}Workflow:${COLORS.reset}
  rex workflow feature <name>   Start feature branch + FEATURE.md
  rex workflow bugfix <desc>    Start bugfix branch + BUG.md
  rex workflow pr               Push + create PR via gh
  rex workflow deploy [env]     Deploy to staging|prod (review + CI check + tag)

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
  rex mcp auto                 Recommend MCP servers for the current project stack
  rex mcp scan                 Security scan via mcp-scan (tool poisoning, prompt injection)
  rex mcp refresh-marketplace  Refresh cache from awesome-mcp-servers + Smithery

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
