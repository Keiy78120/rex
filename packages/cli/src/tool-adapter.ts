/** @module AGENTS */
/**
 * REX Tool Adapter
 *
 * Converts REX capabilities into the native tool-calling format for Ollama/OpenAI,
 * and executes tool calls requested by a model during an agent loop.
 *
 * Tools exposed to local models:
 *   rex_memory_search   — semantic memory search
 *   rex_read_file       — read a file
 *   rex_run_command     — safe shell command execution
 *   rex_get_status      — REX system status
 *   rex_list_projects   — known REX projects
 *   rex_observe         — save an observation
 *   rex_get_context     — project context
 *   rex_search_web      — DuckDuckGo instant answers
 *   rex_get_memory_stats — memory system stats
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createLogger } from './logger.js'

const log = createLogger('AGENTS:tool-adapter')

// ─── Tool Definition Format ──────────────────────────────────

export interface RexTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required: string[]
  }
}

// Ollama/OpenAI tool format (same schema)
export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: RexTool['parameters']
  }
}

export type ToolResult =
  | { ok: true; output: string }
  | { ok: false; error: string }

// ─── Canonical REX Tools ─────────────────────────────────────

const REX_TOOLS: RexTool[] = [
  {
    name: 'rex_memory_search',
    description: 'Search REX semantic memory for relevant past context, decisions, and patterns.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        limit: { type: 'number', description: 'Max results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'rex_read_file',
    description: 'Read a file\'s content from the filesystem.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'rex_run_command',
    description: 'Run a safe shell command. Destructive operations (rm -rf, sudo, format, mkfs) are blocked.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional, defaults to process cwd)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'rex_get_status',
    description: 'Get REX system status including doctor checks and service health.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'rex_list_projects',
    description: 'List all known REX projects with their stack and last activity.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'rex_observe',
    description: 'Save an observation, fact, habit, or runbook to REX memory.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Subject or context of the observation' },
        observation: { type: 'string', description: 'Content of the observation to record' },
        type: {
          type: 'string',
          description: 'Observation type',
          enum: ['fact', 'habit', 'runbook'],
        },
      },
      required: ['subject', 'observation'],
    },
  },
  {
    name: 'rex_get_context',
    description: 'Get REX context analysis for a project path (stack detection, suggested tools, intent).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project directory path (optional, defaults to cwd)' },
      },
      required: [],
    },
  },
  {
    name: 'rex_search_web',
    description: 'Search the web for quick answers using DuckDuckGo instant answers API.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'rex_get_memory_stats',
    description: 'Get REX memory system statistics: embedding count, pending chunks, duplicates, orphans.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// ─── Commands blocked for safety ─────────────────────────────

const BLOCKED_PATTERNS = [
  'rm -rf',
  'sudo',
  'format',
  'mkfs',
  'dd if=',
  '> /dev/sd',
  'shutdown',
  'reboot',
  'init 0',
  'curl | sh',
  'curl | bash',
  'wget | sh',
]

function isCommandBlocked(command: string): boolean {
  const lower = command.toLowerCase()
  return BLOCKED_PATTERNS.some(p => lower.includes(p))
}

// ─── Find rex binary ─────────────────────────────────────────

function findRexBin(): string {
  try {
    return execFileSync('/usr/bin/which', ['rex'], { encoding: 'utf-8', timeout: 3000 }).trim()
  } catch {
    return 'rex'
  }
}

const REX_BIN = findRexBin()

// ─── Tool executor ────────────────────────────────────────────

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  log.debug(`tool call: ${name} args=${JSON.stringify(args).slice(0, 200)}`)

  try {
    switch (name) {
      case 'rex_memory_search': {
        const query = String(args.query ?? '').trim()
        const limit = Number(args.limit ?? 5)
        if (!query) return { ok: false, error: 'query is required' }
        try {
          const out = execFileSync(
            REX_BIN,
            ['search', query, `--limit=${limit}`, '--json'],
            { encoding: 'utf-8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim()
          return { ok: true, output: out || '[]' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Memory search failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_read_file': {
        const filePath = String(args.path ?? '').trim()
        if (!filePath) return { ok: false, error: 'path is required' }
        try {
          const content = readFileSync(filePath, 'utf-8')
          // Truncate to avoid blowing context window
          const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n...[truncated]' : content
          return { ok: true, output: truncated }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `File read failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_run_command': {
        const command = String(args.command ?? '').trim()
        const cwd = args.cwd ? String(args.cwd) : process.cwd()
        if (!command) return { ok: false, error: 'command is required' }
        if (isCommandBlocked(command)) {
          return { ok: false, error: `Command blocked for safety: "${command}"` }
        }
        try {
          const out = execFileSync('/bin/sh', ['-c', command], {
            encoding: 'utf-8',
            timeout: 10_000,
            cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
          }).trim()
          return { ok: true, output: out || '(no output)' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Command failed: ${msg.slice(0, 300)}` }
        }
      }

      case 'rex_get_status': {
        try {
          const out = execFileSync(REX_BIN, ['status', '--json'], {
            encoding: 'utf-8',
            timeout: 15_000,
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim()
          return { ok: true, output: out || '{}' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Status failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_list_projects': {
        try {
          const out = execFileSync(REX_BIN, ['projects', '--json'], {
            encoding: 'utf-8',
            timeout: 15_000,
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim()
          return { ok: true, output: out || '{"projects":[]}' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Projects list failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_observe': {
        const subject = String(args.subject ?? '').trim()
        const observation = String(args.observation ?? '').trim()
        const type = String(args.type ?? 'fact')
        if (!subject || !observation) return { ok: false, error: 'subject and observation are required' }
        try {
          const out = execFileSync(
            REX_BIN,
            ['observer', 'add', `--subject=${subject}`, `--type=${type}`, observation],
            { encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim()
          return { ok: true, output: out || `Observation recorded (${type})` }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Observe failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_get_context': {
        const targetPath = args.path ? String(args.path) : process.cwd()
        try {
          const out = execFileSync(REX_BIN, ['context', '--json'], {
            encoding: 'utf-8',
            timeout: 15_000,
            cwd: targetPath,
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim()
          return { ok: true, output: out || '{}' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Context failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_search_web': {
        const query = String(args.query ?? '').trim()
        if (!query) return { ok: false, error: 'query is required' }
        try {
          const encoded = encodeURIComponent(query)
          const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`
          const out = execFileSync(
            '/usr/bin/curl',
            ['-s', '--max-time', '8', url],
            { encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim()
          const parsed = JSON.parse(out) as {
            AbstractText?: string
            RelatedTopics?: Array<{ Text?: string }>
          }
          const answer = parsed.AbstractText?.trim()
          if (answer) return { ok: true, output: answer }
          const related = (parsed.RelatedTopics ?? [])
            .slice(0, 3)
            .map((t) => t.Text ?? '')
            .filter(Boolean)
            .join('\n')
          return { ok: true, output: related || 'No instant answer found.' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Web search failed: ${msg.slice(0, 200)}` }
        }
      }

      case 'rex_get_memory_stats': {
        try {
          const out = execFileSync(REX_BIN, ['memory-check', '--json'], {
            encoding: 'utf-8',
            timeout: 20_000,
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim()
          return { ok: true, output: out || '{}' }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { ok: false, error: `Memory stats failed: ${msg.slice(0, 200)}` }
        }
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn(`tool-adapter: unhandled error in ${name}: ${msg.slice(0, 200)}`)
    return { ok: false, error: `Tool error: ${msg.slice(0, 200)}` }
  }
}

// ─── Format converters ────────────────────────────────────────

/** Convert REX tools to Ollama/OpenAI native tool format */
export function getRexTools(): OllamaTool[] {
  return REX_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

/** Get a compact one-line tool list for context injection (token-efficient) */
export function getToolsSummary(): string {
  return REX_TOOLS.map((t) => `${t.name}: ${t.description.split('.')[0]}`).join('\n')
}
