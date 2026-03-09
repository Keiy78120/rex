/**
 * REX LiteLLM Config Generator
 * @module BUDGET
 *
 * Generates a litellm_config.yaml from detected providers.
 * Order: Ollama (local) → free tier APIs → subscription
 *
 * Usage:  rex litellm-config [--output=<path>]
 *         rex litellm-config --print
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { FREE_TIER_PROVIDERS, getApiKey } from './free-tiers.js'
import { REX_DIR, ensureRexDirs } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('litellm-config')
const HOME = homedir()
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const DEFAULT_OUTPUT = join(REX_DIR, 'litellm_config.yaml')

// ── Types ──────────────────────────────────────────────

interface LiteLLMModel {
  model_name: string     // alias used by callers
  litellm_params: {
    model: string        // e.g. "groq/llama-3.3-70b-versatile"
    api_base?: string
    api_key?: string
  }
  model_info?: {
    max_tokens?: number
    input_cost_per_token?: number
    output_cost_per_token?: number
  }
}

interface LiteLLMConfig {
  model_list: LiteLLMModel[]
  router_settings: {
    routing_strategy: string
    num_retries: number
    timeout: number
    retry_after: number
    fallbacks: Array<{ [key: string]: string[] }>
  }
  general_settings: {
    master_key: string
    database_url?: string
  }
}

// ── Ollama model discovery ─────────────────────────────

async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json() as { models: Array<{ name: string }> }
    return data.models
      .map(m => m.name)
      .filter(m => !m.includes('embed') && !m.includes('nomic'))
  } catch {
    return []
  }
}

// ── Proxy key ─────────────────────────────────────────

function getProxyKey(): string {
  // Try to reuse existing config's master_key
  if (existsSync(DEFAULT_OUTPUT)) {
    try {
      const content = readFileSync(DEFAULT_OUTPUT, 'utf-8')
      const match = content.match(/master_key:\s*["']?([a-zA-Z0-9_-]+)["']?/)
      if (match) return match[1]
    } catch {}
  }
  // Generate stable key from hostname
  const { hostname } = require('node:os')
  return `rex-${hostname().split('.')[0]}-proxy`
}

// ── Config builder ─────────────────────────────────────

export async function buildLiteLLMConfig(): Promise<LiteLLMConfig> {
  const models: LiteLLMModel[] = []
  const fallbackGroups: string[] = []

  // 1. Ollama models (local, free, zero latency)
  const ollamaModels = await getOllamaModels()
  for (const m of ollamaModels) {
    const alias = `ollama/${m.replace(':', '-')}`
    models.push({
      model_name: alias,
      litellm_params: {
        model: `ollama/${m}`,
        api_base: `${OLLAMA_URL}/v1`,
        api_key: 'ollama',
      },
      model_info: { input_cost_per_token: 0, output_cost_per_token: 0 },
    })
    fallbackGroups.push(alias)
  }

  // 2. Free tier API providers
  for (const p of FREE_TIER_PROVIDERS) {
    if (!p.requiresKey) continue
    const key = getApiKey(p.envKey)
    if (!key) continue

    const providerPrefix = p.name.toLowerCase().replace(/\s+/g, '-')
    for (const model of p.models) {
      const alias = `${providerPrefix}/${model.id.split('/').pop()!.replace(':', '-')}`
      models.push({
        model_name: alias,
        litellm_params: {
          model: `openai/${model.id}`,  // OpenAI-compat base
          api_base: p.baseUrl,
          api_key: key,
        },
        model_info: {
          max_tokens: model.contextWindow,
          input_cost_per_token: 0,       // free tier
          output_cost_per_token: 0,
        },
      })
      fallbackGroups.push(alias)
    }
  }

  // 3. Add claude-code if installed (subscription)
  const { execSync } = await import('node:child_process')
  let claudePath = ''
  try { claudePath = execSync('which claude', { encoding: 'utf-8', timeout: 2000 }).trim() } catch {}
  // Claude is handled by Claude Code CLI, not litellm directly — skip proxy routing

  // Build fallback chain: fast small models first, then large
  const fallbacks = fallbackGroups.length > 1 ? [{
    'default-model': fallbackGroups.slice(1),
  }] : []

  const defaultModel = fallbackGroups[0] ?? 'ollama/qwen3.5-latest'

  return {
    model_list: models,
    router_settings: {
      routing_strategy: 'least-busy',
      num_retries: 2,
      timeout: 30,
      retry_after: 5,
      fallbacks,
    },
    general_settings: {
      master_key: getProxyKey(),
    },
  }
}

// ── YAML serializer (no deps) ──────────────────────────

function toYaml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return 'null'
  if (typeof obj === 'boolean') return String(obj)
  if (typeof obj === 'number') return String(obj)
  if (typeof obj === 'string') {
    // Quote strings that need it
    if (obj.includes(':') || obj.includes('#') || obj.startsWith('"') || obj === '') {
      return `"${obj.replace(/"/g, '\\"')}"`
    }
    return obj
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    return obj.map(item => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>)
        const first = entries[0]
        const rest = entries.slice(1)
        const firstLine = `${pad}- ${first[0]}: ${toYaml(first[1], indent + 1)}`
        const restLines = rest.map(([k, v]) => `${pad}  ${k}: ${toYaml(v, indent + 1)}`).join('\n')
        return restLines ? `${firstLine}\n${restLines}` : firstLine
      }
      return `${pad}- ${toYaml(item, indent)}`
    }).join('\n')
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>)
    return entries.map(([k, v]) => {
      if (Array.isArray(v) || (typeof v === 'object' && v !== null)) {
        const inner = toYaml(v, indent + 1)
        if (Array.isArray(v) && v.length > 0 && typeof v[0] !== 'object') {
          return `${pad}${k}:\n${inner}`
        }
        if (Array.isArray(v)) {
          return `${pad}${k}:\n${inner}`
        }
        return `${pad}${k}:\n${inner}`
      }
      return `${pad}${k}: ${toYaml(v, indent)}`
    }).join('\n')
  }
  return String(obj)
}

function configToYaml(config: LiteLLMConfig): string {
  const lines: string[] = [
    '# REX LiteLLM Config — auto-generated by rex litellm-config',
    `# Generated: ${new Date().toISOString()}`,
    '',
  ]

  // model_list
  lines.push('model_list:')
  for (const m of config.model_list) {
    lines.push(`  - model_name: ${m.model_name}`)
    lines.push(`    litellm_params:`)
    lines.push(`      model: ${m.litellm_params.model}`)
    if (m.litellm_params.api_base) lines.push(`      api_base: ${m.litellm_params.api_base}`)
    if (m.litellm_params.api_key) lines.push(`      api_key: "${m.litellm_params.api_key}"`)
    if (m.model_info) {
      lines.push(`    model_info:`)
      if (m.model_info.max_tokens !== undefined) lines.push(`      max_tokens: ${m.model_info.max_tokens}`)
      if (m.model_info.input_cost_per_token !== undefined) lines.push(`      input_cost_per_token: ${m.model_info.input_cost_per_token}`)
      if (m.model_info.output_cost_per_token !== undefined) lines.push(`      output_cost_per_token: ${m.model_info.output_cost_per_token}`)
    }
  }

  // router_settings
  lines.push('')
  lines.push('router_settings:')
  lines.push(`  routing_strategy: ${config.router_settings.routing_strategy}`)
  lines.push(`  num_retries: ${config.router_settings.num_retries}`)
  lines.push(`  timeout: ${config.router_settings.timeout}`)
  lines.push(`  retry_after: ${config.router_settings.retry_after}`)
  if (config.router_settings.fallbacks.length > 0) {
    lines.push(`  fallbacks:`)
    for (const fb of config.router_settings.fallbacks) {
      for (const [k, v] of Object.entries(fb)) {
        lines.push(`    - ${k}:`)
        for (const item of v as string[]) {
          lines.push(`        - ${item}`)
        }
      }
    }
  }

  // general_settings
  lines.push('')
  lines.push('general_settings:')
  lines.push(`  master_key: "${config.general_settings.master_key}"`)
  if (config.general_settings.database_url) {
    lines.push(`  database_url: "${config.general_settings.database_url}"`)
  }

  return lines.join('\n') + '\n'
}

// ── Main ───────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
}

export async function generateLiteLLMConfig(opts: {
  output?: string
  print?: boolean
} = {}): Promise<void> {
  const outputPath = opts.output ?? DEFAULT_OUTPUT
  const doPrint = opts.print ?? false

  console.log(`\n${C.bold}REX LiteLLM Config Generator${C.reset}`)
  console.log('─'.repeat(48))

  console.log(`\n  Detecting providers...`)
  const config = await buildLiteLLMConfig()

  if (config.model_list.length === 0) {
    console.log(`\n  ${C.yellow}No providers detected.${C.reset}`)
    console.log(`  Start Ollama or set API keys to populate config.\n`)
    return
  }

  const yaml = configToYaml(config)

  if (doPrint) {
    console.log('\n' + yaml)
    return
  }

  ensureRexDirs()
  writeFileSync(outputPath, yaml)

  console.log(`\n  ${C.green}✓${C.reset}  ${config.model_list.length} models configured`)
  for (const m of config.model_list.slice(0, 5)) {
    console.log(`     ${C.dim}${m.model_name}${C.reset}`)
  }
  if (config.model_list.length > 5) {
    console.log(`     ${C.dim}... +${config.model_list.length - 5} more${C.reset}`)
  }
  console.log(`\n  Config saved → ${C.dim}${outputPath}${C.reset}`)
  console.log(`\n  Start proxy:`)
  console.log(`    ${C.cyan}litellm --config ${outputPath} --port 4000${C.reset}`)
  console.log(`\n  Or install:  ${C.dim}pip install litellm[proxy]${C.reset}\n`)

  log.info(`LiteLLM config written to ${outputPath} (${config.model_list.length} models)`)
}
