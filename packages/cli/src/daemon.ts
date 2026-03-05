// packages/cli/src/daemon.ts
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { MEMORY_DB_PATH, PENDING_DIR, BACKUPS_DIR, DAEMON_LOG_PATH, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'
import { createLogger, rotateLog } from './logger.js'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const log = createLogger('daemon')

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}

async function restartOllama(): Promise<boolean> {
  try {
    execSync('ollama serve &', { timeout: 5000, stdio: 'ignore' })
    await new Promise(r => setTimeout(r, 3000))
    return checkOllama()
  } catch { return false }
}

function checkDiskSpace(): number {
  try {
    const output = execSync("df -g ~ | tail -1 | awk '{print $4}'", { encoding: 'utf-8' }).trim()
    return parseInt(output) || 999
  } catch { return 999 }
}

function checkDbIntegrity(): boolean {
  if (!existsSync(MEMORY_DB_PATH)) return true
  try {
    const result = execSync(`sqlite3 "${MEMORY_DB_PATH}" "PRAGMA integrity_check"`, { encoding: 'utf-8' }).trim()
    return result === 'ok'
  } catch { return false }
}

function backupDb(): void {
  if (!existsSync(MEMORY_DB_PATH)) return
  const date = new Date().toISOString().split('T')[0]
  const backupPath = join(BACKUPS_DIR, `rex-${date}.sqlite`)
  if (existsSync(backupPath)) return // already backed up today
  copyFileSync(MEMORY_DB_PATH, backupPath)
  log.info(`Backup: ${backupPath}`)
}

function pruneBackups(retainDays: number = 7): void {
  if (!existsSync(BACKUPS_DIR)) return
  const cutoff = Date.now() - retainDays * 86400_000
  for (const f of readdirSync(BACKUPS_DIR)) {
    const fPath = join(BACKUPS_DIR, f)
    try {
      if (statSync(fPath).mtimeMs < cutoff) {
        unlinkSync(fPath)
        log.debug(`Pruned backup: ${f}`)
      }
    } catch {}
  }
}

function countPending(): number {
  if (!existsSync(PENDING_DIR)) return 0
  return readdirSync(PENDING_DIR).filter(f => f.endsWith('.json')).length
}

function runCmd(cmd: string, timeout: number = 120_000): void {
  try {
    execSync(cmd, { timeout, encoding: 'utf-8', stdio: 'pipe' })
  } catch (e: any) {
    log.error(`Command error (${cmd.slice(0, 30)}): ${e.message?.slice(0, 200)}`)
  }
}

async function sendTelegramNotify(message: string): Promise<void> {
  try {
    const token = process.env.REX_TELEGRAM_BOT_TOKEN
    const chatId = process.env.REX_TELEGRAM_CHAT_ID
    if (!token || !chatId) return
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {}
}

// ─── Health Check (every 5 min) ────────────────────────────
async function healthCheck(): Promise<void> {
  const ollamaUp = await checkOllama()

  if (!ollamaUp) {
    log.warn('Ollama down — attempting restart')
    const restarted = await restartOllama()
    if (restarted) log.info('Ollama restarted successfully')
    else log.error('Ollama restart failed')
  }

  // Process pending if Ollama is now up
  if (await checkOllama()) {
    const pending = countPending()
    if (pending > 0) {
      log.info(`Processing ${pending} pending files`)
      runCmd('rex ingest')
    }
  }

  // Check DB integrity
  if (!checkDbIntegrity()) {
    log.error('DB integrity check FAILED')
    const backups = existsSync(BACKUPS_DIR) ? readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.sqlite')).sort().reverse() : []
    if (backups.length) {
      copyFileSync(join(BACKUPS_DIR, backups[0]), MEMORY_DB_PATH)
      log.warn(`Restored DB from ${backups[0]}`)
      await sendTelegramNotify('⚠️ REX: DB integrity fail — restored from backup')
    }
  }

  // Check disk space
  const freeGb = checkDiskSpace()
  if (freeGb < 1) {
    log.warn(`Disk low: ${freeGb}GB free`)
    pruneBackups(3)
    await sendTelegramNotify(`⚠️ REX: Disk low (${freeGb}GB free)`)
  }
}

// ─── Ingest Cycle (every 30 min) ──────────────────────────
async function ingestCycle(): Promise<void> {
  log.info('Ingest cycle start')
  runCmd('rex ingest')
  runCmd('rex categorize --batch=100', 180_000)
  runCmd('rex recategorize --batch=20', 180_000)
  log.info('Ingest cycle done')
}

// ─── Maintenance (every 60 min) ───────────────────────────
async function maintenanceCycle(): Promise<void> {
  log.info('Maintenance cycle start')
  backupDb()
  pruneBackups(7)
  runCmd('rex projects', 30_000)

  rotateLog()
  log.info('Maintenance cycle done')
}

// ─── Self-Review (every 24h) ──────────────────────────────
async function selfReviewCycle(): Promise<void> {
  log.info('Self-review cycle start')
  runCmd('rex self-review')

  const config = loadConfig()
  if (config.notifications.daily) {
    try {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(MEMORY_DB_PATH, { readonly: true })
      const total = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c
      const today = new Date().toISOString().split('T')[0]
      const todayCount = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE created_at >= ?").get(today) as any).c
      const uncategorized = (db.prepare("SELECT COUNT(*) as c FROM memories WHERE category IN ('session', 'general')").get() as any).c
      db.close()

      const msg = `🦖 *REX Daily*\n\nMemories: ${total} total, +${todayCount} today\nUncategorized: ${uncategorized}\nDisk: ${checkDiskSpace()}GB free`
      await sendTelegramNotify(msg)
    } catch {}
  }

  log.info('Self-review cycle done')
}

// ─── Main Loop ────────────────────────────────────────────
export async function daemon(): Promise<void> {
  ensureRexDirs()
  const config = loadConfig()

  log.info('REX Daemon started')
  log.info(`Health: ${config.daemon.healthCheckInterval}s | Ingest: ${config.daemon.ingestInterval}s | Maintenance: ${config.daemon.maintenanceInterval}s | Self-review: ${config.daemon.selfReviewInterval}s`)

  // Initial health check
  await healthCheck()

  // Schedule loops
  let lastHealth = Date.now()
  let lastIngest = Date.now()
  let lastMaintenance = Date.now()
  let lastSelfReview = Date.now()

  // Run maintenance immediately on start
  await maintenanceCycle()

  while (true) {
    const now = Date.now()

    if (now - lastHealth >= config.daemon.healthCheckInterval * 1000) {
      await healthCheck()
      lastHealth = now
    }

    if (now - lastIngest >= config.daemon.ingestInterval * 1000) {
      await ingestCycle()
      lastIngest = now
    }

    if (now - lastMaintenance >= config.daemon.maintenanceInterval * 1000) {
      await maintenanceCycle()
      lastMaintenance = now
    }

    if (now - lastSelfReview >= config.daemon.selfReviewInterval * 1000) {
      await selfReviewCycle()
      lastSelfReview = now
    }

    // Sleep 30 seconds between loop iterations
    await new Promise(r => setTimeout(r, 30_000))
  }
}
