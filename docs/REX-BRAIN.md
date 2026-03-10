
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

---

## REX — MINI-MODELS (09/03/2026)

> Concept : un petit modèle local entraîné / prompté pour UNE seule tâche.
> Ultra cheap, ultra rapide, ultra précis sur son domaine.
> Combinés avec les mini-modes → 0 token API pour 95% des tâches.

---

### Principe

```
Modèle général (Claude Sonnet) = généraliste → coûteux, lent, over-qualified
Mini-model (Qwen 1.5B fine-tuné) = spécialiste → 0.8GB RAM, <100ms, parfait pour 1 tâche

Analogie : tu n'appelles pas un chirurgien pour mesurer ta tension.
L'infirmière (mini-model) fait ça parfaitement en 10 secondes.
```

---

### Catalogue de mini-models REX

| Mini-model | Tâche unique | Base model | RAM | Latence |
|-----------|-------------|-----------|-----|---------|
| `rex-intent` | Classifier l'intent (SEARCH/CREATE/FIX...) | Qwen 1.5B | 0.8GB | 20ms |
| `rex-tagger` | Générer 3-5 tags depuis un texte | Qwen 1.5B | 0.8GB | 30ms |
| `rex-summarizer` | Résumer un texte en 2-3 phrases | Qwen 1.5B | 0.8GB | 50ms |
| `rex-formatter` | Formater JSON en réponse lisible | Qwen 1.5B | 0.8GB | 20ms |
| `rex-sentiment` | Détecter urgence / ton d'un message | Qwen 1.5B | 0.8GB | 15ms |
| `rex-extractor` | Extraire entités (noms, dates, URLs) | Qwen 1.5B | 0.8GB | 25ms |
| `rex-code-title` | Générer un titre de commit/PR | Qwen 1.5B | 0.8GB | 20ms |
| `rex-email-tone` | Ajuster le ton d'un email | Qwen 3B | 1.5GB | 60ms |
| `rex-security` | Détecter si action est risquée | Qwen 1.5B | 0.8GB | 20ms |

**Total pour tous les mini-models : ~6GB RAM max (jamais tous en même temps)**

---

### Implémentation dans Ollama

```bash
# Créer un mini-model Ollama = Modelfile avec system prompt ultra ciblé

# Exemple : rex-intent
cat > Modelfile.intent << 'EOF'
FROM qwen2.5:1.5b
SYSTEM """
Tu es un classificateur d'intent. Tu réponds UNIQUEMENT avec un JSON.
Intents possibles: SEARCH | CREATE | FIX | STATUS | SCHEDULE | BUDGET | DEPLOY | SAVE | DELETE | FLEET
Format: {"intent": "SEARCH", "confidence": 0.95, "entity": "maires et citoyens"}
Rien d'autre. Pas d'explication. Juste le JSON.
"""
PARAMETER temperature 0.1
PARAMETER num_predict 50
EOF
ollama create rex-intent -f Modelfile.intent

# Exemple : rex-tagger
cat > Modelfile.tagger << 'EOF'
FROM qwen2.5:1.5b
SYSTEM """
Tu génères des tags. Réponds UNIQUEMENT avec un tableau JSON de 3-5 tags courts.
Format: ["tag1", "tag2", "tag3"]
Rien d'autre.
"""
PARAMETER temperature 0.1
PARAMETER num_predict 30
EOF
ollama create rex-tagger -f Modelfile.tagger
```

---

### Usage dans REX

```typescript
// Au lieu d'appeler Claude pour classifier l'intent :
// ❌ Avant : intent = await claude.complete("Quel est l'intent de: " + message)
// ✅ Après :
const intent = await ollama.chat({
  model: 'rex-intent',
  messages: [{ role: 'user', content: message }]
})
// → {"intent": "SEARCH", "confidence": 0.95, "entity": "maires et citoyens"}
// → 20ms, 0€, 0 token API

// Idem pour tagger une idée sauvegardée :
const tags = await ollama.chat({ model: 'rex-tagger', messages: [{ role: 'user', content: idea }] })
// → ["rex", "marketing", "viral"] en 30ms
```

---

### Fine-tuning futur (quand REX accumule assez de data)

```
Après 1000+ interactions :
  → Exporter les paires (message → intent) validées
  → Fine-tuner rex-intent sur ces données réelles de Kevin
  → Précision 95% → 99%
  → Modèle personnalisé qui connaît le vocabulaire de Kevin

Outils :
  - Ollama custom models (déjà supporté)
  - Unsloth (fine-tuning rapide, open source)
  - LLaMA-Factory (multi-backend fine-tuning)
  - Dataset : event_journal → pairs (input, intent)
```

---

### Mini-models + Mini-modes = stack complète

```
Message entrant
  → rex-intent (mini-model, 20ms) → intent: SEARCH_PROJECT
  → search-project.mode (mini-mode) → charge contexte
  → rex-summarizer (mini-model, 50ms) → résume le résultat
  → Réponse

Total : 70ms, 0 token API, 0€
```

---

## SOURCES REPOS — Audit à faire (TODO)

> Ces repos contiennent des scripts/tools utiles à intégrer dans REX.
> À auditer : utile, inutile, doublon avec ce qu'on a déjà.

### Priorité HAUTE (fort signal, à intégrer)

| Repo | URL | Pourquoi utile | Doublon ? |
|------|-----|---------------|-----------|
| Amazing-Python-Scripts | github.com/avinashkranjan/Amazing-Python-Scripts | 800+ scripts automatisation | Partiellement |
| awesome-web-scraping | github.com/lorien/awesome-web-scraping | Stack scraping complète | Non |
| autoscraper | github.com/alirezamika/autoscraper | Scraper auto-apprenant | Non |
| awesome-selfhosted | github.com/awesome-selfhosted/awesome-selfhosted | Bible apps self-host | Non |
| awesome-web-agents | github.com/steel-dev/awesome-web-agents | Browser AI agents | Partiellement (playwright) |

### Priorité MOYENNE

| Repo | URL | Pourquoi utile |
|------|-----|---------------|
| Huginn | github.com/huginn/huginn | IFTTT self-hosted, agents événements |
| Windmill | github.com/windmill-labs/windmill | Scripts avec UI auto + API |
| trigger.dev | github.com/triggerdotdev/trigger.dev | Background jobs TS natif |
| activepieces | github.com/activepieces/activepieces | n8n alternatif, 200+ intégrations |

### À évaluer (peut-être doublon)

| Repo | Potentiel doublon avec |
|------|----------------------|
| awesome-browser-automation | Playwright déjà dans REX |
| Awesome-Python-Scripts (hastagAB) | Amazing-Python-Scripts |
| grv231/automation-bash-scripts | Nos scripts bash custom |

### Processus d'audit (à faire avec CURIOUS + Claude Code)

```
Pour chaque repo :
1. Script fetch README + categories
2. Compare avec rex/scripts/ existants (doublon ?)
3. Note les gaps (ce qu'on n'a pas)
4. Liste les candidats à porter en TypeScript ou à wrapper
5. Priorité : web, email, files, APIs tierces, monitoring
```

### Intégration dans REX HUB

```typescript
// resource-hub.ts → ajouter une section "community scripts"
interface CommunityScript {
  source_repo: string
  original_language: 'python' | 'bash' | 'node'
  rex_wrapper: string        // chemin du wrapper TypeScript
  tested: boolean
  rex_version_added: string
}
```

---

# REX — GAPS & INCOHÉRENCES (09/03/2026)
> Ce qu'on n'a pas vu, les contradictions, les trous dans l'architecture.
> À résoudre avant la mise en prod.

---

## INCOHÉRENCES DÉTECTÉES

### 1. gateway.ts vs rex-identity.ts — Duplication ?
**Problème :** `gateway.ts` existe + `rex-identity.ts` existe (375 lignes).
Lequel est le vrai entry point ? Sont-ils câblés ensemble ?
**Fix :** Vérifier que `gateway.ts` appelle `rex-identity.ts`.
Si deux logiques séparées → merger ou documenter la séparation.

### 2. relay-engine.ts — câblé dans quoi ?
**Problème :** `relay-engine.ts` existe mais est-ce qu'il est appelé depuis `gateway.ts` ou `orchestrator.ts` ?
**Fix :** Vérifier l'import dans orchestrator.ts + gateway.ts.

### 3. user-cycles.ts vs user-state.ts — Doublon ?
**Problème :** Deux fichiers pour la gestion d'état utilisateur.
**Fix :** Fusionner ou clarifier : user-state = primitive, user-cycles = XState machine.

### 4. activitywatch-bridge.ts — Jamais appelé ?
**Problème :** Le fichier existe mais rien ne l'appelle dans les logs commits.
**Fix :** Brancher dans user-cycles.ts pour le sleepScore.

### 5. agent-templates vs client-factory.ts — Overlap ?
**Problème :** `agent-templates/` (personas DG/DRH) + `client-factory.ts` semblent faire la même chose.
**Fix :** client-factory crée les containers Docker, agent-templates définit les personas → OK si séparés. Vérifier.

### 6. CLAUDE_TASK.md — Tâches déjà faites non cochées
**Problème :** relay-engine.ts, watchdog.ts, sandbox/ sont déjà implémentés mais le TODO.md dit non.
**Fix :** Claude Code doit mettre à jour TODO.md + CLAUDE_TASK.md avec l'état réel.

### 7. scripts/ directory — Absent du repo
**Problème :** On a documenté un script store complet mais le répertoire `scripts/` n'existe que comme `build-binary.sh` etc.
**Fix :** Créer `rex/scripts/` avec les shell scripts opérationnels.

### 8. mini-modes/ — Documenté mais pas créé
**Problème :** `packages/cli/src/mini-modes/` n'existe pas encore.
**Fix :** Claude Code doit créer ce répertoire avec les premiers modes (search, save, status).

---

## TROUS DANS L'ARCHITECTURE (choses non pensées)

### A. Comment REX reçoit les messages Telegram en production ?
**Gap :** On a gateway.ts mais comment est-ce que le bot Telegram est configuré pour pointer vers REX ?
Actuellement REX utilise OpenClaw comme gateway. Quand REX tourne en standalone, il faut son propre bot Telegram.
**Fix :** Documenter dans UX.md : "rex setup" configure le bot Telegram.
Fichier à créer : `telegram-gateway.ts` standalone (sans OpenClaw).

### B. Authentification entre BRAIN et FLEET nodes
**Gap :** Comment un FLEET node prouve son identité au BRAIN ?
**Fix :** JWT token généré au `rex fleet:join`, stocké dans `~/.rex/fleet-token`.
Renouvellement automatique toutes les 24h.

### C. Que se passe-t-il si le BRAIN VPS est down ?
**Gap :** Pas de fallback documenté. L'user ne peut plus rien faire.
**Fix :** Mode dégradé local : FLEET node (Mac) peut répondre aux intents simples en offline.
Documenter dans `REX-LOGIC.md` section "offline mode".

### D. Versioning du format de mémoire
**Gap :** Si on change le schema SQLite en v2, les vieilles données sont perdues.
**Fix :** `db-migrations.ts` existe déjà (vu dans les commits) → vérifier qu'il est branché au démarrage.

### E. Rate limiting des scripts web
**Gap :** Si CURIOUS scanne trop vite les sources OSS → IP ban.
**Fix :** Ajouter délais entre requêtes dans `curious.ts`. Respecter `robots.txt`. Cacher les résultats 24h minimum.

### F. Secrets chiffrés — mais la clé de chiffrement est où ?
**Gap :** `secrets.ts` avec AES-256-GCM existe, mais la master key est stockée comment ?
**Fix :** Dériver depuis un password maître (argon2) + stockée dans le keychain OS (Keychain Mac / libsecret Linux).

### G. Multi-langue — REX parle français mais l'user peut switcher
**Gap :** Si l'utilisateur écrit en anglais, REX répond en quoi ?
**Fix :** Détecter la langue du message entrant (mini-model ou simple regex). Répondre dans la même langue.

### H. Limite de taille des messages Telegram
**Gap :** Telegram = max 4096 chars. Si REX génère une longue réponse → erreur silencieuse.
**Fix :** Dans `gateway-adapter.ts` → splitter automatiquement les réponses > 4000 chars.
OpenClaw le fait déjà (textChunkLimit: 4000) mais REX standalone non.

### I. Gestion des pièces jointes Telegram
**Gap :** Si l'user envoie une image ou un audio → REX ne sait pas quoi faire.
**Fix :** Audio → pipe vers `audio-logger.ts` (Whisper). Image → Ollama vision si disponible, sinon notify "image reçue, traitement non disponible".

### J. Cold start VPS (premier démarrage)
**Gap :** Sur un VPS vierge, quelle est la séquence exacte d'installation ?
**Fix :** `install-linux.sh` existe → vérifier qu'il installe : Node 22, pnpm, Ollama, nomic-embed, PM2, rex npm package.

### K. Monitoring des coûts en temps réel
**Gap :** Le budget tracker existe mais est-ce qu'il y a une alerte quand on approche du daily_limit ?
**Fix :** `budget.ts` → ajouter alerte à 80% du daily_limit via Telegram.

### L. REX CURIOUS — sources RSS pas encore fetchées
**Gap :** On a documenté les sources (Simon Willison, HuggingFace, r/LocalLLaMA) mais aucun cron ne les fetch.
**Fix :** Cron nocturne dans `daemon.ts` → `curious-scanner.ts` (à créer ou vérifier s'il existe).

---

## ACTIONS POUR CLAUDE CODE (priorité correctrice)

```
1. Vérifier câblage gateway.ts → rex-identity.ts → orchestrator → relay-engine
2. Fusionner user-cycles.ts + user-state.ts si doublon
3. Brancher activitywatch-bridge.ts dans user-cycles.ts (sleepScore)
4. Créer scripts/ directory avec les shell scripts (copier depuis /tmp/rex_scripts_store.sh)
5. Créer packages/cli/src/mini-modes/ avec 3 premiers modes (search-memory, save-idea, status)
6. Mettre à jour TODO.md avec l'état réel (cocher ce qui est fait)
7. Créer curious-scanner.ts si pas encore là (cron nocturne sources RSS/OSS)
8. Vérifier db-migrations.ts branché au boot
9. Ajouter split 4000 chars dans gateway-adapter.ts
10. Ajouter alerte 80% daily_limit dans budget.ts
```

---

## QUESTIONS À TRANCHER (décisions Kevin)

1. **Telegram standalone** : quand REX sera indépendant d'OpenClaw, il faut son propre bot → créer maintenant ou attendre ?
2. **Fleet auth JWT** : implémenter maintenant ou attendre le split BRAIN/FLEET ?
3. **Offline mode** : fallback Mac si VPS down → dans scope v1 ou v2 ?
4. **Multi-langue** : détecter et répondre dans la langue de l'user → v1 ou v2 ?

---

# REX — AUDIT GLOBAL DE LOGIQUE (09/03/2026)
> Basé sur lecture directe des fichiers TypeScript du repo.
> Vérité : ce qui est réellement câblé, pas ce qui est documenté.

---

## FLOW RÉEL D'UN MESSAGE (état actuel)

```
Telegram message
       │
       ▼
gateway.ts — webhook handler
       │
       ├─ /commande → handler direct (0 LLM)
       │
       ├─ free text + state.mode === "qwen"
       │       │
       │       ▼
       │   rexIdentityPipeline (rex-identity.ts)
       │   ① memory search (semantic)
       │   ② event journal (last 5 events)
       │   ③ intent scripts (SCRIPT_RULES regex → CLI direct)
       │   ④ script-first answer si possible (0 LLM)
       │   ⑤ orchestrator si LLM nécessaire
       │       │
       │       ▼
       │   orchestrator.ts → relayRace()
       │   [Ollama → free-tiers → Claude API]
       │
       └─ free text + autre mode (défaut)
               │
               ▼
           /chat → rex agents run orchestrator
               │
               └─ fallback: claudeSession() ou askClaude()
```

---

## PROBLÈME #1 — DEUX RELAY IMPLEMENTATIONS EN PARALLÈLE ⚠️

**État :** Deux "relay" coexistent, logiques différentes, non intégrées.

| | `orchestrator.ts relayRace()` | `relay-engine.ts runRelay()` |
|-|------------------------------|------------------------------|
| **Appelé par** | rex-identity.ts → orchestrator | index.ts CLI `rex relay <task>` UNIQUEMENT |
| **Pattern** | Fallback séquentiel : si A échoue → B | Vrai relay document : chaque modèle lit les contributions précédentes |
| **Doc partagée** | Non | Oui (RelayDocument avec contributions[]) |
| **Confidence** | Non | Oui (auto-reported 0-1) |
| **Mentor** | Non | Oui (Opus si confidence < 0.6) |

**Problème :** Le vrai relay (relay-engine.ts) n'est JAMAIS utilisé dans le pipeline principal.
`relayRace()` dans orchestrator.ts est un simple fallback déguisé en relay.

**Fix :**
```typescript
// Dans rex-identity.ts step 5, remplacer :
const result = await orchestrate(prompt)

// Par :
const { runRelay } = await import('./relay-engine.js')
const doc = await runRelay(prompt, context, { mentorEnabled: false })
```

---

## PROBLÈME #2 — MODE "QWEN" EST LE SEUL À UTILISER REX IDENTITY LAYER ⚠️

**État :** `rexIdentityPipeline` n'est appelée que si `state.mode === "qwen"`.
Le mode par défaut passe par `/chat → agents run orchestrator → claudeSession()`.
→ **90% du trafic ne passe pas par le pipeline REX.**

**Fix :** Faire de `rexIdentityPipeline` le handler par défaut pour TOUS les messages.
Le mode "qwen" ne devrait pas être un flag — c'est la logique principale de REX.

```typescript
// gateway.ts — remplacer le bloc free text par :
if (text.length > 2) {
  const { rexIdentityPipeline } = await import('./rex-identity.js')
  const result = await rexIdentityPipeline(text, { onChunk })
  response = result.response
}
// Supprimer la distinction mode === "qwen"
```

---

## PROBLÈME #3 — DB-MIGRATIONS NON APPELÉ AU BOOT ⚠️

**État :** `applyMigrations()` est appelé UNIQUEMENT depuis `index.ts` via commande CLI `rex migrate`.
→ Si l'user ne fait pas `rex migrate` manuellement → schema potentiellement désynchronisé.

**Fix :** Appeler `applyMigrations()` dans `daemon.ts` au démarrage :
```typescript
// daemon.ts — dans la fonction boot principale
const { applyMigrations } = await import('./db-migrations.js')
const migrations = await applyMigrations()
if (migrations.applied.length > 0) {
  log.info(`Applied ${migrations.applied.length} DB migrations: v${migrations.applied.join(', v')}`)
}
```

---

## PROBLÈME #4 — BUDGET ALERT N'ENVOIE PAS TELEGRAM ⚠️

**État :** `checkBudgetAlert()` (budget.ts ligne 235) détecte bien les 80%+ mais `console.log` seulement.
→ En production (daemon headless), personne ne voit le warning.

**Fix :** Dans `daemon.ts`, connecter l'alerte à la notification Telegram :
```typescript
// Dans daemon.ts, tick check toutes les heures :
const alert = checkBudgetAlert()
if (alert.level !== 'ok') {
  await notifyTelegram(`⚠️ Budget REX : ${alert.message}`)
}
```

---

## CE QUI EST OK (pas de problème)

| Composant | État réel |
|-----------|-----------|
| `user-state.ts` vs `user-cycles.ts` | Complémentaires : user-state = primitives AW + calcul score ; user-cycles = XState machine qui consomme user-state. Pas de doublon. |
| `activitywatch-bridge.ts` | Correctement appelé depuis user-state, user-cycles, pattern-detector, monitor-daemon. OK. |
| `budget.ts` alerte 80% | Logique de détection OK. Problème = seulement console.log (voir #4). |
| `gateway.ts` PID lock | Single instance guard OK. |
| `daemon.ts` AW check | `detectUserCycle()` branché dans daemon.ts ligne 848. OK. |
| `relay-engine.ts` logic | Logique propre, bien documentée. Juste pas câblée au pipeline. |
| `agent-templates/` + `client-factory.ts` | Séparation claire : templates = personas, factory = containers Docker. OK. |
| `secrets.ts` AES-256-GCM | Implémenté. Question master key reste ouverte (voir GAPS.md). |

---

## AUDIT DES MINI-MODELS (état actuel)

**État :** Aucun mini-model Ollama spécialisé n'existe encore.
Le pipeline utilise Qwen 2.5 généraliste pour tout.

**Gap :** `rex-intent`, `rex-tagger`, `rex-summarizer` ne sont pas créés.
Script de création : `scripts/mini-models/create-all.sh` (créé dans cette session).

**Fix :** Claude Code doit exécuter `scripts/mini-models/create-all.sh` après avoir vérifié qu'Ollama tourne.

---

## AUDIT DU SCRIPT STORE (état actuel)

**État :** 
- `scripts/build-binary.sh`, `install-linux.sh`, `install-macos.sh` existaient
- `scripts/fetch/`, `scripts/memory/`, `scripts/system/`, `scripts/security/` → créés cette session (15 scripts)
- Syntaxe error dans create-all.sh (EOF heredoc) → à corriger

---

## ACTIONS CLAUDE CODE — PRIORISÉES

### 🔴 CRITIQUE (logique cassée)

1. **Câbler relay-engine.ts dans rexIdentityPipeline** (step 5)
   - Remplacer `orchestrate()` par `runRelay()` avec `mentorEnabled: false`
   - Conserver orchestrate() comme fallback si relay-engine échoue

2. **Supprimer la dépendance mode === "qwen"**
   - `rexIdentityPipeline` doit être le handler par défaut de TOUS les messages free text
   - Tester : envoyer un message sans activer le mode qwen → doit passer par le pipeline

### 🟠 IMPORTANT (fiabilité prod)

3. **Appeler applyMigrations() dans daemon.ts au boot**
   - Avant toute opération SQLite
   - Logger les migrations appliquées

4. **Brancher budget alert → notification Telegram**
   - Dans daemon.ts, tick horaire → checkBudgetAlert() → notifyTelegram si level != ok

### 🟡 AMÉLIORATION (qualité)

5. **Corriger syntax error dans scripts/mini-models/create-all.sh**
   - EOF heredoc mal fermé (ligne 252)
   
6. **Créer les 4 mini-models Ollama** (si Ollama disponible sur Mac)
   - `rex-intent`, `rex-tagger`, `rex-summarizer`, `rex-security-check`
   
7. **Créer packages/cli/src/mini-modes/** avec 3 modes initiaux
   - `search-memory.mode.ts`
   - `save-idea.mode.ts`
   - `status.mode.ts`

8. **Mettre à jour TODO.md** — cocher : relay-engine ✅, user-cycles ✅, activitywatch ✅, watchdog ✅, sandbox ✅, secrets ✅

---

## SCHÉMA CIBLE (après fix)

```
Telegram message
       │
       ▼
gateway.ts — webhook handler (TOUS les messages free text)
       │
       ▼
rexIdentityPipeline (rex-identity.ts) — TOUJOURS
① memory search → snippets de contexte
② event journal → 5 derniers events
③ SCRIPT_RULES regex → réponse directe si match (0 LLM)
④ mini-model rex-intent (Ollama, 20ms) → intent + confidence
⑤ mini-mode chargé → contexte enrichi via scripts
⑥ LLM si nécessaire :
   └─ runRelay (relay-engine.ts) — vrai relay document
       [Ollama → Groq → Haiku → Sonnet → Opus mentor]
       Chaque modèle lit les contributions précédentes
       S'arrête quand confidence >= 0.8
       │
       ▼
      Réponse Telegram (splittée si > 4000 chars)
```
