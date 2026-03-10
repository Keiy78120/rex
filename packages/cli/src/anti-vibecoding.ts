/**
 * REX Anti-Vibecoding — Workflow multi-LLM complet
 *
 * Utilise OpenClaw sessions_spawn/send au lieu de TMUX.
 * Plan → Code → Review → Débat → Merge si consensus.
 *
 * CLI: rex anti-vibe <task>
 *
 * @module AGENTS
 */

import { runPaneRelay, detectLlmIntent } from './pane-relay.js'
import { appendEvent } from './event-journal.js'
import { createLogger } from './logger.js'

const log = createLogger('AGENTS:anti-vibecoding')

const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

export interface AntiVibeOptions {
  task: string
  mentorEnabled?: boolean
  autoMerge?: boolean    // merge automatique si consensus >= 0.85
  verbose?: boolean
}

export async function runAntiVibecoding(opts: AntiVibeOptions): Promise<void> {
  const start = Date.now()

  console.log(`\n${BOLD}🧠 REX Anti-Vibecoding${RESET}`)
  console.log(`${DIM}Task: ${opts.task.slice(0, 100)}${RESET}\n`)

  console.log(`${DIM}Mode: Plan → Code → Review → Consensus${RESET}`)
  console.log(`${DIM}LLMs: Haiku (planner) + Haiku (coder) + Qwen 7B (reviewer)${RESET}\n`)

  try {
    const result = await runPaneRelay({
      task: opts.task,
      mentorEnabled: opts.mentorEnabled,
      onProgress: (pane, msg) => {
        if (opts.verbose) {
          console.log(`  ${DIM}[${pane}]${RESET} ${msg}`)
        } else {
          process.stdout.write(`  ◆ ${pane}... `)
        }
      },
    })

    const durationS = (result.durationMs / 1000).toFixed(1)

    console.log(`\n${BOLD}Résultat${RESET}`)
    console.log(`${'─'.repeat(60)}`)

    if (result.consensus) {
      console.log(`${GREEN}✓ Consensus atteint${RESET} (confidence: ${(result.confidence * 100).toFixed(0)}%)`)
    } else {
      console.log(`${YELLOW}⚠ Pas de consensus${RESET} (confidence: ${(result.confidence * 100).toFixed(0)}%)`)
      console.log(`${DIM}→ Escalade nécessaire (Sonnet ou Opus)${RESET}`)
    }

    console.log(`\n${BOLD}Conclusion${RESET}`)
    console.log(result.conclusion.slice(0, 1000))

    console.log(`\n${DIM}Panes: ${Object.keys(result.contributions).join(' → ')}`)
    console.log(`Duration: ${durationS}s${RESET}`)

    if (result.consensus && opts.autoMerge) {
      console.log(`\n${GREEN}✓ Auto-merge activé — implémentation validée${RESET}`)
      // TODO: déclencher le merge git si applicable
    }

    appendEvent({
      type: 'anti-vibe:completed',
      task: opts.task.slice(0, 100),
      consensus: result.consensus,
      confidence: result.confidence,
      panesUsed: Object.keys(result.contributions).length,
      durationMs: result.durationMs,
    } as any)

  } catch (err: any) {
    console.error(`${RED}✗ Relay failed: ${err.message}${RESET}`)
    log.error(`anti-vibe failed: ${err.message}`)
  }
}

// ── CLI entrypoint (depuis index.ts) ───────────────────────────────────
// case 'anti-vibe': {
//   const task = args.slice(1).join(' ')
//   if (!task) { console.error('Usage: rex anti-vibe <task>'); process.exit(1) }
//   await runAntiVibecoding({ task, verbose: flags['--verbose'], autoMerge: flags['--auto-merge'] })
//   break
// }
