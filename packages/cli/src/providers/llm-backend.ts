/** @module BUDGET */
/**
 * REX LLM Backend Adapter
 * Switchable backend: ollama | llama-cpp | localai | vllm | llamafile
 * All non-Ollama backends expose an OpenAI-compatible API.
 */

import { loadConfig, saveConfig } from '../config.js'
import { createLogger } from '../logger.js'

const log = createLogger('llm-backend')

export type BackendType = 'ollama' | 'llama-cpp' | 'localai' | 'vllm' | 'llamafile'
export type ApiFormat = 'ollama' | 'openai'

export interface GenOpts {
  maxTokens?: number
  temperature?: number
  system?: string
}

export interface LlmBackend {
  type: BackendType
  url: string
  apiFormat: ApiFormat
  listModels(): Promise<string[]>
  generate(prompt: string, model: string, opts?: GenOpts): Promise<string>
  generateStream(prompt: string, model: string, opts?: GenOpts): AsyncIterable<string>
  embed(text: string, model: string): Promise<number[]>
  isHealthy(): Promise<boolean>
}

// ─── Ollama backend ───────────────────────────────────────────────────────────

class OllamaBackend implements LlmBackend {
  type: BackendType = 'ollama'
  apiFormat: ApiFormat = 'ollama'

  constructor(public url: string) {}

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    const data = (await res.json()) as { models: Array<{ name: string }> }
    return (data.models ?? []).map((m) => m.name)
  }

  async generate(prompt: string, model: string, opts: GenOpts = {}): Promise<string> {
    const body: Record<string, unknown> = { model, prompt, stream: false }
    if (opts.system) body['system'] = opts.system
    if (opts.temperature !== undefined) body['options'] = { temperature: opts.temperature }

    const res = await fetch(`${this.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Ollama generate failed: ${res.status}`)
    const data = (await res.json()) as { response: string }
    return data.response
  }

  async *generateStream(prompt: string, model: string, opts: GenOpts = {}): AsyncIterable<string> {
    const body: Record<string, unknown> = { model, prompt, stream: true }
    if (opts.system) body['system'] = opts.system

    const res = await fetch(`${this.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) throw new Error(`Ollama stream failed: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const chunk = JSON.parse(line) as { response?: string; done?: boolean }
          if (chunk.response) yield chunk.response
          if (chunk.done) return
        } catch {
          // skip malformed line
        }
      }
    }
  }

  async embed(text: string, model: string): Promise<number[]> {
    const res = await fetch(`${this.url}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`)
    const data = (await res.json()) as { embedding: number[] }
    return data.embedding
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }
}

// ─── OpenAI-compatible backend (llama-cpp, localai, vllm, llamafile) ─────────

class OpenAICompatBackend implements LlmBackend {
  apiFormat: ApiFormat = 'openai'

  constructor(
    public type: BackendType,
    public url: string,
  ) {}

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.url}/v1/models`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return []
      const data = (await res.json()) as { data: Array<{ id: string }> }
      return (data.data ?? []).map((m) => m.id)
    } catch {
      return []
    }
  }

  async generate(prompt: string, model: string, opts: GenOpts = {}): Promise<string> {
    const messages: Array<{ role: string; content: string }> = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })

    const body: Record<string, unknown> = { model, messages, stream: false }
    if (opts.maxTokens) body['max_tokens'] = opts.maxTokens
    if (opts.temperature !== undefined) body['temperature'] = opts.temperature

    const res = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`${this.type} generate failed: ${res.status}`)
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    return data.choices[0]?.message?.content ?? ''
  }

  async *generateStream(prompt: string, model: string, opts: GenOpts = {}): AsyncIterable<string> {
    const messages: Array<{ role: string; content: string }> = []
    if (opts.system) messages.push({ role: 'system', content: opts.system })
    messages.push({ role: 'user', content: prompt })

    const body: Record<string, unknown> = { model, messages, stream: true }
    if (opts.maxTokens) body['max_tokens'] = opts.maxTokens

    const res = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) throw new Error(`${this.type} stream failed: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.replace(/^data:\s*/, '')
        if (!trimmed || trimmed === '[DONE]') continue
        try {
          const chunk = JSON.parse(trimmed) as {
            choices: Array<{ delta: { content?: string }; finish_reason?: string }>
          }
          const content = chunk.choices[0]?.delta?.content
          if (content) yield content
          if (chunk.choices[0]?.finish_reason === 'stop') return
        } catch {
          // skip malformed SSE line
        }
      }
    }
  }

  async embed(text: string, model: string): Promise<number[]> {
    const res = await fetch(`${this.url}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`${this.type} embed failed: ${res.status}`)
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> }
    return data.data[0]?.embedding ?? []
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/v1/models`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBackend(type: BackendType, url: string): LlmBackend {
  if (type === 'ollama') return new OllamaBackend(url)
  return new OpenAICompatBackend(type, url)
}

let _cached: LlmBackend | null = null

export function getBackend(): LlmBackend {
  if (_cached) return _cached
  const cfg = loadConfig()
  const type = (cfg.llm.backend ?? 'ollama') as BackendType
  const url = cfg.llm.backendUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434'
  _cached = createBackend(type, url)
  log.debug(`LLM backend: ${type} @ ${url}`)
  return _cached
}

export function resetBackendCache(): void {
  _cached = null
}

// ─── Backend info/switch ──────────────────────────────────────────────────────

export const BACKEND_INFO: Record<
  BackendType,
  { name: string; install: string; platform: string }
> = {
  ollama: {
    name: 'Ollama',
    install: 'brew install ollama (macOS) | curl https://ollama.ai/install.sh | sh (Linux)',
    platform: 'macOS, Linux, Windows — model hub, GPU support',
  },
  'llama-cpp': {
    name: 'llama.cpp server',
    install: 'brew install llama.cpp | cargo install llama-cpp-server',
    platform: 'macOS, Linux — ultra-lightweight, same engine as Ollama',
  },
  localai: {
    name: 'LocalAI',
    install: 'docker run -p 8080:8080 localai/localai:latest',
    platform: 'Docker-first — embeddings, TTS, images',
  },
  vllm: {
    name: 'vLLM',
    install: 'pip install vllm && python -m vllm.entrypoints.openai.api_server',
    platform: 'Linux + GPU — high throughput, production serving',
  },
  llamafile: {
    name: 'llamafile',
    install: 'Download .llamafile and chmod +x, run directly',
    platform: 'Any platform — single binary, zero install',
  },
}

export async function switchBackend(
  type: BackendType,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  const backend = createBackend(type, url)
  const healthy = await backend.isHealthy()
  if (!healthy) {
    return { ok: false, error: `Backend ${type} at ${url} is not reachable` }
  }

  const cfg = loadConfig()
  cfg.llm.backend = type as string
  cfg.llm.backendUrl = url
  saveConfig(cfg)
  resetBackendCache()
  log.info(`Backend switched to ${type} @ ${url}`)
  return { ok: true }
}
