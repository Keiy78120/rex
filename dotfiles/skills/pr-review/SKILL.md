---
name: pr-review
description: Automated PR review — check code quality, tests, docs. Use before merging any PR.
---
# PR Review — Checklist complète

Avant de merger une PR, vérifier :

## Code Quality
- [ ] Pas de TODO/FIXME non résolus dans le nouveau code
- [ ] Pas de console.log/print de debug
- [ ] Pas de credentials ou secrets hardcodés
- [ ] Gestion des erreurs sur tous les appels async
- [ ] Types explicites (pas de `any` en TypeScript)

## Tests
- [ ] Tests ajoutés pour les nouvelles fonctionnalités
- [ ] Tests existants passent (`npm test` / `pnpm test`)
- [ ] Cas limites couverts

## Documentation
- [ ] CHANGELOG.md mis à jour
- [ ] README mis à jour si nouvelle feature user-facing
- [ ] JSDoc/docstrings sur les fonctions publiques complexes

## Sécurité
- [ ] Pas d'injection possible (SQL, XSS, etc.)
- [ ] Inputs validés
- [ ] Dépendances vérifiées (pas de CVE critique)

## Performance
- [ ] Pas de requêtes N+1
- [ ] Pas de boucle avec opération coûteuse
- [ ] Bundle size non impacté négativement (si frontend)

Résumer : ✅ Ready to merge / ⚠️ Minor issues / 🔴 Blocking issues
