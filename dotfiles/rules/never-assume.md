# Never Assume

## Environnement & Outils

- JAMAIS assumer qu'un framework, lib ou commande est installé → vérifier d'abord (`which`, `ls node_modules`, `package.json`)
- JAMAIS assumer la version d'un outil → lire `package.json`, `pubspec.yaml`, `composer.json`, etc.

## Structure du projet

- JAMAIS assumer la structure d'un projet → lire le code existant avant de modifier quoi que ce soit
- JAMAIS créer un fichier sans avoir vérifié qu'un fichier similaire n'existe pas déjà
- JAMAIS assumer qu'un pattern utilisé ailleurs dans le projet est le bon — vérifier les conventions locales

## APIs & Données

- JAMAIS assumer qu'une API retourne un format spécifique → vérifier la doc ou le code
- JAMAIS assumer qu'une liste est non-vide → toujours gérer le cas `[]` ou `null`
- JAMAIS assumer qu'un champ est présent dans une réponse → accès défensif avec fallback

## TypeScript & Qualité

- JAMAIS utiliser `@ts-ignore` sans justification explicite dans un commentaire expliquant pourquoi
- JAMAIS utiliser `eslint-disable` sans justification explicite
- JAMAIS utiliser `any` comme type sans documenter pourquoi c'est inévitable
- Alternative : typer correctement, utiliser `unknown` + type guard si le type est incertain

## Comportement en cas d'ambiguïté

- TOUJOURS poser des questions en cas d'ambiguïté — accompagnement et précision > vitesse
- Si une instruction est floue, demander une clarification plutôt que d'interpréter et potentiellement mal comprendre
- Si deux approches semblent valides, présenter les options à l'utilisateur avant de choisir

## Principe "Mistakes become rules"

Chaque erreur récurrente identifiée en session de travail doit devenir une nouvelle règle dans `~/.claude/rules/`.

- Chaque interdit DOIT avoir une alternative : "Ne jamais X → utiliser Y à la place"
- Les règles doivent être actionnables, pas juste des interdictions vagues
- Exemple : "JAMAIS concaténer des strings SQL → TOUJOURS utiliser des requêtes paramétrées"
