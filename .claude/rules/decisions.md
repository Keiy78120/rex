# REX — Décisions passées importantes

## Commits et PRs

- **Pas de Co-Authored-By** dans les commits
- **Pas de mention Claude/AI** dans les commits ou descriptions de PR
- `pnpm build` obligatoire avant tout commit CLI
- `flutter build macos --debug` + test app avant commit Flutter

## Build

- **tsup** pour le build CLI (pas esbuild direct, pas tsc seul) — bundle + types
- **pnpm** comme package manager (pas npm ni yarn) au niveau monorepo
- `npm install` dans `packages/memory` et `memory/` (legacy) — ces packages ont leur propre node_modules

## Architecture CLI

- **paths.ts** : toutes les paths (~/.claude/rex/*) centralisées ici — jamais hardcoder
- **config.ts** : config unifiée avec fallback chain (config.json → env → defaults)
- **logger.ts** : `createLogger(source)` — tous les modules l'utilisent, jamais console.log direct
- **Daemon unifié** : un seul `rex daemon` remplace 3 LaunchAgents séparés

## Flutter

- **rex_service.dart** : toute la logique métier ici — pages = UI only
- **ValueListenableBuilder** pour les widgets complexes — pas de setState
- **Provider pattern** : `context.read<RexService>()` partout — ne pas revenir à `widget.service`
- **Sidebar fixe** : `minWidth: 220`, `isResizable: false` — ne pas rendre resizable (labels disparaissent)
- **Flat UI** : pas de Material elevation/shadows
- **Theme** : `RexColors` dans theme.dart — jamais de couleurs hardcodées dans les pages

## Memory

- **768 dimensions** pour nomic-embed-text — ne pas changer sans migration SQLite
- **512 tokens** max par chunk — compromis qualité/perf validé
- **500ms throttle** entre embeddings — Ollama local se sature facilement
- **Two-phase ingest** : pending/ d'abord (instant), embed lazily — évite de bloquer les sessions

## Install

- **install.sh** : script standalone pour cloner+installer sans npm global
- **rex install** : commande CLI équivalente (init + setup + audit) pour les users qui ont rex-claude installé
- **Merge intelligent settings.json** : jq merge — ne jamais écraser les mcpServers existants
- **Détection OS** : Hammerspoon + LaunchAgents skippés sur Linux automatiquement

## Repo

- **Repo officiel** : `Keiy78120/rex` (branche `main`)
- **CLAUDE.md root** : garde en-tête + section En cours/Terminé + référence vers .claude/rules/
