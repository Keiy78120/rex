---

# REX — LLM INTENT INTERCEPTION + TMUX RELAY (10/03/2026)

> Concept clé : REX ne détecte pas seulement les intents de l'USER.
> Il détecte aussi les intents des LLMs qui travaillent.
> Il est le middleware invisible entre tous les intelligences.

---

## Le Concept

```
Avant (classique) :
  User → Claude Code → résultat
  Claude Code n'a accès qu'à ses outils MCP

Avec REX :
  User → Claude Code → REX intercepte l'intent du LLM
                     → script / web search / local LLM
                     → MD résultat injecté dans le workspace
                     → Claude Code continue avec les données
```

REX voit tout (TMUX panes, ActivityWatch, filesystem).
Quand un LLM écrit "I need to find X" ou génère un pattern d'intent détectable,
REX agit **avant** que le LLM soit bloqué.

---

## Architecture TMUX Multi-LLM

```
┌─────────────────┬─────────────────┬─────────────────┐
│   PANE 1        │   PANE 2        │   PANE 3        │
│  Claude Code    │   Codex         │  Ollama local   │
│  (planner)      │   (coder)       │  (reviewer)     │
└────────┬────────┴────────┬────────┴────────┬────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │   REX RELAY │
                    │  (PANE 4)   │
                    │             │
                    │ • Monitor   │
                    │ • Intercept │
                    │ • Execute   │
                    │ • Inject    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  SHARED.md  │
                    │ (workspace  │
                    │  partagé)   │
                    └─────────────┘
```

---

## LLM Intent Interception — Comment ça marche

### 1. REX monitore les panes TMUX

```typescript
// tmux-monitor.ts — polling toutes les 500ms
const paneOutput = await tmux.capturePane(paneId, { lines: 50 })

// Détecter un intent LLM dans l'output
const intent = detectLlmIntent(paneOutput)
if (intent) {
  const result = await executeIntent(intent)
  await injectToSharedWorkspace(result)
  await notifyPane(paneId, `✅ REX a résolu: ${intent.type}`)
}
```

### 2. Intent detection dans l'output LLM

```typescript
const LLM_INTENT_PATTERNS: IntentPattern[] = [
  // Recherche web
  {
    pattern: /I need to (find|search|look up|check)\s+(.+?)(?:\.|$)/im,
    type: 'WEB_SEARCH',
    extract: (m) => m[2]
  },
  // Documentation
  {
    pattern: /I need (docs?|documentation|examples?)\s+(?:for|about|on)\s+(.+?)(?:\.|$)/im,
    type: 'FETCH_DOCS',
    extract: (m) => m[2]
  },
  // Vérification fichier/code
  {
    pattern: /(?:let me|I should|I need to)\s+(?:check|read|look at)\s+(.+?)(?:\.|$)/im,
    type: 'READ_FILE',
    extract: (m) => m[1]
  },
  // Test/Validation
  {
    pattern: /(?:I should|let me)\s+(?:run|test|verify|validate)\s+(.+?)(?:\.|$)/im,
    type: 'RUN_COMMAND',
    extract: (m) => m[1]
  },
  // Demande à un autre LLM
  {
    pattern: /(?:need|want|should)\s+(?:a|an)?\s+(?:second opinion|review|validation)\s+(?:on|about|from)\s+(.+?)(?:\.|$)/im,
    type: 'LLM_RELAY',
    extract: (m) => m[1]
  }
]
```

### 3. Script execution par type d'intent

```typescript
async function executeIntent(intent: LlmIntent): Promise<string> {
  switch (intent.type) {
    case 'WEB_SEARCH':
      return await runScript('fetch/web-search.sh', { query: intent.query })
    case 'FETCH_DOCS':
      // context7 MCP ou fetch direct
      return await fetchDocs(intent.library)
    case 'READ_FILE':
      return await readFileContext(intent.path)
    case 'RUN_COMMAND':
      return await sandboxedRun(intent.command)
    case 'LLM_RELAY':
      // Passer au modèle suivant dans le relay
      return await runRelay(intent.context)
  }
}
```

### 4. Injection dans SHARED.md

```typescript
// Le shared workspace = document partagé entre tous les LLMs
// Chaque LLM peut lire et écrire dans ce fichier
async function injectToSharedWorkspace(data: {
  type: string,
  query: string,
  result: string,
  source: string
}) {
  const entry = `
## [${new Date().toISOString()}] ${data.type} — demandé par ${data.source}
**Query:** ${data.query}
**Résultat:**
${data.result}
---
`
  fs.appendFileSync(SHARED_WORKSPACE_PATH, entry)

  // Notifier toutes les panes qu'une nouvelle ressource est disponible
  await tmux.sendKeys('all-panes', `# REX: nouvelle ressource disponible → SHARED.md\n`)
}
```

---

## Le Workflow Anti-Vibecoding avec REX

```
Phase 1 — PLAN (Claude Code, pane 1)
  → Analyse la tâche
  → "I need to find best practices for X"
  → REX intercepte → web_search.sh → résultat dans SHARED.md
  → Claude Code lit SHARED.md → plan informé

Phase 2 — CODE (Codex, pane 2)
  → Implémente le plan
  → "I need docs for [library]"
  → REX intercepte → context7 MCP → docs dans SHARED.md
  → Codex code avec les vraies docs

Phase 3 — REVIEW (Ollama local, pane 3)
  → Lit le code + SHARED.md (contexte complet)
  → "I should run the tests"
  → REX intercepte → sandbox run tests → résultats dans SHARED.md
  → Ollama review avec les résultats réels

Phase 4 — DEBATE (REX Relay, pane 4)
  → Claude Code et Codex lisent les objections d'Ollama
  → Débattent via SHARED.md (chacun écrit sa section)
  → Confidence score : si accord → merge ; si désaccord → escalade Sonnet

Phase 5 — MERGE (REX)
  → Confidence >= 0.85 sur tous les panes → REX commit automatique
  → Confidence < 0.85 → notify Kevin + résumé du désaccord
```

---

## Implémentation — Fichiers à créer

```
packages/cli/src/
  tmux-monitor.ts          ← polling panes, capture output
  llm-intent-interceptor.ts ← patterns détection, executeIntent
  shared-workspace.ts      ← SHARED.md management, read/write/notify
  pane-relay.ts            ← orchestrer N panes en relay document
  anti-vibecoding.ts       ← workflow complet (plan→code→review→debate→merge)
```

### Interface CLI

```bash
rex relay --tmux           # Lance le relay TMUX multi-pane
rex relay --panes=3        # 3 panes : Claude Code + Codex + Ollama
rex anti-vibe <task>       # Lance le workflow anti-vibecoding complet
rex monitor --panes        # Monitore toutes les panes actives
```

### Flux de données

```
TMUX pane output (text stream)
  → LLM intent detected (pattern match, 0ms)
  → Script executed (50-500ms)
  → SHARED.md updated
  → All panes notified
  → LLM continues with data

Total overhead par intent : 100-600ms
Token cost : 0 (REX exécute, pas les LLMs)
```

---

## Règles du SHARED.md

```markdown
# SHARED WORKSPACE — [session_id]

## Context
- Task: {{task}}
- Started: {{timestamp}}
- Panes: Claude Code (planner) | Codex (coder) | Ollama (reviewer)

## Resources (fetched by REX)
[auto-injecté par REX à chaque intent résolu]

## Contributions
### Claude Code
[plan, décisions, architecture]

### Codex
[implémentation, snippets]

### Ollama
[review, objections, suggestions]

## Consensus
- Status: DEBATING | AGREED | ESCALATED
- Confidence: 0.87
- Decision: [ce qui a été décidé]
```

---

## Pourquoi c'est différent du MCP classique

```
MCP classique :
  LLM → tool call → résultat → LLM continue
  Chaque LLM a ses propres tools
  Pas de partage entre LLMs

REX LLM Interception :
  LLM écrit du texte → REX détecte l'intent dans le texte → script
  Tous les LLMs partagent le même workspace (SHARED.md)
  REX peut cross-injecter : "Codex a besoin de X, Claude Code l'a déjà calculé"
  Invisible pour le LLM (il ne sait pas que REX a agi)
```

REX est le middleware que les LLMs ne voient pas — il les augmente silencieusement.

---

## Cas d'usage concrets

| Intent LLM détecté | Action REX | Résultat |
|-------------------|-----------|---------|
| "I need to find how X works" | web_search.sh | Top 5 résultats → SHARED.md |
| "I need docs for Playwright" | context7 MCP fetch | Docs complètes → SHARED.md |
| "Let me check if this API exists" | curl API endpoint | Response → SHARED.md |
| "I should run the tests first" | sandbox npm test | Résultats → SHARED.md |
| "Need a second opinion on this" | runRelay() | Analyse Ollama → SHARED.md |
| "I need the latest version of X" | npm show X version | Version → SHARED.md |
| "Let me read the error logs" | tail -n 50 logs | Logs → SHARED.md |

**Dans tous les cas : 0 token LLM supplémentaire pour trouver l'info.**
REX exécute, le LLM reçoit directement le résultat dans son workspace.
