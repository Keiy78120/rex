# Git Workflow

## Conventional Commits

Format : `type(scope): description courte`

| Type       | Usage |
|------------|-------|
| `feat:`    | Nouvelle fonctionnalité |
| `fix:`     | Correction de bug |
| `refactor:`| Refactoring sans changement de comportement |
| `chore:`   | Maintenance, dépendances, config |
| `docs:`    | Documentation uniquement |
| `test:`    | Ajout ou modification de tests |
| `perf:`    | Amélioration de performance |

Exemples :
```
feat(auth): add JWT refresh token rotation
fix(orders): correct total calculation on discounted items
chore: upgrade dependencies to latest minor versions
```

## Branches

- TOUJOURS créer une nouvelle branche sauf instruction contraire.
- Nommage kebab-case descriptif :
  - `fix/auth-token-refresh`
  - `feat/add-oauth-google`
  - `refactor/orders-service-cleanup`
- Ne jamais commiter directement sur `main` ou `master`.

## Avant de commiter

1. Lancer le linter/formatter s'il existe
2. Vérifier qu'aucun secret ou fichier `.env` n'est inclus
3. Relire le diff (`git diff --staged`) avant de confirmer

## Pull Requests

- Titre court et clair (< 72 caractères)
- Description : contexte du changement + test plan
- Lier l'issue ou la tâche Monday associée si applicable

## PR Review Loop

1. Après création, récupérer les commentaires automatisés :
   - `gh pr view <number> --comments`
   - `gh api repos/{owner}/{repo}/pulls/{number}/comments`
2. Évaluer chaque commentaire : corriger ce qui est valide, ignorer ce qui ne l'est pas
3. Push des corrections, notifier l'utilisateur pour review du diff v1 → v2

## Règles absolues

- JAMAIS de `Co-Authored-By` dans les commits
- JAMAIS mentionner Claude, AI ou un assistant dans les messages de commit, PR ou issues
- JAMAIS `git push --force` sur main/master
