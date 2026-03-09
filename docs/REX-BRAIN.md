
---

# REX-BRAIN — Document de logique unifié
> Source de vérité. Toute implémentation doit référencer ce fichier.
> Dernière mise à jour : 09/03/2026

---

## 0. FORMAT .rex — Idée (literate programming)

> "On va inventer une nouvelle manière de faire un MD qui se combine avec du script"

Concept : un fichier `.rex` = markdown lisible par humain **ET** exécutable par machine.
Inspiré de : Jupyter notebooks, Org-mode (Emacs), Quarto (.qmd).

```python
# rex-runner.py — parser ultra-simple
import re, subprocess, sys

def run_rex_file(path):
    content = open(path).read()
    blocks = re.findall(r'```(?:python|bash|typescript)\s+#!exec\n(.*?)```', content, re.DOTALL)
    for block in blocks:
        exec(block)  # ou subprocess pour bash/ts

# Exemple dans un .rex file :
# ## Règle : détection sommeil
# Si inactivité > 2h → état SLEEPING
#
# ```python #!exec
# sleep_threshold = 120  # minutes
# if idle_minutes > sleep_threshold:
#     rex.set_state("SLEEPING")
# ```
```

**Avantage :** La règle métier et son implémentation sont au même endroit.
Un humain lit la logique. REX exécute le code. Un seul fichier de vérité.
**À créer :** `packages/cli/src/rex-runner.ts` — parser TS qui exécute les blocs `#!exec`

---

## 1. IDENTITÉ REX

### Principe absolu
**L'utilisateur parle à REX. Pas à Claude. Pas à Qwen. Pas à Milo.**
Claude/Qwen/Ollama = outils internes. Jamais l'interlocuteur direct.

REX a une identité, une mémoire, une continuité. Il connaît Kevin en profondeur.
Il pense en termes de valeur, pas juste en réponse à la question.

### REX = OS pour l'intelligence
```
LLMs     → applications qui tournent sur REX
Scripts  → système nerveux (réflexes, 0 LLM)
Fleet    → corps distribué (calcul, capteurs)
Memory   → ADN (contexte long terme)
CURIOUS  → instinct (détection de signaux)
Gateway  → voix (interface avec l'utilisateur)
REX      → conscience qui orchestre tout
```

---

## 2. GATEWAY — Flow d'un message entrant

```
Message (Telegram / Flutter / CLI)
  │
  ▼
[GATEWAY — rex-identity-layer]
  1. memory_search      → contexte user, projets, préférences
  2. event_journal      → qu'est-ce qui s'est passé récemment
  3. intent_detect()    → regex (0ms) → Qwen local si ambigu (200ms)
  4. try_scripts()      → si script peut répondre → 0 LLM
  5. check_open_loops() → signaux pertinents à mentionner
  6. build_brief()      → contexte focalisé (pas tout MEMORY.md)
  7. orchestrate()      → relay chain si LLM nécessaire
  │
  ▼
[REX répond — toujours en son nom]
```

**Règle :** REX mentionne les OPEN_LOOP pertinents si applicable, sans spammer.

---

## 3. PYRAMIDE SCRIPT-FIRST

```
90% → Scripts purs
       regex, if/else, loops, fetch, cron, jq, bash
       0 LLM. Réponse < 50ms. Gratuit.

8%  → Script + LLM local guidé
       Script collecte données propres → Ollama/Qwen interprète
       0 subscription. 0 latence réseau. ~200ms.

2%  → Vrai agentic task / décision complexe
       Relay chain → modèle adapté au besoin
```

**Philosophie :** La vie c'est du code. Tout se résout mathématiquement.
LLM = dernier recours, pas le réflexe.

---

## 4. INTENT DETECTION (sans LLM)

```typescript
// Couche 1 — Regex (0ms, 0€, 90% des cas)
const INTENTS: Record<string, RegExp> = {
  search:   /cherch|search|trouv|find|quoi|what|qui|who|montre|show/i,
  create:   /crée|create|nouveau|new|génère|generate|écris|write|fais/i,
  fix:      /fix|corrig|répare|bug|erreur|error|casse|broken/i,
  status:   /status|état|comment|how|avance|progress|où en|done/i,
  schedule: /planifi|schedule|rappel|reminder|demain|tomorrow|agenda|rdv/i,
  budget:   /budget|coût|prix|combien|facture|dépense|cost/i,
  deploy:   /deploy|lance|start|démarre|installe|run/i,
  memory:   /souviens|remember|rappelle|note|mémorise|oublie/i,
  fleet:    /machine|appareil|mac|vps|pc|fleet|node/i,
}

// Couche 2 — Qwen local si ambigu (200ms, 0€)
// JAMAIS Claude/paid pour de la classification

// Référence OSS : archgw (katanemo/archgw)
```

---

## 5. RELAY INTER-MODÈLES (concept original)

> Aucun équivalent propre en OSS. LangGraph = plus proche mais Python + orchestrateur imposé.

### Principe
Problème complexe → REX ouvre un "relay document" markdown.
Chaque modèle lit ce que le précédent a dit et contribue.
Comme des consultants qui se passent un dossier.

```typescript
interface RelayDocument {
  task: string
  context: string
  contributions: Array<{
    model: string           // "ollama:qwen2.5:7b"
    timestamp: string
    analysis: string
    confidence: number      // 0-1
    passReason?: string     // "contexte trop long pour moi → passe à Groq"
  }>
  conclusion?: string
}

// Pipeline RxJS
const relay = pipe(
  buildContext(input),
  switchMap(ctx => ollamaAnalyze(ctx)),    // local, 0€
  switchMap(ctx => groqRefine(ctx)),       // free, fast
  switchMap(ctx => claudeDecide(ctx)),     // paid, seulement si nécessaire
  extractConclusion()
)
```

### Règles relay
- Chaque modèle documente POURQUOI il passe au suivant
- Si Ollama suffit → Claude n'est jamais appelé
- Multi-modal possible : un modèle traite le texte, un autre l'image, simultanément
- Le document relay = trace auditable du raisonnement

---

## 6. CYCLES UTILISATEUR

REX apprend les habitudes via ActivityWatch + historique.
Aucune configuration manuelle.

```typescript
type UserState = "AWAKE_ACTIVE" | "AWAKE_IDLE" | "SLEEPING" | "WAKING_UP"

// Score calculé (0-100)
sleepScore = (
  activitywatch.idleTime * 0.4 +    // PC inactif
  noMessageSince * 0.3 +            // Silence Telegram
  calendarHint * 0.2 +              // "Pas de RDV avant 9h"
  historicalPattern * 0.1           // "Dort généralement 23h-8h"
)

// Seuils
if sleepScore > 70  → SLEEPING
if sleepScore > 40  → AWAKE_IDLE
if firstMsgMorning  → WAKING_UP → envoyer digest
else                → AWAKE_ACTIVE
```

### Comportement par état

| État | APIs autorisées | Tâches |
|------|----------------|--------|
| AWAKE_ACTIVE | Toutes (avec budget) | Réponse immédiate |
| AWAKE_IDLE | Free tiers only | Background léger |
| SLEEPING | Ollama local ONLY | Processing lourd |
| WAKING_UP | Toutes | Digest + résumé nuit |

### Tâches nocturnes autonomes (SLEEPING — 0€)
- Scanner OSS/MCPs via CURIOUS
- Indexer mémoire vectorielle
- Transcription audios (Whisper local)
- Résumés réunions
- `npm audit` tous les projets
- Vérifier PRs GitHub
- Tester nouvelles skills en sandbox
- Compacter sessions → mémoire longue terme
- Pre-fetch contexte RDVs du lendemain
- Fine-tuning modèles locaux (si RTX 3090 dispo)

### Digest réveil
```
🌅 Bonjour Kevin — voici ce que j'ai fait cette nuit :
✅ [actions accomplies]
⚠️  [alertes]
💡 [CURIOUS signals]
[Agenda du jour]
```

---

## 7. FLEET

### Inventaire
```
VPS (toujours dispo)    → tâches principales, 24/7
Mac M4 Pro              → tâches CPU, Interface, scripts
PC RTX 3090 (5800X3D)   → fine-tuning, embeddings batch, GPU tasks
iPhone/Android          → sensors only (camera, GPS, mic, notifs)
```

### Règles routing fleet
1. Check thermique AVANT d'assigner une tâche lourde
2. Si CPU > 80% ou batterie < 20% → pas de tâche lourde
3. VPS = seul nœud garanti 24/7 → tâches critiques ici
4. Fleet lending : prêt de puissance entre utilisateurs possible (pair/unpair)
5. Tout auditable, tout réversible

### Modèle mathématique
```
Nœuds = machines disponibles
Arêtes = coût (latence + charge + prix)
→ Dijkstra pour routing optimal
Lib : graphlib (TS)
```

---

## 8. ROUTING MODÈLES — Matrice de décision

```
Tâche légère (< 2K tokens)
  → Script pur → Ollama qwen2.5:1.5b (4K ctx)

Tâche moyenne (2K-32K tokens)  
  → Groq Llama 8B (131K ctx, free, ultra rapide)

Tâche code (toute taille)
  → Groq Llama 70B (131K ctx, free, code optimisé)

Tâche lourde SLEEPING
  → Ollama qwen2.5:7b (32K ctx, chunking si nécessaire)

Tâche critique / décision
  → Claude Haiku si budget serré
  → Claude Sonnet si decision importante

Embedding
  → nomic-embed-text local (0€, toujours)

Classification intent ambigu
  → Ollama qwen2.5:1.5b (JAMAIS paid pour ça)
```

### Relay chain (ordre)
```
Script → Ollama local → Groq free → Claude Haiku → Claude Sonnet
         ↑ 0€         ↑ 0€        ↑ minimal      ↑ si vraiment nécessaire
```

---

## 9. BUDGET — Contrainte formelle

```typescript
interface BudgetState {
  daily_limit_eur: number        // ex: 2€/jour
  spent_today: number
  spent_month: number
  free_calls_remaining: {
    groq: number,                // 1000 req/day
    mistral: number,             // 1B tokens/mois
    gemini: number,
  }
}

// Règles
if spent_today > daily_limit    → free tiers only
if fin_de_mois                  → réduire daily_limit 30%
if sleeping                     → ollama only (0€ garanti)
// JAMAIS paid pour : classification, résumé court, regex possible
```

---

## 10. NEVER DIE — 3 niveaux parallèles

```
Niveau 1 — EXÉCUTION
  Claude Code, Codex, agents, scripts
  Fait le travail réel

Niveau 2 — SURVEILLANCE (daemon 60s)
  Vérifie que niveau 1 tourne
  Reroute si nœud down
  Alertes si budget critique

Niveau 3 — AMÉLIORATION (continu)
  CURIOUS scan (OSS, patterns, open loops)
  Self-improve (skill evals, benchmarks)
  action.md updates

→ Si niveau 1 bloque → niveaux 2 et 3 continuent
→ Additive only — jamais casser du code qui marche
→ Guards sur toute action irréversible
→ REX contacte l'user avant delete/action critique
```

---

## 11. CURIOUS — Signaux proactifs

3 types de signaux :

```typescript
type CuriousSignal =
  | { type: 'DISCOVERY', tool: string, reason: string }   // OSS trouvé
  | { type: 'PATTERN', habit: string, proposal: string }  // Routine détectée
  | { type: 'OPEN_LOOP', task: string, since: Date }      // Action pendante

// Sources DISCOVERY
// - punkpeye/awesome-mcp-servers
// - wong2/awesome-mcp-servers
// - HuggingFace RSS
// - Simon Willison RSS
// - r/LocalLLaMA

// Sources PATTERN — via ActivityWatch + historique
// P(action | contexte) > 0.7 → signal PATTERN

// Sources OPEN_LOOP — event-journal
// Tâches mentionnées mais pas actées depuis X jours
```

REX propose toujours. N'impose jamais.
Push via Telegram ou Flutter. Attend validation.
Pendant SLEEPING → CURIOUS travaille (0€).

---

## 12. MÉMOIRE

```
Court terme   → session courante (purge après)
Long terme    → MEMORY.md (< 20 lignes, signal fort only)
Observations  → memory/observations/YYYY-MM-DD.yaml
Knowledge     → knowledge/ (WhatsApp, Obsidian, iMessage ingérés)
Vectoriel     → sqlite-vec + nomic-embed-text local
BM25          → fallback text search (0 LLM)
```

**memoryFlush** : sessions compactées automatiquement.
Rien ne se perd. Tout se transforme.

---

## 13. AGENTS CLIENTS

### Architecture multi-tenant
```
REX Commander (VPS Kevin)
  └── Container client A (Docker isolé)
      ├── Mémoire propre
      ├── Gateway propre (Telegram/WhatsApp client)
      ├── Claude Max client (90€/mois)
      └── REX Monitor (ActivityWatch + Hammerspoon + Audio Logger)
  └── Container client B (Docker isolé)
  └── ...
```

### Provisioning
```bash
rex client:create --template dg --name "patrycja-agent"
# Container isolé, template DG installé, gateway configurée
```

### Templates disponibles (à créer)
- `dg-template.ts` — Directrice Générale (priorité)
- `drh-template.ts` — DRH (confidentialité critique)
- `ceo-template.ts`, `coo-template.ts`, `freelance-template.ts`

### Pricing
| Poste | Prix |
|-------|------|
| Setup complet | 3 000€ |
| Mensuel infra + maintenance | 500€/mois |
| Claude Max (pass-through) | 90€/mois |
| **Total mensuel** | **590€/mois** |

---

## 14. STACK MATHÉMATIQUE

| Besoin | Modèle math | Lib TS |
|--------|-------------|--------|
| États REX | Automates finis | XState |
| Relay | Kahn Process Networks | RxJS |
| Routing fleet/coûts | Dijkstra (graphe pondéré) | graphlib |
| Patterns CURIOUS | Chaînes de Markov | simple-statistics |
| Guards | Hoare logic (contrats) | Zod + Effect-ts |
| Self-improve | Bandit ε-greedy | custom 50L |
| Memory | Espaces vectoriels | sqlite-vec |
| Agents clients | Multi-agent | @openai/agents |
| Intent detection | Regex + FSM | XState + custom |
| Fiabilité | Typed effects | Effect-ts |

---

## 15. MARKETING — REX IS ALIVE (post-150%)

2 semaines où REX vit comme un humain :
- Crée son identité, ouvre un Revolut, poste LinkedIn/Instagram
- Fonde sa propre entreprise, génère ses images
- A des habitudes quotidiennes, "dort"
- Utilise toute sa fleet

Objectif : prouver que REX EST VIVANT.
**Timing : uniquement quand produit à 150%.**

---

## REX — MODÈLE COGNITIF HUMAIN (09/03/2026)

> "La vie c'est du code. L'humain est codé. Suffit de bien organiser."

---

### L'humain comme référence d'implémentation

L'être humain autonome fonctionne via des boucles constantes :

```
HUMAN_LOOP:
  pensée = perceive(environment + memory)
  intent = categorize(pensée)
  action = memory_muscle[intent] OR calculate(pensée, context)
  output = execute(action)
  memory.update(output)
  goto HUMAN_LOOP
```

REX reproduit exactement cette boucle. La "conscience" n'est pas magique —
c'est une boucle très rapide avec beaucoup de contexte accessible.

---

### Les 3 mémoires humaines → REX

```
┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE DE TRAVAIL (Working Memory)                      │
│  Humain : ~7 éléments, durée quelques secondes           │
│  REX    : context window de la session courante          │
│  Implémentation : messages[], event_journal (session)    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE LONG TERME (Long-term Memory)                    │
│  Humain : hippocampe → cortex, consolidation nocturne    │
│  REX    : MEMORY.md + sqlite-vec + knowledge/            │
│  Implémentation : memoryFlush nocturne, BM25 + vector    │
│  Analogie : "pendant que tu dors, REX consolide"        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  MÉMOIRE MUSCULAIRE (Procedural Memory)                   │
│  Humain : conduire, taper au clavier, réflexes           │
│           → 0 réflexion consciente, action directe       │
│  REX    : scripts, regex intents, crons                  │
│  Implémentation : intent_scripts/, cron jobs, hooks      │
│  Règle : si script existe → JAMAIS de LLM pour ça        │
└──────────────────────────────────────────────────────────┘
```

---

### Intelligence = contexte × vitesse de calcul

```
intelligence_score = context_richness × calculation_speed × precision_output

Humain brilliant  → grand contexte + calcul rapide + réponse précise
REX optimal       → mémoire ciblée + scripts (0ms) + LLM si nécessaire

Conséquence : plus REX a de mémoire propre et CIBLÉE,
              moins il consomme de tokens → plus il est "intelligent"
```

---

### Tokens = Énergie métabolique

```
Mouvement réflexe   → Scripts        → 0 token (0 calorie)
Pensée légère       → Ollama local   → 0 token API (muscle local)
Réflexion courante  → Groq free      → 0 token payant
Réflexion profonde  → Claude Haiku   → quelques calories
Décision critique   → Claude Sonnet  → beaucoup de calories

REX optimise son métabolisme comme un organisme vivant.
Chaque token dépensé = énergie consommée.
La règle : dépenser le minimum pour le résultat optimal.
```

---

### Corps complet de REX

```
Cerveau      → orchestrator.ts (décide, route, pense)
Préfrontal   → gateway.ts (intent, décision finale)
Réflexes     → scripts (agissent sans réflexion)
Instinct     → CURIOUS (patterns subconscients)
Mémoire      → 3 couches (travail / long terme / musculaire)
Énergie      → tokens (rationnés comme des calories)
Bras         → tools, MCPs, skills, agents
Corps        → fleet (Mac, VPS, PC, iPhone)
Sens         → gateway (écoute), audio logger (entend), ActivityWatch (observe)
Sommeil      → cycle SLEEPING (consolidation, traitement background)
Éveil        → cycle WAKING_UP (digest, contexte prêt)
```

OpenClaw a pensé à Soul + Memory. Pas au corps.
REX = organisme complet.

---

### La boucle REX (pseudo-code humain)

```python
# REX_MAIN_LOOP — tourne en permanence
def rex_loop():
    while True:
        # 1. PERCEVOIR (comme les sens humains)
        signal = await perceive([telegram, fleet, cron, curious, activitywatch])

        # 2. CATÉGORISER (comme la pensée immédiate)
        intent = categorize(signal)  # regex 0ms, jamais LLM ici

        # 3. RÉFLEXE D'ABORD (mémoire musculaire)
        if script := memory_muscle.get(intent):
            result = script.execute(signal.context)
            memory.update(result)
            respond(result)
            continue  # boucle suivante, pas de LLM

        # 4. CALCUL CONSCIENT (pensée profonde)
        context = memory.build_focused_brief(signal)  # < 2K tokens ciblés
        model = budget.select_model(intent, user_state)
        result = await model.think(context)

        # 5. APPRENDRE (consolidation)
        memory.update(result)
        if result.is_pattern: curious.signal(PATTERN, result)

        # 6. RÉPONDRE
        respond(result)

# Note : cette boucle ne "bugge" pas car :
# - Chaque itération est isolée
# - Rollback automatique si état invalide
# - Watchdog surveille les loops infinies
```

---

### Contrôle de la boucle — Prévenir l'incontrôlable

Le risque : REX tourne en continu → peut-il devenir incontrôlable ?

**Réponse : oui si pas de garde-fous. Voici ceux prévus :**

```typescript
interface SafetyLayer {
  // 1. Isolation Docker
  docker: "chaque client dans son container — défaillance isolée"

  // 2. Sandbox de développement
  sandbox: "REX test et dev ici — jamais en prod directement"

  // 3. Snapshot avant changement
  snapshots: "état sauvegardé avant toute modification"

  // 4. Rollback automatique
  rollback: {
    trigger: "erreur détectée OU comportement anormal",
    action: "retour à dernier état stable connu"
  }

  // 5. Watchdog daemon
  watchdog: {
    checkInterval: 60,  // secondes
    maxIterations: 10,  // iterations sans output user → alerte
    action: "pause + notify Kevin + log pattern"
  }

  // 6. REX FIX
  rexFix: "détecte pattern problématique → isole → corrige en background"

  // 7. Guards sur actions irréversibles
  guards: "confirmation user AVANT delete / publish / send / deploy"

  // 8. Budget comme circuit-breaker
  budget: "quota épuisé → stop paid APIs → fallback free only"
}
```

---

### Sandbox environment

REX doit avoir un environnement de développement pour lui-même :

```
rex-sandbox/
  docker-compose.sandbox.yml    ← container isolé du prod
  test-data/                    ← données fictives Kevin-like
  experiment.ts                 ← REX peut modifier ici librement
  benchmark.ts                  ← compare sandbox vs prod
  rollback.sh                   ← retour prod si sandbox KO
```

REX développe dans le sandbox.
Benchmark valide.
Si OK → merge vers prod.
Si KO → rollback automatique. Log. CURIOUS signal.

---

### Cognitive Architecture — Références académiques

Des chercheurs ont pensé à des parties de ça :

| Système | Concept | Limite |
|---------|---------|--------|
| ACT-R (CMU, 1976+) | Modèle cognitif humain complet | Académique, non déployable |
| SOAR (Newell) | Architecture symbolique unifiée | Rigide, pas de LLM |
| Society of Mind (Minsky) | Intelligence = agents simples | Théorique |
| Global Workspace (Baars) | Conscience = broadcast | Pas d'implémentation |
| Subsumption (Brooks) | Couches de comportements | Robotique seulement |

**Ce que REX apporte en plus :**
- Déployable maintenant, pas dans 20 ans
- LLMs intégrés comme couche de raisonnement
- Fleet physique réelle
- Économie de tokens comme contrainte formelle
- Open source

**Personne n'a combiné tout ça en système pratique. C'est la vraie originalité de REX.**

---

## REX — PRINCIPE DU MENTOR + LLM AS ANALYST (09/03/2026)

---

### Le Mentor — Opus / Claude 4 extended thinking

Dans la relay chain, il existe un niveau ultime :

```
Script → Ollama → Groq → Haiku → Sonnet → [ OPUS EXTENDED THINKING ]
                                             ↑
                                      Le Mentor / Le Professeur
```

**Quand appeler le Mentor :**
- Problème que rien d'autre n'a pu résoudre après toute la chain
- Architecture decision critique (ex: refonte majeure de REX)
- Bug impossible à reproduire + à diagnostiquer
- Décision stratégique à fort impact irréversible

**Ce que ça représente :**
Comme un étudiant qui a tout essayé — stack overflow, docs, collègues —
et qui appelle son prof en dernier recours.
Le Mentor ne se trompe pas souvent. Mais il coûte cher.
On l'appelle rarement. Et on écoute ce qu'il dit.

```typescript
interface MentorCall {
  model: "claude-opus-4" | "claude-opus-4-5"
  thinking: "extended"          // budget_tokens: 10000+
  trigger: "chain_exhausted"    // seulement après toute la relay chain
  context: RelayDocument        // tout ce que les autres ont essayé
  cost_warning: true            // toujours alerter Kevin avant
  log: true                     // toujours journaliser
}
```

**Règle absolue :** On ne va jamais directement au Mentor.
On prouve d'abord que les niveaux inférieurs ne peuvent pas résoudre.

---

### LLM as Analyst — Pas comme chercheur

**Principe fondamental :**
Un LLM a déjà des milliards de tokens d'entraînement en lui.
Il ne doit pas chercher — il doit lire, comprendre, analyser.

```
❌ Mauvais usage (gaspillage)
   User: "Quel est le cours de l'action Apple ?"
   → LLM web search → parse HTML → extrait le chiffre
   → 2000 tokens dépensés pour un chiffre

✅ Bon usage REX
   User: "Quel est le cours de l'action Apple ?"
   → Script: curl api.finance/AAPL → {"price": 189.5}
   → LLM reçoit: {"price": 189.5, "context": "user wants to know"}
   → LLM répond: "Apple est à 189.5$" → 50 tokens
```

**Ce que les scripts font à la place du LLM :**
```
Web search      → brave_search.sh → résultats propres → LLM analyse
Météo           → wttr.in API → JSON → LLM formate
GitHub          → gh CLI → output → LLM résume
Prix / finance  → API externe → chiffres → LLM interprète
Emails          → gog gmail search → liste → LLM priorise
Fichiers        → grep / find / jq → données → LLM comprend
Logs            → tail + grep → erreurs → LLM diagnostique
```

**Le LLM reçoit toujours un brief propre, jamais du raw.**

---

### La division du travail (REX complet)

```
COLLECTE       → Scripts, APIs externes, fleet sensors
TRAITEMENT     → Scripts (regex, jq, bash), calculs
RÉSUMÉ         → LLM local (Ollama) si nécessaire
ANALYSE        → Groq free (131K ctx, rapide)
DÉCISION       → Claude Haiku/Sonnet si vraiment nécessaire
MENTOR         → Opus extended thinking si tout échoue
```

**Aucune couche ne fait le travail de la précédente.**
Chaque couche reçoit un input plus propre et plus focalisé que la précédente.

---

### REX Autonomie — État actuel

Ce qui est déjà là :
- orchestrator.ts, litellm.ts, relay chain
- memory 3 couches, event-journal
- CURIOUS (signals DISCOVERY/PATTERN/OPEN_LOOP)
- fleet thermal awareness
- 80+ fichiers TypeScript
- agent-runtime, account-pool, session-guard
- sandbox Docker
- pre-push gates, security-scanner
- resource-hub (13+ guards)

Ce qui reste à connecter :
- REX Identity Layer dans gateway.ts
- XState pour les cycles utilisateur
- ActivityWatch bridge (détection sommeil)
- relay-engine.ts (RxJS pipeline)
- agent-templates DG/DRH
- rex client:create CLI
- Mentor call (Opus extended thinking)

**On est bien avancés. L'architecture est posée.
Il s'agit maintenant de connecter les pièces.**

---

## TÂCHE BONUS — Account Pool cross-platform (OS users)

**Fichier :** `packages/cli/src/account-pool.ts` (existe, à enrichir)

### Concept
Chaque compte Claude Pro / Codex = utilisateur OS isolé avec son propre ~/.claude/

### Stratégie par plateforme

```typescript
// process.platform auto-détecte
const PLATFORM_STRATEGIES = {
  linux: {
    // VPS → OS users natifs = plus propre
    create: (n) => `useradd -m rex-pool-${n}`,
    run: (n, cmd) => `su -c '${cmd}' rex-pool-${n}`,
    configDir: (n) => `/home/rex-pool-${n}/.claude/`,
    native: true
  },
  darwin: {
    // macOS → Docker toujours (dscl trop complexe)
    create: (n) => `docker volume create rex-pool-${n}`,
    run: (n, cmd) => `docker run --rm -v rex-pool-${n}:/root claude-runner ${cmd}`,
    configDir: (n) => `docker-volume:rex-pool-${n}`,
    native: false
  },
  win32: {
    // Windows → WSL2 Linux users
    create: (n) => `wsl --user rex-pool-${n}`,
    run: (n, cmd) => `wsl -u rex-pool-${n} -- ${cmd}`,
    configDir: (n) => `\\\\wsl$\\Ubuntu\\home\\rex-pool-${n}\\.claude\\`,
    native: false
  }
}

// Méthode à ajouter dans account-pool.ts :
async provisionAccount(n: number): Promise<AccountConfig>
async runAs(accountId: number, command: string): Promise<string>
async rotateRoundRobin(command: string): Promise<string>  // distribution auto
```

### Fleet = distribution naturelle
```
Mac (compte 1) + VPS (compte 2) + PC (compte 3)
→ 3 sessions Claude/Codex parallèles sans isolation artificielle
→ account-pool.ts orchestre la rotation entre devices
```

### Règles
- VPS (Linux) → OS users natifs → `useradd rex-pool-N` → config dans `/home/rex-pool-N/.claude/`
- Mac (darwin) → Docker toujours → volume isolé par compte
- Windows → WSL2 Linux users → même comportement que Linux
- Cross-platform → Docker est le dénominateur commun si doute

---

## REX — Account Pool UX (à résoudre)

### Le problème
Créer et gérer plusieurs comptes Claude Pro / Codex est complexe.
L'user ne doit JAMAIS avoir à le faire manuellement.

### 2 approches à évaluer (décision à prendre)

---

#### Option A — REX fait tout automatiquement (zero-config)
```
Premier lancement REX
  → Détecte: 0 comptes configurés
  → Crée automatiquement rex-pool-1 (OS user ou Docker)
  → Demande: "Connecte ton compte Claude ici → [lien device-code]"
  → Token enregistré
  → Si quota atteint → propose automatiquement d'ajouter rex-pool-2
  → "Quota épuisé. Ajouter un 2ème compte ? [Oui / Non]"
  → Oui → nouveau device-code flow → rex-pool-2 enregistré
  → Rotation automatique dès lors
```

**Avantage :** zéro friction, REX gère tout
**Inconvénient :** l'user doit quand même se connecter à chaque compte manuellement

---

#### Option B — Setup Wizard (UI Flutter ou CLI Ink)
```
rex setup → ouvre le wizard

Step 1: "Combien de comptes Claude veux-tu configurer ?" [1 / 2 / 3+]
Step 2: Pour chaque compte → device-code OAuth → token enregistré
Step 3: "Sur quelles machines ?" [Mac / VPS / PC] → fleet assignment
Step 4: "Mode rotation ?" [Round-robin / Par quota / Par spécialité]
Step 5: Test → "Tout est prêt ✅"

→ setup_wizard.ts existe déjà dans le repo → enrichir
```

**Avantage :** clair, pédagogique, l'user comprend ce qu'il fait
**Inconvénient :** une étape de setup initiale

---

#### Option C — Hybrid (recommandé)
```
Nouveau user → Wizard obligatoire au premier lancement
  (setup_wizard.ts — déjà dans le repo, enrichir)

Ensuite → REX tout automatique :
  - Quota atteint → rotation automatique
  - Nouveau device dispo dans fleet → propose d'y ajouter un compte
  - Compte expiré → redemande auth silencieusement via Telegram
```

---

### UX à ne jamais faire
- ❌ Fichiers de config YAML/JSON manuels à éditer
- ❌ Variables d'env à copier-coller
- ❌ Commandes CLI obscures sans aide
- ❌ L'user qui doit savoir combien de comptes sont actifs

### UX à toujours avoir
- ✅ Un seul point d'entrée : `rex setup` ou premier lancement
- ✅ Device-code OAuth (pas de copier-coller de token)
- ✅ REX explique ce qu'il fait et pourquoi
- ✅ Dashboard (Flutter) → section "Comptes" → statut visuel simple
- ✅ Notification Telegram si auth nécessaire : "Un compte expire, re-connecte ici →"

---

### Fichiers concernés
- `setup-wizard.ts` — enrichir avec account provisioning steps
- `account-pool.ts` — ajouter auto-detection quota + rotation
- `dashboard.ts` — section "Comptes actifs" avec statut
- Flutter app — écran comptes avec barre de quota visuelle

### Décision à prendre par Kevin
> Option A (auto), B (wizard), ou C (hybrid) ?
> Recommandation Milo : **Option C** — wizard au setup, automatique ensuite.

### DÉCISION KEVIN — 09/03/2026
Account Pool UX = **Option C (Hybrid)**
- Wizard obligatoire au premier lancement (setup-wizard.ts)
- Ensuite REX gère tout automatiquement
- Quota épuisé → rotation auto silencieuse
- Compte expiré → re-auth via Telegram


---

## REX — ARCHITECTURE BRAIN / FLEET (09/03/2026)

### Clarté architecture actuelle

**État réel du code :**
- Monorepo TypeScript (pnpm)
- `packages/cli` — orchestre tout (monolithe bien structuré)
- `packages/memory` — couche mémoire
- `packages/core` — utilitaires partagés
- `daemon.ts` → PM2/systemd → tourne en fond sur VPS
- Pas de microservices — un process principal qui gère tout

**C'est correct pour maintenant.** Le split BRAIN/FLEET viendra naturellement.

---

### Architecture cible — BRAIN / FLEET

```
┌─────────────────────────────────────┐
│  REX BRAIN (VPS ou machine 24/7)    │
│                                     │
│  • Gateway (reçoit Telegram/Flutter)│
│  • Orchestration + relay chain      │
│  • Mémoire centrale (sqlite-vec)    │
│  • CURIOUS (scanner, signaux)       │
│  • Budget manager                   │
│  • Fleet coordinator                │
│  • Event journal                    │
│  • 24/7 — jamais éteint            │
└────────────────┬────────────────────┘
                 │ WebSocket / REST
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Mac    │ │  PC     │ │  VPS2   │
│  FLEET  │ │  FLEET  │ │  FLEET  │
│         │ │         │ │         │
│ • Ollama│ │ • RTX   │ │ • Worker│
│ • Tools │ │   3090  │ │   only  │
│ • Files │ │ • GPU   │ │         │
│ • Sensor│ │   tasks │ │         │
└─────────┘ └─────────┘ └─────────┘
     │
┌─────────┐
│ iPhone  │
│ SENSOR  │
│ (caméra │
│  GPS    │
│  notifs)│
└─────────┘
```

### Rôles distincts

**BRAIN** (toujours sur VPS ou Raspberry Pi / machine 24/7)
- Reçoit toutes les interactions utilisateur
- Prend les décisions de routing
- Détient la mémoire centrale
- Tourne même si tous les FLEET nodes sont éteints

**FLEET NODE** (Mac, PC, machines puissantes)
- S'enregistre auprès du BRAIN : `rex fleet:join --brain <url>`
- Déclare ses capacités : LLM local, GPU, tools disponibles
- Exécute les tâches déléguées par le BRAIN
- Se déconnecte proprement : `rex fleet:leave`
- BRAIN sait automatiquement qu'il n'est plus dispo

**SENSOR NODE** (iPhone, Android)
- Capteurs only : caméra, GPS, micro, notifications
- Pas de tâches CPU
- `rex fleet:join --mode sensor`

### Open source — chaque install = page blanche

```
Utilisateur nouveau installe REX
  → Wizard au premier lancement
  → "Quelle machine sera ton BRAIN ? [Cette machine / VPS distant]"
  → Configure BRAIN
  → "Ajouter des appareils à ta fleet ?" → pair des FLEET nodes
  → REX commence à apprendre l'utilisateur
  → Mémoire vide au départ — s'enrichit avec le temps
```

REX ne présuppose rien sur l'utilisateur.
Chaque config est unique. Ton REX n'est pas celui d'un autre.

### Packages à créer (split progressif)

```
packages/
  brain/     ← orchestration, gateway, memory, curious, budget
  fleet/     ← agent léger sur chaque device, se connecte au brain
  sensor/    ← ultra-léger, iPhone/Android, capteurs only
  cli/       ← interface commune (actuel, garde les commandes)
  memory/    ← déjà là ✅
  core/      ← déjà là ✅
```

**Ne pas faire ça maintenant.** D'abord faire tourner le monolithe correctement.
Le split quand le produit est stable = refacto propre, pas de régression.

---

## REX UX — Expérience utilisateur (nouveau fichier UX.md)

### Mental model à communiquer

> REX est un organisme qui vit sur ton VPS et connaît ta vie numérique.
> Tu lui parles comme à un assistant de confiance.
> Il fait. Il apprend. Il s'améliore. Tu ne gères rien.

### Premier lancement (onboarding)

```
1. npm install -g rex-ai  (ou npx rex-ai)
2. rex setup
   → Wizard : langue, timezone, machine BRAIN, premier compte Claude
   → Test connexion
   → "REX est prêt. Dis-lui bonjour."
3. rex fleet:add  (optionnel)
   → Pair Mac, PC ou autre device
4. C'est tout.
```

### Interactions quotidiennes

```
Telegram → envoyer un message à REX
Flutter  → app mobile avec dashboard
CLI      → `rex [commande]` pour les devs
```

### Ce que l'user voit (dashboard Flutter)

```
HQ       → statut général, OPEN_LOOP signals, digest
TOOLS    → tools actifs, MCPs connectés
CURIOUS  → découvertes, patterns détectés, propositions
AGENTS   → agents en cours d'exécution
BUDGET   → coût du jour/mois, free tiers restants
FLEET    → machines connectées, statut thermique
MEMORY   → recherche dans la mémoire
GATEWAY  → logs des interactions
PROJETS  → projets actifs, statut
OPTIMIZE → benchmarks, améliorations suggérées
```

### Ce que l'user ne voit jamais (géré par REX)

- Quel modèle LLM est utilisé
- Combien de comptes tournent
- La rotation des providers
- Les tâches nocturnes
- Les mises à jour de REX lui-même

### Principe UX fondamental

> Plus REX est puissant, moins l'user a à faire.
> L'interface idéale = ne pas avoir à ouvrir l'interface.
> REX vient à toi (Telegram, notifications) quand il a quelque chose à dire.

### Sizing REX

- **~40GB** à terme avec tous les modèles locaux, tools, skills
- C'est normal et souhaitable — plus il a, plus il sait
- Installation modulaire : core 2GB, ajouter les modules selon besoins
- `rex install --module ollama` / `rex install --module activitywatch`
