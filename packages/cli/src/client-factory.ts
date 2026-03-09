/**
 * REX Agent Factory — B2B client provisioning
 *
 * Each client = isolated agent trained on their trade (plumber, electrician…)
 * REX provisions the stack (Dify + n8n + Twenty CRM + LiteLLM budget)
 * and stores state in SQLite alongside REX memory.
 *
 * rex create-client --name "Jean Martin" --trade "plombier" --plan pro
 * rex clients list
 * rex clients status <id>
 * rex clients remove <id>
 */

import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { execSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { REX_DIR } from './paths.js'
import { createLogger } from './logger.js'

const execFileAsync = promisify(execFile)
const log = createLogger('client-factory')

// ── Types ────────────────────────────────────────────────────────────────────

export type ClientPlan = 'starter' | 'pro' | 'enterprise'

export interface ClientConfig {
  id: string                // slug: jean-martin-plombier-20260308
  name: string
  trade: string
  phone?: string
  email?: string
  plan: ClientPlan
  status: ClientStatus
  createdAt: string
  updatedAt: string
  ports: {
    dify: number
    n8n: number
    twenty: number
  }
  litellm: {
    monthlyBudgetUsd: number
    model: string           // preferred model for this client
  }
  docker: {
    composeFile: string
    networkName: string
    dataDir: string
  }
  metrics: {
    totalTokens: number
    totalCostUsd: number
    sessionsCount: number
    lastActiveAt?: string
  }
}

export type ClientStatus =
  | 'provisioning'
  | 'active'
  | 'paused'
  | 'error'
  | 'removed'

// ── Plan definitions ─────────────────────────────────────────────────────────

const PLAN_CONFIGS: Record<ClientPlan, { monthlyBudgetUsd: number; model: string }> = {
  starter:    { monthlyBudgetUsd: 15,  model: 'groq/llama-3.1-8b-instant' },
  pro:        { monthlyBudgetUsd: 40,  model: 'groq/llama-3.3-70b-versatile' },
  enterprise: { monthlyBudgetUsd: 120, model: 'anthropic/claude-haiku-4-5-20251001' },
}

// ── Trade corpus hints (used for Dify RAG seeding) ───────────────────────────

const TRADE_HINTS: Record<string, string[]> = {
  plombier:      ['SAV urgences', 'pièces véhicule', 'dossiers CEE', 'astreintes'],
  electricien:   ['attestations CONSUEL', 'schémas électriques', 'DICT', 'Qualifelec'],
  peintre:       ['quantitatifs surfaces', 'gestion coloris', 'devis peinture'],
  macon:         ['BL béton temps réel', 'plans chantier', 'métrés'],
  couvreur:      ['chiffrage pente/surface', 'étanchéité', 'drone devis'],
  menuisier:     ['carnets de cotes', 'commandes usine', 'suivi pose'],
  chauffagiste:  ['MaPrimeRénov', 'dossiers CEE', 'RGE', 'chaudière'],
  plaquiste:     ['métrés BA13', 'acoustique', 'isolation thermique'],
  carreleur:     ['quantitatifs m²', 'joints', 'pose complexe'],
  charpentier:   ['structure bois', 'DTU', 'plans charpente'],
}

// ── Storage ──────────────────────────────────────────────────────────────────

const CLIENTS_DIR = join(REX_DIR, 'clients')
const CLIENTS_INDEX = join(CLIENTS_DIR, 'index.json')

function ensureClientsDir(): void {
  if (!existsSync(CLIENTS_DIR)) mkdirSync(CLIENTS_DIR, { recursive: true })
}

function loadIndex(): ClientConfig[] {
  ensureClientsDir()
  if (!existsSync(CLIENTS_INDEX)) return []
  try {
    return JSON.parse(readFileSync(CLIENTS_INDEX, 'utf-8')) as ClientConfig[]
  } catch {
    return []
  }
}

function saveIndex(clients: ClientConfig[]): void {
  ensureClientsDir()
  writeFileSync(CLIENTS_INDEX, JSON.stringify(clients, null, 2))
}

function saveClient(client: ClientConfig): void {
  const clients = loadIndex()
  const idx = clients.findIndex(c => c.id === client.id)
  if (idx >= 0) clients[idx] = client
  else clients.push(client)
  saveIndex(clients)
  // Also write individual file for easy access
  const dir = join(CLIENTS_DIR, client.id)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(client, null, 2))
}

// ── Port allocation ──────────────────────────────────────────────────────────

const BASE_PORTS = { dify: 3100, n8n: 5678, twenty: 3000 }

function allocatePorts(existingClients: ClientConfig[]): { dify: number; n8n: number; twenty: number } {
  const used = new Set(existingClients.flatMap(c => Object.values(c.ports)))
  let offset = existingClients.length * 10
  while (
    used.has(BASE_PORTS.dify + offset) ||
    used.has(BASE_PORTS.n8n + offset) ||
    used.has(BASE_PORTS.twenty + offset)
  ) {
    offset += 10
  }
  return {
    dify:  BASE_PORTS.dify + offset,
    n8n:   BASE_PORTS.n8n + offset,
    twenty: BASE_PORTS.twenty + offset,
  }
}

// ── ID generation ────────────────────────────────────────────────────────────

function makeClientId(name: string, trade: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${slug(name)}-${slug(trade)}-${date}`
}

// ── Docker Compose generation ─────────────────────────────────────────────────

function generateDockerCompose(client: ClientConfig): string {
  const { ports, docker } = client
  const p = ports

  return `# REX Agent Factory — ${client.name} (${client.trade})
# Generated: ${new Date().toISOString()}
# Plan: ${client.plan} | Budget: $${client.litellm.monthlyBudgetUsd}/mo

version: '3.8'

networks:
  ${docker.networkName}:
    driver: bridge

volumes:
  ${client.id}-dify-db:
  ${client.id}-n8n-db:
  ${client.id}-twenty-db:

services:
  # ── Dify — Agent conversationnel + RAG ──────────────────────────────────
  ${client.id}-dify-api:
    image: langgenius/dify-api:latest
    container_name: ${client.id}-dify-api
    environment:
      - SECRET_KEY=rex-${client.id}-dify-secret
      - DB_USERNAME=dify
      - DB_PASSWORD=rex-${client.id}-dify-db
      - DB_DATABASE=${client.id}_dify
      - CELERY_BROKER_URL=redis://${client.id}-redis:6379/1
      - STORAGE_TYPE=local
    volumes:
      - ${docker.dataDir}/dify:/app/api/storage
    networks:
      - ${docker.networkName}
    restart: unless-stopped

  ${client.id}-dify-web:
    image: langgenius/dify-web:latest
    container_name: ${client.id}-dify-web
    ports:
      - "${p.dify}:3000"
    environment:
      - CONSOLE_API_URL=http://localhost:${p.dify}
    networks:
      - ${docker.networkName}
    restart: unless-stopped

  # ── n8n — Workflows & automations ───────────────────────────────────────
  ${client.id}-n8n:
    image: n8nio/n8n:latest
    container_name: ${client.id}-n8n
    ports:
      - "${p.n8n}:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=rex
      - N8N_BASIC_AUTH_PASSWORD=rex-${client.id}
      - N8N_ENCRYPTION_KEY=rex-${client.id}-n8n-key
      - DB_TYPE=sqlite
      - N8N_USER_FOLDER=/home/node/.n8n
    volumes:
      - ${docker.dataDir}/n8n:/home/node/.n8n
    networks:
      - ${docker.networkName}
    restart: unless-stopped

  # ── Twenty CRM — Contacts, chantiers, suivi ─────────────────────────────
  ${client.id}-twenty:
    image: twentycrm/twenty:latest
    container_name: ${client.id}-twenty
    ports:
      - "${p.twenty}:3000"
    environment:
      - SERVER_URL=http://localhost:${p.twenty}
      - SIGN_IN_PREFILLED=true
      - STORAGE_TYPE=local
    volumes:
      - ${docker.dataDir}/twenty:/app/packages/twenty-server/.local-storage
    networks:
      - ${docker.networkName}
    restart: unless-stopped

  # ── Redis (shared) ───────────────────────────────────────────────────────
  ${client.id}-redis:
    image: redis:7-alpine
    container_name: ${client.id}-redis
    networks:
      - ${docker.networkName}
    restart: unless-stopped
`
}

// ── LiteLLM budget config fragment ───────────────────────────────────────────

function generateLiteLLMBudget(client: ClientConfig): object {
  return {
    model: client.litellm.model,
    litellm_params: {
      model: client.litellm.model,
      api_key: 'os.environ/LITELLM_MASTER_KEY',
    },
    model_info: {
      id: `client-${client.id}`,
      max_budget: client.litellm.monthlyBudgetUsd,
      budget_duration: '1mo',
    },
  }
}

// ── Provision ────────────────────────────────────────────────────────────────

export interface CreateClientOpts {
  name: string
  trade: string
  phone?: string
  email?: string
  plan?: ClientPlan
  dryRun?: boolean
}

export async function createClient(opts: CreateClientOpts): Promise<ClientConfig> {
  const plan = opts.plan ?? 'pro'
  const planCfg = PLAN_CONFIGS[plan]
  const existing = loadIndex()

  const id = makeClientId(opts.name, opts.trade)
  if (existing.find(c => c.id === id)) {
    throw new Error(`Client ${id} already exists. Use a different name or remove first.`)
  }

  const ports = allocatePorts(existing)
  const dataDir = join(CLIENTS_DIR, id, 'data')
  const composeFile = join(CLIENTS_DIR, id, 'docker-compose.yml')
  const networkName = `rex-${id}`

  const client: ClientConfig = {
    id,
    name: opts.name,
    trade: opts.trade.toLowerCase(),
    phone: opts.phone,
    email: opts.email,
    plan,
    status: 'provisioning',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ports,
    litellm: {
      monthlyBudgetUsd: planCfg.monthlyBudgetUsd,
      model: planCfg.model,
    },
    docker: { composeFile, networkName, dataDir },
    metrics: { totalTokens: 0, totalCostUsd: 0, sessionsCount: 0 },
  }

  const hints = TRADE_HINTS[client.trade] ?? []
  log.info(`Creating client: ${id} | plan=${plan} | budget=$${planCfg.monthlyBudgetUsd}/mo`)
  if (hints.length > 0) log.info(`Trade corpus: ${hints.join(', ')}`)

  if (opts.dryRun) {
    log.info('[dry-run] Would provision:')
    log.info(`  Docker Compose → ${composeFile}`)
    log.info(`  Data dir → ${dataDir}`)
    log.info(`  Ports: Dify=${ports.dify} n8n=${ports.n8n} Twenty=${ports.twenty}`)
    log.info(`  LiteLLM model: ${planCfg.model} | $${planCfg.monthlyBudgetUsd}/mo budget`)
    return { ...client, status: 'active' }
  }

  // 1. Create dirs
  mkdirSync(join(CLIENTS_DIR, id), { recursive: true })
  mkdirSync(dataDir, { recursive: true })

  // 2. Write docker-compose.yml
  writeFileSync(composeFile, generateDockerCompose(client))
  log.info(`Docker Compose written → ${composeFile}`)

  // 3. Write RAG corpus seed file
  if (hints.length > 0) {
    const corpusPath = join(CLIENTS_DIR, id, 'corpus-seed.md')
    const corpus = `# Agent ${opts.name} — ${opts.trade}\n\n## Topics métier\n\n${hints.map(h => `- ${h}`).join('\n')}\n\n## Contexte\n\nAgent spécialisé pour un artisan ${opts.trade}. Répond en français, de façon concise et professionnelle.\n`
    writeFileSync(corpusPath, corpus)
    log.info(`Corpus seed written → ${corpusPath}`)
  }

  // 4. Write LiteLLM budget config fragment
  const litellmPath = join(CLIENTS_DIR, id, 'litellm-budget.json')
  writeFileSync(litellmPath, JSON.stringify(generateLiteLLMBudget(client), null, 2))

  // 5. Try to start docker stack if docker available
  let started = false
  try {
    execSync('which docker', { stdio: 'ignore' })
    log.info('Docker found — starting client stack...')
    await execFileAsync('docker', ['compose', '-f', composeFile, 'up', '-d'], {
      timeout: 120_000,
      env: { ...process.env },
    })
    started = true
    log.info('Docker stack started')
  } catch {
    log.warn('Docker not available or failed — stack not started. Run manually:')
    log.warn(`  docker compose -f ${composeFile} up -d`)
  }

  client.status = started ? 'active' : 'provisioning'
  client.updatedAt = new Date().toISOString()
  saveClient(client)

  return client
}

// ── List / status / remove ────────────────────────────────────────────────────

export function listClients(): ClientConfig[] {
  return loadIndex().filter(c => c.status !== 'removed')
}

export function getClient(id: string): ClientConfig | null {
  return loadIndex().find(c => c.id === id) ?? null
}

export async function pauseClient(id: string): Promise<void> {
  const client = getClient(id)
  if (!client) throw new Error(`Client ${id} not found`)
  try {
    await execFileAsync('docker', ['compose', '-f', client.docker.composeFile, 'stop'], { timeout: 30_000 })
  } catch { /* ignore if docker not available */ }
  client.status = 'paused'
  client.updatedAt = new Date().toISOString()
  saveClient(client)
}

export async function resumeClient(id: string): Promise<void> {
  const client = getClient(id)
  if (!client) throw new Error(`Client ${id} not found`)
  try {
    await execFileAsync('docker', ['compose', '-f', client.docker.composeFile, 'up', '-d'], { timeout: 60_000 })
  } catch { /* ignore */ }
  client.status = 'active'
  client.updatedAt = new Date().toISOString()
  saveClient(client)
}

export async function removeClient(id: string, opts: { purge?: boolean } = {}): Promise<void> {
  const client = getClient(id)
  if (!client) throw new Error(`Client ${id} not found`)

  try {
    await execFileAsync('docker', ['compose', '-f', client.docker.composeFile, 'down', '-v'], { timeout: 60_000 })
  } catch { /* ignore */ }

  if (opts.purge) {
    const dir = join(CLIENTS_DIR, id)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    const clients = loadIndex().filter(c => c.id !== id)
    saveIndex(clients)
  } else {
    client.status = 'removed'
    client.updatedAt = new Date().toISOString()
    saveClient(client)
  }
}

// ── Logs / Stop ───────────────────────────────────────────────────────────────

export async function getClientLogs(id: string, lines = 100): Promise<string> {
  const client = getClient(id)
  if (!client) throw new Error(`Client ${id} not found`)
  try {
    const r = await execFileAsync(
      'docker',
      ['compose', '-f', client.docker.composeFile, 'logs', '--tail', String(lines)],
      { timeout: 15_000 },
    )
    return r.stdout
  } catch (e) {
    return `Docker logs unavailable: ${(e as Error).message}`
  }
}

export async function stopClient(id: string): Promise<void> {
  await pauseClient(id)
}

// ── Print helpers ─────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
}

function statusColor(s: ClientStatus): string {
  switch (s) {
    case 'active':       return C.green
    case 'provisioning': return C.yellow
    case 'paused':       return C.cyan
    case 'error':        return C.red
    case 'removed':      return C.dim
    default:             return C.reset
  }
}

function planBadge(p: ClientPlan): string {
  switch (p) {
    case 'starter':    return `${C.dim}starter${C.reset}`
    case 'pro':        return `${C.cyan}pro${C.reset}`
    case 'enterprise': return `${C.yellow}enterprise${C.reset}`
  }
}

export function printClients(clients: ClientConfig[]): void {
  if (clients.length === 0) {
    console.log(`${C.dim}No clients. Run: rex create-client --name "..." --trade "..." --plan pro${C.reset}`)
    return
  }

  console.log()
  console.log(`${C.bold}REX Agent Factory — ${clients.length} client${clients.length !== 1 ? 's' : ''}${C.reset}`)
  console.log()

  for (const c of clients) {
    const sc = statusColor(c.status)
    const age = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000)
    console.log(`  ${C.bold}${c.name}${C.reset} ${C.dim}(${c.trade})${C.reset}  ${sc}●${C.reset} ${c.status}  ${planBadge(c.plan)}`)
    console.log(`    ${C.dim}id: ${c.id}  created: ${age}d ago${C.reset}`)
    console.log(`    Ports: Dify=${c.ports.dify}  n8n=${c.ports.n8n}  Twenty=${c.ports.twenty}`)
    console.log(`    Budget: $${c.litellm.monthlyBudgetUsd}/mo  Used: $${c.metrics.totalCostUsd.toFixed(2)}  Sessions: ${c.metrics.sessionsCount}`)
    console.log()
  }
}

export function printClientDetail(client: ClientConfig): void {
  const sc = statusColor(client.status)
  console.log()
  console.log(`${C.bold}${client.name}${C.reset} — ${client.trade}`)
  console.log(`  ID:       ${client.id}`)
  console.log(`  Status:   ${sc}${client.status}${C.reset}`)
  console.log(`  Plan:     ${planBadge(client.plan)}  ($${client.litellm.monthlyBudgetUsd}/mo budget)`)
  console.log(`  Model:    ${client.litellm.model}`)
  if (client.phone) console.log(`  Phone:    ${client.phone}`)
  if (client.email) console.log(`  Email:    ${client.email}`)
  console.log()
  console.log(`  Dify UI:  http://localhost:${client.ports.dify}`)
  console.log(`  n8n UI:   http://localhost:${client.ports.n8n}`)
  console.log(`  Twenty:   http://localhost:${client.ports.twenty}`)
  console.log()
  console.log(`  Compose:  ${client.docker.composeFile}`)
  console.log(`  Data:     ${client.docker.dataDir}`)
  console.log()
  console.log(`  Tokens:   ${client.metrics.totalTokens.toLocaleString()}`)
  console.log(`  Cost:     $${client.metrics.totalCostUsd.toFixed(4)}`)
  console.log(`  Sessions: ${client.metrics.sessionsCount}`)
  if (client.metrics.lastActiveAt) {
    const ago = Math.floor((Date.now() - new Date(client.metrics.lastActiveAt).getTime()) / 60_000)
    console.log(`  Last:     ${ago}m ago`)
  }
  console.log()
}
