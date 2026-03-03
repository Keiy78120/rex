# React 19 — Doc Cache Local

> Dernière mise à jour : 2026-03-03

## React 19 Nouveautés

### `use()` hook
```tsx
function Component({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise); // suspend until resolved
  return <div>{data.name}</div>;
}
```

### Server Components
- Pas de state, pas de hooks (sauf `use()`)
- Accès direct aux données (DB, fichiers, APIs)
- Ne sont jamais envoyés au client (0 JS)

### Actions (form)
```tsx
function Form() {
  const [state, formAction, isPending] = useActionState(async (prev, formData) => {
    const result = await submitForm(formData);
    return result;
  }, null);

  return (
    <form action={formAction}>
      <input name="email" />
      <button disabled={isPending}>Submit</button>
    </form>
  );
}
```

### `useOptimistic()`
```tsx
const [optimisticItems, addOptimistic] = useOptimistic(items, (state, newItem) => [...state, newItem]);
```

## Patterns récurrents

### Loading + Error + Empty states (OBLIGATOIRE)
```tsx
function ItemList() {
  const { data, isLoading, error } = useQuery(...);

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage retry={refetch} />;
  if (!data?.length) return <EmptyState message="Aucun élément" />;

  return <ul>{data.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
}
```

## Gotchas

1. **StrictMode** double-render en dev — normal, pas un bug
2. **Key prop** : ne jamais utiliser l'index comme key si la liste peut être réordonnée
3. **Closure stale** dans useEffect — utiliser ref ou functional update
4. **Ref callback** : React 19 supporte le cleanup `return () => {}` dans les ref callbacks
5. **`forwardRef` deprecated** en React 19 — `ref` est maintenant une prop normale
