# REX — TODO LIST FOR OPUS
*Préparé le 2026-03-04 par Milo. Version 2 — mise à jour 21:08 UTC*
*Repo : https://github.com/Keiy78120/rex*

---

## VISION

REX n'est pas un linter. C'est un **compagnon de développement senior** qui :
- Surveille chaque action dans Claude Code
- Apprend de tout ce que Kevin fait (code, audio, clipboard, réflexions)
- Orchestre des outils de qualité comme un vrai lead dev
- Ne laisse rien passer avant un deploy
- Enseigne les bonnes pratiques en temps réel
- Ne ment jamais — si pas sûr → dit "je ne sais pas"

Stack : TypeScript monorepo (pnpm), Tauri+React (app), SQLite (storage), bash (guards).

---

## BLOC 1 — MÉMOIRE CROSS-SESSION (PRIORITÉ CRITIQUE)

### 1.1 Session Summary — capturer les décisions, pas juste le git state
**Fichier :** `packages/cli/src/guards/session-summary.sh`
**Problème actuel :** sauvegarde uniquement branch + fichiers modifiés. Inutile.

**À faire :**
- Extraire depuis le transcript Claude Code :
  - Décisions prises ("on a choisi X plutôt que Y parce que...")
  - Blockers non résolus
  - Feature en cours + état d'avancement
  - Commandes importantes exécutées
- Format YAML dans `~/.claude/projects/<project>/memory/last-session.md`
- Inclure : timestamp, branche, résumé décisionnel, next steps

### 1.2 SessionStart — injection de contexte automatique
**Problème actuel :** `rex-context.sh` ne fait rien (set juste une env var vide).

**À faire :**
- Au SessionStart, lire le dernier `last-session.md` du projet courant
- L'injecter dans `CLAUDE_ENV_FILE` comme contexte système
- Format : "Dernière session [date] : [résumé]. En cours : [feature]. Blockers : [liste]."
- Si pas de mémoire → skip silencieux

### 1.3 rex context — nouvelle commande
```
rex context          # génère un CONTEXT.md depuis les 5 dernières sessions
rex context --inject # injecte dans CLAUDE.md du projet courant
```
- Lire les N derniers `last-session.md`
- Dédupliquer, résumer les patterns récurrents
- Écrire un CONTEXT.md propre, injectable

---

## BLOC 2 — LOGGING UNIVERSEL MAC

### 2.1 Capture audio — réunions et meetings
**Nouveau package :** `packages/logger/`

- Enregistrement audio continu en background (optionnel, on/off)
- Transcription via Whisper local (whisper.cpp déjà dans Tauri app)
- Storage : `~/.rex/logs/audio/YYYY-MM-DD/HH-MM.md`
- Format : timestamp + transcript + speaker diarization si possible
- Cron : transcription différée toutes les 30 min si Whisper tourne en local

### 2.2 Clipboard logger
- Hook sur clipboard change (macOS API via Tauri)
- Log tout ce qui est copié : texte, URL, code
- Storage : `~/.rex/logs/clipboard/YYYY-MM-DD.jsonl`
- Filtre : ne pas logger les passwords (détecter via patterns type `sk-`, `ghp_`, etc.)
- Accessible via `rex search "ce que j'ai copié sur X"`

### 2.3 Keystroke logger (réflexions, brouillons)
- Capturer tout ce qui est tapé (pas seulement dans Claude Code)
- Storage par app : `~/.rex/logs/keystrokes/<app>/YYYY-MM-DD.txt`
- Résumé automatique toutes les heures par modèle local
- **Privacy guard OBLIGATOIRE :** blacklist 1Password, Bitwarden, terminal sudo, navigateurs sur champs password

### 2.4 Action logger générique
- Log app focus, URL visitées, fichiers ouverts
- Via macOS Accessibility API + Tauri
- Storage : `~/.rex/logs/actions/YYYY-MM-DD.jsonl`

---

## BLOC 3 — MODÈLES LOCAUX + ROUTING INTELLIGENT

### 3.1 Hiérarchie de modèles
```
Tâche → REX Router → [Ollama local]   : résumé, compression, search, classification
                   → [Claude Haiku]   : analyse code, correction, reformulation
                   → [Claude Sonnet]  : implémentation, debug, architecture
                   → [Claude Opus]    : décisions critiques uniquement
```

**Règles strictes :**
- Local uniquement : résumé, compression, déduplication, embedding, classification
- Jamais de code critique traité en local
- Si modèle local crash → fallback automatique Haiku sans bloquer

### 3.2 Auto-setup modèles locaux
**Commande :** `rex models setup`

- Vérifier Ollama installé → installer si absent (homebrew ou direct)
- Détecter RAM disponible → choisir modèles adaptés :
  - 8GB RAM : `nomic-embed-text` + `llama3.2:3b` seulement
  - 16GB RAM : + `qwen2.5-coder:7b`
  - 32GB+ RAM : + modèles plus lourds en option
- Pull automatique des modèles nécessaires
- Config dans `~/.rex/config.json`

### 3.3 Crons automatiques (tout tourne sans action post-setup)
```
Toutes les heures    → rex ingest (indexer sessions Claude Code)
Toutes les heures    → rex compress (résumer logs audio/clipboard)
Toutes les 6h        → rex context --inject (refresh CLAUDE.md projets actifs)
Chaque nuit 3h       → rex distill (distiller mémoire, virer doublons)
Au login             → rex doctor (health check silencieux)
Au login             → rex models check (vérifier modèles disponibles)
```
- LaunchAgents macOS + systemd Linux (les deux)

### 3.4 Fallback sécurisé
- Si Ollama down → task en queue, retry dans 10 min
- Si retry 3x → escalade Haiku API
- Log des fallbacks dans `~/.rex/logs/model-fallbacks.jsonl`
- Jamais bloquer silencieusement

---

## BLOC 4 — REX AU CŒUR DE CLAUDE CODE

### 4.1 Auto-activation à chaque ouverture Claude Code
- `rex init` installe un hook SessionStart permanent
- À chaque nouvelle session :
  1. Injecter last-session context du projet courant
  2. Vérifier guards actifs (si manquants → réinstaller)
  3. Activer le logging
  4. Afficher : `REX active — memory loaded from [date] — [N] guards active`

### 4.2 rex watch — mode live
```
rex watch    # terminal sidebar : affiche les guards en temps réel
```
- Tail en live sur `~/.rex/logs/guards.log`
- Afficher : garde déclenché + fichier + action prise
- Color-coded : rouge=bloqué, jaune=warning, vert=ok

### 4.3 rex log — historique des guards
```
rex log              # dernières 50 entrées
rex log --today      # session du jour
rex log --guard ui   # filtrer par garde
```

---

## BLOC 5 — NOUVEAUX GUARDS LOCAUX

### 5.1 secret-guard.sh (CRITIQUE)
- Hook : PreToolUse (Write|Edit)
- Détecter : `sk-`, `ghp_`, `Bearer `, `password=`, `secret=`, clés hex 32+ chars
- Action : BLOQUER + message clair

### 5.2 any-type-guard.sh
- Hook : PostToolUse (Write|Edit)
- Détecter : `any` TypeScript ajoutés vs avant (git diff)
- Action : warning + suggestion de type correct

### 5.3 console-log-guard.sh
- Hook : PostToolUse (Write|Edit)
- Détecter : `console.log` hors `/tests/`
- Exceptions : `logger.`, `winston.`, fichiers de logging dédiés
- Action : warning + rappel d'utiliser le logger

### 5.4 a11y-guard.sh
- Hook : PostToolUse (Write|Edit TSX/JSX)
- Vérifier : images sans `alt`, buttons sans `aria-label`, inputs sans `label`
- Action : warning avec liste précise

### 5.5 perf-guard.sh
- Hook : PostToolUse (Write|Edit)
- Détecter : `useEffect` sans deps, appels API dans boucles, `new Date()` dans render
- Action : warning + explication

### 5.6 import-guard.sh
- Hook : PostToolUse (Write|Edit TS/JS)
- Détecter : imports non utilisés
- Action : warning + liste

---

## BLOC 6 — CODE REVIEW AUTOMATISÉ (NIVEAU SENIOR DEV)

C'est le bloc le plus important pour éviter les erreurs de deploy.
REX orchestre plusieurs outils de review en parallèle — tous gratuits (open source ou free tier).

### 6.1 Stack de review multi-couches

| Outil | Free tier | Ce qu'il fait |
|-------|-----------|--------------|
| **CodeRabbit** | Gratuit open source | Review IA complète sur chaque PR, contextuelle, conversationnelle |
| **DeepSource** | Gratuit open source | SAST + sécurité + qualité, 40+ intégrations |
| **SonarCloud** | Gratuit open source | Code smells, coverage, duplications, security hotspots |
| **Snyk** | Free tier (200 scans/mois) | Vulnérabilités deps + code |
| **GitHub Actions** | 2000 min/mois | CI/CD pipeline complet |
| **Biome** | Open source | Linter + formatter ultra-rapide (remplace ESLint+Prettier) |
| **Vitest** | Open source | Tests unitaires + coverage |
| **Playwright** | Open source | Tests E2E |

### 6.2 rex review — commande de review locale avant push
```
rex review           # review complète avant commit/push
rex review --quick   # checks rapides (< 5s) seulement
rex review --pre-push # mode gate : bloque si critique
```

**Pipeline interne de `rex review` :**
```
1. Biome lint + format check        (local, < 1s)
2. TypeScript strict check          (local, tsc --noEmit)
3. Tests unitaires                  (vitest --run)
4. Guards REX locaux                (5 guards)
5. npm audit / pnpm audit           (sécurité deps)
6. Snyk test (si token configuré)   (vulnérabilités)
7. Coverage check (> seuil config)  (vitest --coverage)
8. Bundle size check (si web)       (size-limit)
```

Si un check échoue → BLOQUE avec message précis. Jamais de deploy avec red.

### 6.3 rex review --ai — review IA avant PR
```
rex review --ai      # soumet diff à Claude Haiku pour review
rex review --ai --full  # Sonnet pour review complète
```
- Génère le diff de la branche vs main
- Envoie à Claude avec le contexte projet (CLAUDE.md + last-session.md)
- Reçoit : liste de problèmes, suggestions, verdict (ready / issues / blocker)
- Sauvegarde le rapport dans `~/.rex/reviews/<date>-<branch>.md`

### 6.4 Intégration GitHub Actions (auto-configurée par rex init)
**Fichier généré :** `.github/workflows/rex-ci.yml`

```yaml
name: REX CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm biome check .
      - run: pnpm tsc --noEmit
      - run: pnpm test --coverage
      - run: pnpm audit
  coderabbit:
    if: github.event_name == 'pull_request'
    # CodeRabbit s'active automatiquement si configuré dans le repo
  sonarcloud:
    uses: SonarSource/sonarcloud-github-action@master
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### 6.5 Setup CodeRabbit (rex init --review)
```
rex init --review
```
- Guide interactif pour configurer CodeRabbit sur le repo GitHub
- Crée `.coderabbit.yaml` avec les bonnes règles projet
- **Free pour repos open source**

### 6.6 DeepSource setup (rex init --review)
- Crée `.deepsource.toml` adapté au projet (TypeScript/Flutter/Python)
- **Gratuit open source**, analyse à chaque push

### 6.7 Pre-commit hooks (husky + lint-staged)
**Installés par `rex init` :**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["biome check --apply", "tsc --noEmit --skipLibCheck"],
    "*.{dart}": ["dart format", "dart analyze"],
    "**/*.{ts,tsx,js,dart}": ["rex review --quick"]
  }
}
```

### 6.8 Conventional Commits (enforced)
- `commitlint` configuré par `rex init`
- Format : `type(scope): description`

---

## BLOC 7 — WORKFLOWS SENIOR DEV (REX t'accompagne)

### 7.1 rex workflow new-feature
```
rex workflow new-feature "nom de la feature"
```
1. Crée branche `feat/<nom>` depuis `develop`
2. Crée fichier `FEATURE.md` avec template
3. Crée le ticket dans le CLAUDE.md du projet
4. Active le skill `feature-development.md`

### 7.2 rex workflow bug-fix
```
rex workflow bug-fix "description du bug" [--issue 42]
```
1. Crée branche `fix/<description>`
2. Injecte le skill `debug.md` dans le contexte
3. Crée `BUG.md` : étapes de repro, hypothèses, solution appliquée
4. Force un test qui reproduit le bug avant de commencer

### 7.3 rex workflow pr
```
rex workflow pr
```
1. Run `rex review` complet — BLOQUE si rouge
2. Vérifie coverage > seuil
3. Génère description PR depuis l'historique commits + FEATURE.md
4. Ouvre la PR sur GitHub avec la description pré-remplie
5. Assigne CodeRabbit automatiquement

### 7.4 rex workflow deploy
```
rex workflow deploy [staging|prod]
```
Gate de sécurité avant deploy :
1. `rex review --pre-push` → BLOQUE si moindre rouge
2. Vérifier que CI est vert
3. Vérifier que PR a été review (pas de self-merge)
4. Pour prod : confirmation explicite requise
5. Après deploy : `rex log deploy` pour traçabilité

### 7.5 rex skill <nom> — injection de contexte expert
```
rex skill debug/testing/refactor/api/git/perf/security/ui/flutter
```
Auto-injection par détection de contexte.

---

## BLOC 8 — COACHING SENIOR DEV EN TEMPS RÉEL

### 8.1 Correction automatique
Hook `UserPromptSubmit` : si Kevin dit quelque chose d'incorrect, REX ajoute une correction au contexte silencieusement.

### 8.2 Honesty guard (RÈGLE ABSOLUE)
- Claude ne peut pas dire "c'est fait" / "ça marche" sans preuve
- Preuve acceptable : output de test, screenshot, curl response, build log

### 8.3 Tech debt tracker
- Chaque `// TODO`, `// FIXME`, `// HACK` ajouté → loggé dans `TECH_DEBT.md`
- `rex debt` → liste la dette technique du projet
- `rex debt --old 7` → dettes de plus de 7 jours non résolues

---

## BLOC 9 — GATEWAY REMOTE + TELEGRAM

### 9.1 rex gateway — serveur de contrôle à distance
```
GET  /status    → health REX + modèles + mémoire
GET  /logs      → derniers logs
POST /command   → exécuter une commande REX à distance
GET  /context   → contexte mémoire actuel
POST /inject    → injecter du contexte dans la prochaine session
```

### 9.2 Telegram bot integration
Notifications proactives + commandes Telegram → REX.

---

## BLOC 10 — FLUTTER APP (REFONTE LIQUID GLASS)

### 10.1 Design System — Liquid Glass
Inspiration : Apple visionOS / iOS 26 — translucent frosted glass, depth layers

### 10.2 Screens Flutter (5 screens)
1. Dashboard (StatusOrb, 3 glass cards, feed live)
2. Memory Browser (timeline, semantic search)
3. Code Quality (Biome/Tests/Coverage/Snyk/SonarCloud statuts)
4. Models (Ollama status, modèles installés, stats)
5. Settings (toggles logging, Telegram, blacklist, seuils, budget)

---

## BLOC 11 — ROUTING DYNAMIQUE INTELLIGENT

### 11.1 rex decide — moteur de décision
```typescript
'summarize'   + tokens<2k    → local
'compress'                   → local
'search'                     → local (embeddings)
'review'      + complexity=low  → haiku
'code'        + complexity=low  → haiku
'debug'       + complexity=med  → sonnet
'architect'                  → sonnet
'code'        + complexity=high → sonnet
// Opus = uniquement si Kevin le demande explicitement
```

### 11.2 Budget tracker
- Compter tokens API par jour/mois
- Si budget dépassé → fallback local forcé
- `rex budget` → consommation du mois

---

## ORDRE D'IMPLÉMENTATION

```
Phase 1 — Fondations (1-2 semaines)
  Bloc 1   : Cross-session memory
  Bloc 3.3 : Crons automatiques
  Bloc 4.1 : Auto-activation Claude Code
  Bloc 6.7 : Pre-commit hooks (husky + lint-staged)

Phase 2 — Qualité (1 semaine)
  Bloc 5   : 6 nouveaux guards locaux
  Bloc 6.1 : Stack review (CodeRabbit + DeepSource + SonarCloud)
  Bloc 6.2 : rex review command
  Bloc 6.4 : GitHub Actions CI

Phase 3 — Workflows (1 semaine)
  Bloc 7   : rex workflow (new-feature, bug-fix, pr, deploy)
  Bloc 8   : Coaching + honesty guard + tech debt
  Bloc 6.5 : CodeRabbit + DeepSource setup automatique

Phase 4 — Logging universel (1-2 semaines)
  Bloc 2   : Audio + clipboard + keystrokes
  Bloc 3.1 : Modèles locaux auto-setup
  Bloc 11  : Routing dynamique

Phase 5 — Remote + UI (1-2 semaines)
  Bloc 9   : Gateway + Telegram
  Bloc 10  : Flutter refonte Liquid Glass
```

---

## CONTRAINTES TECHNIQUES (NON NÉGOCIABLES)

1. **Zero breaking change** — tout additionnel, backward compatible
2. **Local-first** — données jamais hors machine sans consentement
3. **Modèles locaux = tâches simples uniquement** — jamais de code critique
4. **Fallback chain obligatoire** : local → haiku → sonnet → jamais bloquer
5. **Privacy by default** — blacklist apps sensibles pour le keylogger
6. **TypeScript strict partout** — zéro `any`, zéro `// @ts-ignore`
7. **Tests pour chaque nouvelle commande** — pas de merge sans tests
8. **Conventional commits** — enforced partout
9. **REX ne ment jamais** — si pas sûr → "je ne sais pas" + vérifier
10. **Deploy gate** — jamais de push en prod avec CI rouge ou sans review

---

## OUTILS GRATUITS À CONFIGURER

| Outil | Usage | Free tier |
|-------|-------|-----------|
| CodeRabbit | Review IA sur PR | illimité open source |
| DeepSource | SAST + sécurité statique | illimité open source |
| SonarCloud | Code quality + coverage | illimité open source |
| Snyk | Vulnérabilités deps | 200 scans/mois |
| GitHub Actions | CI/CD pipeline | 2000 min/mois |
| Biome | Lint + format | open source |
| Ollama | Modèles locaux | gratuit (local) |
| Husky | Pre-commit hooks | open source |

**Total coût :** 0 EUR pour un repo public open source.

---

## NOTES D'INVESTIGATION (ajoutées par REX 2026-03-07)

### PRs ouvertes par Milo sur le repo REX
- **PR #4** : Split CLAUDE.md en `.claude/rules/`, package CLAUDE.md files, fix install.sh
- **PR #5** : Skills, GitHub Actions templates, accounts.ts, project_init.ts, router updates, preload.ts rewrite

### Rate limit du 2026-03-07
- **Source** : Milo (milo-openclaw container) a épuisé la window Claude Pro 5h
- **Modèle** : `anthropic/claude-sonnet-4-6` — 3 grosses tâches consécutives (17h-19h UTC)
- **Fallbacks crashés** : Haiku (même provider), Mistral, OpenRouter free — tous rate limited
- **Garry** (openclaw-bot) aussi rate limited via heartbeat toutes les 30min sur GPT-5.2

---

*Todo v2 généré par Milo le 2026-03-04 21:08 UTC*
*Sauvegardé dans rex/docs/plans/ par REX le 2026-03-07*
