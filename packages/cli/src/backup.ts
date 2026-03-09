/** @module HQ */
import { existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { REX_DIR, MEMORY_DB_PATH, CONFIG_PATH, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('HQ:backup')

const FULL_BACKUPS_DIR = join(REX_DIR, 'backups-full')

function ensureBackupDir(): void {
  if (!existsSync(FULL_BACKUPS_DIR)) mkdirSync(FULL_BACKUPS_DIR, { recursive: true })
}

export interface BackupInfo {
  filename: string
  path: string
  date: string
  sizeBytes: number
  sizeHuman: string
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function backupNow(): string | null {
  ensureRexDirs()
  ensureBackupDir()

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const archiveName = `backup-${ts}.tar.gz`
  const archivePath = join(FULL_BACKUPS_DIR, archiveName)

  // Collect files that exist
  const filesToBackup: { absPath: string; relPath: string }[] = []

  const candidates = [
    { abs: MEMORY_DB_PATH, rel: 'memory/rex.sqlite' },
    { abs: MEMORY_DB_PATH + '-wal', rel: 'memory/rex.sqlite-wal' },
    { abs: MEMORY_DB_PATH + '-shm', rel: 'memory/rex.sqlite-shm' },
    { abs: join(REX_DIR, 'sync-queue.sqlite'), rel: 'sync-queue.sqlite' },
    { abs: CONFIG_PATH, rel: 'config.json' },
  ]

  for (const c of candidates) {
    if (existsSync(c.abs)) filesToBackup.push({ absPath: c.abs, relPath: c.rel })
  }

  if (filesToBackup.length === 0) {
    log.warn('No files to backup')
    return null
  }

  // Build tar command: use -C to set base dir and add files relative to REX_DIR
  const fileArgs = filesToBackup.map(f => {
    // Compute path relative to REX_DIR
    const rel = f.absPath.replace(REX_DIR + '/', '')
    return `"${rel}"`
  }).join(' ')

  try {
    execSync(`tar -czf "${archivePath}" -C "${REX_DIR}" ${fileArgs}`, {
      timeout: 60_000,
      stdio: 'pipe',
    })
    const size = statSync(archivePath).size
    log.info(`Backup created: ${archiveName} (${humanSize(size)})`)
    return archivePath
  } catch (e: any) {
    log.error(`Backup failed: ${e.message?.slice(0, 200)}`)
    return null
  }
}

export function listBackups(): BackupInfo[] {
  ensureBackupDir()
  if (!existsSync(FULL_BACKUPS_DIR)) return []

  return readdirSync(FULL_BACKUPS_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz'))
    .sort()
    .reverse()
    .map(f => {
      const fullPath = join(FULL_BACKUPS_DIR, f)
      const stat = statSync(fullPath)
      // Extract date from filename: backup-YYYY-MM-DDTHH-MM-SS.tar.gz
      const dateStr = f.replace('backup-', '').replace('.tar.gz', '').replace(/T/, ' ').replace(/-/g, (m, offset) => offset > 9 ? ':' : '-')
      return {
        filename: f,
        path: fullPath,
        date: dateStr,
        sizeBytes: stat.size,
        sizeHuman: humanSize(stat.size),
      }
    })
}

export function restoreBackup(backupPath: string, confirm = false): boolean {
  if (!existsSync(backupPath)) {
    log.error(`Backup not found: ${backupPath}`)
    return false
  }

  if (!confirm) {
    log.warn('Restore requires --confirm flag to prevent accidental overwrites')
    return false
  }

  try {
    execSync(`tar -xzf "${backupPath}" -C "${REX_DIR}"`, {
      timeout: 60_000,
      stdio: 'pipe',
    })
    log.info(`Restored from: ${backupPath}`)
    return true
  } catch (e: any) {
    log.error(`Restore failed: ${e.message?.slice(0, 200)}`)
    return false
  }
}

export function rotateBackups(keep = 7): number {
  const backups = listBackups()
  if (backups.length <= keep) return 0

  let removed = 0
  const toRemove = backups.slice(keep)
  for (const b of toRemove) {
    try {
      unlinkSync(b.path)
      log.debug(`Removed old backup: ${b.filename}`)
      removed++
    } catch {}
  }

  if (removed > 0) log.info(`Rotated ${removed} old backups (keeping ${keep})`)
  return removed
}

export function lastBackupAge(): number | null {
  const backups = listBackups()
  if (backups.length === 0) return null
  const newest = statSync(backups[0].path)
  return Date.now() - newest.mtimeMs
}
