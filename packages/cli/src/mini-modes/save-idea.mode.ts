/**
 * Mini-mode: Save Idea
 * Intent: "note ça", "mémorise", "garde en mémoire", "sauvegarde cette idée"
 * LLM calls: 0 — rex ingest pending file
 * Security: SAFE
 * @module IDENTITY
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { registerMode, type ModeContext } from './engine.js'
import { createLogger } from '../logger.js'
import { REX_DIR } from '../paths.js'

const log = createLogger('IDENTITY:mode:save-idea')

// Strip the trigger prefix from the message
function extractContent(message: string): string {
  return message
    .replace(/^(note|mémorise|sauvegarde|garde en mémoire|retiens|remember|save)[:\s]*/i, '')
    .trim()
}

async function saveIdeaToMemory(ctx: ModeContext): Promise<Record<string, unknown>> {
  const content = extractContent(String(ctx.message))
  if (!content) return { saved: false, reason: 'empty content' }

  try {
    const pendingDir = join(REX_DIR, 'memory', 'pending')
    mkdirSync(pendingDir, { recursive: true })

    const ts = Date.now()
    const filename = `idea_${ts}.json`
    const entry = {
      content,
      source: 'gateway-idea',
      category: 'idea',
      tags: ['user-note'],
      created_at: new Date(ts).toISOString(),
    }
    writeFileSync(join(pendingDir, filename), JSON.stringify(entry, null, 2))
    log.info(`Idea saved to pending: ${filename}`)
    return { saved: true, content, filename }
  } catch (e: any) {
    log.warn(`Failed to save idea: ${e.message}`)
    return { saved: false, reason: e.message }
  }
}

function formatSaveResult(ctx: ModeContext): string {
  const saved = ctx['saved'] as boolean
  const content = ctx['content'] as string
  if (!saved) return `Impossible de sauvegarder l'idée : ${ctx['reason']}`
  return `✅ Idée sauvegardée :\n"${content}"\n\nSera indexée dans ta mémoire au prochain \`rex ingest\`.`
}

registerMode({
  id: 'save-idea',
  description: 'Sauvegarde une idée dans la mémoire pending',
  triggers: [
    /^note[:\s]|^mémorise[:\s]|^sauvegarde[:\s]|^garde en mémoire|^retiens[:\s]/i,
    /^remember[:\s]|^save (this|that|idea)[:\s]/i,
  ],
  security: 'SAFE',
  estimatedTokens: 0,
  loaders: [saveIdeaToMemory],
  template: '{{content}}',
  llmFields: [],
  outputFormatter: formatSaveResult,
})
