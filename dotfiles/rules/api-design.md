# API Design

## REST Conventions

- URLs en kebab-case, noms de ressources au pluriel : `/api/v1/users`, `/api/v1/order-items`
- Verbes HTTP sémantiques : GET (lecture), POST (création), PUT/PATCH (mise à jour), DELETE (suppression)
- Versioning via URL prefix : `/api/v1/`

## Response Envelope

Toute réponse API doit suivre cette structure :

```json
{
  "data": { ... },
  "meta": {
    "total": 150,
    "limit": 20,
    "offset": 0
  },
  "error": null
}
```

En cas d'erreur :

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Le champ email est requis."
  }
}
```

## Pagination OBLIGATOIRE

Toute liste doit accepter `limit` + `offset` et retourner `total` dans `meta`. Ne jamais retourner une liste non bornée.

## Status Codes

| Code | Signification |
|------|---------------|
| 200  | Succès |
| 201  | Ressource créée |
| 400  | Requête invalide |
| 401  | Non authentifié |
| 403  | Accès interdit |
| 404  | Ressource introuvable |
| 422  | Erreur de validation |
| 500  | Erreur serveur interne |

## Rate Limiting Headers

Inclure dans les réponses quand applicable :

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1735689600
```
