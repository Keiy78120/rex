# Telegram Bot API — Doc Cache Local

> Dernière mise à jour : 2026-03-03

## Rate Limits CRITIQUES

- **30 messages/seconde** par bot (global)
- **1 message/seconde** par chat (recommandé)
- **20 messages/minute** par groupe
- Batch : toujours ajouter des délais entre les envois

## Webhook vs Polling

Workers → webhook obligatoire :
```ts
// wrangler.toml : pas de cron, c'est un webhook
// POST https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://my-worker.workers.dev/webhook
```

## Mini Apps

```ts
// Ouvrir une mini app depuis un bouton
{
  reply_markup: {
    inline_keyboard: [[{
      text: "Open App",
      web_app: { url: "https://my-app.pages.dev" }
    }]]
  }
}
```

### Validation initData côté serveur
```ts
import { createHmac } from 'crypto';

function validateInitData(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const sorted = [...params.entries()].sort().map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(sorted).digest('hex');
  return hash === expected;
}
```

## Gotchas

1. **Message trop long** : max 4096 chars — splitter si besoin
2. **Markdown parse mode** : utiliser `parse_mode: 'HTML'` (plus fiable que MarkdownV2)
3. **Callback query** : toujours `answerCallbackQuery()` sinon le spinner tourne indéfiniment
4. **Fichiers** : max 50MB download, 20MB upload via bot API
5. **Fallback Telegraph** : toujours avoir une page telegra.ph de backup
