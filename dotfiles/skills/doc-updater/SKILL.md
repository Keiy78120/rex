---
name: doc-updater
description: Keep docs up to date. Detect stale docs and update them. Use after any significant feature change.
---
# Doc Updater

Après chaque changement significatif :

1. Identifier les docs impactés :
   - README (features user-facing)
   - ARCHITECTURE.md (changements structurels)
   - CHANGELOG.md (TOUJOURS)
   - API docs si endpoints changés

2. Format CHANGELOG (Keep a Changelog) :

```md
## [Unreleased]
### Added
- Nouvelle feature X

### Changed
- Comportement Y modifié

### Fixed
- Bug Z corrigé
```

3. Vérifier que les exemples de code dans les docs compilent encore
4. Mettre à jour les screenshots/captures si UI changée
