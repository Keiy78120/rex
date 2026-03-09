
---

# REX — PLAN E2E TESTS + DEBUG (09/03/2026)

> Penser loin. Tout ce qu'on va rencontrer avant de le rencontrer.

---

## 1. PRÉREQUIS AVANT TOUT TEST

### Environnement de test isolé
- [ ] `docker-compose.test.yml` — stack REX complète en mode test
- [ ] Variables d'env séparées : `.env.test` (jamais les vraies clés)
- [ ] Base SQLite de test (données fictives Kevin-like)
- [ ] Telegram bot de test séparé (pas le prod)
- [ ] Comptes LLM de test (ou mocks)

### Mocks LLM (critique — ne pas brûler quota en tests)
- [ ] `mock-llm-server.ts` — serveur local OpenAI-compatible qui répond instantanément
- [ ] Réponses scriptées par intent (`SEARCH` → réponse mock, `FIX` → réponse mock)
- [ ] Mode `REX_TEST_MODE=true` → utilise toujours le mock, jamais le vrai LLM
- [ ] Compteur de tokens fake pour tester les fallbacks budget

### ActivityWatch mock
- [ ] Serveur mock `localhost:5600` pour simuler idle time sans AW installé
- [ ] Simuler états : awake / idle / sleeping

---

## 2. SCÉNARIOS E2E — HAPPY PATH

### 2.1 Message → Script → Réponse (0 LLM)
```
Input: "quel temps fait-il à Paris ?"
Expected:
  1. Intent detect → SEARCH (regex)
  2. Script: curl wttr.in/Paris → JSON
  3. Format → réponse sans LLM
  4. LLM calls: 0
  Latence: < 500ms
```

### 2.2 Message → LLM → Réponse
```
Input: "rédige un email professionnel pour X"
Expected:
  1. Intent detect → CREATE
  2. Pas de script possible
  3. Brief focalisé construit (< 2K tokens)
  4. Groq free appelé
  5. Réponse formatée
```

### 2.3 Relay chain complet
```
Input: "analyse complète de l'architecture REX et propose des améliorations"
Expected:
  1. Ollama → confidence 0.4 → passReason "contexte trop complexe"
  2. Groq → confidence 0.7 → passReason "décision stratégique nécessite plus"
  3. Claude Sonnet → conclusion
  4. RelayDocument correctement rempli
  5. Trace auditable disponible
```

### 2.4 Cycle sommeil complet
```
Simuler: 3h d'inactivité
Expected:
  1. sleepScore > 70 → état SLEEPING
  2. Tâches nocturnes déclenchées (npm audit, memory compaction)
  3. Seul Ollama appelé (0 paid)
  Simuler: message entrant le matin
  4. WAKING_UP → morning digest envoyé
  5. Retour AWAKE_ACTIVE
```

### 2.5 Provisioning client
```
rex client:create --template dg --name "test-client"
Expected:
  1. Container Docker créé
  2. Template DG installé
  3. Port unique assigné
  4. Commander peut voir les logs
  5. Isolation : test-client ne voit pas les données Kevin
```

---

## 3. SCÉNARIOS EDGE CASES (les trucs qu'on oublie)

### 3.1 Quota LLM épuisé en pleine tâche
```
Simuler: Groq quota = 0 restant
Expected:
  - Fallback automatique vers Ollama
  - Aucune erreur visible pour l'user
  - Log du fallback dans event journal
  - Notification si ALL quotas épuisés
```

### 3.2 VPS network failure (reconnexion)
```
Simuler: coupure réseau 30 secondes
Expected:
  - daemon.ts survit (process pas killed)
  - Queue des messages pendant la coupure
  - Replay des messages en attente au retour
  - Aucun message perdu
```

### 3.3 Fleet node déconnecté en milieu de tâche
```
Simuler: Mac se met en veille pendant une tâche longue
Expected:
  - BRAIN détecte la déconnexion (heartbeat timeout)
  - Tâche reroutée vers autre node ou VPS
  - User notifié si tâche abandonnée
  - Pas de zombie process
```

### 3.4 Messages simultanés (concurrence)
```
Simuler: 5 messages Telegram en 1 seconde
Expected:
  - Queue ordonnée, pas de réponses croisées
  - Chaque message a sa propre trace
  - Pas de race condition sur la mémoire
```

### 3.5 Mémoire corrompue / SQLite locked
```
Simuler: sqlite-vec corrompu ou locked
Expected:
  - Fallback vers BM25 text search
  - Log d'erreur + alerte Kevin
  - Pas de crash total de REX
```

### 3.6 Docker container client KO
```
Simuler: container crash ou OOM kill
Expected:
  - watchdog.ts détecte dans 60s
  - Restart automatique
  - Snapshot restauré si nécessaire
  - Kevin notifié
```

### 3.7 Budget dépassé (daily limit)
```
Simuler: spent_today > daily_limit
Expected:
  - Basculement automatique free-only
  - User notifié : "Budget quotidien atteint, mode économie activé"
  - LLM paid bloqué jusqu'à minuit
  - Scripts et Ollama continuent normalement
```

### 3.8 API key expirée / révoquée
```
Simuler: Claude API key invalide
Expected:
  - Erreur 401 catchée proprement
  - Fallback vers Groq/Ollama
  - Alerte Kevin : "Clé Claude expirée, renouveler"
  - Pas de retry loop infini
```

### 3.9 Encoding / Caractères spéciaux (French!)
```
Input: "ça marche avec les accents, les emojis 🔥 et le français ?"
Expected:
  - Pas de corruption en SQLite
  - Emojis préservés dans les réponses Telegram
  - Intent regex fonctionne avec accents
```

### 3.10 Très long message (> context window)
```
Input: coller 50K tokens de texte
Expected:
  - Chunking automatique
  - Pas de crash LLM avec 413/400
  - Résumé partiel possible
```

---

## 4. CE QU'ON N'A PAS ENCORE PENSÉ (penser loin)

### Observabilité
- [ ] **OpenTelemetry** — traces distribuées (chaque appel LLM, chaque script)
- [ ] **Langfuse** — dashboard LLM : latences, coûts, qualité réponses
- [ ] `/health` endpoint — pour monitoring externe (Uptime Robot, etc.)
- [ ] Alertes PagerDuty/Telegram si REX down > 5min

### Migrations de données
- [ ] Schema SQLite versioned (`migrations/001_initial.sql`, etc.)
- [ ] `rex upgrade` → migre la DB automatiquement sans perte
- [ ] Test : vieille mémoire v1 fonctionne après upgrade v2

### Backup & Recovery
- [ ] Backup automatique SQLite vers S3/Backblaze ou local
- [ ] `rex backup` / `rex restore`
- [ ] Test : VPS wipe complet → restauration en < 15min

### Graceful shutdown
- [ ] SIGTERM → finir les tâches en cours proprement
- [ ] Pas de messages à moitié envoyés
- [ ] State sauvegardé avant extinction

### Log rotation
- [ ] Logs bornés à 100MB → rotation automatique
- [ ] Event journal archivé après 30 jours (pas supprimé, compressé)
- [ ] Disk space monitoring : alerte si < 2GB free

### Secret rotation
- [ ] Si clé API leakée → `rex secrets:rotate` → re-chiffre tout
- [ ] Secrets chiffrés au repos (pas en plain text dans .env)

### Cold start
- [ ] Temps de démarrage REX from scratch → objectif < 5 secondes
- [ ] Lazy loading des modules non-critiques
- [ ] Benchmark cold start dans CI

### Load testing
- [ ] `rex test:load --rps 10 --duration 60`
- [ ] Combien de messages/seconde avant dégradation ?
- [ ] Memory leak test sur 24h de run continu

### Multi-timezone
- [ ] Kevin = Paris. Client DG = autre timezone ?
- [ ] Tous les timestamps en UTC en base, conversion à l'affichage
- [ ] Crons avec timezone explicite (`cron.tz = "Europe/Paris"`)

### Accessibilité API (fleet)
- [ ] Versioning de l'API BRAIN ↔ FLEET : `/api/v1/`, `/api/v2/`
- [ ] Breaking changes annoncés → migration guidée
- [ ] Fleet node old version → BRAIN backwards compatible ?

---

## 5. PREREQUIS TECHNIQUES À INSTALLER

```bash
# Testing framework
npm install -D vitest @vitest/coverage-v8 supertest

# E2E
npm install -D playwright  # ou Puppeteer pour les tests UI

# Mocks
npm install -D msw  # Mock Service Worker pour les API calls

# Load testing
npm install -D autocannon  # ou k6

# Observability
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node

# Process management
npm install -D wait-on  # attendre qu'un service soit up avant de tester
```

---

## 6. STRUCTURE DES TESTS

```
tests/
  unit/
    intent-detect.test.ts      ← regex patterns
    relay-engine.test.ts       ← relay chain logic
    budget.test.ts             ← calcul coûts
    user-cycles.test.ts        ← XState transitions
  integration/
    gateway.test.ts            ← flow complet message → réponse
    memory.test.ts             ← search, update, compaction
    fleet.test.ts              ← join, leave, task delegation
    account-pool.test.ts       ← rotation, quota detection
  e2e/
    happy-path.test.ts         ← scénarios §2
    edge-cases.test.ts         ← scénarios §3
    sleep-cycle.test.ts        ← cycle complet sommeil
    client-provision.test.ts   ← rex client:create
  fixtures/
    mock-llm-server.ts         ← serveur LLM fake
    mock-activitywatch.ts      ← AW fake
    test-memory.sqlite         ← DB de test
    test-kevin-context.ts      ← contexte fictif
```

---

## 7. CI/CD PIPELINE

```yaml
# .github/workflows/test.yml
on: [push, pull_request]

jobs:
  unit:       → rapide (< 1min), toujours
  integration: → moyen (< 5min), sur PR
  e2e:        → lent (< 15min), avant merge main
  load:       → weekly, sur main seulement
```

---

## 8. SKILL À CRÉER : `rex-test-runner`

Skill OpenClaw ou commande REX pour lancer les tests :
```bash
rex test              → unit + integration
rex test:e2e          → tous les E2E
rex test:edge         → edge cases seulement
rex test:load         → load test 60s
rex test:report       → rapport complet avec coûts estimés
```

REX peut se tester lui-même via CURIOUS en tâche nocturne.
Si regression détectée → alerte Kevin le matin.
