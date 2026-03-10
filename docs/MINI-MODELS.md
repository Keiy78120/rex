
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
