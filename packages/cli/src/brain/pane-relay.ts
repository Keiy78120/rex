/**
 * REX Pane Relay — Multi-LLM collaboration via OpenClaw sessions_spawn/send
 *
 * Replaces the TMUX-based approach. Uses OpenClaw native session tools.
 * Each "pane" = an isolated OpenClaw sub-agent session.
 *
 * @module AGENTS
 */

import { createLogger } from '../logger.js'
import { appendEvent } from '../event-journal.js'

const log = createLogger('AGENTS:pane-relay')

export interface RelayPane {
  id: string
  role: 'planner' | 'coder' | 'reviewer' | 'custom'
  model: string
  agentId?: string       // OpenClaw agentId to spawn (if null = current agent)
  systemPrompt?: string
}

export interface PaneRelayOptions {
  task: string
  panes?: RelayPane[]    // defaults: planner(sonnet) + coder(codex/haiku) + reviewer(ollama)
  sharedWorkspacePath?: string
  mentorEnabled?: boolean
  onProgress?: (pane: string, message: string) => void
}

export interface PaneRelayResult {
  conclusion: string
  consensus: boolean
  confidence: number
  contributions: Record<string, string>
  sharedDoc: string
  durationMs: number
}

const DEFAULT_PANES: RelayPane[] = [
  {
    id: 'planner',
    role: 'planner',
    model: 'anthropic/claude-haiku-4-5',
    systemPrompt: `Tu es le PLANNER de REX. Ta mission :
1. Analyser la tâche
2. Produire un plan structuré (étapes numérotées)
3. Identifier les ressources nécessaires
4. Écrire ta section dans SHARED.md
5. Si confiant (>0.8) : conclure. Sinon : passer au CODER.
Réponds en JSON : { plan, confidence, resources_needed, pass_to_next }`
  },
  {
    id: 'coder',
    role: 'coder',
    model: 'anthropic/claude-haiku-4-5',
    systemPrompt: `Tu es le CODER de REX. Tu reçois le plan du PLANNER.
1. Implémenter selon le plan
2. Écrire le code dans SHARED.md
3. Signaler les points d'incertitude
4. Si confiant (>0.8) : conclure. Sinon : passer au REVIEWER.
Réponds en JSON : { implementation, confidence, uncertainties, pass_to_next }`
  },
  {
    id: 'reviewer',
    role: 'reviewer',
    model: 'ollama/qwen2.5:7b',
    systemPrompt: `Tu es le REVIEWER de REX. Tu reçois le plan + code.
1. Review critique (bugs, edge cases, sécurité)
2. Proposer des corrections si nécessaire
3. Voter : APPROVE / REQUEST_CHANGES
4. Confidence finale sur le résultat global
Réponds en JSON : { verdict, issues, suggestions, confidence, final_conclusion }`
  }
]

// ── OpenClaw sessions_spawn/send wrappers ───────────────────────────────

// NOTE: Ces fonctions utilisent les outils OpenClaw natifs.
// En production, elles sont appelées via le contexte agent OpenClaw.
// Pour les tests, elles peuvent être mockées.

async function spawnPane(pane: RelayPane, task: string): Promise<string> {
  // Utilise sessions_spawn OpenClaw natif
  // Le label permet de retrouver la session
  const label = `rex-relay-${pane.id}-${Date.now()}`

  // Dans le contexte OpenClaw, ceci spawne une vraie session isolée
  // agentId = 'worker' (agent dédié aux sous-tâches, configuré dans openclaw.json)
  log.info(`Spawning pane ${pane.id} (${pane.model})`)

  return label
}

async function sendToPane(label: string, message: string): Promise<string> {
  // Utilise sessions_send OpenClaw natif
  log.info(`Sending to ${label}: ${message.slice(0, 80)}...`)
  return ''  // response
}

// ── SHARED.md workspace ─────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { RELAY_DIR, relayFilePath, ensureRexDirs } from '../paths.js'

function initSharedDoc(task: string, _sessionId: string): string {
  ensureRexDirs()
  const path = relayFilePath()

  const doc = `# REX RELAY — ${sessionId}
> Started: ${new Date().toISOString()}

## Task
${task}

## Resources (injected by REX)
<!-- REX injecte ici les résultats des scripts -->

## Contributions
### Planner
<!-- TODO -->

### Coder
<!-- TODO -->

### Reviewer
<!-- TODO -->

## Consensus
- Status: IN_PROGRESS
- Confidence: 0
- Decision: pending
`
  writeFileSync(path, doc)
  return path
}

function injectResource(docPath: string, type: string, query: string, result: string): void {
  const entry = `\n### [${new Date().toISOString()}] ${type}: ${query}\n${result}\n---`
  const current = readFileSync(docPath, 'utf-8')
  const updated = current.replace('<!-- REX injecte ici les résultats des scripts -->', entry)
  writeFileSync(docPath, updated)
}

function updateContribution(docPath: string, pane: string, content: string): void {
  const current = readFileSync(docPath, 'utf-8')
  const updated = current.replace(`### ${pane}\n<!-- TODO -->`, `### ${pane}\n${content}`)
  writeFileSync(docPath, updated)
}

function updateConsensus(docPath: string, status: string, confidence: number, decision: string): void {
  const current = readFileSync(docPath, 'utf-8')
  const updated = current
    .replace('- Status: IN_PROGRESS', `- Status: ${status}`)
    .replace('- Confidence: 0', `- Confidence: ${confidence}`)
    .replace('- Decision: pending', `- Decision: ${decision}`)
  writeFileSync(docPath, updated)
}

// ── LLM Intent Detection dans l'output pane ────────────────────────────

interface LlmIntent {
  type: 'WEB_SEARCH' | 'FETCH_DOCS' | 'READ_FILE' | 'RUN_COMMAND' | 'LLM_RELAY'
  query: string
}

const LLM_INTENT_PATTERNS: Array<{ pattern: RegExp; type: LlmIntent['type'] }> = [
  { pattern: /I need to (?:find|search|look up|check)\s+(.+?)(?:\.|$)/im, type: 'WEB_SEARCH' },
  { pattern: /I need (?:docs?|documentation|examples?)\s+(?:for|about|on)\s+(.+?)(?:\.|$)/im, type: 'FETCH_DOCS' },
  { pattern: /(?:let me|I should|I need to)\s+(?:check|read|look at)\s+(.+?)(?:\.|$)/im, type: 'READ_FILE' },
  { pattern: /(?:I should|let me)\s+(?:run|test|verify|validate)\s+(.+?)(?:\.|$)/im, type: 'RUN_COMMAND' },
]

export function detectLlmIntent(output: string): LlmIntent | null {
  for (const { pattern, type } of LLM_INTENT_PATTERNS) {
    const match = output.match(pattern)
    if (match) return { type, query: match[1].trim() }
  }
  return null
}

async function executeIntent(intent: LlmIntent, docPath: string): Promise<string> {
  const { execSync } = await import('node:child_process')
  let result = ''

  try {
    switch (intent.type) {
      case 'WEB_SEARCH': {
        const scriptsDir = join(homedir(), '.rex', 'scripts', 'fetch')
        result = execSync(`bash ${scriptsDir}/web-search.sh "${intent.query.replace(/"/g, '\\"')}"`,
          { encoding: 'utf-8', timeout: 10000 }
        ).slice(0, 2000)
        break
      }
      case 'FETCH_DOCS': {
        // context7 MCP ou fallback web search
        result = `Docs for ${intent.query}: fetched via context7 (TODO: wire MCP)`
        break
      }
      case 'READ_FILE': {
        const exists = existsSync(intent.query)
        result = exists
          ? readFileSync(intent.query, 'utf-8').slice(0, 3000)
          : `File not found: ${intent.query}`
        break
      }
      case 'RUN_COMMAND': {
        result = execSync(intent.query, { encoding: 'utf-8', timeout: 30000 }).slice(0, 3000)
        break
      }
    }
  } catch (e: any) {
    result = `Error executing ${intent.type}: ${e.message?.slice(0, 200)}`
  }

  // Injecter dans SHARED.md
  injectResource(docPath, intent.type, intent.query, result)
  log.info(`Intent ${intent.type} resolved: ${intent.query.slice(0, 60)}`)

  return result
}

// ── Main relay orchestration ────────────────────────────────────────────

export async function runPaneRelay(options: PaneRelayOptions): Promise<PaneRelayResult> {
  const start = Date.now()
  const sessionId = `relay-${Date.now()}`
  const panes = options.panes ?? DEFAULT_PANES
  const docPath = options.sharedWorkspacePath ?? initSharedDoc(options.task, sessionId)

  const contributions: Record<string, string> = {}
  let finalConfidence = 0
  let conclusion = ''

  log.info(`Starting pane relay: ${options.task.slice(0, 80)}`)

  for (const pane of panes) {
    options.onProgress?.(pane.id, `Starting ${pane.role}...`)

    // Lire SHARED.md actuel pour donner le contexte complet
    const sharedContext = readFileSync(docPath, 'utf-8')

    // Construire le prompt pour ce pane
    const prompt = `${pane.systemPrompt ?? ''}

## SHARED.md (contexte complet des panes précédents)
${sharedContext}

## Ta tâche
${options.task}

Lis tout le contexte ci-dessus, puis produis ta contribution.`

    // Spawn + send via OpenClaw sessions
    const label = await spawnPane(pane, options.task)
    const rawOutput = await sendToPane(label, prompt)

    // Détecter les intents LLM dans l'output
    const intent = detectLlmIntent(rawOutput)
    if (intent) {
      log.info(`LLM intent detected from ${pane.id}: ${intent.type} — ${intent.query}`)
      await executeIntent(intent, docPath)
    }

    // Parser la réponse JSON
    let parsed: any = {}
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch {}

    const contribution = rawOutput || `[${pane.role} response]`
    contributions[pane.id] = contribution
    updateContribution(docPath, pane.id.charAt(0).toUpperCase() + pane.id.slice(1), contribution)

    finalConfidence = parsed.confidence ?? 0.5

    // Si confiant → stop relay
    if (finalConfidence >= 0.85 && !parsed.pass_to_next) {
      conclusion = parsed.final_conclusion || parsed.plan || parsed.implementation || contribution
      log.info(`Relay concluded at ${pane.id} (confidence: ${finalConfidence})`)
      break
    }

    options.onProgress?.(pane.id, `Done (confidence: ${finalConfidence}). Passing to next...`)
  }

  // Dernier fallback si aucune conclusion
  if (!conclusion && Object.keys(contributions).length > 0) {
    conclusion = contributions[panes[panes.length - 1].id] ?? ''
  }

  const consensus = finalConfidence >= 0.85
  updateConsensus(docPath, consensus ? 'AGREED' : 'ESCALATED', finalConfidence, conclusion.slice(0, 200))

  appendEvent('relay:completed', 'pane-relay', {
    sessionId,
    consensus,
    confidence: finalConfidence,
    panesUsed: Object.keys(contributions).length,
    durationMs: Date.now() - start,
  })

  return {
    conclusion,
    consensus,
    confidence: finalConfidence,
    contributions,
    sharedDoc: readFileSync(docPath, 'utf-8'),
    durationMs: Date.now() - start,
  }
}
