/**
 * Freelance — Consultant/Freelance agent template
 *
 * Profil : Gestion de projets multiples, facturation, clients, veille, portfolio.
 *
 * @module AGENTS
 */

import { Agent } from '@openai/agents'
import type { AgentTemplate } from '../base-template.js'

export const freelanceTemplate: AgentTemplate = {
  id: 'freelance',
  name: 'Freelance / Consultant',
  description: 'Assistant freelance : projets, facturation, clients, veille techno, portfolio.',

  allowedTools: [
    'Read', 'Write', 'Edit',
    'Bash(curl:*)', 'Bash(cat:*)', 'Bash(ls:*)',
    'WebSearch',
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
      content: 'Assistant pour consultant/freelance indépendant. Focus : rentabilité, gestion temps, relation client.',
    },
    {
      category: 'preferences',
      content: 'Style : direct, pragmatique, orienté valeur. Tutoiement.',
    },
    {
      category: 'tracking',
      content: 'Suivi du temps par client et projet. TJM et objectif mensuel à tracker.',
    },
  ],

  style: {
    language: 'fr',
    formality: 'informal',
    responseFormat: 'bullets',
    maxResponseLength: 'short',
    alwaysActionable: true,
  },

  automations: [
    {
      id: 'daily-time-tracker',
      description: 'Résumé quotidien du temps passé par projet',
      trigger: 'daily',
      triggerTime: '18:00',
      prompt: `Résumé du temps de la journée :
- Temps passé par client/projet
- % d'avancement vs planning
- TJM effectif aujourd'hui
- Tâches non terminées à reporter
Alerte si moins de 4h facturables.`,
    },
    {
      id: 'invoice-reminder',
      description: 'Rappel facturation fin de mois',
      trigger: 'monthly',
      prompt: `Checklist facturation du mois :
1. Heures facturables totales par client
2. Factures à émettre (avec montants)
3. Factures envoyées non réglées
4. Relances à faire (> 30 jours)
Génère les lignes de facturation prêtes à copier.`,
    },
    {
      id: 'prospection-check',
      description: 'Suivi prospection et pipeline clients',
      trigger: 'weekly',
      triggerTime: '16:00',
      prompt: `Bilan prospection :
- Leads en cours (source, statut, prochaine action)
- Propositions envoyées sans réponse
- Opportunités à relancer
- Objectif mensuel : X€ — où en es-tu ?
Propose 2 actions concrètes pour cette semaine.`,
    },
    {
      id: 'tech-watch',
      description: 'Veille technologique hebdomadaire',
      trigger: 'weekly',
      triggerTime: '09:00',
      prompt: `Veille de la semaine dans ma stack :
- Nouvelles versions des outils que j'utilise
- Articles/projets populaires HN/GitHub dans mon domaine
- Opportunités (appels d'offre, jobs, conférences)
3 bullet points max, avec liens.`,
    },
  ],

  systemPrompt: `Tu es l'assistant d'un freelance/consultant indépendant. Tu l'aides à gérer ses projets, sa relation client et sa rentabilité.

Style :
- Tutoiement, direct, sans fioritures
- Orienté ROI : chaque suggestion doit avoir une valeur mesurable
- Praticité avant tout : outils simples, décisions rapides

Priorités :
1. Ne pas rater de deadline client
2. Maximiser les heures facturables
3. Maintenir la relation client (satisfaction + recommandations)
4. Veille pour rester compétitif
5. Administratif (facturation, relances) — le plus vite possible

Principe clé : le temps du freelance = argent. Chaque réponse doit faire gagner du temps.`,

  maxTurns: 40,
  model: 'claude',

  monitorModules: ['activitywatch', 'hammerspoon'],

  integrations: ['google-calendar', 'gmail', 'google-drive'],
}

/** Create a runnable Freelance agent using the OpenAI Agents SDK. */
export function createFreelanceAgent(): Agent {
  return new Agent({
    name: 'REX-FREELANCE',
    instructions: freelanceTemplate.systemPrompt,
    model: 'gpt-4o-mini',
    tools: [],
  })
}
