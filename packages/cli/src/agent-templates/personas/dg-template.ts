/**
 * DG — Directeur(trice) Général(e) agent template
 *
 * Profil : Agenda chargé, nombreuses réunions, gestion de dossiers stratégiques,
 * communication multi-niveaux, peu de temps pour le détail.
 *
 * Premier client cible : Patrycja
 *
 * @module AGENTS
 */

import { Agent, tool } from '@openai/agents'
import type { AgentTemplate } from '../base-template.js'

// ── DG Tools (OpenAI Agents SDK) ──────────────────────────────────────────────

const calendarBriefTool = tool({
  name: 'calendar_brief',
  description: 'Récupère les RDV du jour avec participants et objectifs',
  parameters: {
    type: 'object',
    properties: {
      date: { type: 'string', description: "Date ISO (défaut: aujourd'hui)" },
    },
    required: [],
  },
  execute: async (args: { date?: string }) => {
    const target = args.date ?? new Date().toISOString().split('T')[0]
    // Stub: in production, reads from google-calendar MCP
    return JSON.stringify({ date: target, events: [], note: 'Connectez le MCP google-calendar pour activer ce tool' })
  },
})

const memorySearchTool = tool({
  name: 'memory_search',
  description: 'Recherche dans la mémoire REX : historique réunions, décisions, dossiers',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Requête de recherche' },
      limit: { type: 'number', description: 'Nombre max de résultats (défaut: 5)' },
    },
    required: ['query'],
  },
  execute: async (args: { query: string; limit?: number }) => {
    const limit = args.limit ?? 5
    try {
      const { execSync } = await import('node:child_process')
      const out = execSync(`rex search "${args.query.replace(/"/g, '')}" --limit=${limit} --json 2>/dev/null`, {
        timeout: 10_000,
        encoding: 'utf-8',
      })
      return out.trim() || '[]'
    } catch {
      return '[]'
    }
  },
})

const emailSummaryTool = tool({
  name: 'email_summary',
  description: 'Résume les emails non lus prioritaires',
  parameters: {
    type: 'object',
    properties: {
      maxEmails: { type: 'number', description: "Nombre max d'emails à analyser (défaut: 10)" },
    },
    required: [],
  },
  execute: async (args: { maxEmails?: number }) => {
    const maxEmails = args.maxEmails ?? 10
    // Stub: in production, reads from gmail MCP
    return JSON.stringify({ emails: [], maxEmails, note: 'Connectez le MCP gmail pour activer ce tool' })
  },
})

const openLoopsTool = tool({
  name: 'open_loops',
  description: 'Liste les boucles ouvertes : décisions non actées, emails sans réponse, tâches en attente',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args: Record<string, never>) => {
    try {
      const { execSync } = await import('node:child_process')
      const out = execSync('rex search "open_loop" --limit=10 --json 2>/dev/null', {
        timeout: 10_000,
        encoding: 'utf-8',
      })
      return out.trim() || '[]'
    } catch {
      return '[]'
    }
  },
})

/**
 * Create a runnable DG agent using the OpenAI Agents SDK.
 * The agent uses the DG system prompt and has access to calendar,
 * memory search, email summary, and open-loop detection tools.
 *
 * @example
 * const agent = createDgAgent()
 * const result = await run(agent, 'Prépare mon brief du matin')
 */
export function createDgAgent(): Agent {
  return new Agent({
    name: 'REX-DG',
    instructions: dgTemplate.systemPrompt,
    model: 'gpt-4o-mini', // fallback model — overridden by rex routing in production
    tools: [calendarBriefTool, memorySearchTool, emailSummaryTool, openLoopsTool],
  })
}

export const dgTemplate: AgentTemplate = {
  id: 'dg',
  name: 'Directeur(trice) Général(e)',
  description: 'Assistant exécutif pour DG : agenda, réunions, dossiers stratégiques, communication.',

  allowedTools: [
    'Read', 'Write', 'Edit',
    'Bash(curl:*)', 'Bash(cat:*)', 'Bash(ls:*)',
    'mcp__google_calendar__*',
    'mcp__gmail__*',
    'mcp__google_drive__*',
    'mcp__rex__rex_memory_search',
    'mcp__rex__rex_observe',
  ],

  mcpServers: [
    'google-calendar',
    'gmail',
    'google-drive',
    'rex',
  ],

  memoryInit: [
    {
      category: 'context',
      content: 'Je suis votre assistant personnel dédié. Je gère votre agenda, prépare vos réunions et assure le suivi de vos décisions.',
    },
    {
      category: 'preferences',
      content: 'Style de communication : formel, réponses courtes en bullet points, toujours proposer une action concrète.',
    },
    {
      category: 'routines',
      content: 'Brief quotidien à 8h00 : agenda du jour + emails prioritaires non traités + actions en attente.',
    },
  ],

  style: {
    language: 'fr',
    formality: 'formal',
    responseFormat: 'bullets',
    maxResponseLength: 'short',
    alwaysActionable: true,
  },

  automations: [
    {
      id: 'morning-brief',
      description: 'Brief quotidien 8h : agenda du jour + emails non lus importants',
      trigger: 'daily',
      triggerTime: '08:00',
      prompt: `Prépare le brief du matin :
1. Liste les RDV d'aujourd'hui avec participants et objectif
2. Résume les 3 emails les plus importants non lus
3. Liste les actions en attente de la veille
Format : 3 sections courtes, bullet points.`,
    },
    {
      id: 'pre-meeting-brief',
      description: 'Brief automatique 15min avant chaque RDV',
      trigger: 'on-event',
      signalKind: 'OPEN_LOOP',
      prompt: `Prépare un brief pré-réunion en 3 points :
1. Participants (qui ils sont, leur rôle)
2. Historique des échanges récents avec eux
3. Objectif du RDV et points clés à aborder
Maximum 5 bullet points.`,
    },
    {
      id: 'post-meeting-summary',
      description: 'Compte-rendu post-réunion avec action items',
      trigger: 'on-demand',
      prompt: `À partir de la transcription de la réunion :
1. Résumé en 3 bullet points
2. Décisions prises
3. Action items avec responsable et deadline
Format : court, actionnable, prêt à envoyer par email.`,
    },
    {
      id: 'weekly-review',
      description: 'Revue hebdomadaire : décisions, progrès, priorités',
      trigger: 'weekly',
      triggerTime: '17:00',
      prompt: `Prépare la revue de la semaine :
1. Décisions prises cette semaine
2. Actions complétées vs prévues
3. Priorités de la semaine suivante
Identifie les boucles ouvertes (décisions non actées, emails sans réponse).`,
    },
    {
      id: 'open-loops-alert',
      description: 'Alerte boucles ouvertes — décisions non actées',
      trigger: 'daily',
      triggerTime: '16:00',
      signalKind: 'OPEN_LOOP',
      prompt: `Identifie les boucles ouvertes de la journée :
- Emails qui attendent une réponse (> 24h)
- Décisions prises mais non communiquées
- Tâches promises non démarrées
Propose une action pour chacune.`,
    },
  ],

  systemPrompt: `Tu es l'assistant exécutif personnel d'une Directrice Générale.
Ton rôle : décharger la DG de la gestion opérationnelle pour qu'elle se concentre sur l'essentiel.

Règles absolues :
- Vouvoiement systématique
- Réponses courtes : maximum 5 bullet points
- Chaque réponse se termine par une action concrète proposée
- Si tu n'es pas sûr : poser UNE question précise, pas plusieurs
- Confidentialité absolue sur tous les dossiers

Priorities par ordre :
1. Ce qui bloque une décision stratégique
2. Ce qui implique des partenaires externes
3. Ce qui a une deadline aujourd'hui
4. Tout le reste`,

  maxTurns: 50,
  model: 'claude',

  monitorModules: ['activitywatch', 'hammerspoon', 'audio'],

  integrations: ['google-calendar', 'gmail', 'google-drive'],
}
