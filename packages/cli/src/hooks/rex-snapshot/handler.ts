/**
 * REX Hook: Auto-Snapshot
 * Crée un snapshot avant /reset ou toute action HIGH/CRITICAL.
 * @module MEMORY
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SNAP_DIR = join(homedir(), '.rex', 'snapshots')

const handler = async (event: any) => {
  // Snapshot sur /reset et /new
  if (event.type !== 'command') return
  if (!['reset', 'new'].includes(event.action)) return

  try {
    const date = new Date().toISOString().replace(/[:.]/g, '-')
    const snapPath = join(SNAP_DIR, date)
    mkdirSync(snapPath, { recursive: true })

    // Snapshot de la DB mémoire REX
    const dbPath = join(homedir(), '.rex-memory', 'rex.db')
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, join(snapPath, 'rex.db'))
    }

    // Snapshot du workspace
    const workspacePath = join(homedir(), '.openclaw', 'workspace', 'MEMORY.md')
    if (existsSync(workspacePath)) {
      copyFileSync(workspacePath, join(snapPath, 'MEMORY.md'))
    }

    console.log(`[rex-snapshot] Snapshot created: ${snapPath}`)
  } catch (e: any) {
    console.warn(`[rex-snapshot] Failed: ${e.message?.slice(0, 80)}`)
  }
}

export default handler
