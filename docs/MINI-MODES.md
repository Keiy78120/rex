
---

## REX — SOURCES SCRIPTS + MINI-MODES SYSTEM (09/03/2026)

---

### REPOS GITHUB SOURCES (à intégrer dans REX HUB)

#### Scripts & Automation
| Repo | Stars | Contenu | Usage REX |
|------|-------|---------|-----------|
| `avinashkranjan/Amazing-Python-Scripts` | 4.5k | 800+ scripts Python automation | Base de patterns |
| `hastagAB/Awesome-Python-Scripts` | 11k | Scripts automatisation tâches | Référence |
| `lorien/awesome-web-scraping` | 9k | Librairies scraping toutes langues | Scraper selection |
| `luminati-io/Awesome-Web-Scraping` | 3k | HTTP + parsing + proxy + CAPTCHA | Stack scraping |
| `alirezamika/autoscraper` | 5k | Scraper auto-apprenant Python | Smart scraping |
| `awesome-selfhosted/awesome-selfhosted` | 220k | Apps self-hostables toutes catégories | Services à integrer |
| `steel-dev/awesome-web-agents` | 2k | Tools browser automation AI | Agent browser |
| `angrykoala/awesome-browser-automation` | 4k | Playwright/Puppeteer/CDP tools | Browser fleet |

#### Workflow & Integration
| Repo | Usage REX |
|------|-----------|
| `n8n` (self-hosted) | Workflows visuels → scripts → déjà installé chez Kevin |
| `Huginn` | IFTTT-like self-hosted, agents qui surveillent et agissent |
| `activepieces` | n8n alternatif OSS, 200+ intégrations |
| `windmill` | Scripts Python/TS avec UI auto-générée |
| `trigger.dev` | Background jobs TypeScript natif |

#### Scraping tools à avoir dans REX
```bash
# Python (pour scripts complexes)
pip install playwright beautifulsoup4 httpx autoscraper scrapy

# Node/TS (pour intégration directe)
npm install playwright cheerio got node-fetch readability

# CLI tools
brew install curl jq lynx w3m  # parsing HTML sans browser
```

---

### CONCEPT MINI-MODES — Système de modes dynamiques

> L'idée : chaque type de tâche = un mini environnement pré-configuré.
> Le LLM entre dans un "mode" qui a déjà tout préparé.
> Il ne fait que remplir les cases vides.

**Principe :**
```
Mode = {
  tools disponibles,
  contexte pré-chargé,
  template de réponse attendu,
  variables dynamiques à remplir
}

L'orchestrateur charge le bon mode → inject le contexte → appelle LLM avec 0 friction
```

**Analogie :** Comme les env variables dans Docker, mais pour l'intelligence.

---

### IMPLÉMENTATION — mini-modes en TypeScript

```typescript
// packages/cli/src/mini-modes/

interface MiniMode {
  id: string
  triggers: RegExp[]           // intents qui activent ce mode
  context_loaders: Loader[]    // scripts qui chargent le contexte
  template: string             // template avec {{variables}}
  llm_fields: string[]         // UNIQUEMENT ces champs vont au LLM
  output_formatter: Formatter  // comment formatter la réponse
  security: SecurityLevel
  estimated_tokens: number     // estimation pour le budget
}

// Exemple mode SEARCH_PROJECT
const SEARCH_PROJECT_MODE: MiniMode = {
  id: "search_project",
  triggers: [/où en est|statut|avance.*projet|comment va.*projet/i],
  context_loaders: [
    loadMemorySearch,       // sqlite-vec
    loadMondayStatus,       // monday API script
    loadGitHubActivity,     // gh CLI script
    loadEventJournal        // derniers événements
  ],
  template: `
    Projet: {{project_name}}
    Mémoire: {{memory_snippets}}
    Monday: {{monday_status}}
    GitHub: {{github_activity}}
    Derniers événements: {{recent_events}}
    ---
    Résumé en 2-3 phrases maximum:
  `,
  llm_fields: ["summary"],    // LLM génère uniquement le résumé final
  output_formatter: formatProjectStatus,
  security: "SAFE",
  estimated_tokens: 200       // 150 input + 50 output max
}
```

---

### CATALOGUE DE MINI-MODES (à implémenter)

```
modes/
  search/
    search-memory.mode.ts        ← recherche dans knowledge base
    search-web.mode.ts           ← web search + résumé
    search-project.mode.ts       ← statut projet (Monday + GitHub + memory)
    search-person.mode.ts        ← infos sur un contact (WhatsApp + iMessage + Obsidian)

  create/
    create-file.mode.ts          ← créer MD/fichier avec contexte dynamique
    create-email.mode.ts         ← rédiger email avec contexte
    create-code.mode.ts          ← nouveau fichier code (boilerplate + docs)
    create-report.mode.ts        ← rapport automatique

  action/
    buy.mode.ts                  ← achat via Playwright + vault (SECURITY: HIGH)
    send-message.mode.ts         ← envoyer message (WhatsApp, Telegram, email)
    schedule.mode.ts             ← créer rappel/event calendrier
    deploy.mode.ts               ← déployer (SECURITY: HIGH)

  dev/
    code-review.mode.ts          ← review code avec context
    debug.mode.ts                ← debug avec logs + stack trace
    refactor.mode.ts             ← refactor avec règles projet
    test-generate.mode.ts        ← générer tests depuis code

  monitor/
    check-service.mode.ts        ← statut service (VPS, app, API)
    check-budget.mode.ts         ← coûts LLM du jour/mois
    check-fleet.mode.ts          ← état fleet
    check-security.mode.ts       ← audit sécurité rapide

  save/
    save-idea.mode.ts            ← sauvegarder idée + enrichir
    save-meeting.mode.ts         ← note de réunion + actions
    save-link.mode.ts            ← bookmark avec résumé auto

  delete/                        ← SECURITY: MEDIUM → CRITICAL
    delete-file.mode.ts          ← avec snapshot obligatoire
    delete-container.mode.ts     ← CRITICAL: double confirmation
```

---

### DYNAMIC CONTEXT INJECTION — Comme des env variables

```typescript
// Chaque mode reçoit un contexte dynamique au runtime
// Comme des variables d'environnement mais pour le LLM

interface ModeContext {
  // Auto-injectés par REX
  user: { name: string, timezone: string, preferences: UserPrefs }
  fleet: { available_nodes: FleetNode[], active_models: string[] }
  budget: { remaining_daily: number, free_calls: FreeCalls }
  memory: { recent_relevant: MemorySnippet[] }

  // Chargés par les loaders du mode
  [key: string]: any  // données spécifiques au mode
}

// Rendre un template dynamique
function renderTemplate(template: string, context: ModeContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    JSON.stringify(context[key] ?? '') // stringify compact, pas de whitespace
  )
}

// Résultat : LLM reçoit un prompt de 100-300 tokens max
// au lieu de 2000+ tokens de contexte brut
```

---

### SCRIPT STORE — Référentiel de scripts pré-construits

```
rex/scripts/
  fetch/
    web-search.sh          BRAVE_API_KEY={{key}} query={{q}} → JSON
    fetch-page.sh          url={{url}} → markdown text
    fetch-github.sh        repo={{repo}} action={{action}} → JSON
    fetch-monday.sh        board={{id}} filter={{status}} → JSON compact
    fetch-weather.sh       city={{city}} → JSON
    fetch-calendar.sh      days={{n}} → events JSON
    fetch-prices.sh        item={{item}} site={{site}} → price + url

  memory/
    search-semantic.sh     query={{q}} limit={{n}} → top results
    save-to-memory.sh      content={{c}} tags={{t}} → saved path
    update-memory.sh       id={{id}} content={{c}} → updated

  actions/
    send-telegram.sh       chat={{id}} msg={{text}} → sent
    send-email.sh          to={{to}} subj={{s}} body={{b}} → sent
    create-event.sh        title={{t}} date={{d}} → event id
    set-reminder.sh        msg={{m}} at={{time}} → cron id

  system/
    fleet-status.sh        → JSON fleet state
    pm2-status.sh          service={{name}} → status
    disk-usage.sh          path={{p}} → usage JSON
    docker-list.sh         → containers JSON
    ollama-list.sh         → available models

  security/
    snapshot.sh            path={{p}} → snapshot id (BEFORE any write)
    rollback.sh            snapshot_id={{id}} → restored
    vault-get.sh           service={{s}} field={{f}} → value (no logs)
    audit-npm.sh           path={{p}} → vulnerabilities JSON
```

---

### N8N COMME COUCHE GLUE (déjà installé chez Kevin)

n8n = orchestrateur visuel parfait pour les mini-modes complexes :
- Workflows visuels → scriptés en JSON (versionnable)
- 400+ intégrations natives (Google, Slack, GitHub, Notion...)
- Exécutable via API REST : `POST /api/v1/workflows/{id}/execute`
- REX peut déclencher les workflows n8n comme des scripts

```typescript
// Dans rex : déclencher un workflow n8n
async function runN8nWorkflow(workflowId: string, context: ModeContext) {
  return fetch(`http://172.17.0.1:5678/api/v1/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_TOKEN },
    body: JSON.stringify({ data: context })
  })
}
```

---

### RÈGLE FINALE — Lancer le LLM comme une lancette

```
1. Mode détecté (regex, 0ms)
2. Context loaders parallèles (scripts, 50-200ms)
3. Template rendu (dynamic inject, 0ms)
4. LLM reçoit: template rempli + champs vides à compléter
   → Input: 50-300 tokens (pas 2000)
   → Output: 20-100 tokens (juste ce qui manque)
5. Scripts formatent la réponse finale
6. User reçoit quelque chose de propre

Total LLM: 70-400 tokens maximum pour 99% des tâches
```

**Quand utiliser le LLM comme une lancette :**
→ Compléter une phrase, un résumé, un titre
→ Choisir entre 3 options claires
→ Reformuler en style humain

**Quand NE PAS utiliser le LLM :**
→ Chercher → script
→ Calculer → script
→ Formater → script
→ Fetch → script
→ Compare → script
