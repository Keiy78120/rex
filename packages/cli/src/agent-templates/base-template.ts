/**
 * REX Agent Templates — Base interface and factory
 *
 * Defines the AgentTemplate interface that all persona templates implement.
 * Used by `rex client:create --template <type>` to provision client agents
 * with the right tools, memory, style, and automations pre-configured.
 *
 * @module AGENTS
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TemplateId = 'dg' | 'drh' | 'ceo' | 'coo' | 'freelance' | 'dev'

export interface MemoryInit {
  category: string
  content: string
}

export interface Automation {
  id: string
  description: string
  trigger: 'daily' | 'weekly' | 'monthly' | 'on-event' | 'on-demand'
  triggerTime?: string  // HH:MM for daily/weekly
  signalKind?: 'PATTERN' | 'OPEN_LOOP' | 'DISCOVERY'
  prompt: string
}

export interface AgentStyle {
  language: 'fr' | 'en'
  formality: 'formal' | 'informal'       // formal = vouvoiement, informal = tutoiement
  responseFormat: 'bullets' | 'prose' | 'mixed'
  maxResponseLength: 'short' | 'medium' | 'long'  // short = 3 bullets, medium = paragraph, long = full doc
  alwaysActionable: boolean               // always end with a concrete next action
}

export interface AgentTemplate {
  id: TemplateId
  name: string
  description: string

  /** MCP servers to enable for this agent */
  mcpServers: string[]

  /** Claude allowed tools list */
  allowedTools: string[]

  /** Initial memory entries to seed the agent's context */
  memoryInit: MemoryInit[]

  /** Communication style */
  style: AgentStyle

  /** Pre-configured automations */
  automations: Automation[]

  /** System prompt prefix (persona definition) */
  systemPrompt: string

  /** Max turns per session */
  maxTurns: number

  /** Default model */
  model: 'claude' | 'local'
  localModel?: string

  /** REX Monitor modules to enable */
  monitorModules: ('activitywatch' | 'hammerspoon' | 'audio')[]

  /** Required external integrations */
  integrations: string[]
}

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<TemplateId, AgentTemplate>()

export function registerTemplate(template: AgentTemplate): void {
  registry.set(template.id, template)
}

export function getTemplate(id: TemplateId): AgentTemplate | undefined {
  return registry.get(id)
}

export function listTemplates(): AgentTemplate[] {
  return Array.from(registry.values())
}

// ── Auto-load all persona templates ─────────────────────────────────────────

export async function loadAllTemplates(): Promise<void> {
  const { dgTemplate } = await import('./personas/dg-template.js')
  const { drhTemplate } = await import('./personas/drh-template.js')
  const { ceoTemplate } = await import('./personas/ceo-template.js')
  const { cooTemplate } = await import('./personas/coo-template.js')
  const { freelanceTemplate } = await import('./personas/freelance-template.js')

  for (const t of [dgTemplate, drhTemplate, ceoTemplate, cooTemplate, freelanceTemplate]) {
    registerTemplate(t)
  }
}

// ── Print helpers ─────────────────────────────────────────────────────────────

export function printTemplateList(): void {
  const templates = listTemplates()
  console.log('\nAgent Templates\n')
  for (const t of templates) {
    console.log(`  ${t.id.padEnd(12)} ${t.name}`)
    console.log(`               ${t.description}`)
    console.log(`               Tools: ${t.allowedTools.slice(0, 4).join(', ')}${t.allowedTools.length > 4 ? '...' : ''}`)
    console.log()
  }
}

export function printTemplateDetail(t: AgentTemplate): void {
  console.log(`\nTemplate: ${t.name} (${t.id})\n`)
  console.log(`Description  : ${t.description}`)
  console.log(`Model        : ${t.model}${t.localModel ? ` (${t.localModel})` : ''}`)
  console.log(`Max turns    : ${t.maxTurns}`)
  console.log(`Style        : ${t.style.formality}, ${t.style.language}, ${t.style.responseFormat}`)
  console.log(`\nTools (${t.allowedTools.length}):`)
  for (const tool of t.allowedTools) console.log(`  - ${tool}`)
  console.log(`\nMCP Servers:`)
  for (const mcp of t.mcpServers) console.log(`  - ${mcp}`)
  console.log(`\nAutomations (${t.automations.length}):`)
  for (const a of t.automations) {
    const when = a.triggerTime ? ` @ ${a.triggerTime}` : ''
    console.log(`  [${a.trigger}${when}] ${a.description}`)
  }
  console.log(`\nMonitor modules: ${t.monitorModules.join(', ')}`)
  console.log(`Integrations   : ${t.integrations.join(', ')}`)
  console.log()
}
