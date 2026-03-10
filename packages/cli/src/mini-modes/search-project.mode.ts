/**
 * Mini-mode: Search Project
 * Intent: "où en est <projet>", "statut de X", "avancement de Y"
 * LLM calls: 0-1 (only if memory hit insufficient)
 * Security: SAFE
 * @module IDENTITY
 */

import { execSync } from 'node:child_process'
import { registerMode, type ModeContext } from './engine.js'
import { createLogger } from '../logger.js'

const log = createLogger('IDENTITY:mode:search-project')

async function loadProjectMemory(ctx: ModeContext): Promise<Record<string, unknown>> {
  const query = String(ctx.message)
  try {
    const raw = execSync(
      `rex search ${JSON.stringify(query)} --json --limit=3 --hybrid`,
      { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const parsed = JSON.parse(raw.trim())
    const results: Array<{ content?: string; summary?: string; category?: string }> = Array.isArray(parsed)
      ? parsed
      : (parsed.results ?? [])
    if (!results.length) return { project_memory: null }
    const snippets = results.map(r => (r.summary ?? r.content ?? '').slice(0, 300)).filter(Boolean)
    return { project_memory: snippets.join('\n\n') }
  } catch { return { project_memory: null } }
}

async function loadGitActivity(ctx: ModeContext): Promise<Record<string, unknown>> {
  try {
    // Recent commits across all git repos in ~/Documents/Developer
    const raw = execSync(
      'git log --oneline --since="7 days ago" --all --no-walk --format="%h %s (%ar)" 2>/dev/null | head -5',
      { encoding: 'utf-8' as BufferEncoding, timeout: 4000, shell: '/bin/sh', cwd: process.env.HOME ?? process.cwd() }
    )
    return { git_recent: raw.trim() || null }
  } catch { return { git_recent: null } }
}

async function loadOpenLoops(ctx: ModeContext): Promise<Record<string, unknown>> {
  try {
    const raw = execSync('rex context --json 2>/dev/null | head -c 2000', {
      encoding: 'utf-8' as BufferEncoding, timeout: 5000, shell: '/bin/sh',
    })
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { open_loops: null }
    const data = JSON.parse(match[0])
    const loops = data['open_loops'] ?? data['loops'] ?? []
    if (!Array.isArray(loops) || !loops.length) return { open_loops: null }
    const items = loops.slice(0, 3).map((l: { title?: string; description?: string }) =>
      `• ${l.title ?? l.description ?? JSON.stringify(l)}`
    )
    return { open_loops: items.join('\n') }
  } catch { return { open_loops: null } }
}

function formatProjectStatus(ctx: ModeContext): string {
  const memory = ctx['project_memory'] as string | null
  const git = ctx['git_recent'] as string | null
  const loops = ctx['open_loops'] as string | null

  if (!memory && !git && !loops) {
    return `Pas d'info trouvée pour "${ctx.message}". Lance \`rex ingest\` pour indexer tes sessions.`
  }

  const lines: string[] = []
  if (memory) { lines.push('📚 Mémoire :'); lines.push(memory) }
  if (git) { lines.push('\n🔀 Activité git récente :'); lines.push(git) }
  if (loops) { lines.push('\n🔄 Boucles ouvertes :'); lines.push(loops) }

  return lines.join('\n')
}

registerMode({
  id: 'search-project',
  description: 'Statut d\'un projet (mémoire + git + open loops)',
  triggers: [
    /où en est|avancement|statut.*projet|projet.*statut|comment va|progress.*on/i,
    /qu.est.ce qui.*reste|que reste.t.il|what.s left|what.s the status/i,
  ],
  security: 'SAFE',
  estimatedTokens: 50,
  loaders: [loadProjectMemory, loadGitActivity, loadOpenLoops],
  template: `Projet: {{message}}
Mémoire: {{project_memory}}
Git: {{git_recent}}
Open loops: {{open_loops}}
---
Résumé court: {{summary}}`,
  llmFields: [],  // script-only by default; summary filled only if loaders return nothing
  outputFormatter: formatProjectStatus,
})
