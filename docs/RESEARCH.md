
---

## REX — RECHERCHES TECHNIQUES (09/03/2026)

> Toutes les découvertes, librairies, frameworks, et références trouvées cette session.
> Source de vérité pour Claude Code avant implémentation.

---

### 1. OPENAI AGENTS SDK (TypeScript)

**Repo :** https://github.com/openai/openai-agents-js
**Docs :** https://openai.github.io/openai-agents-js/
**Install :** `npm install @openai/agents zod`
**Node :** 22+ requis (aussi Deno, Bun, Cloudflare Workers)

**Capacités :**
- Multi-agent natif : agents as tools, handoffs entre agents
- MCP tools intégré nativement
- Sessions (historique conversation automatique)
- Tracing intégré (debug + optimisation)
- Guardrails (input/output validation)
- Human in the loop
- Realtime voice agents
- Provider-agnostic (peut pointer vers Ollama, LiteLLM, etc.)

**Usage basique :**
```typescript
import { Agent, run } from '@openai/agents';
const agent = new Agent({
  name: 'REX',
  instructions: 'Tu es REX...',
});
const result = await run(agent, 'message');
```

**À intégrer dans :** `packages/cli/src/agent-runtime.ts`
Pour les templates clients DG/DRH — remplace l'implémentation custom actuelle.

---

### 2. OPENAI CODEX — PROVIDER OAUTH (OpenClaw PR #32065)

**PR :** https://github.com/openclaw/openclaw/pull/32065
**Auteur :** byrafael
**Statut :** mergée

**Comment ça marche :**
- OAuth device-code avec compte ChatGPT Plus/Pro
- Commande : `openclaw models auth login --provider openai-codex --method device-code`
- Transport : WebSocket-first (auto), SSE fallback
- Token stocké dans openclaw.json

**À répliquer dans REX :**
- `packages/cli/src/providers/codex-oauth.ts`
- Device-code flow → token → stocké dans `~/.rex/credentials`
- Codex utilisé comme worker background via `agents.ts`
- Slot dans relay chain : entre Groq et Claude subscription

---

### 3. 9ROUTER — PROXY UNIVERSEL

**Repo :** https://github.com/decolua/9router
**Install :** `npm install -g 9router`
**URL locale :** `http://localhost:20128/v1`

**Architecture :**
```
CLI Tool → localhost:20128/v1
  → Tier 1: SUBSCRIPTION (Claude Code, Codex, Gemini CLI)
    ↓ quota exhausted
  → Tier 2: CHEAP (GLM $0.6/1M, MiniMax $0.2/1M)
    ↓ budget limit
  → Tier 3: FREE (iFlow, Qwen, Kiro — unlimited)
```

**Compatible avec :** Claude Code, Codex, Gemini CLI, OpenClaw, Cursor, Cline

**Décision REX :** Ne pas intégrer directement — garder `free-tiers.ts` custom pour fleet awareness et contrôle fin. S'inspirer du pattern de routing tiered.

---

### 4. ARCHGW — INTENT ROUTING GATEWAY

**Repo :** https://github.com/katanemo/archgw
**Docs :** https://docs.archgw.com/guides/agent_routing.html

**Concept :** Gateway spécialisé dans le routing d'intent via un petit modèle function-calling.
Déterministe pour les cas simples, LLM léger pour les cas ambigus.

**Pattern à répliquer dans REX :**
```
Intent simple → regex (0ms, 0€)
Intent ambigu → Qwen 3 4B local via function-calling (200ms, 0€)
Jamais Claude/subscription pour de la classification
```

---

### 5. XSTATE — MACHINES D'ÉTAT FORMELLES

**Site :** https://xstate.js.org
**Install :** `npm install xstate`
**Usage :** Modéliser les états de REX (AWAKE/SLEEPING/RELAY/etc.)

**Pourquoi :**
- Chaque comportement de REX = transition d'état formelle
- Impossible d'avoir un état invalide
- Visualisable (XState viz)
- Théorie : automates finis déterministes (Kleene/Turing)

**Application REX :**
```typescript
const rexMachine = createMachine({
  states: {
    awake_active: { on: { IDLE_30MIN: 'awake_idle' } },
    awake_idle: { on: { SLEEP_DETECTED: 'sleeping' } },
    sleeping: {
      entry: 'startNightTasks',
      on: { WAKE_UP: 'waking_up' }
    },
    waking_up: {
      entry: 'sendMorningDigest',
      on: { DIGEST_SENT: 'awake_active' }
    }
  }
})
```

---

### 6. RXJS — RELAY COMME STREAMS RÉACTIFS

**Site :** https://rxjs.dev
**Install :** `npm install rxjs`
**Théorie :** Kahn Process Networks, dataflow programming

**Le relay REX en RxJS :**
```typescript
import { pipe } from 'rxjs';
import { switchMap } from 'rxjs/operators';

const relayChain = pipe(
  switchMap(context => ollamaAnalyze(context)),
  switchMap(result => groqRefine(result)),
  switchMap(result => claudeDecide(result))  // seulement si nécessaire
)
```

Chaque opérateur = un modèle qui lit et enrichit le contexte.
Le relay document markdown = l'état qui se passe entre switchMaps.

---

### 7. EFFECT-TS — FIABILITÉ MATHÉMATIQUE

**Site :** https://effect.website
**Install :** `npm install effect`
**Théorie :** Programmation fonctionnelle applicative, typed effects

**Pourquoi c'est le game changer pour REX :**
- Chaque effet (appel API, lecture fichier, etc.) est typé
- Les erreurs ne peuvent PAS être ignorées — le compilateur force le traitement
- Concurrence gérée formellement (fibers)
- Dependency injection sans magie
- Resource management automatique (pas de leak)

**Application REX :**
```typescript
import { Effect, pipe } from 'effect'

const callModel = (prompt: string): Effect.Effect<string, ModelError, ModelDep> =>
  Effect.tryPromise({
    try: () => model.complete(prompt),
    catch: (e) => new ModelError(e)
  })

// L'erreur DOIT être gérée — le compilateur refuse sinon
pipe(
  callModel("..."),
  Effect.catchTag("ModelError", () => fallbackModel("...")),
  Effect.runPromise
)
```

REX ne peut pas ignorer une erreur d'API. Jamais. Par design.

---

### 8. ZOD — CONTRATS RUNTIME

**Site :** https://zod.dev
**Install :** `npm install zod`
**Théorie :** Design by Contract (Hoare logic)

Chaque input/output de REX validé à l'entrée.
Utilisé dans `@openai/agents` nativement.

---

### 9. GRAPHLIB — ROUTING EN GRAPHE

**Install :** `npm install graphlib`
**Théorie :** Dijkstra, Bellman-Ford, graphes pondérés

**Application REX :**
```
Nœuds = modèles disponibles (Ollama, Groq, Claude...)
Arêtes = coût pondéré (latence + prix + qualité)
REX calcule le chemin optimal à chaque décision
```

---

### 10. SIMPLE-STATISTICS — PATTERNS CURIOUS

**Install :** `npm install simple-statistics`
**Usage :** Détection de patterns récurrents, anomalies

```typescript
import { linearRegression, mean, standardDeviation } from 'simple-statistics'

// Kevin cherche Stellantis chaque lundi ?
const mondayFrequency = computeConditionalProbability('stellantis', 'monday')
if (mondayFrequency > 0.7) → CURIOUS.signal(PATTERN, 'Brief Stellantis lundi')
```

---

### 11. ACTIVITYWATCH — SURVEILLANCE HABITUDES

**Site :** https://activitywatch.net
**Repo :** https://github.com/ActivityWatch/activitywatch
**License :** MIT
**API :** REST locale `localhost:5600`

**Données disponibles :**
- Apps actives + durée
- Fenêtres et titres
- URLs (avec extension browser)
- Temps d'inactivité (idle)
- Cross-platform : Mac, Windows, Linux, Android

**Pour REX :** Détection cycle sommeil + patterns habitudes + CURIOUS

---

### 12. HAMMERSPOON — AUTOMATION MAC

**Site :** https://www.hammerspoon.org
**License :** MIT, Lua scripts

**Capacités :**
- Events système macOS (changement d'app, sleep/wake, réseau...)
- Clipboard logger
- Hotkeys personnalisés
- Scripts Lua déclenchés par événements
- Accès aux APIs macOS non exposées

**Pour REX Monitor :** Détecter patterns Mac, clipboard, routines du matin

---

### 13. RÉCAPITULATIF STACK MATHÉMATIQUE REX

| Besoin REX | Modèle mathématique | Librairie TS | Priorité |
|------------|--------------------|-----------|----|
| États utilisateur | Automates finis | XState | HIGH |
| Relay inter-modèles | Kahn Process Networks | RxJS | HIGH |
| Routing coûts | Graphe pondéré (Dijkstra) | graphlib | MEDIUM |
| Patterns CURIOUS | Chaînes de Markov / Stats | simple-statistics | MEDIUM |
| Guards / Contrats | Hoare logic | Zod + Effect-ts | HIGH |
| Self-improve | Bandit ε-greedy | custom 50L | LOW |
| Memory | Espaces vectoriels | sqlite-vec | DONE ✅ |
| Agents clients | Multi-agent orchestration | @openai/agents | HIGH |
| Intent detection | Regex + LLM léger | archgw pattern | HIGH |
| Fiabilité globale | Typed effects | Effect-ts | HIGH |

---

### 14. PRIORITÉS D'INTÉGRATION POUR CLAUDE CODE

**Phase immédiate :**
1. `@openai/agents` dans `agent-runtime.ts` + templates DG/DRH
2. XState pour les états utilisateur (AWAKE/SLEEPING/WAKING_UP)
3. Effect-ts pour la fiabilité des appels API critiques
4. `relay-engine.ts` avec RxJS pipeline

**Phase suivante :**
5. `activitywatch-bridge.ts` (détection cycle sommeil)
6. `codex-oauth.ts` (provider Codex ChatGPT Plus)
7. `pattern-detector.ts` avec simple-statistics
8. `graphlib` pour routing coûts optimisé
