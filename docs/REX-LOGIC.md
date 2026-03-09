
---

## REX LOGIC — Le cerveau documenté (09/03/2026)

> Ce fichier est la source de vérité de comment REX pense, décide, et agit.
> Tout comportement de REX doit être traçable à une règle de ce document.

---

### 1. CYCLES UTILISATEUR — REX s'adapte au rythme humain

REX apprend les habitudes de l'utilisateur via ActivityWatch + historique messages.
Pas de configuration manuelle — il infère.

#### États détectés automatiquement

```
AWAKE_ACTIVE    → messages fréquents, apps actives, CPU fleet actif
                  Mode : réponse rapide, paid API ok si nécessaire

AWAKE_IDLE      → pas de message depuis 30min mais PC actif
                  Mode : tâches background légères, free tiers only

SLEEPING        → aucune activité depuis X heures (seuil appris)
                  Mode : heavy background processing, OLLAMA ONLY
                  Tâches autorisées : CURIOUS scan, entraînement modèles,
                  indexation mémoire, commits GitHub, résumés audio,
                  npm audits, patterns détection

WAKING_UP       → premier message du matin
                  Mode : préparer le digest, présenter ce qui a été fait la nuit
                  "Pendant que tu dormais, j'ai fait X, Y, Z"
```

#### Détection du cycle sommeil

```typescript
// Sources combinées (score 0-100)
const sleepScore = (
  activitywatch.idleTime * 0.4 +      // Temps inactif PC
  noTelegramSince * 0.3 +             // Silence messages
  calendarHint * 0.2 +                // "Pas de RDV avant 9h"
  historicalPattern * 0.1             // "Il dort généralement 23h-8h"
)
if (sleepScore > 70) → state = SLEEPING
```

---

### 2. FLEET SCHEDULING — Utiliser la puissance disponible

#### Règle fondamentale
> Ne jamais dépenser de l'argent pour ce qu'on peut faire gratuitement avec la fleet.

#### Matrice de décision

```
Tâche légère (< 2K tokens, réponse simple)
  → Script pur si possible (0ms, 0€)
  → Ollama local si LLM nécessaire (0€)

Tâche moyenne (2K-32K tokens)
  → Groq free tier (131K ctx, ultra rapide, 0€)
  → Si quota épuisé → Ollama 7B

Tâche lourde (> 32K tokens, code complexe)
  → User AWAKE → Claude Haiku (minimal cost)
  → User SLEEPING → Ollama + chunking (0€, temps illimité)

Tâche critique / décision importante
  → Claude Sonnet (meilleur ratio qualité/coût)
  → Toujours avec confirmation user si irréversible
```

#### Fleet la nuit

Pendant SLEEPING :
```
VPS (toujours dispo) → tâches principales
Mac (si branché + pas en veille) → tâches lourdes CPU/GPU
iPhone (fleet sensor) → aucune tâche CPU
RTX 3090 PC (si dispo) → fine-tuning, embeddings batch
```

REX vérifie l'état thermique avant d'assigner une tâche lourde.
Si Mac chaud → pause. Si batterie < 20% → pas de tâche lourde.

---

### 3. TÂCHES AUTONOMES NOCTURNES (exemples)

Ce que REX peut faire pendant que Kevin dort, sans dépenser un centime :

- Scanner les nouveaux MCPs/tools OSS via CURIOUS
- Indexer les nouvelles conversations en mémoire vectorielle
- Transcription des audios du jour (Whisper local)
- Résumés des réunions non encore traités
- `npm audit` sur tous les projets → rapport disponible au réveil
- Vérifier les PRs ouvertes sur GitHub
- Tester les nouvelles skills en sandbox Docker
- Compacter les sessions en mémoire longue terme
- Vérifier les métriques de coût du mois
- Pre-fetch contexte des RDVs du lendemain

---

### 4. DIGEST RÉVEIL — "Pendant que tu dormais"

Premier message du matin = briefing automatique :

```
🌅 Bonjour Kevin — voici ce que j'ai fait cette nuit :

✅ 3 réunions transcrites et résumées
✅ CURIOUS : trouvé 2 nouveaux outils (te les présente si tu veux)
✅ PR #47 ouverte sur keiy78120/rex
⚠️  npm audit : 1 vulnérabilité medium dans packages/cli (déjà patchée)
💡 Pattern détecté : tu cherches des infos sur Stellantis chaque lundi matin — j'ai préparé un brief

Agenda du jour : RDV 14h (brief prêt), RDV 18h (pas de brief encore)
```

---

### 5. LOGIQUE DE DÉCISION GLOBALE (pseudo-code REX)

```
function rex_decide(input, context):

  # 1. Qui parle, dans quel état
  user_state = detect_user_state(context)
  
  # 2. Quel est l'intent
  intent = detect_intent_regex(input)
  if intent == AMBIGUOUS:
    intent = ollama_classify(input)  # jamais paid pour ça

  # 3. Est-ce qu'un script peut répondre ?
  script_result = try_scripts(intent, context)
  if script_result: return format_rex_response(script_result)

  # 4. Choisir le bon modèle selon état et coût
  model = select_model(intent, user_state, budget_remaining)

  # 5. Construire un brief focalisé (pas tout le contexte)
  brief = build_focused_brief(context, intent)

  # 6. Relay si tâche complexe
  if intent.complexity > THRESHOLD:
    return relay_chain(brief, model)
  
  return model.complete(brief)

function select_model(intent, user_state, budget):
  if user_state == SLEEPING:
    return OLLAMA  # toujours, sauf exception
  if budget.paid_today > budget.daily_limit:
    return FREE_TIER
  if intent.requires_code:
    return GROQ_70B  # free, code optimisé
  if intent.is_critical:
    return CLAUDE_SONNET
  return GROQ_8B  # default : rapide, gratuit
```

---

### 6. LOGIQUE DE COÛT — Budget comme contrainte formelle

```typescript
interface BudgetState {
  daily_limit_eur: number      // ex: 2€/jour
  spent_today: number
  spent_month: number
  free_calls_remaining: {
    groq: number,
    gemini: number,
    // ...
  }
}

// Règle : si spent_today > daily_limit → fallback free only
// Règle : si fin de mois → réduire daily_limit de 30%
// Règle : jamais paid pour classification, résumé court, regex possible
```

---

### 7. REX LOGIC.md — Principe de centralisation

Ce document doit être :
- La référence unique pour le comportement de REX
- Mis à jour automatiquement quand une règle change
- Versionné (chaque règle a une date)
- Lu par Claude Code avant toute implémentation de logique

**Fichier à créer dans le repo :** `docs/REX-LOGIC.md`
Pointer vers lui depuis CLAUDE.md et README.
--- Remplacé par REX-BRAIN.md ---
