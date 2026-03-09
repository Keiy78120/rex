/** @module TOOLS */
import { readdirSync, readFileSync, writeFileSync, chmodSync, renameSync, existsSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from './logger.js'
import { DAEMON_LOG_PATH } from './paths.js'

const log = createLogger('TOOLS:guards')
const HOME = process.env.HOME || '~'
const GUARDS_DIR = join(HOME, '.claude', 'rex-guards')

export interface GuardInfo {
  name: string
  file: string
  description: string
  hook: string
  enabled: boolean
}

function parseGuardFile(filePath: string): Omit<GuardInfo, 'enabled'> | null {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n').slice(0, 6)
    const descLine = lines.find(l => l.startsWith('# REX Guard:'))
    const hookLine = lines.find(l => l.startsWith('# Hook:'))
    return {
      name: basename(filePath).replace(/\.(sh|disabled)$/g, ''),
      file: basename(filePath),
      description: descLine ? descLine.replace('# REX Guard:', '').trim() : 'No description',
      hook: hookLine ? hookLine.replace('# Hook:', '').trim() : 'unknown',
    }
  } catch {
    return null
  }
}

export function listGuards(): GuardInfo[] {
  if (!existsSync(GUARDS_DIR)) {
    log.warn(`Guards directory not found: ${GUARDS_DIR}`)
    return []
  }

  const files = readdirSync(GUARDS_DIR)
  const guards: GuardInfo[] = []

  for (const file of files) {
    const isScript = file.endsWith('.sh') || file.endsWith('.sh.disabled')
    if (!isScript) continue

    const filePath = join(GUARDS_DIR, file)
    const info = parseGuardFile(filePath)
    if (!info) continue

    const stat = statSync(filePath)
    const isExecutable = (stat.mode & 0o111) !== 0
    const isDisabled = file.endsWith('.disabled')

    guards.push({
      ...info,
      enabled: isExecutable && !isDisabled,
    })
  }

  return guards.sort((a, b) => a.name.localeCompare(b.name))
}

export function enableGuard(name: string): boolean {
  const guards = listGuards()
  const guard = guards.find(g => g.name === name)
  if (!guard) {
    log.error(`Guard not found: ${name}`)
    return false
  }

  const filePath = join(GUARDS_DIR, guard.file)

  if (guard.file.endsWith('.disabled')) {
    const newPath = filePath.replace(/\.disabled$/, '')
    renameSync(filePath, newPath)
    chmodSync(newPath, 0o755)
    log.info(`Guard enabled: ${name}`)
  } else {
    chmodSync(filePath, 0o755)
    log.info(`Guard enabled: ${name}`)
  }

  return true
}

export function disableGuard(name: string): boolean {
  const guards = listGuards()
  const guard = guards.find(g => g.name === name)
  if (!guard) {
    log.error(`Guard not found: ${name}`)
    return false
  }

  const filePath = join(GUARDS_DIR, guard.file)

  if (!guard.file.endsWith('.disabled')) {
    const newPath = filePath + '.disabled'
    renameSync(filePath, newPath)
    chmodSync(newPath, 0o644)
    log.info(`Guard disabled: ${name}`)
  } else {
    chmodSync(filePath, 0o644)
    log.info(`Guard disabled: ${name}`)
  }

  return true
}

// ── Registry ─────────────────────────────────────────────────────────────────

/** Directory of built-in guard templates (co-located with this source file). */
function getRegistryDir(): string {
  // Works both from source (src/guards/) and installed (dist/../src/guards/)
  const thisFile = fileURLToPath(import.meta.url)
  const candidates = [
    join(dirname(thisFile), '..', 'src', 'guards'),   // installed: dist/ → src/guards/
    join(dirname(thisFile), 'guards'),                  // source: src/guards/
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fallback: installed rex-claude package
  return join(HOME, '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', 'rex-claude', 'src', 'guards')
}

export function listRegistry(): string[] {
  const dir = getRegistryDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.sh'))
    .map(f => f.replace(/\.sh$/, ''))
    .sort()
}

/** Copy a guard from the built-in registry to ~/.claude/rex-guards/ */
export function addGuard(name: string): { ok: boolean; message: string } {
  const registryDir = getRegistryDir()
  const src = join(registryDir, `${name}.sh`)

  if (!existsSync(src)) {
    const available = listRegistry().join(', ')
    return { ok: false, message: `Guard '${name}' not found in registry. Available: ${available}` }
  }

  if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })

  const dest = join(GUARDS_DIR, `${name}.sh`)
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
  log.info(`Guard added: ${name} → ${dest}`)
  return { ok: true, message: `Guard '${name}' installed to ${dest}` }
}

const GUARD_TEMPLATE = (name: string) => `#!/bin/bash
# REX Guard: ${name}
# Hook: PostToolUse (matcher: Edit|Write)
# Detects: <describe what this guard checks>
# Action: WARNING

INPUT="\${CLAUDE_TOOL_INPUT:-\$TOOL_INPUT}"

# Only check relevant file types
if ! echo "\$INPUT" | grep -qE '\\.(ts|tsx|js|jsx)'; then
  exit 0
fi

# Extract file path from tool input
FILE_PATH=\$(echo "\$INPUT" | grep -oE '[a-zA-Z0-9_./@-]+\\.(ts|tsx|js|jsx)' | head -1)
if [ -z "\$FILE_PATH" ] || [ ! -f "\$FILE_PATH" ]; then
  exit 0
fi

ISSUES=""

# TODO: Add your grep checks here
# Example:
# if grep -qE 'some_pattern' "\$FILE_PATH" 2>/dev/null; then
#   ISSUES="\${ISSUES}\\n  - Found problematic pattern"
# fi

if [ -n "\$ISSUES" ]; then
  echo "REX Guard [${name}]: Issues found in \${FILE_PATH}:"
  echo -e "\$ISSUES"
fi

exit 0
`

/** Create a new custom guard from a template */
export function createGuard(name: string): { ok: boolean; message: string; path?: string } {
  if (!name.match(/^[a-z0-9-]+$/)) {
    return { ok: false, message: 'Guard name must be lowercase letters, numbers, and hyphens only' }
  }

  if (!existsSync(GUARDS_DIR)) mkdirSync(GUARDS_DIR, { recursive: true })

  const dest = join(GUARDS_DIR, `${name}.sh`)
  if (existsSync(dest)) {
    return { ok: false, message: `Guard '${name}' already exists at ${dest}` }
  }

  writeFileSync(dest, GUARD_TEMPLATE(name))
  chmodSync(dest, 0o755)
  log.info(`Guard created: ${name} → ${dest}`)
  return { ok: true, message: `Guard '${name}' created at ${dest}. Edit it to add your logic.`, path: dest }
}

export function getGuardLogs(name?: string, limit = 30): string[] {
  if (!existsSync(DAEMON_LOG_PATH)) return []

  try {
    const content = readFileSync(DAEMON_LOG_PATH, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    const filtered = name
      ? lines.filter(l => l.toLowerCase().includes('guard') && l.toLowerCase().includes(name.toLowerCase()))
      : lines.filter(l => l.toLowerCase().includes('guard'))

    return filtered.slice(-limit)
  } catch {
    return []
  }
}
