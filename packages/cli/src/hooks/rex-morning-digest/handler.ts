/**
 * REX Hook: Morning Digest
 * Au bootstrap, si état WAKING_UP → envoie le digest matin.
 * @module HQ
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const USER_CYCLES_PATH = join(homedir(), '.rex-memory', 'user-cycles-state.json')

const handler = async (event: any) => {
  if (event.type !== 'agent' || event.action !== 'bootstrap') return

  if (!existsSync(USER_CYCLES_PATH)) return

  try {
    const state = JSON.parse(readFileSync(USER_CYCLES_PATH, 'utf-8'))
    if (state.state !== 'waking_up') return

    const hour = new Date().getHours()
    // Digest seulement entre 6h et 11h
    if (hour < 6 || hour > 11) return

    const digestParts = [
      '☀️ **Bonjour ! Voilà ce qui s\'est passé :**',
    ]

    // Récupère les derniers events du journal
    const journalPath = join(homedir(), '.rex-memory', 'event-journal.jsonl')
    if (existsSync(journalPath)) {
      const events = readFileSync(journalPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .filter(Boolean)
        .filter((e: any) => {
          // Events des dernières 8h (pendant le sommeil)
          const ts = new Date(e.ts || e.timestamp || 0)
          return Date.now() - ts.getTime() < 8 * 60 * 60 * 1000
        })
        .slice(-10)

      if (events.length > 0) {
        digestParts.push(`\n🌙 **Pendant ton sommeil (${events.length} events) :**`)
        events.forEach((e: any) => {
          digestParts.push(`• ${e.type}: ${e.summary || JSON.stringify(e).slice(0, 80)}`)
        })
      }
    }

    digestParts.push('\n_REX est en mode actif. Fleet connectée._')

    event.messages.push(digestParts.join('\n'))
    console.log('[rex-morning-digest] Morning digest sent')

  } catch (e: any) {
    console.warn(`[rex-morning-digest] Failed: ${e.message?.slice(0, 80)}`)
  }
}

export default handler
