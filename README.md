<h1 align="center">REX</h1>

<p align="center">
  <strong>Claude Code sous steroides</strong><br>
  Installe, oublie, Claude Code fait moins de conneries.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rex-claude"><img src="https://img.shields.io/npm/v/rex-claude?color=blue&label=npm" alt="npm" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
  <img src="https://img.shields.io/badge/zero_deps-black" alt="zero deps" />
</p>

---

## C'est quoi ?

Claude Code est puissant mais fait toujours les memes erreurs. REX ajoute des **gardes automatiques** qui surveillent Claude en arriere-plan et l'empechent de faire n'importe quoi.

**En une phrase :** REX = un filet de securite pour Claude Code.

## Install

```bash
npm install -g rex-claude
rex install
```

C'est tout. Tout est automatique apres ca.

## Ce que REX fait

### Il empeche Claude de faire des betises

| Garde | Ce qu'il fait |
|-------|--------------|
| **Completion** | Empeche Claude de dire "done" quand il reste des TODO ou des fonctions vides |
| **Dangerous Command** | Bloque les commandes dangereuses (`rm -rf`, `git push --force main`) |
| **Test Protector** | Alerte quand Claude modifie les tests au lieu de fixer le code |
| **UI Checklist** | Verifie que chaque composant gere le loading, l'erreur et le vide |
| **Scope Guard** | Alerte quand Claude touche trop de fichiers (> 8) |
| **Session Summary** | Sauvegarde l'etat du travail a chaque fin de session |

### Il surveille ta config

```bash
rex doctor    # 55 checks, 9 categories
rex status    # une ligne rapide
```

### Il se souvient de tout (optionnel)

Avec [Ollama](https://ollama.ai), REX transforme tes sessions Claude Code en base de connaissances searchable :

```bash
rex ingest                              # indexe tes sessions
rex search "comment j'ai fix le bug X"  # recherche semantique
```

### Il tourne tout seul

- Health check toutes les heures (LaunchAgent macOS)
- Auto-ingest des sessions toutes les heures
- Gateway Telegram + call watcher au demarrage du Mac

## Commandes

| Commande | Description |
|----------|-------------|
| `rex install` | One-command install (init + setup + audit) |
| `rex init` | Setup complet (gardes, hooks, LaunchAgents) |
| `rex setup --yes` | Setup non-interactif (deps + Ollama + models) |
| `rex audit` | Audit d'integration des fonctionnalites |
| `rex doctor` | Health check detaille |
| `rex status` | Status en une ligne |
| `rex startup` | Installer le demarrage auto |
| `rex startup-remove` | Retirer le demarrage auto |
| `rex ingest` | Indexer les sessions (Ollama) |
| `rex search <query>` | Recherche semantique (Ollama) |
| `rex optimize` | Analyser CLAUDE.md (Ollama) |
| `rex call status` | Etat detection d'appel (Hammerspoon) |
| `rex call watch` | Auto start/stop audio logger sur event d'appel |
| `rex voice transcribe` | Transcrire le dernier WAV (whisper-cli) |
| `rex voice set-optimize on/off` | Activer l'optimisation prompt post-transcription |
| `rex audio start/stop` | Controle enregistrement audio (ffmpeg) |

## Architecture

```
rex-claude (npm, 12KB, zero deps)
├── 6 gardes bash          ~/.claude/rex-guards/
├── 9 categories de checks  rex doctor
├── 4 LaunchAgents          health + ingest + gateway + call-watch
└── hooks Claude Code       SessionStart/End, Stop, PreToolUse, PostToolUse

rex-app (Flutter, macOS)
├── UI desktop              health + memory + gateway + optimize
└── voice/audio             call detection + audio logger (Hammerspoon + ffmpeg)
```

## Prerequis

- Node.js 20+
- Claude Code
- macOS ou Linux

**Optionnel :** Ollama + `nomic-embed-text` pour la memoire

## License

[MIT](LICENSE) — D-Studio
