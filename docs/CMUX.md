# REX × cmux — Implementation Plan (10/03/2026)

> Visual orchestration layer pour `rex anti-vibe` sur Mac.
> Cross-platform via sessions_spawn (fallback), Mac-native via cmux panes.

---

## Architecture

```
rex anti-vibe <task> sur Mac avec cmux installé
        │
        ▼
    ┌─────────────────┐
    │ rex-cmux.ts     │ ← detect cmux availability
    │ detectCmux()    │
    └────────┬────────┘
             │
    ┌────────▼──────────────────────────┐
    │ cmux sockets + CLI                 │
    │ /tmp/cmux.{pid}.sock               │
    │ cmux new-pane --label "Planner"    │
    └────────┬──────────────────────────┘
             │
    ┌────────▼────────────────────────────────────┐
    │ pane-relay.ts (adapted for cmux)            │
    │ runPaneRelayWithCmux()                      │
    │ - spawn panes visually                      │
    │ - send keys via cmux CLI                    │
    │ - notification rings via OSC                │
    │ - browser pane for web searches             │
    └────────┬────────────────────────────────────┘
             │
    ┌────────▼──────────┐
    │ Visual relay UI   │
    │ ┌──────┬──────┬──────┬──────┐
    │ │Plan  │Code  │Rev.  │Share │
    │ │  ◆   │  ◆   │  ◆   │  ◆   │ ← notification rings
    │ │      │      │      │      │
    │ └──────┴──────┴──────┴──────┘
    │   git branch, PR, notifications sidebar
    └───────────────────────────┘
```

---

## Files à créer

### 1. `rex-cmux.ts` — Detection + wrapper

```typescript
// packages/cli/src/rex-cmux.ts

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createLogger } from './logger.js'

const log = createLogger('UI:cmux')

export interface CmuxPane {
  id: string
  label: string
  type: 'terminal' | 'browser'
  index?: number
}

export interface CmuxConfig {
  socketPath: string
  available: boolean
  version?: string
}

export async function detectCmux(): Promise<CmuxConfig> {
  try {
    const version = execSync('cmux --version', { encoding: 'utf-8' }).trim()
    const socketPath = `/tmp/cmux.${process.pid}.sock`
    return { available: true, version, socketPath }
  } catch {
    return { available: false, socketPath: '' }
  }
}

export async function cmuxNewPane(label: string, type: 'terminal' | 'browser' = 'terminal'): Promise<CmuxPane> {
  // CLI: cmux new-pane --label "Planner" [--type browser]
  const cmd = `cmux new-pane --label "${label}" ${type === 'browser' ? '--type browser' : ''}`
  try {
    const output = execSync(cmd, { encoding: 'utf-8' }).trim()
    const index = parseInt(output.match(/pane (\d+)/)?.[1] ?? '0')
    return { id: `pane-${index}`, label, type, index }
  } catch (e) {
    log.warn(`cmux new-pane failed: ${e}`)
    return { id: 'fallback', label, type }
  }
}

export async function cmuxSendKeys(paneIndex: number, keys: string): Promise<void> {
  // CLI: cmux send-keys --pane 0 "your command"
  const cmd = `cmux send-keys --pane ${paneIndex} "${keys.replace(/"/g, '\\"')}"`
  try {
    execSync(cmd)
  } catch (e) {
    log.warn(`cmux send-keys failed: ${e}`)
  }
}

export async function cmuxNotify(title: string, body?: string): Promise<void> {
  // OSC escape sequence — works cross-platform
  // OSC 9 (basic), OSC 99 (advanced), OSC 777 (Ghostty)
  process.stdout.write(`\x1b]9;${title}\x07`)
  if (body) {
    process.stdout.write(`\x1b]777;notify;${title};${body}\x07`)
  }
}

export async function cmuxOpenBrowser(url: string): Promise<void> {
  // CLI: cmux browser open "https://example.com"
  const cmd = `cmux browser open "${url}"`
  try {
    execSync(cmd)
  } catch (e) {
    log.warn(`cmux browser failed: ${e}`)
  }
}

export async function cmuxSnapshot(): Promise<string> {
  // CLI: cmux workspace snapshot → returns JSON
  try {
    return execSync('cmux workspace snapshot', { encoding: 'utf-8' })
  } catch (e) {
    return '{}'
  }
}
```

### 2. Adapter `pane-relay.ts` pour cmux

Dans `pane-relay.ts`, ajouter :

```typescript
import { detectCmux, cmuxNewPane, cmuxSendKeys, cmuxNotify, CmuxConfig } from './rex-cmux.js'

export async function runPaneRelayWithCmux(
  options: PaneRelayOptions,
  cmuxConfig: CmuxConfig
): Promise<PaneRelayResult> {
  if (!cmuxConfig.available) {
    // Fallback: sessions_spawn classique
    return runPaneRelay(options)
  }

  const start = Date.now()
  const sessionId = `relay-${Date.now()}`
  const panes = options.panes ?? DEFAULT_PANES

  // Créer les panes cmux visuellement
  const paneMap: Record<string, CmuxPane> = {}
  for (const pane of panes) {
    const cmuxPane = await cmuxNewPane(pane.id, 'terminal')
    paneMap[pane.id] = cmuxPane
  }

  // Pane pour SHARED.md
  const sharedPane = await cmuxNewPane('SHARED.md', 'terminal')
  paneMap['shared'] = sharedPane

  // Orchestrer le relay
  for (const pane of panes) {
    const cmuxPane = paneMap[pane.id]
    if (!cmuxPane.index) continue

    options.onProgress?.(pane.id, `Starting ${pane.role}...`)

    // Envoyer la commande au pane
    const prompt = buildPrompt(pane, options)
    await cmuxSendKeys(cmuxPane.index, `cat << 'EOF'\n${prompt}\nEOF`)

    // Attendre que l'agent réponde
    // (en vrai, il faut vraiment que le pane exécute la commande et REX la capture via stdout)

    // Notifier quand le pane finit
    await cmuxNotify(`${pane.id} completed`, `Confidence: 0.85`)
  }

  return {
    conclusion: 'Relay completed via cmux visual interface',
    consensus: true,
    confidence: 0.85,
    contributions: paneMap,
    sharedDoc: '',
    durationMs: Date.now() - start,
  }
}
```

### 3. Modifier `anti-vibecoding.ts`

```typescript
// Dans runAntiVibecoding()
const cmuxConfig = await detectCmux()

if (cmuxConfig.available) {
  console.log(`${GREEN}✓ cmux detected${RESET} — running visual relay`)
  result = await runPaneRelayWithCmux(options, cmuxConfig)
} else {
  console.log(`${DIM}cmux not found — using sessions_spawn fallback${RESET}`)
  result = await runPaneRelay(options)
}
```

---

## Intégration avec gateway.ts

Gateway peut détecter cmux et l'utiliser pour les notifications Telegram → visual rings sur Mac :

```typescript
// Dans gateway.ts, quand on envoie une réponse Telegram
if (process.platform === 'darwin') {
  const cmux = await detectCmux()
  if (cmux.available) {
    // Notifier via cmux rings + Telegram
    await cmuxNotify('REX', `Réponse prête: ${response.slice(0, 50)}...`)
  }
}
```

---

## OSC escape sequences (cross-platform)

Ces séquences fonctionnent partout, pas seulement cmux :

```typescript
// Basic notification (OSC 9)
process.stdout.write('\x1b]9;REX Relay\x07')

// Advanced (OSC 777 — Ghostty/cmux)
process.stdout.write('\x1b]777;notify;REX;Consensus atteint\x07')

// Dans les panes pour les notification rings
console.log('\x1b]9;PLANNER_WAITING\x07')
console.log('\x1b]9;CODER_IN_PROGRESS\x07')
console.log('\x1b]9;REVIEWER_DONE\x07')
```

---

## Limitations + workarounds

| Limitation | Workaround |
|-----------|-----------|
| cmux only on Mac | Detect + fallback sessions_spawn |
| Output capture from panes | Parse terminal output, tail logs |
| Multi-line input | Use `cmux send-keys` + Enter |
| Browser pane only on new pane | Can open in sidebar split |
| No direct socket JSON API (yet) | Use CLI + exit codes |

---

## CLI commands à supporter

```bash
# Setup
cmux new-pane --label "Planner" --index 0
cmux new-pane --label "Coder" --index 1
cmux new-pane --label "Reviewer" --index 2
cmux new-pane --label "SHARED.md" --index 3 --readonly

# Orchestration
cmux send-keys --pane 0 "cat prompt.txt && read response"
cmux send-keys --pane 0 "Enter"

# Notifications
cmux notify "REX Relay" "Consensus atteint"

# Browser
cmux browser open "https://example.com"
cmux browser inject-js "document.querySelector('h1')"

# Workspace state
cmux workspace snapshot
cmux workspace save "relay-session-1"
```

---

## Implementation order

1. **Phase 1** — cmux detection + wrapper (`rex-cmux.ts`)
2. **Phase 2** — Adapt pane-relay for visual output
3. **Phase 3** — OSC notifications everywhere
4. **Phase 4** — Browser pane integration (Playwright → cmux browser)
5. **Phase 5** — Sidebar state + git integration

Pour la phase 1, on peut juste faire le detection + CLI commands, sans changer le relay logic.
