# Frontend Rules

## États obligatoires pour chaque composant qui fetch

TOUJOURS implémenter les trois états :

1. **Loading state** : spinner ou skeleton pendant le fetch
2. **Empty state** : message clair si 0 résultat (jamais un composant vide sans explication)
3. **Error state** : message d'erreur lisible, option de retry si pertinent

## SSR / Next.js

- JAMAIS lire `window`, `localStorage`, `sessionStorage` ou tout browser API pendant le render initial (serveur).
- Utiliser `useEffect` pour accéder aux browser APIs côté client uniquement.
- Le HTML généré côté serveur DOIT correspondre exactement au premier render client — sinon hydration mismatch.

Exemple correct :
```tsx
const [value, setValue] = useState<string | null>(null);

useEffect(() => {
  setValue(localStorage.getItem('key'));
}, []);
```

## Hydration

- Les données dynamiques (date, heure, valeurs aléatoires) doivent être initialisées après montage via `useEffect`, jamais directement dans le state initial.
- Tester explicitement les hydration warnings dans la console du navigateur.

## Formulaires

- Validation côté client ET côté serveur — toujours les deux.
- Ne jamais faire confiance aux données envoyées par le client côté serveur.
- Désactiver le bouton de soumission pendant le chargement pour éviter les doubles soumissions.

## Accessibilité

- Tous les `<input>` doivent avoir un `<label>` associé (via `for`/`htmlFor` ou `aria-label`).
- Utiliser les rôles ARIA quand le composant ne correspond pas à un élément HTML sémantique natif.
- Les images doivent avoir un attribut `alt` descriptif (ou `alt=""` si purement décoratif).
