# Testing Rules

## Discipline absolue

- JAMAIS modifier ou supprimer des tests pour les faire passer — corriger le CODE, pas les tests.
- Un test qui échoue est une information précieuse : comprendre pourquoi avant de toucher quoi que ce soit.

## Vérification obligatoire après chaque implémentation

Avant de déclarer une tâche terminée :

1. `npm run build` (ou équivalent) — doit passer avec zéro erreur
2. Démarrer le dev server — confirmer que l'app charge (au minimum `curl` homepage → 200)
3. Pour les changements UI : screenshot ou browser automation pour vérifier visuellement
4. Pour SSR/Next.js : inspecter la console navigateur pour les hydration warnings
5. Si une suite de tests existe : la lancer (`npm test`, `pytest`, etc.)

## Types de tests

- **Tests unitaires** : couvrir la logique métier (calculs, transformations, validations)
- **Tests d'intégration** : couvrir les endpoints API end-to-end
- **Tests E2E** : réserver aux parcours critiques (login, checkout, actions irréversibles)

## Mocking

- Mocker les dépendances externes (APIs tierces, base de données, services email)
- Ne jamais mocker la logique interne qu'on est en train de tester
- Utiliser des fixtures réalistes, pas des données trop simplifiées

## Root cause

- Corriger les causes racines, jamais les symptômes.
- Ne jamais supprimer un log d'erreur pour "nettoyer" — comprendre d'abord ce qu'il signifie.
