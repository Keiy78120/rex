# LiteLLM Phase 2 — Free Tier Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un routing chain Ollama → free tier API → subscription dans REX via Vercel AI SDK, avec auto-fallback sur rate-limit, catalog de modèles gratuits, et status UI Flutter.

**Architecture:** Vercel AI SDK (`ai` v6 + `@ai-sdk/openai`) comme couche d'abstraction unifiée. Un nouveau module `free-tiers.ts` centralise le catalog providers et l'état rate-limit. `llm.ts` devient le router unifié via `generateText()`. Ollama est traité comme un provider OpenAI-compat via son endpoint `/v1`. `providers.ts` enregistre tous les free tiers. Flutter `providers_page.dart` affiche le status de chaque provider.

**Tech Stack:** `ai@^6.0.0`, `@ai-sdk/openai@^1.0.0`, TypeScript ESM, Flutter existing patterns.

**Vision reminder:** Claude Code + Codex = orchestrators. REX = hub qui sait ce qu'on possède (clés, quotas, modèles) et route intelligemment. Vercel AI SDK = interface unifiée vers tous les workers.

---

## Contexte important

- Fichiers CLI dans `packages/cli/src/`
- Imports entre modules CLI : extension `.js` (ESM)
- Logger : `import { createLogger } from './logger.js'`
- Clés API stockées dans `~/.claude/settings.json` sous `env` (même pattern que Telegram)
- Ollama expose `/v1/chat/completions` (OpenAI-compat) → traité comme provider OpenAI avec `baseURL`
- `pnpm build` depuis root ou `packages/cli` pour compiler
- `pnpm add <pkg>` depuis `packages/cli/` pour ajouter une dépendance

---

## Task 1 : Installer Vercel AI SDK

**Files:**
- Modify: `packages/cli/package.json`

**Step 1: Installer les packages**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex/packages/cli
pnpm add ai@^6.0.0 @ai-sdk/openai@^1.0.0
```

**Step 2: Vérifier le build**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build 2>&1 | tail -10
```

Attendu : zéro erreur TypeScript.

**Step 3: Vérifier les versions installées**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex/packages/cli && cat package.json | grep -A5 '"dependencies"'
```

Attendu : `"ai": "^6.x.x"` et `"@ai-sdk/openai": "^1.x.x"` présents.

**Step 4: Créer la branche**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex
git checkout -b feat/litellm-phase2
git add packages/cli/package.json pnpm-lock.yaml
git commit -m "chore(deps): add Vercel AI SDK v6 + @ai-sdk/openai"
```

---

## Task 2 : `free-tiers.ts` — Catalog + routing via Vercel AI SDK

**Files:**
- Create: `packages/cli/src/free-tiers.ts`

**Step 1: Créer le fichier**

```typescript
/**
 * REX Free Tier Catalog
 * Vercel AI SDK abstraction over all OpenAI-compatible free tier providers.
 * Routing order: Ollama → Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek → HF
 */

import { generateText, type LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('free-tiers')
const HOME = process.env.HOME || '~'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

// ── Types ──────────────────────────────────────────────

export interface FreeTierModel {
  id: string
  contextWindow: number
  capabilities: ('chat' | 'code' | 'fast' | 'reasoning')[]
}

export interface FreeTierProvider {
  name: string
  envKey: string          // env var name for API key (empty string = no key needed)
  baseUrl: string
  defaultModel: string
  models: FreeTierModel[]
  rpmLimit: number
  tpmLimit: number
  requiresKey: boolean    // false = works without key (Ollama)
}

// Rate-limit state (in-memory, per process)
interface RateState {
  requests: number
  windowStart: number
  blocked: boolean
  blockedUntil: number
}

// ── Catalog ────────────────────────────────────────────
// Order = routing priority (first = tried first)

export const FREE_TIER_PROVIDERS: FreeTierProvider[] = [
  {
    name: 'Ollama',
    envKey: '',
    baseUrl: OLLAMA_URL,
    defaultModel: 'qwen3.5:latest',
    requiresKey: false,
    models: [
      { id: 'qwen3.5:latest', contextWindow: 32768, capabilities: ['chat', 'code'] },
      { id: 'qwen2.5:1.5b', contextWindow: 32768, capabilities: ['chat', 'fast'] },
    ],
    rpmLimit: 999,
    tpmLimit: 999999,
  },
  {
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    models: [
      { id: 'llama-3.1-8b-instant', contextWindow: 128000, capabilities: ['chat', 'fast'] },
      { id: 'llama-3.3-70b-versatile', contextWindow: 128000, capabilities: ['chat', 'code'] },
      { id: 'qwen-qwq-32b', contextWindow: 128000, capabilities: ['chat', 'reasoning'] },
    ],
    rpmLimit: 30,
    tpmLimit: 6000,
  },
  {
    name: 'Cerebras',
    envKey: 'CEREBRAS_API_KEY',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'qwen-3-32b',
    requiresKey: true,
    models: [
      { id: 'llama3.1-8b', contextWindow: 8192, capabilities: ['chat', 'fast'] },
      { id: 'llama3.3-70b', contextWindow: 128000, capabilities: ['chat', 'code'] },
      { id: 'qwen-3-32b', contextWindow: 32768, capabilities: ['chat', 'code', 'reasoning'] },
    ],
    rpmLimit: 60,
    tpmLimit: 60000,
  },
  {
    name: 'Together AI',
    envKey: 'TOGETHER_API_KEY',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    requiresKey: true,
    models: [
      { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', contextWindow: 131072, capabilities: ['chat', 'fast'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', contextWindow: 32768, capabilities: ['chat', 'code'] },
    ],
    rpmLimit: 60,
    tpmLimit: 60000,
  },
  {
    name: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresKey: true,
    models: [
      { id: 'mistral-small-latest', contextWindow: 32000, capabilities: ['chat', 'code'] },
      { id: 'codestral-latest', contextWindow: 32000, capabilities: ['code'] },
    ],
    rpmLimit: 2,
    tpmLimit: 50000,
  },
  {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    requiresKey: true,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', contextWindow: 131072, capabilities: ['chat', 'code'] },
      { id: 'google/gemma-3-27b-it:free', contextWindow: 96000, capabilities: ['chat'] },
    ],
    rpmLimit: 20,
    tpmLimit: 40000,
  },
  {
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    models: [
      { id: 'deepseek-chat', contextWindow: 64000, capabilities: ['chat', 'code'] },
      { id: 'deepseek-reasoner', contextWindow: 64000, capabilities: ['reasoning'] },
    ],
    rpmLimit: 60,
    tpmLimit: 100000,
  },
]

// ── API Key resolution ─────────────────────────────────

export function getApiKey(envKey: string): string | null {
  if (!envKey) return null
  if (process.env[envKey]) return process.env[envKey]!
  try {
    const settingsPath = join(HOME, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.env?.[envKey] ?? null
    }
  } catch {}
  return null
}

// ── Rate limit tracking ────────────────────────────────

const _rateStates = new Map<string, RateState>()
const BLOCK_MS = 60_000

function getRateState(name: string): RateState {
  if (!_rateStates.has(name)) {
    _rateStates.set(name, { requests: 0, windowStart: Date.now(), blocked: false, blockedUntil: 0 })
  }
  return _rateStates.get(name)!
}

export function markRateLimited(name: string): void {
  const state = getRateState(name)
  state.blocked = true
  state.blockedUntil = Date.now() + BLOCK_MS
  log.warn(`${name} rate-limited — blocked for ${BLOCK_MS / 1000}s`)
}

function isBlocked(name: string, rpmLimit: number): boolean {
  const state = getRateState(name)
  const now = Date.now()

  // Unblock if window expired
  if (state.blocked && now >= state.blockedUntil) {
    state.blocked = false
    state.requests = 0
    state.windowStart = now
    log.info(`${name} rate-limit window reset`)
  }
  if (state.blocked) return true

  // Reset request count if window expired
  if (now - state.windowStart > BLOCK_MS) {
    state.requests = 0
    state.windowStart = now
  }

  if (state.requests >= rpmLimit) {
    markRateLimited(name)
    return true
  }

  return false
}

function tick(name: string): void {
  getRateState(name).requests++
}

// ── Vercel AI SDK provider factory ────────────────────

function makeProvider(p: FreeTierProvider, apiKey?: string): ReturnType<typeof createOpenAI> {
  if (p.name === 'Ollama') {
    // Ollama OpenAI-compat endpoint doesn't need a real key
    return createOpenAI({ baseURL: `${p.baseUrl}/v1`, apiKey: 'ollama' })
  }
  return createOpenAI({ baseURL: p.baseUrl, apiKey: apiKey ?? '' })
}

// ── Public API ─────────────────────────────────────────

/**
 * Call a provider using Vercel AI SDK generateText.
 * Throws 'RATE_LIMIT:<name>', 'NO_KEY:<name>', or SDK errors.
 */
export async function callProvider(
  provider: FreeTierProvider,
  prompt: string,
  system?: string,
  modelId?: string,
): Promise<string> {
  // Key check
  const apiKey = provider.requiresKey ? getApiKey(provider.envKey) : 'local'
  if (provider.requiresKey && !apiKey) throw new Error(`NO_KEY:${provider.name}`)

  // Rate limit check
  if (isBlocked(provider.name, provider.rpmLimit)) throw new Error(`RATE_LIMIT:${provider.name}`)
  tick(provider.name)

  const openai = makeProvider(provider, apiKey ?? undefined)
  const useModelId = modelId ?? provider.defaultModel
  const model: LanguageModel = openai(useModelId)

  try {
    const { text } = await generateText({
      model,
      prompt,
      system,
      maxTokens: 2048,
      abortSignal: AbortSignal.timeout(30_000),
    })
    return text
  } catch (err) {
    const msg = String(err)
    // Detect rate-limit from API response
    if (msg.includes('429') || msg.includes('rate') || msg.includes('Rate')) {
      markRateLimited(provider.name)
      throw new Error(`RATE_LIMIT:${provider.name}`)
    }
    throw err
  }
}

/**
 * Providers available for routing (have a key or don't require one),
 * ordered by routing priority (Ollama first, then by RPM descending).
 */
export function getRoutableProviders(): FreeTierProvider[] {
  return FREE_TIER_PROVIDERS.filter(p => !p.requiresKey || !!getApiKey(p.envKey))
}

/**
 * Check if a provider is available (key exists or not required).
 */
export function isProviderAvailable(p: FreeTierProvider): boolean {
  return !p.requiresKey || !!getApiKey(p.envKey)
}

/**
 * Validate an API key by listing models (OpenAI-compat GET /models).
 * For Ollama: checks /api/tags instead.
 */
export async function validateProvider(provider: FreeTierProvider): Promise<boolean> {
  try {
    if (provider.name === 'Ollama') {
      const res = await fetch(`${provider.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    }
    const apiKey = getApiKey(provider.envKey)
    if (!apiKey) return false
    const res = await fetch(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Get snapshot of provider status for Flutter / --json output.
 */
export function getProvidersSnapshot(): object[] {
  return FREE_TIER_PROVIDERS.map(p => ({
    name: p.name,
    envKey: p.envKey,
    available: isProviderAvailable(p),
    blocked: p.name !== 'Ollama' ? getRateState(p.name).blocked : false,
    rpmLimit: p.rpmLimit,
    defaultModel: p.defaultModel,
    modelsCount: p.models.length,
  }))
}
```

**Step 2: Build**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build 2>&1 | tail -20
```

Attendu : zéro erreur TypeScript.

**Step 3: Commit**

```bash
git add packages/cli/src/free-tiers.ts
git commit -m "feat(free-tiers): add provider catalog with Vercel AI SDK abstraction"
```

---

## Task 3 : Réécrire `llm.ts` — router unifié

**Files:**
- Modify: `packages/cli/src/llm.ts`

**Step 1: Remplacer intégralement `llm.ts`**

```typescript
/**
 * REX Unified LLM Router
 * Chain: Ollama (local) → free tier APIs → subscription
 * Uses free-tiers.ts for provider management.
 */

import { callProvider, getRoutableProviders } from './free-tiers.js'
import { createLogger } from './logger.js'

const log = createLogger('llm')

// detectModel kept for backward compat (used by router.ts)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const PREFERRED_MODELS = ['qwen2.5:1.5b', 'qwen3.5:4b', 'llama3.2', 'mistral']

export async function detectModel(): Promise<string> {
  if (process.env.REX_LLM_MODEL) return process.env.REX_LLM_MODEL
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    const data = await res.json() as { models: Array<{ name: string }> }
    const available = data.models.map((m: any) => m.name)
    for (const pref of PREFERRED_MODELS) {
      const base = pref.split(':')[0]
      const match = available.find((a: string) => a.includes(base))
      if (match) return match
    }
    return available.find((a: string) => !a.includes('embed')) || available[0]
  } catch {
    return 'qwen3.5:4b'
  }
}

/**
 * Unified LLM call — routing chain:
 * 1. Ollama local (zero cost, instant)
 * 2. Configured free tier APIs (Groq → Cerebras → Together → Mistral → OpenRouter → DeepSeek)
 * 3. Throws if all fail
 *
 * REX knows what you own. It routes to the cheapest capable option automatically.
 */
export async function llm(prompt: string, system?: string, model?: string): Promise<string> {
  const providers = getRoutableProviders()

  if (providers.length === 0) {
    throw new Error('No LLM providers available: Ollama offline, no free tier keys configured')
  }

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, prompt, system, model)
      log.debug(`llm: routed via ${provider.name}`)
      return result
    } catch (err) {
      const msg = String(err)
      if (msg.startsWith('RATE_LIMIT:') || msg.startsWith('NO_KEY:')) {
        log.debug(`llm: skip ${provider.name} — ${msg}`)
        continue
      }
      // Connectivity errors: log warn, try next
      log.warn(`llm: ${provider.name} failed — ${msg}`)
    }
  }

  throw new Error('All LLM providers exhausted')
}
```

**Step 2: Build + test**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build && rex status
```

Attendu : build propre, `rex status` ne crashe pas.

**Step 3: Commit**

```bash
git add packages/cli/src/llm.ts
git commit -m "feat(llm): unified router chain via Vercel AI SDK (Ollama → free tiers → subscription)"
```

---

## Task 4 : Mettre à jour `providers.ts` — enregistrer les free tiers

**Files:**
- Modify: `packages/cli/src/providers.ts`

**Step 1: Ajouter l'import en haut (après les imports existants)**

```typescript
import { FREE_TIER_PROVIDERS, getApiKey, validateProvider } from './free-tiers.js'
```

**Step 2: Dans `createDefaultRegistry()`, ajouter après l'enregistrement de `claude-api` et avant `telegram`**

```typescript
  // ── Free tier API providers (Vercel AI SDK) ──────────
  for (const ft of FREE_TIER_PROVIDERS) {
    if (ft.name === 'Ollama') continue  // Ollama already registered above
    registry.register(ft.name.toLowerCase().replace(/\s+/g, '-'), {
      name: ft.name,
      type: 'llm',
      costTier: 'free',
      capabilities: ['chat', 'code'],
      details: `${ft.rpmLimit} RPM · ${ft.defaultModel}`,
      check: async () => !!getApiKey(ft.envKey),
    })
  }
```

**Step 3: Dans `showProviders()`, enrichir l'affichage avec details**

Chercher la ligne `console.log` dans la boucle for et remplacer par :

```typescript
const detail = p.details ? `  ${C.dim}${p.details}${C.reset}` : ''
console.log(`   ${dot}  ${p.name.padEnd(16)} ${C.dim}${p.type.padEnd(10)}${C.reset} ${caps}${detail}`)
```

**Step 4: Build + test**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build && rex providers
```

Attendu : Groq, Cerebras, Together AI, Mistral, OpenRouter, DeepSeek visibles dans "Owned / Free" avec leur RPM.

**Step 5: Commit**

```bash
git add packages/cli/src/providers.ts
git commit -m "feat(providers): register all free tier APIs in provider registry"
```

---

## Task 5 : Commande `rex free-tiers`

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Ajouter l'import en haut de `index.ts`**

```typescript
import { FREE_TIER_PROVIDERS, getApiKey, validateProvider, getProvidersSnapshot } from './free-tiers.js'
```

**Step 2: Ajouter le case dans `switch (command)` (avant `default:`)**

```typescript
    case 'free-tiers': {
      const testMode = process.argv.includes('--test')
      const jsonMode = process.argv.includes('--json')

      if (jsonMode) {
        console.log(JSON.stringify(getProvidersSnapshot()))
        break
      }

      const C2 = COLORS  // use existing COLORS const from top of file
      const line = '─'.repeat(54)
      console.log(`\n${C2.bold}REX Free Tiers${C2.reset}  ${C2.dim}(Vercel AI SDK)${C2.reset}`)
      console.log(line)

      let configured = 0

      for (const p of FREE_TIER_PROVIDERS) {
        const hasKey = p.name === 'Ollama' ? true : !!getApiKey(p.envKey)
        if (hasKey) configured++
        const dot = hasKey ? `${C2.green}●${C2.reset}` : `${C2.dim}○${C2.reset}`
        const keyStatus = p.name === 'Ollama'
          ? `${C2.green}local${C2.reset}`
          : hasKey
            ? `${C2.green}configured${C2.reset}`
            : `${C2.dim}set ${p.envKey}${C2.reset}`

        if (testMode && hasKey) {
          process.stdout.write(`  ${dot}  ${p.name.padEnd(14)} validating...`)
          const valid = await validateProvider(p)
          const validStr = valid ? `${C2.green}✓ valid${C2.reset}` : `${C2.red}✗ failed${C2.reset}`
          console.log(`\r  ${dot}  ${p.name.padEnd(14)} ${validStr.padEnd(20)} ${C2.dim}${p.rpmLimit} RPM · ${p.defaultModel}${C2.reset}`)
        } else {
          console.log(`  ${dot}  ${p.name.padEnd(14)} ${keyStatus.padEnd(25)} ${C2.dim}${p.rpmLimit} RPM · ${p.defaultModel}${C2.reset}`)
        }
      }

      console.log(`\n${line}`)
      console.log(`  ${configured}/${FREE_TIER_PROVIDERS.length} providers available`)

      if (configured <= 1) {  // Only Ollama
        console.log(`\n  ${C2.yellow}!${C2.reset} Add API keys to ${C2.dim}~/.claude/settings.json${C2.reset} under ${C2.dim}"env"${C2.reset}:`)
        console.log(`  ${C2.dim}GROQ_API_KEY, CEREBRAS_API_KEY, TOGETHER_API_KEY, MISTRAL_API_KEY${C2.reset}`)
        console.log(`  ${C2.dim}OPENROUTER_API_KEY, DEEPSEEK_API_KEY${C2.reset}`)
      }
      console.log()
      break
    }
```

**Step 3: Build + test**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build && rex free-tiers
```

Attendu : liste propre, Ollama en vert (local), les autres gris si pas de clé.

```bash
rex free-tiers --json | head -5
```

Attendu : JSON valide.

**Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): add rex free-tiers command with status and --test validation"
```

---

## Task 6 : Flutter providers_page — status free tiers

**Files:**
- Modify: `packages/flutter_app/lib/services/rex_service.dart`
- Modify: `packages/flutter_app/lib/pages/providers_page.dart`

**Step 1: Lire les deux fichiers avant de modifier**

```bash
wc -l /Users/keiy/Documents/Developer/keiy/rex/packages/flutter_app/lib/services/rex_service.dart
wc -l /Users/keiy/Documents/Developer/keiy/rex/packages/flutter_app/lib/pages/providers_page.dart
```

**Step 2: Ajouter dans `rex_service.dart` — méthode `getFreeTiers()`**

Chercher la section providers et ajouter :

```dart
Future<List<Map<String, dynamic>>> getFreeTiers() async {
  final output = await _runRexArgs(['free-tiers', '--json']);
  final json = _extractJson(output);
  if (json == null) return [];
  try {
    final parsed = jsonDecode(json) as List<dynamic>;
    return parsed.whereType<Map<String, dynamic>>().toList();
  } catch (e) {
    return [];
  }
}
```

**Step 3: Ajouter dans `providers_page.dart` une section Free Tiers**

Utiliser les widgets partagés existants (`RexSection`, `RexCard`, `RexStatRow`, `RexStatusChip`).
Lire le fichier d'abord pour trouver le bon endroit, puis insérer la section en haut de la page (avant les providers existants) :

```dart
RexSection(
  title: 'Free Tier Routing',
  subtitle: 'Vercel AI SDK — Ollama → free tier → subscription',
  child: FutureBuilder<List<Map<String, dynamic>>>(
    future: context.read<RexService>().getFreeTiers(),
    builder: (context, snapshot) {
      if (!snapshot.hasData) {
        return const Padding(
          padding: EdgeInsets.all(12),
          child: CupertinoActivityIndicator(),
        );
      }
      final tiers = snapshot.data!;
      return Column(
        children: tiers.map((tier) {
          final available = tier['available'] == true;
          final blocked = tier['blocked'] == true;
          final name = tier['name'] as String? ?? '';
          final model = tier['defaultModel'] as String? ?? '';
          final rpm = tier['rpmLimit'];

          String statusLabel;
          Color statusColor;
          if (blocked) {
            statusLabel = 'rate-limited';
            statusColor = const Color(0xFFE5484D);
          } else if (available) {
            statusLabel = name == 'Ollama' ? 'local' : 'configured';
            statusColor = const Color(0xFF30A46C);
          } else {
            statusLabel = 'no key';
            statusColor = const Color(0xFF6F6F6F);
          }

          return RexCard(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(
                    available && !blocked
                        ? CupertinoIcons.circle_fill
                        : CupertinoIcons.circle,
                    color: statusColor,
                    size: 10,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: context.rex.textPrimary,
                          ),
                        ),
                        Text(model,
                          style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  RexStatusChip(label: statusLabel, color: statusColor),
                  const SizedBox(width: 8),
                  Text('$rpm RPM',
                    style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      );
    },
  ),
),
```

**Step 4: Flutter build**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex/packages/flutter_app
flutter build macos --debug 2>&1 | tail -20
```

Attendu : build success.

**Step 5: Commit**

```bash
git add packages/flutter_app/lib/services/rex_service.dart
git add packages/flutter_app/lib/pages/providers_page.dart
git commit -m "feat(flutter): show free tier routing status in providers page"
```

---

## Task 7 : Wiring daemon — log free tiers au démarrage

**Files:**
- Modify: `packages/cli/src/daemon.ts`

**Step 1: Ajouter l'import**

Chercher les imports existants et ajouter :

```typescript
import { getRoutableProviders } from './free-tiers.js'
```

**Step 2: Dans la fonction de démarrage du daemon (chercher `log.info` near startup)**

Ajouter après l'init du registry :

```typescript
const routable = getRoutableProviders()
log.info(`LLM routing chain: ${routable.map(p => p.name).join(' → ')}`)
```

**Step 3: Build + test**

```bash
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build
rex daemon &
sleep 2 && kill %1
```

Attendu dans les logs : `LLM routing chain: Ollama → Groq → ...` (selon les clés configurées).

**Step 4: Commit final**

```bash
git add packages/cli/src/daemon.ts
git commit -m "feat(daemon): log LLM routing chain at startup"
```

---

## Vérification finale

```bash
# 1. Build propre
cd /Users/keiy/Documents/Developer/keiy/rex && pnpm build

# 2. Commands CLI
rex free-tiers          # status tous les providers
rex free-tiers --test   # validation live (si clés configurées)
rex providers           # doit montrer les free tiers
rex free-tiers --json   # JSON pour Flutter

# 3. Test routing (Ollama simulé offline)
OLLAMA_URL=http://localhost:99999 rex free-tiers

# 4. Flutter
cd packages/flutter_app && flutter build macos --debug
```

---

## Notes d'architecture

- **Zero LiteLLM server** : on s'inspire des patterns LiteLLM (auto-rotation, catalog, cost-order) mais on n'installe pas de proxy. Vercel AI SDK = notre abstraction, raw OpenAI-compat calls.
- **Ollama via OpenAI-compat** : `createOpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })`. Pas de package community `ollama-ai-provider` supplémentaire.
- **Rate-limit** : tracking in-memory par process. Suffisant pour usage solo. Pas de persistance (reset au restart daemon).
- **Google AI Studio** : nécessite `@ai-sdk/google` (API non-OpenAI-compat). Ajouté en Phase 3 si besoin.
- **Clés API** : config manuelle dans `~/.claude/settings.json` pour l'instant. UI Flutter = lecture seule + status. Saisie depuis l'UI = Phase 3 (écriture sécurisée dans settings.json, chmod 600).
- **Vision** : REX connaît tous les providers disponibles, route automatiquement. Claude Code et Codex restent les orchestrators. REX est le hub qui gère les ressources en dessous.
