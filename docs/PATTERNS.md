
---

# REX — PATTERNS D'ORCHESTRATION (09/03/2026)

> Chaque intent → une orchestration prévisible.
> Le LLM est la dernière pièce, jamais la première.
> Plus REX a de contexte, plus les patterns sont précis, moins il a besoin de LLM.

---

## PRINCIPE FONDAMENTAL — Dynamic Script Templates

Plutôt que demander au LLM "comment faire X", REX a des templates pré-construits.
Le LLM remplit juste les `{{variables}}`.

```typescript
interface ScriptTemplate {
  id: string
  intent: string
  steps: ScriptStep[]        // orchestration définie à l'avance
  llm_fields?: string[]      // UNIQUEMENT ces champs vont au LLM
  security: SecurityLevel    // SAFE | MEDIUM | HIGH | CRITICAL
  rollback?: ScriptStep[]    // si quelque chose se passe mal
}

// Exemple : LLM ne voit que "{{query}}" et génère "{{summary}}"
// Tout le reste : scripts, fetch, parse, format → 0 LLM
```

---

## NIVEAUX DE SÉCURITÉ

```typescript
type SecurityLevel =
  | 'SAFE'      // read-only, créer un fichier, chercher → pas de confirmation
  | 'MEDIUM'    // modifier un fichier, envoyer un message → log + confirmation légère
  | 'HIGH'      // achat, publication, API write → confirmation explicite + snapshot
  | 'CRITICAL'  // supprimer, déployer en prod, accès vault → double confirmation + audit trail

// La sécurité s'adapte au contexte :
// delete("old_test.md") → MEDIUM
// delete("database.sqlite") → CRITICAL
// REX évalue le contexte, pas juste l'action
```

---

## PATTERN 1 — Recherche dans la mémoire / knowledge

**Intent détecté :** `cherch | trouv | search | quoi | qui | où | quand`
**Security :** SAFE
**LLM calls :** ~0 (sauf reformulation finale)

```
Input: "où en est Maires et Citoyens ?"

STEP 1 — Intent detect (regex 0ms)
  → intent: SEARCH_PROJECT, entity: "maires et citoyens"

STEP 2 — Memory search script
  → sqlite-vec: embed(query) → cosine similarity → top 5 résultats
  → BM25 fallback si vec KO

STEP 3 — Script context assembler
  → Récupère last seen date, statut, fichiers associés
  → Format: { project, status, last_update, open_loops }

STEP 4 — Script project enrichment
  → Si project dans Monday → script fetch monday API → statut tickets
  → Si project dans GitHub → gh pr list / issue list → compact JSON

STEP 5 — if résultat complet → formatter + répondre (0 LLM)
         if résultat insuffisant → REX ROUTER:
           Ollama: "résume ces données: {{compact_json}}" (50 tokens max)

STEP 6 — Répondre
  Output: "M&C : 8 bugs ouverts, PR #3 en attente, dernier commit il y a 2j"

TOKENS LLM : 0 si memory hit / 50 si reformulation nécessaire
```

---

## PATTERN 2 — Coder / Créer un projet avec REX

**Intent détecté :** `crée | projet | app | développe | code | build`
**Security :** SAFE → MEDIUM (selon fichiers modifiés)
**LLM calls :** tiered (Ollama → free → Relay → Opus si mega projet)

```
Input: "je veux créer une app de project management"

STEP 1 — Intent detect → CREATE_PROJECT
  → entity: "project management app"

STEP 2 — Script context discovery (0 LLM)
  → web_search.sh "project management app best practices 2025"
  → fetch context7 / github: frameworks populaires (Linear, Jira alternatives)
  → scraper: top repos github "project management" → README + tech stack
  → Output: { frameworks[], libraries[], boilerplates[], docs_urls[] }

STEP 3 — Script download resources
  → Télécharge boilerplates pertinents
  → Fetch docs prioritaires (React Query, Tanstack, etc.)
  → Stocke dans fleet temp storage

STEP 4 — REX ROUTER → Ollama local (0€)
  → "Voici le contexte: {{compact_context}}. Mini-objectifs pour ce projet?"
  → Output: liste structurée d'objectifs (50-100 tokens)

STEP 5 — Free API provider (si Ollama insuffisant)
  → Groq 70B: "Valide et améliore ces objectifs: {{objectives}}"

STEP 6 — REX RELAY (si projet complexe)
  → Ollama: architecture proposée
  → Groq: validation + tech stack
  → Sonnet: plan détaillé + structure fichiers

STEP 7 — Opus (si MEGA projet, confirmation user)
  → "Orchestre l'équipe d'agents pour implémenter: {{plan}}"
  → Décompose en sous-tâches → délègue Codex / agents spécialisés

STEP 8 — Switch → Claude Sonnet + Codex en monitoring
  → Codex: coding worker
  → Sonnet: review, debug, amélioration, sécurité

STEP 9 — REX HUB
  → Inject skills pertinents: ui-craft, api-design, security-scan
  → MCPs: context7, filesystem, github
  → Scripts: lint, test, build auto
  → Boilerplates: réutiliser ce qui existe

STEP 10 — Local LLM fine-tuné par orchestrateur
  → Si projet similaire déjà fait → local model spécialisé disponible
  → 0 token API pour le même type de tâche la prochaine fois
```

---

## PATTERN 3 — Sauvegarder / Documenter une idée

**Intent détecté :** `save | note | mémorise | documente | enregistre | idée`
**Security :** SAFE
**LLM calls :** ~10 tokens (title generation seulement)

```
Input: "note cette idée : REX IS ALIVE marketing campaign"

STEP 1 — Intent detect → SAVE_IDEA
  → entity: "REX IS ALIVE marketing campaign"

STEP 2 — Script create md (0 LLM)
  → Timestamp + catégorisation automatique (MARKETING, REX, IDEAS)
  → Template pré-rempli: # Title\n## Contexte\n## Détails\n## Actions

STEP 3 — Dynamic context enrichment
  → memory_search("REX marketing") → contexte existant ajouté automatiquement
  → Si URLs dans le message → fetch + résumé ajouté

STEP 4 — Ollama: title + tags (10 tokens max)
  → "Génère 3 tags pour: {{text}}" → ["marketing", "rex", "viral"]

STEP 5 — Script save
  → VPS: memory/ideas/YYYY-MM-DD-{{slug}}.md
  → Index sqlite mis à jour (BM25 + vector)
  → Event journal: { type: "IDEA_SAVED", title, tags, path }

STEP 6 — Répondre
  → "💡 Idée sauvegardée → memory/ideas/2026-03-09-rex-is-alive.md"

TOKENS LLM : ~10 (tags seulement)
```

---

## PATTERN 4 — Acheter quelque chose

**Intent détecté :** `achète | commande | buy | order`
**Security :** HIGH (confirmation explicite + vault check)
**LLM calls :** 0 (scripts + Playwright)

```
Input: "achète du café sur Amazon"

STEP 1 — Intent detect → PURCHASE
  → entity: "café Amazon"
  → Security: HIGH → demander confirmation d'abord

STEP 2 — Memory pattern check (script)
  → "A-t-on déjà acheté café Amazon ?" → memory_search
  → Si oui → récupère: produit exact, prix payé, fréquence
  → Output: { product_url, last_price, last_date, preference }

STEP 3 — Confirmation user
  → "Tu as acheté [produit X] à [prix] le [date]. Même chose ? [Oui/Non/Choisir autre]"
  → Attendre confirmation avant toute action

STEP 4 — Vault check (script bw CLI)
  → bw get item "amazon" → credentials
  → 0 LLM, 0 token

STEP 5 — Playwright fleet (VPS headless ou Mac)
  → Script playwright pré-écrit: amazon_buy.ts({{url}}, {{qty}})
  → Bypass détection bot si nécessaire (fingerprint, delays)
  → Screenshot de confirmation

STEP 6 — if error → REX ROUTER
  → Screenshot → Ollama vision: "que dit l'erreur ?"
  → Script fix ou notify Kevin

STEP 7 — Log + notify
  → "✅ Commandé : [produit] - [prix] - Livraison: [date]"
  → Event journal: PURCHASE_COMPLETED

TOKENS LLM : 0 si script complet / vision si erreur
```

---

## PATTERN 5 — Supprimer quelque chose

**Intent détecté :** `supprime | delete | efface | remove`
**Security :** MEDIUM → CRITICAL (selon contexte)
**LLM calls :** 0

```
Input: "supprime le fichier test.md"

STEP 1 — Intent detect → DELETE
  → entity: "test.md"

STEP 2 — Context evaluation (script)
  → Taille fichier, date création, dernière modification
  → Contenu important ? (keywords: database, prod, backup, key...)
  → Si fichier > 1MB ou keywords critiques → upgrade CRITICAL

STEP 3 — Snapshot (script)
  → cp test.md ~/.rex/trash/{{timestamp}}-test.md (toujours)

STEP 4 — Security check
  → MEDIUM: "Supprimer test.md (12KB, créé hier) ? [Oui/Non]"
  → CRITICAL: "⚠️ Fichier critique détecté. Confirmation + raison ?"

STEP 5 — Execute si confirmé
  → rm test.md
  → Log: DELETE event dans event journal

STEP 6 — Rollback disponible 30 jours
  → "Annuler → rex restore test.md"

TOKENS LLM : 0
```

---

## PATTERN 6 — Surveillance / Status d'un service

**Intent détecté :** `status | état | vérifie | health | tourne | marche`
**Security :** SAFE
**LLM calls :** 0

```
Input: "est-ce que REX tourne sur le VPS ?"

STEP 1 → Script: ssh vps "pm2 status rex"
STEP 2 → Script: parse JSON output → { status, uptime, memory, restarts }
STEP 3 → if status == online → "✅ REX tourne depuis {{uptime}}, {{memory}} RAM"
         if status == stopped → restart auto + notify
         if restarts > 5 → alerte + log pattern

TOKENS LLM : 0
```

---

## PATTERN 7 — Recherche web + résumé

**Intent détecté :** `cherche sur le web | actualité | news | dernières infos`
**Security :** SAFE
**LLM calls :** minimal (résumé seulement)

```
Input: "quoi de neuf sur Claude Code aujourd'hui ?"

STEP 1 → web_search.sh "Claude Code updates {{date}}" → JSON résultats
STEP 2 → Script filter: titre + snippet + url (pas le HTML brut)
STEP 3 → Script dedup + rank par pertinence (BM25 score)
STEP 4 → Ollama: "résume en 3 points: {{compact_results}}" (max 100 tokens input)
STEP 5 → Répondre

TOKENS LLM : ~150 total
```

---

## PATTERN 8 — Coding en arrière-plan (REX Terminal)

**Modes :** `rex terminal` (interactif) | `cc` (Claude Code yolo) | `cx` (Codex yolo)
**Security :** MEDIUM (bypass permissions activé)
**LLM calls :** tiered selon complexité

```
REX tourne TOUJOURS en arrière-plan.
Même si tu codes dans VS Code → REX surveille:
  - Erreurs de build → suggestion auto
  - Pattern bug détecté → solution proposée
  - npm audit → rapport overnight
  - Tests qui cassent → REX FIX en background

Mode YOLO (cc/cx) :
  → bypass confirmations pour les actions non-critiques
  → Snapshot automatique avant chaque changement majeur
  → Rollback disponible si résultat insatisfaisant
```

---

## PATTERN 9 — Fleet dynamic routing

```
Chaque tâche → REX évalue la fleet disponible :

FLEET_STATE = {
  vps: { online: true, cpu: 15%, ram: 40%, models: ["nomic-embed"] },
  mac: { online: true, cpu: 8%, ram: 60%, models: ["qwen2.5:7b", "qwen2.5:1.5b"] },
  pc_rtx: { online: false },  // endormi
  iphone: { online: true, mode: "sensor" }
}

Tâche légère → VPS (toujours dispo)
Tâche LLM locale → Mac (Ollama actif)
Tâche GPU → PC RTX → Wake on LAN si nécessaire
Capteur → iPhone
```

---

## COMPOSANTS PRÉ-CONSTRUITS À AVOIR DANS REX

### Scripts essentiels (0 LLM)
```
scripts/
  web_search.sh         ← Brave API → JSON compact
  fetch_page.sh         ← curl + readability extract
  memory_search.sh      ← sqlite-vec query
  github_fetch.sh       ← gh CLI → résultats
  monday_status.sh      ← Monday API → tickets
  vault_get.sh          ← bw CLI → credentials
  fleet_status.sh       ← ping + pm2 + ollama list
  file_create.sh        ← create MD avec template
  file_snapshot.sh      ← backup avant modification
  playwright_run.sh     ← lancer script playwright
  npm_audit.sh          ← audit + format résultat
```

### Dynamic Script Templates (LLM remplit les {{variables}})
```typescript
const TEMPLATES = {
  web_research: "Fetch: {{urls}}\nContext: {{existing_memory}}\nQuestion: {{query}}",
  code_task: "Stack: {{tech}}\nObjectif: {{goal}}\nFichiers existants: {{file_list}}",
  email_draft: "Destinataire: {{to}}\nContexte: {{context}}\nTon: {{style}}",
  api_call: "Endpoint: {{url}}\nParams: {{params}}\nAuth: [VAULT:{{service}}]",
  purchase: "Produit: {{item}}\nSite: {{site}}\nHistorique: {{past_purchases}}"
}
// LLM reçoit UNIQUEMENT le template rempli → complète les champs manquants
// Pas de "comment faire" → juste "quoi remplir"
```

### Pre-loaded dans REX (dès l'install)
```
MCPs       : github, filesystem, playwright, context7, n8n
CLIs       : gh, gog, bw, rex, claude, codex
Skills     : ui-craft, api-design, security-scan, pr-review, doc-updater
APIs       : Brave search, Groq, Gemini free, OpenAI (vault)
Scrapers   : readability, playwright, curl+jq pipelines
Boilerplates: Next.js, Flutter, Express, FastAPI, CLI Node
Docs cache : React, Flutter, TypeScript, Python, Rust (via context7)
```

### Fleet registry (auto-découverte)
```typescript
interface FleetNode {
  id: string
  hostname: string
  platform: 'linux' | 'darwin' | 'win32'
  models: string[]           // Ollama models disponibles
  gpu?: { vram: number, model: string }
  subscriptions: string[]    // ["claude-max", "groq-free"]
  free_api_credits: Record<string, number>
  capabilities: string[]     // ["playwright", "whisper", "camera", "gps"]
}
// REX auto-découvre et maintient ce registre à jour
// Routing = choisir le meilleur node pour chaque tâche
```

---

## RÈGLE ULTIME — Mâcher le travail pour le LLM

```
1. Scripts collectent → données brutes
2. Scripts filtrent → données pertinentes
3. Scripts formatent → JSON compact
4. Scripts remplissent le template → LLM voit un formulaire à compléter
5. LLM complète → 50 tokens max
6. Scripts formatent la réponse finale → user reçoit le résultat

Si on peut réduire à 0 token → on le fait.
Si on peut convertir en binaire, morse, hash pour réduire → on le fait.
L'objectif : LLM = dernière ligne de traitement, pas la première.
```
