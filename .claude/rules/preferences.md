# REX — Style de code et préférences

## TypeScript (CLI + Memory)

- **Typage explicite** : pas de `any` — utiliser `unknown` + type guard si nécessaire
- **Imports** : ESM (.js extensions dans les imports), pas de CommonJS require()
- **Async/await** partout — pas de callbacks ni .then() chaînés
- **Logs** : `createLogger(source)` de logger.ts — jamais `console.log`/`console.error` direct
- **Paths** : toujours via paths.ts — jamais `path.join(os.homedir(), ...)` en dur
- **Erreurs** : toujours try/catch avec message explicite — pas de swallow silencieux

## Dart / Flutter

- **Logique métier** dans rex_service.dart uniquement
- **UI** : widgets stateless autant que possible, `ValueListenableBuilder` pour le state
- **Couleurs** : via `RexColors` (theme.dart) uniquement — jamais de hex en dur dans les pages
- **Pas d'elevation** : flat UI, pas de `BoxShadow` Material standard
- **addPostFrameCallback** : obligatoire pour tout appel service dans `initState`

## Git

- Messages de commit : impératif, en anglais, concis (`fix: ...`, `feat: ...`, `refactor: ...`)
- Pas de Co-Authored-By
- Pas de mention d'outils AI dans les messages ou descriptions

## Docs

- README orienté utilisateur (quoi + pourquoi + one-liner install)
- CLAUDE.md orienté agents (faits repo, structure, commandes)
- Fichiers .claude/rules/ pour les détails techniques — ne pas surcharger CLAUDE.md root
- Toujours mettre à jour la section "En cours / Terminé" après un changement significatif
