/**
 * REX as MCP Server
 *
 * Exposes REX tools to Claude Code / Codex via the MCP protocol (JSON-RPC over stdio).
 * No external library needed — the protocol is just newline-delimited JSON-RPC 2.0.
 *
 * Start: rex mcp serve
 * Register: add to ~/.claude/settings.json mcpServers.rex
 *
 * Tools exposed:
 *   rex_memory_search   — semantic search across REX memory
 *   rex_observe         — record an observation to memory
 *   rex_delegate        — route a prompt to best available model
 *   rex_sandbox_run     — run a command in sandbox isolation
 *   rex_budget          — get current token budget / cost status
 *   rex_nodes           — list mesh nodes with capabilities
 *   rex_review          — run quick code review pipeline
 *
 * §15.4 REX Master Plan — REX as MCP Server
 * @module TOOLS
 */

import { createInterface } from 'node:readline'
import { execSync } from 'node:child_process'
import { createLogger } from '../logger.js'

const log = createLogger('TOOLS:mcp-server')

// ── MCP types ─────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'rex_memory_search',
    description: 'Search REX semantic memory for relevant past context, decisions, and patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default: 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'rex_observe',
    description: 'Record an observation, decision, error, pattern, or lesson to REX memory.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Observation content' },
        type: {
          type: 'string',
          description: 'Observation type',
          enum: ['decision', 'blocker', 'solution', 'error', 'pattern', 'habit'],
          default: 'pattern',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'rex_delegate',
    description: 'Delegate a task to the best available model via REX routing (cache → local → free tier → subscription).',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task prompt' },
        taskType: {
          type: 'string',
          description: 'Task type for routing',
          enum: ['code', 'classify', 'general', 'summarize'],
          default: 'general',
        },
        skipCache: { type: 'boolean', description: 'Skip semantic cache', default: false },
      },
      required: ['task'],
    },
  },
  {
    name: 'rex_sandbox_run',
    description: 'Run a shell command in a sandboxed environment (macOS seatbelt or Docker).',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to run' },
        mode: {
          type: 'string',
          description: 'Isolation mode',
          enum: ['light', 'full', 'off'],
          default: 'light',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'rex_budget',
    description: 'Get current token burn rate, context usage, and daily budget status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'rex_nodes',
    description: 'List all REX mesh nodes with their capabilities, scores, and hub status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'rex_review',
    description: 'Run a quick code review (TypeScript check + secret scan) on the current working directory.',
    inputSchema: {
      type: 'object',
      properties: {
        full: { type: 'boolean', description: 'Run full review including lint and tests', default: false },
      },
    },
  },
]

// ── Tool handlers ──────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'rex_memory_search': {
      const query = String(args.query ?? '')
      const limit = Number(args.limit ?? 5)
      if (!query) return 'Error: query is required'
      try {
        const { spawnSync } = await import('node:child_process')
        const result = spawnSync('rex', ['search', query], { encoding: 'utf-8', timeout: 30_000 })
        const output = result.stdout?.trim()
        if (!output) return 'No results found.'
        return output
      } catch (e: any) {
        return `Memory search failed: ${e.message?.slice(0, 200)}`
      }
    }

    case 'rex_observe': {
      const content = String(args.content ?? '')
      const type = String(args.type ?? 'pattern')
      if (!content) return 'Error: content is required'
      try {
        const { addObservation } = await import('../observer.js')
        addObservation('mcp', process.cwd(), type as any, content)
        return `Observation recorded (${type}): ${content.slice(0, 80)}`
      } catch (e: any) {
        return `Failed to record observation: ${e.message?.slice(0, 200)}`
      }
    }

    case 'rex_delegate': {
      const task = String(args.task ?? '')
      const taskType = String(args.taskType ?? 'general') as 'code' | 'classify' | 'general' | 'summarize'
      const skipCache = Boolean(args.skipCache ?? false)
      if (!task) return 'Error: task is required'
      try {
        const { runPrompt } = await import('../backend-runner.js')
        const result = await runPrompt(task, { taskType, skipCache })
        return `[${result.source} · ${result.latencyMs}ms]\n\n${result.response}`
      } catch (e: any) {
        return `Delegation failed: ${e.message?.slice(0, 200)}`
      }
    }

    case 'rex_sandbox_run': {
      const command = String(args.command ?? '')
      const mode = String(args.mode ?? 'light') as 'light' | 'full' | 'off'
      if (!command) return 'Error: command is required'
      try {
        const { execSync } = await import('node:child_process')
        const { detectRuntime } = await import('../sandbox.js')
        const runtime = detectRuntime(mode)

        if (runtime === 'seatbelt') {
          const { writeFileSync } = await import('node:fs')
          const { join } = await import('node:path')
          const { tmpdir } = await import('node:os')
          const profilePath = join(tmpdir(), `rex-mcp-sb-${Date.now()}.sb`)
          writeFileSync(profilePath, `(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath "${process.cwd()}"))\n(allow file-write* (subpath "/tmp"))\n`)
          const output = execSync(`sandbox-exec -f ${profilePath} ${command}`, { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' })
          return output.trim() || '(no output)'
        } else if (runtime === 'docker') {
          const output = execSync(`docker run --rm --network none -v "${process.cwd()}:/workspace" --workdir /workspace node:22-alpine ${command}`, {
            encoding: 'utf-8', timeout: 60_000, stdio: 'pipe',
          })
          return output.trim() || '(no output)'
        } else {
          const output = execSync(command, { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' })
          return output.trim() || '(no output)'
        }
      } catch (e: any) {
        return `Command failed: ${e.stderr?.toString().slice(0, 300) || e.message?.slice(0, 200)}`
      }
    }

    case 'rex_budget': {
      try {
        const { getBurnRateStats } = await import('../burn-rate.js')
        const s = getBurnRateStats(false)
        return [
          `Context: ${s.contextPercent?.toFixed(1) ?? '?'}% used`,
          `Daily: ${s.dailyPercent?.toFixed(1) ?? '?'}% of limit`,
          `Burn rate: ${s.burnRatePerMin?.toFixed(0) ?? '?'} tokens/min`,
          s.estimatedMinutesLeft ? `~${s.estimatedMinutesLeft.toFixed(0)} min until context full` : '',
        ].filter(Boolean).join('\n')
      } catch (e: any) {
        return `Budget unavailable: ${e.message?.slice(0, 100)}`
      }
    }

    case 'rex_nodes': {
      try {
        const { buildLocalFleetNode } = await import('../node-mesh.js')
        const node = buildLocalFleetNode()
        return `${node.hostname} [${node.status ?? 'local'}] score=${node.score} caps=${node.capabilities.join(',')}`
      } catch (e: any) {
        return `Nodes unavailable: ${e.message?.slice(0, 100)}`
      }
    }

    case 'rex_review': {
      const full = Boolean(args.full ?? false)
      try {
        const { runReview } = await import('../review.js')
        const result = runReview(full ? 'full' : 'quick')
        return JSON.stringify(result, null, 2)
      } catch (e: any) {
        return `Review failed: ${e.message?.slice(0, 200)}`
      }
    }

    default:
      return `Unknown tool: ${name}`
  }
}

// ── MCP Protocol ───────────────────────────────────────────────────────────

function send(obj: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function errorResponse(id: number | string | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export async function startMcpServer(): Promise<void> {
  log.info('REX MCP server started (stdio mode)')

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let req: JsonRpcRequest
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest
    } catch {
      send(errorResponse(null, -32700, 'Parse error'))
      continue
    }

    const { id, method, params } = req

    switch (method) {
      case 'initialize':
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'rex', version: '7.0.0' },
            capabilities: { tools: {} },
          },
        })
        break

      case 'notifications/initialized':
        // No response needed for notifications
        break

      case 'tools/list':
        send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
        break

      case 'tools/call': {
        const toolName = String((params as any)?.name ?? '')
        const toolArgs = ((params as any)?.arguments ?? {}) as Record<string, unknown>
        if (!toolName) {
          send(errorResponse(id, -32602, 'Missing tool name'))
          break
        }
        try {
          const output = await callTool(toolName, toolArgs)
          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: output }],
            },
          })
        } catch (e: any) {
          send(errorResponse(id, -32603, `Tool error: ${e.message?.slice(0, 200)}`))
        }
        break
      }

      default:
        if (id !== null && id !== undefined) {
          send(errorResponse(id, -32601, `Method not found: ${method}`))
        }
    }
  }
}

/** Generate the mcpServers entry for ~/.claude/settings.json */
export function getMcpServerConfig(): Record<string, unknown> {
  const rexBin = process.argv[0] === 'node' ? process.argv[1] : process.execPath
  // Find rex binary
  let rexPath = ''
  try { rexPath = execSync('which rex', { encoding: 'utf-8', timeout: 3000 }).trim() } catch {}
  if (!rexPath) rexPath = rexBin

  return {
    rex: {
      type: 'stdio',
      command: rexPath,
      args: ['mcp', 'serve'],
    },
  }
}
