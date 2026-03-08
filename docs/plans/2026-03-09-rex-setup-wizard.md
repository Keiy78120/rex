# REX Setup Wizard — Zero-Config Onboarding

*Rédigé le 2026-03-09 — vision d'onboarding pour nouvel utilisateur REX.*

---

## Le Problème

REX est puissant mais actuellement impossible à configurer sans connaître la stack.
Un nouvel utilisateur ne sait pas :
- Quoi installer (Ollama ? Quels modèles ?)
- Quelle machine est le "cerveau" de sa flotte
- Quels providers API il peut utiliser (ses clés, ses abonnements)
- Quelles fonctionnalités activer ou ignorer

**Objectif : un wizard qui transforme n'importe quel setup en REX fonctionnel en < 5 minutes.**

---

## Architecture du Wizard

### Canal 1 : CLI (`rex setup` ou `rex wizard`)

TUI interactif (terminal UI avec prompts, selections, progress).
Adapté aux serveurs headless, VPS, CI/CD.

```bash
rex setup         # Wizard complet
rex setup --quick # Détection auto, valide et configure sans questions
rex setup --reset # Recommence depuis zéro
```

### Canal 2 : Flutter (page Setup / Onboarding)

Premier lancement de l'app → page wizard en plein écran.
Même étapes que CLI, mais interface graphique.
Peut aussi être relancé depuis Settings > "Reconfigure".

---

## Les 5 Étapes du Wizard

### Étape 1 : Inventaire de ta flotte

**Question :** "Quelles machines feront partie de ta flotte REX ?"

```
☑ Mac principal (cette machine — détecté automatiquement)
☐ VPS (Linux headless)
☐ PC Windows
☐ Linux desktop/workstation
☐ NAS (Synology, TrueNAS, etc.)
☐ Raspberry Pi / ARM Linux
☐ GPU node (CUDA, Apple Silicon)
☐ Autre (custom SSH)
```

Pour chaque machine sélectionnée (hors celle-ci) :
- IP / hostname
- Port SSH + clé
- REX va tester la connexion (ping + SSH) en temps réel

**REX détecte automatiquement :**
- Machines sur le même réseau local (mDNS + arp-scan)
- Nodes Tailscale déjà connectés (`tailscale status`)
- Machines accessibles via SSH avec clés existantes

---

### Étape 2 : Désignation du Cerveau

**Question :** "Quelle machine sera le hub central REX ?"

```
○ Mon Mac (cette machine)
  ↳ Bien pour solo dev, mais éteint quand tu fermes l'ordi

● VPS (RECOMMANDÉ)
  ↳ Toujours allumé, gateway Telegram H24, sync permanent
  ↳ REX configure automatiquement : systemd, daemon, gateway

○ NAS
  ↳ Bon pour stockage, moins pour compute

○ PC Linux dédié
  ↳ Toujours allumé, bon compute, pas de mobilité
```

**Conséquences du choix :**
- Hub = machine qui tourne `rex daemon` en permanence
- Hub = machine qui héberge le gateway Telegram
- Hub = point de sync pour toutes les memories
- REX installe automatiquement les services appropriés (LaunchAgent / systemd / cron)

---

### Étape 3 : Fonctionnalités à Activer

**Question :** "Quelles fonctionnalités veux-tu activer ?"

```
Core (toujours actif, non désélectionnable)
☑ Mémoire sémantique (sessions → SQLite + embeddings)
☑ Doctor / health check
☑ CLI complet

Optionnel
☑ Gateway Telegram (commandes depuis mobile)
  ↳ Nécessite : bot token + chat ID
☐ Agents autonomes (Claude Code, Codex en background)
  ↳ Nécessite : compte Claude Max ou OpenAI
☑ MCP marketplace (install one-click de serveurs MCP)
☐ Sync multi-machine (memories partagées entre nodes)
  ↳ Nécessite : hub désigné + Tailscale ou SSH
☐ Backup automatique (SQLite + config, daily)
  ↳ Nécessite : espace disque suffisant (recommandé : NAS ou VPS)
☐ Revue de code automatique (lint + secret scan + tests)
  ↳ Nécessite : projet git configuré
☐ Self-improvement (extraction de leçons → règles CLAUDE.md)
  ↳ Expérimental
```

---

### Étape 4 : Détection des Ressources IA

REX scanne **automatiquement** ce qui est disponible :

#### 4a. Local LLMs

```
🔍 Scanning Ollama...

● Ollama détecté (http://localhost:11434)
  Modèles disponibles :
  ✓ nomic-embed-text — requis pour la mémoire ✓
  ✓ qwen2.5:1.5b — rapide, classify/ingest
  ✓ qwen3.5:9b — puissant mais lent (déconseillé pour ingest auto)
  ✗ deepseek-r1 — absent

  Recommandations REX :
  → Ingest classify : qwen2.5:1.5b (le plus rapide)
  → Gateway LLM : qwen3.5:4b (équilibre)
  → Embeddings : nomic-embed-text ✓

○ Pas d'autres runtimes détectés (llamafile, LocalAI...)
```

#### 4b. Free Tier APIs

```
🔍 Scanning API keys...

● GROQ_API_KEY détectée — Groq Free Tier
  → 30 RPM · llama-3.1-70b-versatile
● TOGETHER_API_KEY détectée — Together AI
  → 60 RPM · meta-llama/Llama-3-70b-chat-hf
✗ CEREBRAS_API_KEY — absent
✗ OPENROUTER_API_KEY — absent

Clés manquantes ? Tu peux les ajouter maintenant ou plus tard dans Settings.
[Ajouter une clé API]
```

#### 4c. Abonnements détectés

```
🔍 Scanning subscriptions...

● Claude Code (claude CLI détecté)
  → Auth status : ✓ Connecté
  → Plan : Max (Opus + Sonnet)
  → Rate limits : auto-géré par REX

✗ Codex CLI (openai/codex) — non installé
  [Installer Codex]

✗ ChatGPT Plus — non configuré
```

#### 4d. Recommandation REX

Après le scan, REX propose une configuration optimisée :

```
REX recommande pour ton setup :

Routing LLM :
1. Ollama (qwen2.5:1.5b) — ingest classify, réponses courtes
2. Groq free (llama-3.1-70b) — questions complexes, gratuit
3. Claude Code (Sonnet) — code, architecture, PR
4. Together AI (llama-3-70b) — fallback gratuit
5. API Anthropic — dernier recours (payant)

Orchestrators :
● Claude Code — dev principal
✗ Codex — non installé (optionnel)

Désélectionner ce que tu ne veux pas :
☑ Ollama  ☑ Groq  ☑ Claude Code  ☑ Together  ☐ API Anthropic
```

---

### Étape 5 : Validation et Setup Automatique

REX configure tout sans intervention manuelle :

```
Configuration en cours...

[1/8] ✓ Config écrite → ~/.claude/settings.json
[2/8] ✓ DB initialisée → ~/.claude/rex/memory/rex.sqlite
[3/8] ✓ LaunchAgent daemon → ~/Library/LaunchAgents/com.dstudio.rex-daemon.plist
[4/8] ✓ LaunchAgent ingest → ~/Library/LaunchAgents/com.dstudio.rex-ingest.plist
[5/8] ✓ Guards installés → ~/.claude/rex-guards/
[6/8] ✓ Hooks configurés → ~/.claude/settings.json hooks
[7/8] → VPS hub : connexion SSH...
      ✓ rex daemon installé via systemd
      ✓ rex gateway démarré
[8/8] ✓ Test de santé final...

REX est prêt.
─────────────────────────────
Hub : VPS (185.234.x.x)
Cerveau actif : ✓
Gateway Telegram : ✓ @claude_keiy_bot
Mémoire : 3057 chunks indexés
Providers : Ollama ✓, Groq ✓, Claude ✓
─────────────────────────────
Prochaine étape : rex doctor pour vérifier l'état complet
```

---

## Accès SSH / Fleet

Pour configurer les machines de la flotte, REX a besoin d'accès SSH.
Le wizard propose :

```
Comment veux-tu connecter ton VPS ?
○ SSH avec clé existante (~/.ssh/id_ed25519)
● Générer une nouvelle clé dédiée REX (~/.ssh/rex_key)
○ Tailscale (connexion directe sans SSH expo)
○ Mot de passe (déconseillé)
```

REX :
1. Génère la clé si besoin
2. Demande à l'user d'ajouter la clé publique au VPS (copiée dans le clipboard)
3. Teste la connexion
4. Installe `rex` sur le VPS via SSH
5. Configure le daemon + gateway en remote

---

## Cas Particuliers

### Setup Solo (1 machine)

Si l'user a qu'un Mac :
- Pas de hub VPS → daemon via LaunchAgent
- Gateway Telegram sur le Mac (éteint quand fermé — l'user est informé)
- Mémoire locale uniquement
- Tous les providers détectés, pas de sync

### Setup Minimaliste (no Ollama, no API keys)

Si rien n'est disponible :
- REX s'installe quand même (CLI, guards, hooks)
- Mémoire = sessions sans embed (plain text search)
- LLM features désactivées gracieusement
- Message : "Ajoute Ollama ou une API key pour débloquer la mémoire vectorielle"

### Setup Entreprise / Équipe

Future consideration :
- Wizard multi-user
- Hub partagé (VPS équipe)
- Permissions par machine

---

## Implémentation

### CLI Wizard (`packages/cli/src/setup-wizard.ts`)

```typescript
// Étapes du wizard
export async function runWizard(opts: { quick?: boolean }): Promise<void>

// Détection automatique
async function detectFleet(): Promise<DetectedNode[]>
async function detectResources(): Promise<ResourceSnapshot>
async function generateConfig(answers: WizardAnswers): Promise<RexConfig>
async function applyConfig(config: RexConfig): Promise<SetupResult>

// Installation distante
async function installOnRemote(node: FleetNode, config: RexConfig): Promise<void>
```

### Flutter Wizard

Page dédiée `setup_wizard_page.dart` avec :
- `Stepper` widget macOS style (5 steps)
- Chaque step = composant Flutter autonome
- Progress indicator
- Skip possible sauf step 3 (Core)
- Accessible depuis : premier lancement + Settings > "Reconfigure REX"

---

## Roadmap Wizard

| Phase | Ce qu'on fait | Priorité |
|-------|--------------|----------|
| **P1** | `rex setup --quick` : detect + apply sans questions | 🔴 HAUTE |
| **P2** | Wizard CLI complet (5 étapes, TUI interactif) | 🔴 HAUTE |
| **P3** | Wizard Flutter (pages dans l'app) | MOYENNE |
| **P4** | Remote install sur VPS via SSH | MOYENNE |
| **P5** | Wizard multi-machine avec Tailscale auto-join | BASSE |

**P1 à faire maintenant** : `rex setup --quick` qui détecte tout (Ollama, API keys, Claude, Tailscale) et génère automatiquement la config optimale dans `~/.claude/settings.json`. Aucune question — juste "REX a détecté X, Y, Z et configuré le routing optimal."
