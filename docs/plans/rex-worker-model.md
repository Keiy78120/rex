# REX Worker — Modèle fine-tuné dédié (Plan)

> Date : 14/03/2026
> Objectif : un modèle ultra-light spécialisé pour TOUTES les fonctions autonomes de REX
> Principe : fine-tune Qwen 3.5 → export multi-taille → déploiement fleet-wide

---

## 1. POURQUOI

REX a 6+ fonctions autonomes (routing, tool selection, categorize, signal→action, fleet dispatch, guard check) qui tournent en continu. Aujourd'hui elles utilisent soit des scripts purs, soit des modèles génériques (qwen2.5) qui :
- Sont trop gros pour un VPS CPU-only
- Ne sont pas optimisés pour les tâches REX
- Gaspillent des tokens sur du contexte inutile
- Répondent parfois mal aux formats structurés REX

Un modèle fine-tuné résout tout : il connaît REX par cœur, sort du JSON propre, tourne partout.

---

## 2. MODÈLE BASE

### Qwen 3.5 (mars 2026) — famille complète

| Variante | Params | RAM (Q4) | Cible device | Usage |
|----------|--------|----------|-------------|-------|
| **rex-worker-mini** | 0.8B | ~500MB | VPS CPU, RPi, vieux devices | Routing, classification, guards |
| **rex-worker** | 4B | ~2.5GB | Mac Mini, MacBook, PC | Toutes les fonctions REX |

Pourquoi Qwen 3.5 :
- Architecture Gated DeltaNet — dernière génération (02/03/2026)
- 262K context natif — même le 0.8B
- Multi-token prediction — inférence plus rapide
- Même architecture 0.8B→9B — fine-tune transférable
- Support mlx-lm (Mac) + Unsloth (GPU) + llama.cpp (CPU) + Ollama
- Le 0.8B tourne sur un Intel i5 gen2 + 4GB DDR3 (confirmé par Qwen docs)

### Performances attendues

| Device | Modèle | tok/s estimé | Latence JSON court |
|--------|--------|-------------|-------------------|
| VPS 4 vCPU | 0.8B Q4 | 20-40 | < 200ms |
| RPi 5 | 0.8B Q4 | 10-15 | < 500ms |
| Mac Mini M1 8GB | 4B Q4 | 40-80 | < 100ms |
| MacBook M2 Pro | 4B Q4 | 60-100 | < 80ms |
| PC RTX 3090 | 4B Q8 | 100-200 | < 50ms |

---

## 3. TÂCHES DU MODÈLE

### 3.1 Intent Routing
```json
// Input
{"message": "combien de RAM me reste ?", "context": "fleet"}

// Output
{"tier": "SCRIPT", "command": "signal-detector.getRamUsedPercent()", "confidence": 0.98}
```

### 3.2 Tool Selection
```json
// Input
{"intent": "search_memory", "model": "qwen3.5:0.8b", "health": {"ollama": true, "memory": true}}

// Output
{"tools": ["memory_search"], "budget": 1, "reason": "small model, 1 tool max"}
```

### 3.3 Signal→Action
```json
// Input
{"signals": {"disk_pressure": "critical", "ram_pressure": "ok", "ollama": "down", "pending_chunks": 342}}

// Output
{"actions": ["alert_telegram", "prune_cache", "skip_embed"], "priority": "high"}
```

### 3.4 Memory Categorize
```json
// Input
{"chunk": "Fixed authentication bug in JWT refresh token rotation..."}

// Output
{"category": "bugfix", "tags": ["auth", "jwt", "security"], "importance": 0.8, "project": "api"}
```

### 3.5 Fleet Dispatch
```json
// Input
{"task": "embed 500 chunks", "fleet": [{"name": "mac", "score": 85, "healthy": true, "caps": ["ollama", "embed"]}, {"name": "vps", "score": 40, "healthy": true, "caps": ["docker"]}]}

// Output
{"target": "mac", "reason": "has ollama + embed capability, highest score"}
```

### 3.6 Guard Check
```json
// Input
{"command": "rm -rf /", "context": "user_shell"}

// Output
{"allow": false, "reason": "destructive command targeting root filesystem", "severity": "critical"}
```

---

## 4. DATASET

### Sources (générées depuis REX)

| Source | Exemples estimés | Comment |
|--------|-----------------|---------|
| `orchestration-policy.ts` | ~200 | Extraire les 6 tiers + regex patterns → exemples routing |
| `tool-injector.ts` | ~150 | Mappings intent→tools + model budgets |
| `signal-detector.ts` | ~100 | Combinaisons signal→action du daemon |
| Memory DB catégorisée | ~1500 | Chunks déjà catégorisés = ground truth parfait |
| `security-scanner.ts` | ~100 | Patterns allow/warn/block |
| Fleet routing logs | ~50 | Logs de `routeTask()` |
| Corrections Claude/Opus | ~variable | Chaque correction = 1 nouvel exemple (self-improvement) |
| **Total cible** | **2000-3000** | Suffisant pour LoRA spécialisé |

### Format JSONL (chat-ml compatible)

```jsonl
{"messages": [{"role": "system", "content": "You are rex-worker, the autonomous function executor for REX OS. Output valid JSON only. No explanations."}, {"role": "user", "content": "TASK: route\nMESSAGE: check my git status"}, {"role": "assistant", "content": "{\"tier\": \"SCRIPT\", \"command\": \"git status\", \"confidence\": 0.99}"}]}
```

### Collecte automatique

Nouveau dans `training.ts` :
```
rex train collect --type routing     # depuis orchestration-policy
rex train collect --type tools       # depuis tool-injector
rex train collect --type signals     # depuis signal-detector
rex train collect --type categorize  # depuis memory DB
rex train collect --type guards      # depuis security-scanner
rex train collect --all              # tout d'un coup
```

---

## 5. PIPELINE DE TRAINING

### Étape 1 — Collecte + Validation
```bash
rex train collect --all              # génère dataset JSONL
rex train validate                   # vérifie JSON valide, distribution équilibrée
rex train split --ratio 90/10        # train/val split
```

### Étape 2 — Fine-tune
```bash
# Auto-détecte le backend (Mac → mlx-lm, GPU → unsloth)
rex train run --model qwen3.5:4b --backend auto

# Mac Apple Silicon : mlx-lm LoRA
# ~30 min sur M2 Pro, 0 GPU nécessaire
# Config: 16 LoRA layers, batch 4, 500 steps, max_seq 2048

# PC RTX 3090 : Unsloth QLoRA
# ~15 min, ~3GB VRAM (reste 21GB libre)
# Config: rank 16, alpha 32, 4-bit quantize
```

### Étape 3 — Évaluation
```bash
rex train eval                       # test sur val set
# Métriques :
# - JSON validity rate (cible: > 99%)
# - Routing accuracy (cible: > 95%)
# - Tool selection accuracy (cible: > 90%)
# - Categorize agreement (cible: > 85%)
```

### Étape 4 — Déploiement
```bash
rex train deploy                     # export → Ollama

# Sous le capot :
# 1. Merge adapter + base model
# 2. Convert to GGUF (Q4_K_M pour fleet, Q8_0 pour PC GPU)
# 3. Créer Modelfile Ollama avec system prompt REX
# 4. ollama create rex-worker -f Modelfile
# 5. Test smoke : rex route "test" → doit utiliser rex-worker
```

### Étape 5 — Déploiement Fleet
```bash
rex train deploy --fleet             # push vers tous les nodes

# 1. rex-worker-mini (0.8B Q4) → VPS + RPi
# 2. rex-worker (4B Q4) → Mac + PC
# 3. Chaque node pull le GGUF via rex fleet sync
# 4. Ollama create local sur chaque node
```

---

## 6. SELF-IMPROVEMENT LOOP

```
rex-worker fait une décision (ex: route vers SCRIPT)
  │
  ├── Correct → rien à faire
  │
  └── Incorrect → Claude/Opus corrige (ex: aurait dû être LOCAL)
       │
       ▼
  Correction sauvée en mémoire (type=training_correction)
       │
       ▼
  Daemon collecte les corrections (weekly)
       │
       ▼
  Re-train avec dataset enrichi
       │
       ▼
  rex-worker v2 déployé sur fleet
       │
       ▼
  rex-worker converge vers la perfection sur les tâches REX
```

**C'est le 70/30 en action** : rex-worker (70% script-like, local) s'améliore grâce aux corrections des LLMs (30%).

---

## 7. INTÉGRATION DANS L'ARCHITECTURE REX

### Avant (actuel)
```
Requête → scripts purs (regex, rules)
       → si pas suffisant : Qwen 2.5 générique (lourd, lent, pas spécialisé)
       → si pas suffisant : Claude API (coûteux)
```

### Après (avec rex-worker)
```
Requête → scripts purs (regex, rules) — 50% résolu ici
       → rex-worker (0.8B-4B, local, < 200ms) — 45% résolu ici
       → Qwen 9B / Claude API — 5% seulement (raisonnement complexe)
```

### Fichiers à modifier
- `orchestration-policy.ts` → tier LOCAL utilise rex-worker au lieu de modèle générique
- `tool-injector.ts` → MODEL_BUDGETS ajouter rex-worker profile
- `training.ts` → ajouter collecteurs spécialisés + deploy pipeline
- `daemon.ts` → cycle self-improvement (collect corrections weekly)
- `config.ts` → `rexWorker: { model: 'rex-worker', fallback: 'qwen3.5:9b' }`

### Fallback chain mis à jour
```
0. SCRIPT (regex, rules, CLI) — 0 LLM, instant
1. REX-WORKER-MINI (0.8B, CPU, VPS/RPi) — 20ms-200ms
2. REX-WORKER (4B, local GPU/Metal) — 50ms-100ms
3. Qwen 3.5 9B (local, fallback) — 200ms-500ms
4. Groq/Cerebras free tier — 500ms-2s
5. Claude Sonnet API — 1s-5s
6. Claude Opus (mentor) — 2s-10s
```

---

## 8. DÉPLOIEMENT PAR DEVICE

| Device | Modèle | Quantization | RAM | Latence | Tâches |
|--------|--------|-------------|-----|---------|--------|
| **VPS (brain)** | rex-worker-mini | Q4_K_M | 500MB | < 200ms | routing, signals, guards, fleet dispatch |
| **RPi 5** | rex-worker-mini | Q4_K_M | 500MB | < 500ms | routing, signals |
| **Mac Mini M1** | rex-worker | Q4_K_M | 2.5GB | < 100ms | toutes les tâches |
| **MacBook** | rex-worker | Q4_K_M | 2.5GB | < 80ms | toutes les tâches |
| **PC RTX 3090** | rex-worker | Q8_0 | 4GB | < 50ms | toutes + training |

---

## 9. CHECKLIST AVANT IMPLÉMENTATION

- [ ] Installer Qwen 3.5 0.8B + 4B sur Ollama (vérifier que ça tourne)
- [ ] Benchmark CPU-only 0.8B sur VPS (confirmer < 200ms pour JSON court)
- [ ] Coder les collecteurs de dataset dans training.ts
- [ ] Générer dataset v1 (cible 2000+ exemples)
- [ ] Fine-tune v1 sur RTX 3090 avec Unsloth
- [ ] Évaluer sur val set (JSON validity > 99%, routing > 95%)
- [ ] Export GGUF + Modelfile Ollama
- [ ] Intégrer dans orchestration-policy.ts
- [ ] Tester end-to-end via `rex route "test"`
- [ ] Déployer sur fleet via `rex train deploy --fleet`
- [ ] Coder le self-improvement loop dans daemon.ts
