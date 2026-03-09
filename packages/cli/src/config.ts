import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { CONFIG_PATH } from './paths.js'

export interface RexConfig {
  llm: {
    embedModel: string
    classifyModel: string
    routing: 'ollama-first' | 'claude-only' | 'ollama-only'
    claudeFallback: string
    backend?: string
    backendUrl?: string
  }
  ingest: {
    scanPaths: string[]
    excludePaths: string[]
    autoIngestInterval: number
  }
  selfImprovement: {
    enabled: boolean
    ruleThreshold: number
    reviewInterval: number
  }
  daemon: {
    healthCheckInterval: number
    ingestInterval: number
    maintenanceInterval: number
    selfReviewInterval: number
  }
  notifications: {
    silent: string[]
    warn: string[]
    daily: boolean
    weekly: boolean
  }
}

const DEFAULTS: RexConfig = {
  llm: {
    embedModel: 'nomic-embed-text',
    classifyModel: 'auto',
    routing: 'ollama-first',
    claudeFallback: 'haiku',
  },
  ingest: {
    scanPaths: ['~/Documents/Developer/'],
    excludePaths: ['node_modules', '.git', '_archive', 'dist', 'build'],
    autoIngestInterval: 1800,
  },
  selfImprovement: {
    enabled: true,
    ruleThreshold: 3,
    reviewInterval: 86400,
  },
  daemon: {
    healthCheckInterval: 300,
    ingestInterval: 1800,
    maintenanceInterval: 3600,
    selfReviewInterval: 86400,
  },
  notifications: {
    silent: ['ollama-restart', 'pending-flush', 'categorize-batch'],
    warn: ['db-corrupt', 'disk-low', 'config-corrupt'],
    daily: true,
    weekly: true,
  },
}

export function loadConfig(): RexConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULTS
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    return {
      ...DEFAULTS,
      ...raw,
      llm: { ...DEFAULTS.llm, ...raw.llm },
      ingest: { ...DEFAULTS.ingest, ...raw.ingest },
      selfImprovement: { ...DEFAULTS.selfImprovement, ...raw.selfImprovement },
      daemon: { ...DEFAULTS.daemon, ...raw.daemon },
      notifications: { ...DEFAULTS.notifications, ...raw.notifications },
    }
  } catch {
    const bakPath = CONFIG_PATH + '.bak'
    if (existsSync(bakPath)) {
      try {
        const bak = JSON.parse(readFileSync(bakPath, 'utf-8'))
        writeFileSync(CONFIG_PATH, JSON.stringify(bak, null, 2))
        return { ...DEFAULTS, ...bak }
      } catch {}
    }
    return DEFAULTS
  }
}

export function saveConfig(config: RexConfig): void {
  if (existsSync(CONFIG_PATH)) {
    copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak')
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
