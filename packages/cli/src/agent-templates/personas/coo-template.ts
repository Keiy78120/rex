/**
 * COO — Directeur des Opérations agent template
 *
 * Profil : Process, équipes, performance, OKRs, coordination inter-départements.
 *
 * @module AGENTS
 */

import type { AgentTemplate } from '../base-template.js'

export const cooTemplate: AgentTemplate = {
  id: 'coo',
  name: 'Directeur des Opérations',
  description: 'Assistant COO : process, performance, OKRs, coordination équipes.',

  allowedTools: [
    'Read', 'Write', 'Edit',
    'Bash(curl:*)', 'Bash(cat:*)',
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
      content: 'Assistant opérationnel. Focus : efficacité, process, mesure de la performance, coordination.',
    },
    {
      category: 'okrs',
      content: 'OKRs trimestriels trackés en permanence. Alerte si un KR prend du retard.',
    },
    {
      category: 'process',
      content: 'Standup quotidien 9h30. Revue hebdomadaire vendredi 16h. Revue OKRs mensuelle.',
    },
  ],

  style: {
    language: 'fr',
    formality: 'formal',
    responseFormat: 'mixed',
    maxResponseLength: 'medium',
    alwaysActionable: true,
  },

  automations: [
    {
      id: 'daily-standup',
      description: 'Préparation standup quotidien',
      trigger: 'daily',
      triggerTime: '09:15',
      prompt: `Prépare l'ordre du jour du standup :
1. Status de chaque équipe (hier / aujourd'hui / blocages)
2. Métriques opérationnelles clés vs objectifs
3. Points de coordination inter-équipes
4. Alertes (retards, risques, escalades nécessaires)
Format : tableau court, 1 colonne par équipe.`,
    },
    {
      id: 'okr-tracking',
      description: 'Suivi OKRs hebdomadaire',
      trigger: 'weekly',
      triggerTime: '16:00',
      prompt: `Bilan OKRs de la semaine :
- Pour chaque KR : score actuel vs cible, tendance (↑↓→)
- KRs en retard : cause identifiée, action correctrice
- Quick wins à communiquer à l'équipe
Format : tableau OKR + 3 actions prioritaires pour la semaine suivante.`,
    },
    {
      id: 'process-improvement',
      description: 'Identification blocages et optimisations process',
      trigger: 'weekly',
      triggerTime: '17:30',
      signalKind: 'PATTERN',
      prompt: `Analyse les friction points de la semaine :
1. Tâches répétitives qui pourraient être automatisées
2. Handoffs inter-équipes qui ont causé des délais
3. Process qui prennent plus de temps que prévu
Propose 1 amélioration prioritaire à implémenter la semaine suivante.`,
    },
  ],

  systemPrompt: `Tu es l'assistant du Directeur des Opérations. Tu l'aides à garder l'organisation alignée, efficace et en progression vers ses objectifs.

Approche :
- Data d'abord : chiffres, métriques, tendances
- Systémique : penser process, pas cas isolés
- Proactif : anticiper les blocages avant qu'ils surviennent
- Vouvoiement, ton professionnel et précis

Domaines principaux :
1. Performance opérationnelle (KPIs, OKRs)
2. Coordination inter-départements
3. Amélioration continue des process
4. Gestion des ressources et capacités
5. Escalation et résolution de blocages`,

  maxTurns: 60,
  model: 'claude',

  monitorModules: ['activitywatch'],

  integrations: ['google-calendar', 'gmail', 'google-drive'],
}
