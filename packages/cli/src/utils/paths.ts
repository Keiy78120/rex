/** @module CORE */
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

const HOME = process.env.HOME || '~'
// REX_HOME overrides the base directory (used in Docker: /data)
export const REX_DIR = process.env.REX_HOME
  ? join(process.env.REX_HOME, '.claude', 'rex')
  : join(HOME, '.claude', 'rex')
export const MEMORY_DIR = join(REX_DIR, 'memory')
export const MEMORY_DB_PATH = join(MEMORY_DIR, 'rex.sqlite')
export const PENDING_DIR = join(MEMORY_DIR, 'pending')
export const BACKUPS_DIR = join(MEMORY_DIR, 'backups')
export const PROJECTS_DIR = join(REX_DIR, 'projects')
export const SUMMARIES_DIR = join(PROJECTS_DIR, 'summaries')
export const SELF_IMPROVEMENT_DIR = join(REX_DIR, 'self-improvement')
export const CONFIG_PATH = join(REX_DIR, 'config.json')
export const VAULT_PATH = join(REX_DIR, 'vault.md')
export const DAEMON_LOG_PATH = join(REX_DIR, 'daemon.log')
export const REFERENCES_DIR = join(REX_DIR, 'references')
export const INSPIRATIONS_DIR = join(REX_DIR, 'inspirations')

export const LAUNCHER_PID_PATH = join(REX_DIR, 'launcher.pid')
export const RECOVERY_STATE_PATH = join(REX_DIR, 'recovery-state.json')
export const INGEST_STATE_PATH = join(REX_DIR, 'ingest-state.json')
export const SNAPSHOTS_DIR = join(REX_DIR, 'snapshots')
export const RELAY_DIR = join(REX_DIR, 'relay')

export const LEGACY_MEMORY_DIR = join(HOME, '.rex-memory')
export const LEGACY_DB_PATH = join(LEGACY_MEMORY_DIR, 'db', 'rex.sqlite')

/**
 * Generate a relay file path with human-readable date+time.
 * Format: RELAY-YYYY-MM-DD-HHhMM.md
 * Each relay session = one file. Never grows unbounded.
 */
export function relayFilePath(date?: Date): string {
  const d = date ?? new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `RELAY-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}.md`
  return join(RELAY_DIR, name)
}

export function ensureRexDirs(): void {
  const dirs = [
    REX_DIR, MEMORY_DIR, PENDING_DIR, BACKUPS_DIR,
    PROJECTS_DIR, SUMMARIES_DIR, SELF_IMPROVEMENT_DIR,
    REFERENCES_DIR, INSPIRATIONS_DIR, SNAPSHOTS_DIR,
    RELAY_DIR,
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
}
