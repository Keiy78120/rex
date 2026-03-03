# Documentation-First Rule

## Principe

AVANT de coder quoi que ce soit avec un framework/lib, TOUJOURS :
1. Vérifier si la doc est déjà cachée localement dans `~/.claude/docs/`
2. Si oui → la lire en priorité (pas de fetch réseau)
3. Si non → fetcher via Context7 ou SiteMCP, puis sauvegarder les points clés dans `~/.claude/docs/`

## Cache local de documentation

Dossier : `~/.claude/docs/`

Structure :
```
docs/
├── nextjs.md          # Next.js patterns, API routes, App Router
├── react.md           # React 19 patterns, hooks, server components
├── cloudflare.md      # Workers, D1, KV, Pages
├── cakephp.md         # CakePHP conventions, ORM, routing
├── ionic.md           # Ionic/Angular patterns, Capacitor
├── flutter.md         # Flutter widgets, state management
├── tailwind.md        # Tailwind classes, config, plugins
├── drizzle.md         # Drizzle ORM schema, queries, migrations
├── telegram-bot.md    # Bot API, mini apps, webhooks
├── n8n.md             # n8n nodes, workflows, webhooks
└── {lib}.md           # Ajouté au fur et à mesure
```

## Quand documenter

Après chaque projet, si un pattern/API/gotcha a été découvert :
1. Ouvrir le fichier `~/.claude/docs/{framework}.md`
2. Ajouter le pattern sous la bonne section
3. Format : titre court + snippet de code + gotcha/piège éventuel

## Outils disponibles

- **Context7** (MCP) : `use context7` → docs versionnées de n'importe quelle lib npm/PyPI
- **SiteMCP** (MCP) : docs complètes de sites crawlés (Next.js, Cloudflare, etc.)
- **`~/.claude/docs/`** : cache Markdown local, lu en priorité, jamais expiré

## Règle d'or

Ne jamais coder "de mémoire" un framework qu'on n'a pas utilisé depuis > 2 semaines.
Toujours vérifier les docs, même pour les APIs qu'on pense connaître.
Les breaking changes entre versions sont la première cause de bugs silencieux.
