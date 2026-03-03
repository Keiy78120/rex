# Security Rules

## OWASP Top 10

Vérifier à chaque PR que le code ne présente aucune des vulnérabilités OWASP Top 10 :
injection, broken auth, exposition de données sensibles, XXE, broken access control, misconfiguration, XSS, insecure deserialization, composants vulnérables, logging insuffisant.

## Secrets & Credentials

- Secrets UNIQUEMENT dans `.env` / variables d'environnement — JAMAIS dans le code source.
- `.env` DOIT être dans `.gitignore`. Vérifier avant chaque commit.
- Ne jamais logger de tokens, mots de passe ou clés API, même en debug.

## SQL Injection

- Requêtes paramétrées UNIQUEMENT — jamais de concaténation de chaînes avec des données utilisateur.

```ts
// JAMAIS
db.query(`SELECT * FROM users WHERE id = ${userId}`);

// TOUJOURS
db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

## XSS (Cross-Site Scripting)

- Échapper tout input utilisateur affiché dans le DOM.
- Ne jamais utiliser `innerHTML` avec des données non sanitisées.
- Utiliser les mécanismes d'échappement natifs du framework (React échappe par défaut, sauf `dangerouslySetInnerHTML`).

## CORS

- Configurer explicitement les origines autorisées — jamais `*` en production.
- Limiter les méthodes et headers autorisés au strict nécessaire.

## Authentification & Tokens

- Tokens JWT/session avec expiration courte.
- Refresh tokens stockés en `httpOnly` cookies (pas en localStorage).
- Invalider les tokens côté serveur à la déconnexion.
- Rate limiter les endpoints d'authentification (login, reset password).

## Signalement

Si du code insécurisé est découvert en travaillant, le signaler immédiatement à l'utilisateur — ne pas ignorer.
