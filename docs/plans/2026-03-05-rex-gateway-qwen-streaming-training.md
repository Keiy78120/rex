# REX Gateway — Streaming Telegram, Qwen optimisation, Codex interconnect, training pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformer le gateway Telegram REX en agent réactif avec streaming LLM, double-réponse corrigée, Qwen optimisé, babysitting Claude CLI + Codex interconnect, et pipeline de training futur.

**Architecture:** Long-polling Telegram → handler avec mutex anti-double → Ollama streaming via fetch SSE → editMessageText progressif. Claude babysitter via CLI `-p`. Codex via CLI si installé.

**Tech Stack:** Node.js (ESM), Ollama `/api/chat` stream, Telegram Bot API, `execFile` async (remplace `execSync`), Flutter for UI research panel.

**Files touchés:**
- `packages/cli/src/gateway.ts` (principal)
- `packages/cli/src/llm.ts` (si besoin d'options Qwen)
- `packages/flutter_app/lib/pages/gateway_page.dart` (minor — log display)

---

## Task 1: Fix double réponse — Mutex + msgId pattern

**Problème root cause:** `send("thinking...")` crée un message #A, puis `send(response)` crée un message #B séparé. Si deux updates arrivent pendant un long `execSync`, ou si le gateway tourne deux fois, on a deux couples de messages.

**Files:** Modify `packages/cli/src/gateway.ts`

**Step 1: Ajouter un Set de messages en cours de traitement**

Dans `gateway.ts`, après la déclaration de `state`, ajouter :

```typescript
// Anti-double: track update_ids currently being processed
const processingUpdates = new Set<number>()
```

**Step 2: Wrapper le traitement dans le poll loop**

Dans le `for (const update of data.result)` loop, entourer le traitement :

```typescript
for (const update of data.result) {
  offset = update.update_id + 1

  // Skip if already being processed (prevents double handling)
  if (processingUpdates.has(update.update_id)) continue
  processingUpdates.add(update.update_id)

  // ... existing callback/text handling ...
  // (must be in try/finally)
  try {
    if (update.callback_query) { ... }
    // Handle text message
    const msg = update.message
    if (!msg?.text) { processingUpdates.delete(update.update_id); continue }
    // ... rest of handling
    await handleText(...)
  } finally {
    processingUpdates.delete(update.update_id)
  }
}
```

**Step 3: Vérifier**

Lancer le gateway manuellement : `rex gateway` et envoyer un message. Vérifier qu'une seule réponse arrive.

---

## Task 2: Streaming Qwen — editMessageText progressif

**Concept:** Au lieu de `send("thinking...")` + `send(response)`, on fait :
1. `send("🧠 _Qwen thinking_ ●")` → récupère `messageId`
2. Stream Ollama `/api/chat` avec `stream: true` → accumule les tokens
3. `editMessage(messageId, accumulated)` toutes les 500ms
4. À la fin : `editMessage(messageId, finalResponse + keyboard)`

**Telegram rate limit:** max ~20 edits/min par message. 500ms = 120/min théorique → utiliser 600ms minimum. En pratique, espacer les edits à chaque "phrase" ou toutes les 200 chars accumulées.

**Files:** Modify `packages/cli/src/gateway.ts`

**Step 1: Remplacer `askQwen` par `askQwenStream`**

```typescript
async function askQwenStream(
  prompt: string,
  onUpdate: (partial: string) => Promise<void>
): Promise<string> {
  // Check Ollama alive
  try {
    const check = await fetch(`${OLLAMA_URL}/api/tags`)
    if (!check.ok) return '⚠️ Ollama not running. Wake Mac first.'
  } catch {
    return '⚠️ Ollama not running. Wake Mac first.'
  }

  const model = process.env.OLLAMA_MODEL || 'qwen3.5:4b'

  let fullText = ''
  let lastEditAt = 0

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: QWEN_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        stream: true,
        options: QWEN_OPTIONS,
      }),
    })

    if (!res.ok || !res.body) return '⚠️ Ollama request failed'

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        try {
          const json = JSON.parse(line)
          const token = json.message?.content ?? ''
          fullText += token

          // Rate-limit edits to every 600ms AND every 200 chars
          const now = Date.now()
          if (now - lastEditAt > 600 && fullText.length % 200 < token.length + 10) {
            lastEditAt = now
            await onUpdate(fullText + ' ●')
          }
        } catch {}
      }
    }
  } catch (e: any) {
    return `⚠️ Stream error: ${e.message}`
  }

  return truncate(fullText) || '⚠️ Empty response from Qwen'
}
```

**Step 2: Ajouter les constantes Qwen en haut du fichier**

```typescript
// --- Qwen Config (optimized params from community research) ---
// Source: r/LocalLLaMA, Ollama forums, Qwen official docs
// Temperature 0.6: optimal for coding tasks (less random)
// top_p 0.9: good balance creativity/coherence
// num_ctx 8192: default is 2048 which is too small for real tasks
// Q4_K_M quantization recommended (best quality/size tradeoff)
const QWEN_SYSTEM_PROMPT = `You are REX, a senior developer assistant for Kevin (D-Studio).
You help with code, architecture, debugging, and dev ops tasks.
Be concise. Respond in the same language as the user (French or English).
For code, use markdown code blocks. Avoid unnecessary preamble.`

const QWEN_OPTIONS = {
  temperature: 0.6,
  top_p: 0.9,
  num_ctx: 8192,
  repeat_penalty: 1.1,
}
```

**Step 3: Mettre à jour `handleText` pour utiliser le streaming**

Dans la section "Free text -> send to current LLM" (ligne ~631), remplacer :

```typescript
// AVANT:
const modeLabel = state.mode === 'qwen' ? '🧠 Qwen' : '🤖 Claude'
await send(token, chatId, `${modeLabel} _thinking..._`)
// ...
response = await askLLM(text)
await send(token, chatId, response, keyboard)

// APRÈS:
if (state.mode === 'qwen') {
  const thinkMsg = await send(token, chatId, '🧠 _Qwen thinking_ ●')
  const thinkMsgId = thinkMsg?.result?.message_id as number | undefined

  const response = await askQwenStream(text, async (partial) => {
    if (thinkMsgId) {
      await editMessage(token, chatId, thinkMsgId, partial)
    }
  })

  const keyboard = [[
    { text: `Mode: ${state.mode}`, callback_data: 'switch_mode' },
    { text: '◀️ Menu', callback_data: 'menu' },
  ]]

  if (thinkMsgId) {
    await editMessage(token, chatId, thinkMsgId, response, keyboard)
  } else {
    await send(token, chatId, response, keyboard)
  }
  logCommand(from, text.slice(0, 80), response.slice(0, 100))
} else {
  // Claude mode: no streaming (CLI doesn't support it easily)
  await send(token, chatId, '🤖 _Claude thinking..._')
  const response = await claudeSession(text)
  await send(token, chatId, response, [
    [
      { text: '💬 Continue', callback_data: 'claude_continue' },
      { text: '◀️ Menu', callback_data: 'menu' },
    ]
  ])
  logCommand(from, text.slice(0, 80), response.slice(0, 100))
}
```

**IMPORTANT:** `send()` doit retourner le résultat Telegram pour obtenir `message_id`. Vérifier que la fonction `send()` retourne bien le résultat de `tg()` (elle le fait déjà via `return tg(...)`).

**Step 4: Test**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex
pnpm build
rex gateway
# Envoyer un message texte dans Telegram
# Vérifier: 1 seul message qui se met à jour progressivement
# Vérifier: pas de double message
```

Expected output dans le chat Telegram : un message "🧠 Qwen thinking ●" qui se met à jour avec les tokens au fur et à mesure, puis affiche la réponse finale avec le menu.

---

## Task 3: Streaming pour les callbacks (doctor, optimize, etc.)

Appliquer le même pattern pour les actions longues dans `handleCallback`.

**Files:** Modify `packages/cli/src/gateway.ts`

Les actions longues actuelles utilisent `await editMessage(... "_Running..._")` puis `await editMessage(... result)`. Le pattern est déjà bon (edit in-place) — MAIS `run()` utilise `execSync` qui bloque le thread.

**Step 1: Rendre `run()` async**

Remplacer la fonction `run()` sync par une version async :

```typescript
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function runAsync(cmd: string, timeout = 30000): Promise<string> {
  try {
    const parts = cmd.split(' ')
    const bin = parts[0]
    const args = parts.slice(1)
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout,
      encoding: 'utf-8',
      shell: true,  // need shell for pipes, env vars
    })
    return (stdout || stderr || '').trim()
  } catch (e: any) {
    return e.stderr?.trim() || e.stdout?.trim() || e.message || 'Command failed'
  }
}
```

Garder `run()` sync pour les endroits où c'est OK (wakeMac, checks simples), utiliser `runAsync()` pour les opérations longues (doctor, optimize, ingest, prune).

**Step 2: Mettre à jour les callbacks longs**

Dans `handleCallback`, pour `doctor`, `optimize`, `ingest`, `prune` :

```typescript
case 'doctor': {
  await editMessage(token, chatId, messageId, '🩺 _Running diagnostics..._')
  const out = truncate(strip(await runAsync('rex doctor')))  // async!
  await editMessage(token, chatId, messageId,
    `🩺 *Doctor*\n\`\`\`\n${out}\n\`\`\``,
    backButton()
  )
  break
}
// ... idem pour optimize, ingest, prune
```

**Step 3: Rebuild + test**

```bash
pnpm build && rex gateway
# Cliquer "Doctor" dans le menu Telegram
# Vérifier que le bot reste réactif pendant le diagnostic
```

---

## Task 4: Claude CLI Babysitter — commande `/babysit`

**Concept:** Pour les tâches complexes (architecture, analyse de code, refactoring), déléguer à Claude CLI via `-p` en mode one-shot. Résultat streamé dans Telegram.

**Note:** Claude CLI ne supporte pas le streaming stdout dans `-p` mode actuellement. On utilise donc le pattern classique : `send("thinking...")` → `claude -p "..."` (peut prendre 2-3 min) → `editMessage(result)`.

**Files:** Modify `packages/cli/src/gateway.ts`

**Step 1: Ajouter `/babysit` dans les slash commands de `handleText`**

```typescript
if (cmd.startsWith('/babysit ') || cmd.startsWith('/bs ')) {
  const task = text.replace(/^\/(babysit|bs)\s+/i, '').trim()
  if (!task) { await send(token, chatId, 'Usage: /babysit <tâche>'); return }

  const thinkMsg = await send(token, chatId, '🤖 _Claude CLI is working on it..._\n⏳ This may take 2-3 minutes.')
  const thinkMsgId = thinkMsg?.result?.message_id as number | undefined

  logCommand(from, `/babysit ${task.slice(0, 50)}`, 'started')

  // Claude -p is synchronous, run in background via execFile
  const claudePath = run('which claude || echo ""')
  if (!claudePath) {
    const errMsg = '❌ Claude CLI not found. Install with: npm i -g @anthropic-ai/claude-code'
    thinkMsgId ? await editMessage(token, chatId, thinkMsgId, errMsg) : await send(token, chatId, errMsg)
    return
  }

  const out = await runAsync(`claude -p "${task.replace(/"/g, '\\"')}" 2>/dev/null`, 180000)
  const response = out ? truncate(out) : '⚠️ Claude returned empty response'

  const keyboard = [[
    { text: '💬 Continue', callback_data: 'claude_continue' },
    { text: '◀️ Menu', callback_data: 'menu' },
  ]]
  thinkMsgId
    ? await editMessage(token, chatId, thinkMsgId, `🤖 *Claude*\n${response}`, keyboard)
    : await send(token, chatId, response, keyboard)

  logCommand(from, `/babysit ${task.slice(0, 50)}`, response.slice(0, 100))
  return
}
```

**Step 2: Ajouter dans le menu principal**

Dans `mainMenu()`, ajouter un bouton :

```typescript
[
  { text: '🤖 Babysit (Claude)', callback_data: 'babysit_prompt' },
  { text: '💻 Codex', callback_data: 'codex_prompt' },
],
```

Et dans `handleCallback`, ajouter :

```typescript
case 'babysit_prompt':
  await editMessage(token, chatId, messageId,
    '🤖 *Claude Babysitter*\nEnvoie ta tâche avec `/babysit <description>`\n\nExemples:\n`/babysit Analyse mon CLAUDE.md et propose des améliorations`\n`/babysit Quels sont les risques dans mon gateway.ts ?`',
    backButton()
  )
  break
```

**Step 3: Test**

```bash
rex gateway
# Dans Telegram: /babysit Analyze the REX gateway and list 3 improvements
# Vérifier: message "working..." puis résultat Claude après ~60-120s
```

---

## Task 5: Codex CLI Interconnect — commande `/codex`

**Concept:** Si `codex` CLI est installé sur le Mac, permettre de lui déléguer des tâches de coding via Telegram.

**Files:** Modify `packages/cli/src/gateway.ts`

**Step 1: Détecter Codex au démarrage**

```typescript
let codexAvailable = false

async function detectCodex(): Promise<void> {
  const path = run('which codex 2>/dev/null || echo ""', 3000)
  codexAvailable = !!path && !path.includes('not found')
  if (codexAvailable) {
    console.log(`${COLORS.green}Codex CLI detected${COLORS.reset}: ${path}`)
  }
}
```

Appeler `await detectCodex()` dans `gateway()` au démarrage (après `loadConfig()`).

**Step 2: Commande `/codex`**

```typescript
if (cmd.startsWith('/codex ') || cmd.startsWith('/cx ')) {
  if (!codexAvailable) {
    await send(token, chatId, '❌ Codex CLI not found on this machine.\nInstall: `npm i -g @openai/codex`')
    return
  }
  const task = text.replace(/^\/(codex|cx)\s+/i, '').trim()
  if (!task) { await send(token, chatId, 'Usage: /codex <coding task>'); return }

  const thinkMsg = await send(token, chatId, '💻 _Codex is coding..._\n⏳ May take 1-3 minutes.')
  const thinkMsgId = thinkMsg?.result?.message_id as number | undefined

  // Codex CLI: --approval-mode full-auto for non-interactive, quiet output
  const out = await runAsync(
    `codex --approval-mode full-auto -q "${task.replace(/"/g, '\\"')}" 2>&1`,
    180000
  )
  const response = out ? truncate(out) : '⚠️ Codex returned empty response'

  const keyboard = [[{ text: '◀️ Menu', callback_data: 'menu' }]]
  thinkMsgId
    ? await editMessage(token, chatId, thinkMsgId, `💻 *Codex*\n${response}`, keyboard)
    : await send(token, chatId, response, keyboard)

  logCommand(from, `/codex ${task.slice(0, 50)}`, response.slice(0, 100))
  return
}
```

**Step 3: Mettre à jour le message de démarrage**

```typescript
await send(token, chatId,
  `🟢 *REX Gateway v3* started\nMode: ${state.mode} | Sessions: ${state.sessionsCount}` +
  `\nClaude: ✅ | Codex: ${codexAvailable ? '✅' : '❌'}`,
  mainMenu()
)
```

**Step 4: Test**

```bash
rex gateway
# Dans Telegram: /codex Write a function to parse a CSV file in TypeScript
# Vérifier que Codex est détecté et répond
```

---

## Task 6: Build + intégration finale gateway

**Files:** `packages/cli/src/gateway.ts`

**Step 1: Ajouter l'import `execFile` en haut**

```typescript
import { execSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
```

**Step 2: Build et test complet**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex
pnpm build
```

Expected: zero TypeScript errors.

**Step 3: Test smoke**

```bash
rex gateway
```

Expected:
- "REX Gateway v3 started" dans terminal
- Message Telegram avec menu
- Envoyer un texte → 1 seul message qui se met à jour progressivement
- `/babysit list my recent git commits` → réponse Claude
- `/status` → réponse rapide

**Step 4: Commit**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex
git add packages/cli/src/gateway.ts
git commit -m "feat(gateway): streaming Qwen, fix double responses, babysit + codex interconnect"
```

---

## Task 7: Flutter app — afficher les logs gateway en temps réel

**Context:** Le log file est `~/.claude/rex-gateway.log` mais le gateway COMMANDES log va dans `rex-gateway-commands.log`. Il faut afficher les deux.

**Files:** `packages/flutter_app/lib/pages/gateway_page.dart`

**Step 1: Lire les deux fichiers de log**

Dans `_loadLogs()` :

```dart
Future<void> _loadLogs() async {
  setState(() => _refreshingLogs = true);
  try {
    final home = Platform.environment['HOME']!;
    final mainLog = File('$home/.claude/rex-gateway.log');
    final cmdLog = File('$home/.claude/rex-gateway-commands.log');

    final StringBuffer combined = StringBuffer();

    for (final logFile in [mainLog, cmdLog]) {
      if (await logFile.exists()) {
        final content = await logFile.readAsString();
        final lines = content.split('\n');
        final last25 = lines.length > 25 ? lines.sublist(lines.length - 25) : lines;
        if (combined.isNotEmpty) combined.write('\n--- CMD LOG ---\n');
        combined.write(last25.join('\n'));
      }
    }

    if (mounted) {
      setState(() => _logContent = combined.isEmpty
        ? 'No gateway log files found.'
        : combined.toString());
    }
  } catch (e) {
    if (mounted) setState(() => _logContent = 'Error reading logs: $e');
  }
  if (mounted) setState(() => _refreshingLogs = false);
}
```

**Step 2: Auto-refresh logs toutes les 10s quand le gateway tourne**

Ajouter dans `_GatewayPageState` :

```dart
Timer? _logTimer;

// Dans initState, après addPostFrameCallback:
// _startLogAutoRefresh() -- appelé SEULEMENT si gateway running

// Dans dispose:
_logTimer?.cancel();

void _startLogAutoRefresh() {
  _logTimer?.cancel();
  _logTimer = Timer.periodic(const Duration(seconds: 10), (_) {
    if (context.read<RexService>().gatewayRunning) _loadLogs();
  });
}
```

Appeler `_startLogAutoRefresh()` dans le `addPostFrameCallback`.

Ajouter `import 'dart:async';` en haut du fichier.

**Step 3: Build Flutter**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex/packages/flutter_app
flutter build macos --debug
open build/macos/Build/Products/Debug/rex_app.app
```

Vérifier : la page Gateway affiche les logs mis à jour automatiquement quand le gateway tourne.

---

## Task 8: Research — Pipeline d'entraînement (subagent, ne pas implémenter)

**Goal:** Identifier le meilleur framework open-source pour fine-tuner un modèle avec les données REX Memory, puis documenter dans un design doc.

**Résultat de la recherche préliminaire (à approfondir avec subagent WebSearch) :**

| Framework | Mac M1/M2 | GPU requis | Format data | Qualité |
|-----------|-----------|-----------|-------------|---------|
| **unsloth** | ✅ (Metal) | Non requis | JSONL chat | ★★★★★ |
| **LLaMA-Factory** | ✅ (MPS) | Optionnel | Alpaca/ShareGPT | ★★★★☆ |
| **Axolotl** | Partiel | GPU fort | JSONL | ★★★☆☆ |
| **mlx-lm** | ✅ (MLX natif Apple) | Non requis | JSONL | ★★★★☆ |

**Recommandation préliminaire :** `mlx-lm` pour Mac (Apple Silicon natif, très rapide), `unsloth` pour PC GPU.

**Format de dataset depuis REX Memory :**

```python
# REX memory SQLite → JSONL format (ShareGPT/Alpaca)
# Table: memories (content TEXT, category TEXT, created_at TEXT)
# Convertir en: {"conversations": [{"from": "human", "value": "..."}, {"from": "gpt", "value": "..."}]}
# Les sessions .jsonl Claude Code → extraire les paires prompt/response
```

**Action requise (subagent) :**
1. Rechercher `mlx-lm fine-tuning tutorial mac 2025`
2. Rechercher `unsloth qwen3.5 fine-tuning example`
3. Rechercher `REX memory SQLite to training dataset conversion`
4. Documenter dans `docs/research/training-pipeline.md`

**UI stub dans REX app (Phase future, ne pas implémenter maintenant) :**
- Nouvel onglet "Train" dans la sidebar
- Bouton "Export Dataset" (SQLite → JSONL)
- Bouton "Start Fine-tune" (lance mlx-lm ou unsloth)
- Progress bar + logs
- "Load Model" (swap Ollama model vers le fine-tuned)

---

## Vérification end-to-end

1. `rex gateway` → démarre sans erreur, message Telegram reçu
2. Texte libre → 1 seul message qui se met à jour (pas de double)
3. Qwen stream → tokens apparaissent progressivement en Telegram
4. `/babysit <task>` → Claude CLI répond dans Telegram
5. `/codex <task>` → Codex répond (ou message "not found" si non installé)
6. `rex doctor` via Telegram → réponse sans bloquer le bot
7. Flutter app → Gateway page affiche logs auto-refresh
8. Flutter app → reste ouverte après lancement (crash fix vérifié)
