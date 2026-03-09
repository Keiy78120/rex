/**
 * REX Mock LLM Server
 *
 * OpenAI-compatible HTTP server for tests. Responds instantly with scripted
 * responses based on intent keywords — no real API calls, no quota burned.
 *
 * Start: REX_TEST_MODE=true node dist/mock-llm-server.js
 * Port: 11435 (won't conflict with Ollama at 11434)
 *
 * Supports:
 *   POST /v1/chat/completions  (OpenAI-compatible)
 *   POST /api/chat             (Ollama-compatible)
 *   GET  /api/tags             (Ollama-compatible — for availability checks)
 *   GET  /health
 *
 * @module CORE
 */

import { createServer } from 'node:http'
import { createLogger } from './logger.js'

const log = createLogger('CORE:mock-llm')

export const MOCK_PORT = parseInt(process.env.REX_MOCK_LLM_PORT ?? '11435', 10)

// ── Token counter (for budget fallback tests) ───────────────────────────────

let _totalTokensUsed = 0

export function getMockTokenCount(): number { return _totalTokensUsed }
export function resetMockTokenCount(): void { _totalTokensUsed = 0 }

// ── Scripted responses by intent keyword ────────────────────────────────────

interface ScriptedResponse {
  match: RegExp
  reply: string
  inputTokens: number
  outputTokens: number
  confidence: number
}

const SCRIPTED: ScriptedResponse[] = [
  {
    match: /search|find|cherch|trouv/i,
    reply: 'Mock: Je vais rechercher ça. [MOCK_SEARCH_RESULT]',
    inputTokens: 30, outputTokens: 20, confidence: 0.95,
  },
  {
    match: /fix|corrig|bug|erreur|error/i,
    reply: 'Mock: Correction appliquée. Le bug était dû à un index manquant. [MOCK_FIX]',
    inputTokens: 50, outputTokens: 35, confidence: 0.90,
  },
  {
    match: /status|état|santé|health|avance|progress/i,
    reply: 'Mock: Statut REX — tout fonctionne normalement. Ollama: ✓ Hub: ✓ Memory: ✓ [MOCK_STATUS]',
    inputTokens: 20, outputTokens: 25, confidence: 0.98,
  },
  {
    match: /crée|create|génère|generate|écris|write|rédige|draft/i,
    reply: 'Mock: Voici le contenu généré:\n\n[MOCK_GENERATED_CONTENT]\n\nDocument créé avec succès.',
    inputTokens: 40, outputTokens: 60, confidence: 0.85,
  },
  {
    match: /analyse|analyze|explain|explique|why|pourquoi/i,
    reply: 'Mock: Analyse complète: Le problème principal est X avec un facteur Y. Recommandation: Z. [MOCK_ANALYSIS]',
    inputTokens: 60, outputTokens: 80, confidence: 0.80,
  },
  {
    match: /budget|coût|cost|argent|money|prix|price/i,
    reply: 'Mock: Budget actuel — $0.12 utilisé sur $5.00 quota mensuel. 97.6% disponible. [MOCK_BUDGET]',
    inputTokens: 25, outputTokens: 30, confidence: 0.95,
  },
  {
    match: /relay|chain|pipeline/i,
    reply: JSON.stringify({
      conclusion: 'Mock relay conclusion — confidence achieved at step 1.',
      confidence: 0.9,
      passReason: 'mock: direct answer available',
    }),
    inputTokens: 40, outputTokens: 45, confidence: 0.90,
  },
]

const DEFAULT_REPLY = 'Mock: Réponse générique du serveur de test REX. [MOCK_DEFAULT]'

function pickResponse(userContent: string): ScriptedResponse {
  for (const s of SCRIPTED) {
    if (s.match.test(userContent)) return s
  }
  return { match: /.*/, reply: DEFAULT_REPLY, inputTokens: 15, outputTokens: 15, confidence: 0.7 }
}

// ── Request body parser ──────────────────────────────────────────────────────

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

// ── OpenAI-compatible response builder ──────────────────────────────────────

function buildOpenAIResponse(model: string, content: string, inputTokens: number, outputTokens: number) {
  _totalTokensUsed += inputTokens + outputTokens
  return {
    id: `chatcmpl-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  }
}

// ── Ollama-compatible response builder ──────────────────────────────────────

function buildOllamaResponse(model: string, content: string, inputTokens: number, outputTokens: number) {
  _totalTokensUsed += inputTokens + outputTokens
  return {
    model,
    created_at: new Date().toISOString(),
    message: { role: 'assistant', content },
    done: true,
    eval_count: outputTokens,
    prompt_eval_count: inputTokens,
    total_duration: 50_000_000,  // 50ms in nanoseconds
    load_duration: 1_000_000,
    eval_duration: 48_000_000,
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

let _server: ReturnType<typeof createServer> | null = null
const _startTime = Date.now()

export function startMockLlmServer(port = MOCK_PORT): Promise<void> {
  if (_server) return Promise.resolve()

  _server = createServer(async (req, res) => {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('X-Mock-Server', 'rex-mock-llm')

    // ── GET /health ────────────────────────────────────────────────────────
    if (method === 'GET' && url === '/health') {
      res.writeHead(200)
      res.end(JSON.stringify({ status: 'ok', totalTokensUsed: _totalTokensUsed, uptime: Math.floor((Date.now() - _startTime) / 1000) }))
      return
    }

    // ── GET /api/tags (Ollama availability check) ──────────────────────────
    if (method === 'GET' && url.startsWith('/api/tags')) {
      res.writeHead(200)
      res.end(JSON.stringify({ models: [
        { name: 'qwen2.5:1.5b', size: 1_000_000_000 },
        { name: 'qwen3.5:9b', size: 9_000_000_000 },
        { name: 'nomic-embed-text', size: 500_000_000 },
      ]}))
      return
    }

    // ── POST /v1/chat/completions (OpenAI) ─────────────────────────────────
    if (method === 'POST' && url === '/v1/chat/completions') {
      try {
        const body = JSON.parse(await readBody(req)) as { model?: string; messages?: Array<{ role: string; content: string }> }
        const model = body.model ?? 'mock-model'
        const lastMsg = ([...(body.messages ?? [])].reverse().find(m => m.role === 'user'))?.content ?? ''
        const script = pickResponse(lastMsg)
        log.debug(`POST /v1/chat/completions model=${model} intent=${script.confidence}`)
        res.writeHead(200)
        res.end(JSON.stringify(buildOpenAIResponse(model, script.reply, script.inputTokens, script.outputTokens)))
      } catch (e: any) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: { message: `Bad request: ${e.message}`, type: 'invalid_request_error' } }))
      }
      return
    }

    // ── POST /api/chat (Ollama) ────────────────────────────────────────────
    if (method === 'POST' && url === '/api/chat') {
      try {
        const body = JSON.parse(await readBody(req)) as { model?: string; messages?: Array<{ role: string; content: string }> }
        const model = body.model ?? 'qwen2.5:1.5b'
        const lastMsg = ([...(body.messages ?? [])].reverse().find(m => m.role === 'user'))?.content ?? ''
        const script = pickResponse(lastMsg)
        log.debug(`POST /api/chat model=${model}`)
        res.writeHead(200)
        res.end(JSON.stringify(buildOllamaResponse(model, script.reply, script.inputTokens, script.outputTokens)))
      } catch (e: any) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: e.message }))
      }
      return
    }

    // ── 404 ────────────────────────────────────────────────────────────────
    res.writeHead(404)
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  return new Promise((resolve, reject) => {
    _server!.listen(port, () => {
      log.info(`Mock LLM server running on port ${port} (REX_TEST_MODE)`)
      resolve()
    })
    _server!.on('error', reject)
  })
}

export function stopMockLlmServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!_server) { resolve(); return }
    _server.close(() => { _server = null; resolve() })
  })
}

// ── Standalone entry (node dist/mock-llm-server.js) ──────────────────────────

if (process.env.REX_TEST_MODE === 'true' || process.argv[1]?.includes('mock-llm-server')) {
  startMockLlmServer().then(() => {
    process.on('SIGTERM', () => stopMockLlmServer().then(() => process.exit(0)))
    process.on('SIGINT', () => stopMockLlmServer().then(() => process.exit(0)))
  }).catch((e) => {
    console.error('Mock LLM server failed to start:', e)
    process.exit(1)
  })
}
