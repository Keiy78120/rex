// packages/cli/src/daemon.ts
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { MEMORY_DB_PATH, PENDING_DIR, BACKUPS_DIR, DAEMON_LOG_PATH, ensureRexDirs } from './paths.js'
import { loadConfig } from './config.js'
import { createLogger, rotateLog } from './logger.js'
import { collectInventory, saveInventoryCache } from './inventory.js'
import { syncBidirectional } from './sync.js'
import { purgeOldEvents } from './sync-queue.js'
import { appendEvent as journalAppend, purgeOldJournalEvents } from './event-journal.js'
import { cacheClean } from './semantic-cache.js'
import { getRoutableProviders } from './free-tiers.js'
import { buildLocalNodeInfo, registerWithHub } from './node-mesh.js'

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
    journalAppend('daemon_action', 'health-check', { action: 'ollama_restart_attempt' })
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
    journalAppend('daemon_action', 'health-check', { action: 'db_integrity_fail' })
    const backups = existsSync(BACKUPS_DIR) ? readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.sqlite')).sort().reverse() : []
    if (backups.length) {
      copyFileSync(join(BACKUPS_DIR, backups[0]), MEMORY_DB_PATH)
      log.warn(`Restored DB from ${backups[0]}`)
      journalAppend('daemon_action', 'health-check', { action: 'db_restored', backup: backups[0] })
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

  // Memory health check
  try {
    const { checkMemoryHealth } = await import('./memory-check.js')
    const mh = checkMemoryHealth()
    if (!mh.dbIntegrity.ok) log.warn(`Memory DB integrity: ${mh.dbIntegrity.message}`)
    if (mh.orphans.count > 0) log.warn(`${mh.orphans.count} memories without embeddings`)
    if (mh.duplicates.count > 0) log.info(`${mh.duplicates.count} duplicate memories detected`)
    if (mh.pending.count > 100) log.warn(`Pending queue large: ${mh.pending.count} files`)
    if (mh.pending.staleCount > 0) log.warn(`${mh.pending.staleCount} stale pending files (>24h)`)
  } catch (e: any) {
    log.debug(`Memory health check skipped: ${e.message?.slice(0, 100)}`)
  }
}

// ─── Ollama latency probe ─────────────────────────────────
async function measureOllamaLatencyMs(): Promise<number> {
  const start = Date.now()
  try {
    await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(15_000) })
    return Date.now() - start
  } catch {
    return Infinity
  }
}

// ─── Ingest Cycle (adaptive, every 30 min) ────────────────
async function ingestCycle(): Promise<void> {
  const pending = countPending()
  const latencyMs = await measureOllamaLatencyMs()
  const ollamaUp = latencyMs < 15_000

  log.info(`Ingest cycle start — pending=${pending}, ollama=${ollamaUp ? `${latencyMs}ms` : 'down'}`)

  // Always ingest (save to pending/ is instant, no Ollama needed)
  runCmd('rex ingest')

  if (!ollamaUp) {
    // Ollama down — skip embed/categorize, chunks already saved in pending/
    log.warn('Ollama down — skipping embed+categorize, will retry next cycle')
    return
  }

  if (pending > 2000) {
    // Urgency mode: embed only, skip categorize, alert
    log.warn(`Pending queue critical (${pending}) — embed-only urgency mode`)
    await sendTelegramNotify(`⚠️ REX: Ingest queue critical — ${pending} pending chunks, embed-only mode`)
    runCmd('rex ingest --max=200', 300_000)
    log.info('Ingest cycle done (urgency mode)')
    return
  }

  if (pending > 500) {
    // Backlog mode: embed only, defer categorize
    log.warn(`Pending queue large (${pending}) — embed-only, deferring categorize`)
    runCmd('rex ingest --max=100', 240_000)
    log.info('Ingest cycle done (backlog mode, categorize deferred)')
    return
  }

  if (latencyMs > 2_000) {
    // Ollama slow — embed only with tiny model, skip heavy categorize
    log.info(`Ollama slow (${latencyMs}ms) — embed-only mode, skipping categorize`)
    runCmd('rex ingest')
    log.info('Ingest cycle done (slow-ollama mode)')
    return
  }

  // Normal mode: full pipeline
  runCmd('rex ingest')
  runCmd('rex categorize --batch=100', 180_000)
  runCmd('rex recategorize --batch=20', 180_000)
  log.info('Ingest cycle done')
}

// ─── Full Backup (daily) ──────────────────────────────────
async function dailyBackup(): Promise<void> {
  try {
    const { lastBackupAge, backupNow, rotateBackups: rotateFullBackups } = await import('./backup.js')
    const age = lastBackupAge()
    // Run if no backup exists or last backup is >24h old
    if (age === null || age > 24 * 60 * 60 * 1000) {
      const path = backupNow()
      if (path) {
        rotateFullBackups(7)
        log.info('Daily full backup completed')
      }
    }
  } catch (e: any) {
    log.warn(`Daily backup failed: ${e.message?.slice(0, 200)}`)
  }
}

// ─── Maintenance (every 60 min) ───────────────────────────
async function maintenanceCycle(): Promise<void> {
  log.info('Maintenance cycle start')
  backupDb()
  pruneBackups(7)
  runCmd('rex projects', 30_000)

  rotateLog()

  // Clean expired cache entries
  try {
    const removed = cacheClean()
    if (removed > 0) log.info(`Cache cleaned: ${removed} expired entries`)
  } catch (e: any) {
    log.debug(`Cache clean skipped: ${e.message}`)
  }

  // Purge old journal events
  try {
    const purged = purgeOldJournalEvents(30)
    if (purged > 0) log.info(`Journal purged: ${purged} old events`)
  } catch (e: any) {
    log.debug(`Journal purge skipped: ${e.message}`)
  }

  // Auto-prune duplicate memories (direct SQL — prune.ts uses legacy path)
  try {
    const { checkMemoryHealth } = await import('./memory-check.js')
    const mh = checkMemoryHealth()
    if (mh.duplicates.count > 0) {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(MEMORY_DB_PATH)
      db.pragma('journal_mode = WAL')
      const dupes = db.prepare(`
        SELECT id FROM memories WHERE id NOT IN (
          SELECT MIN(id) FROM memories GROUP BY content
        )
      `).all() as Array<{ id: number }>
      if (dupes.length > 0) {
        const deleteVec = db.prepare('DELETE FROM memory_vec WHERE rowid = ?')
        const deleteMem = db.prepare('DELETE FROM memories WHERE id = ?')
        db.transaction(() => {
          for (const row of dupes) {
            try { deleteVec.run(row.id) } catch {}
            deleteMem.run(row.id)
          }
        })()
        log.info(`Auto-pruned ${dupes.length} duplicate memories`)
      }
      db.close()
    }
  } catch (e: any) {
    log.debug(`Duplicate prune skipped: ${e.message?.slice(0, 80)}`)
  }

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

// ─── Inventory Refresh (every 30 min) ────────────────────
async function refreshInventory(): Promise<void> {
  try {
    const inv = await collectInventory()
    await saveInventoryCache(inv)
    log.info('Inventory refreshed')
  } catch (e: any) {
    log.warn(`Inventory refresh failed: ${e.message}`)
  }
}

// ─── Auto Sync (every 5 min) ─────────────────────────────
async function autoSync(): Promise<void> {
  try {
    const result = await syncBidirectional()
    if (result.pushed > 0 || result.pulled > 0) {
      log.info(`Sync: pushed ${result.pushed}, pulled ${result.pulled}`)
    }
  } catch (e: any) {
    log.debug(`Sync skipped: ${e.message}`)
  }
}

// ─── Queue Purge (every 24h) ─────────────────────────────
function purgeQueue(): void {
  try {
    const purged = purgeOldEvents(30)
    if (purged > 0) log.info(`Purged ${purged} old events`)
  } catch (e: any) {
    log.warn(`Queue purge failed: ${e.message}`)
  }
}

// ─── Reflector Cycle (every 6h) ──────────────────────────────
async function reflectorCycle(): Promise<void> {
  try {
    const { reflectOnSession } = await import('./reflector.js')
    const sessionsDir = join(homedir(), '.claude', 'projects')
    if (!existsSync(sessionsDir)) return

    // Find the most recent .jsonl session log
    let newest = ''
    let newestMtime = 0
    const walk = (dir: string) => {
      try {
        for (const entry of readdirSync(dir)) {
          const p = join(dir, entry)
          try {
            const s = statSync(p)
            if (s.isDirectory()) walk(p)
            else if (entry.endsWith('.jsonl') && s.mtimeMs > newestMtime) {
              newest = p
              newestMtime = s.mtimeMs
            }
          } catch {}
        }
      } catch {}
    }
    walk(sessionsDir)

    if (!newest) return

    // Only reflect on sessions modified in the last 24h
    if (Date.now() - newestMtime > 24 * 60 * 60 * 1000) return

    const result = await reflectOnSession(newest)
    if (result.promoted > 0) {
      log.info(`Reflector: ${result.lessons.length} lessons, ${result.promoted} promoted`)
    }
  } catch (e: any) {
    log.debug(`Reflector cycle skipped: ${e.message}`)
  }
}

// ─── Main Loop ────────────────────────────────────────────
export async function daemon(): Promise<void> {
  ensureRexDirs()
  const config = loadConfig()

  log.info('REX Daemon started')
  log.info(`Health: ${config.daemon.healthCheckInterval}s | Ingest: ${config.daemon.ingestInterval}s | Maintenance: ${config.daemon.maintenanceInterval}s | Self-review: ${config.daemon.selfReviewInterval}s`)
  const routable = getRoutableProviders()
  log.info(`LLM routing chain: ${routable.map(p => p.name).join(' → ')}`)
  journalAppend('daemon_action', 'daemon', { action: 'started' })

  // Start embedded hub (auto port 7420, non-blocking)
  try {
    const { startHub } = await import('./hub.js')
    startHub().catch((e: any) => log.debug(`Hub start skipped: ${e.message?.slice(0, 80)}`))
    log.info('Hub started on port 7420')
  } catch (e: any) {
    log.debug(`Hub unavailable: ${e.message?.slice(0, 80)}`)
  }

  // Register this node with the hub (non-blocking, best-effort)
  setTimeout(async () => {
    try {
      const { registerWithHub } = await import('./node-mesh.js')
      await registerWithHub()
    } catch { /* silent */ }
  }, 3000) // wait 3s for hub to fully start

  // Initial health check
  await healthCheck()

  // Schedule loops
  let lastHealth = Date.now()
  let lastIngest = Date.now()
  let lastMaintenance = Date.now()
  let lastSelfReview = Date.now()
  let lastInventory = Date.now()
  let lastSync = Date.now()
  let lastPurge = Date.now()
  let lastReflect = Date.now()
  let lastFullBackup = Date.now()
  let lastNodeRegister = 0  // register immediately on start
  let lastSessionGuard = 0  // check immediately
  let lastCurious = Date.now() - 23 * 60 * 60 * 1000  // run ~1h after daemon start
  let lastDailySummaryDate = ''  // tracks 'YYYY-MM-DD' to send once per day
  let lastAlertDate = ''  // disk/backlog alerts — max once per day

  // Run maintenance immediately on start
  await maintenanceCycle()

  // Run daily backup on start
  await dailyBackup()

  // Run initial inventory and queue purge
  await refreshInventory()
  purgeQueue()

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

    // Inventory refresh every 30 min
    if (now - lastInventory >= 30 * 60 * 1000) {
      await refreshInventory()
      lastInventory = now
    }

    // Auto sync every 5 min
    if (now - lastSync >= 5 * 60 * 1000) {
      await autoSync()
      lastSync = now
    }

    // Reflector every 6h
    if (now - lastReflect >= 6 * 60 * 60 * 1000) {
      await reflectorCycle()
      lastReflect = now
    }

    // Full backup every 24h
    if (now - lastFullBackup >= 24 * 60 * 60 * 1000) {
      await dailyBackup()
      lastFullBackup = now
    }

    // Queue purge every 24h
    if (now - lastPurge >= 24 * 60 * 60 * 1000) {
      purgeQueue()
      lastPurge = now
    }

    // Curious discovery every 24h
    if (now - lastCurious >= 24 * 60 * 60 * 1000) {
      try {
        const { runCurious } = await import('./curious.js')
        const result = await runCurious({ silent: true })
        if (result.newCount > 0) {
          log.info(`Curious: ${result.newCount} new discoveries`)
        }
      } catch (e: any) {
        log.debug(`Curious cycle skipped: ${e.message?.slice(0, 80)}`)
      }
      lastCurious = now
    }

    // Node registration every 60s (advertise capabilities to hub)
    if (now - lastNodeRegister >= 60_000) {
      try {
        const nodeInfo = buildLocalNodeInfo()
        await registerWithHub(nodeInfo)
      } catch (e: any) {
        log.debug(`Node registration skipped: ${e.message?.slice(0, 80)}`)
      }
      lastNodeRegister = now
    }

    // Daily dev summary push to Telegram at configurable hour (default 22:00)
    const todayStr = new Date().toISOString().split('T')[0]
    const currentHour = new Date().getHours()
    const summaryHour = (config as any).daemon?.summaryHour ?? 22
    if (currentHour === summaryHour && lastDailySummaryDate !== todayStr) {
      lastDailySummaryDate = todayStr
      try {
        const { getDevStatus, formatDevStatusTelegram } = await import('./dev-monitor.js')
        const report = await getDevStatus()
        if (report.totalCommits > 0 || report.sessionCount > 0) {
          await sendTelegramNotify(formatDevStatusTelegram(report))
          log.info(`Daily summary sent: ${report.totalCommits} commits, ${report.sessionCount} sessions`)
        }
      } catch (e: any) {
        log.debug(`Daily summary skipped: ${e.message?.slice(0, 80)}`)
      }
    }

    // Smart alerts: disk space + memory backlog (once per day)
    if (lastAlertDate !== todayStr) {
      const diskFree = checkDiskSpace()
      const pending = countPending()
      const alerts: string[] = []
      if (diskFree < 5) alerts.push(`⚠️ Disk low: ${diskFree}GB free`)
      if (pending > 100) alerts.push(`📥 Memory backlog: ${pending} chunks pending embed`)
      if (alerts.length > 0) {
        await sendTelegramNotify(alerts.join('\n'))
        log.warn(`Smart alerts sent: ${alerts.join(' | ')}`)
        lastAlertDate = todayStr
      }
    }

    // Session guard — check context window + daily budget every 5 min
    if (now - lastSessionGuard >= 5 * 60_000) {
      try {
        const { checkSessionGuard } = await import('./session-guard.js')
        const report = await checkSessionGuard()
        if (report.alerted.length > 0) {
          log.info(`Session guard fired: ${report.alerted.join(', ')} | ctx=${report.contextPercent.toFixed(0)}% daily=${report.dailyPercent.toFixed(0)}%`)
        }
      } catch (e: any) {
        log.debug(`Session guard skipped: ${e.message?.slice(0, 80)}`)
      }
      lastSessionGuard = now
    }

    // Sleep 30 seconds between loop iterations
    await new Promise(r => setTimeout(r, 30_000))
  }
}
