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
rex init
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
- App menubar au demarrage du Mac

## Commandes

| Commande | Description |
|----------|-------------|
| `rex init` | Setup complet (gardes, hooks, LaunchAgents) |
| `rex doctor` | Health check detaille |
| `rex status` | Status en une ligne |
| `rex startup` | Installer le demarrage auto |
| `rex startup-remove` | Retirer le demarrage auto |
| `rex ingest` | Indexer les sessions (Ollama) |
| `rex search <query>` | Recherche semantique (Ollama) |
| `rex optimize` | Analyser CLAUDE.md (Ollama) |

## Architecture

```
rex-claude (npm, 12KB, zero deps)
├── 6 gardes bash          ~/.claude/rex-guards/
├── 9 categories de checks  rex doctor
├── 2 LaunchAgents          health + ingest auto
└── hooks Claude Code       SessionStart/End, Stop, PreToolUse, PostToolUse

rex-app (Tauri, optionnel)
├── menubar macOS           status en temps reel
└── voice transcription     whisper.cpp
```

## Prerequis

- Node.js 20+
- Claude Code
- macOS ou Linux

**Optionnel :** Ollama + `nomic-embed-text` pour la memoire

## License

[MIT](LICENSE) — D-Studio
