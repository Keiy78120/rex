import { readdirSync, readFileSync, chmodSync, renameSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createLogger } from './logger.js'
import { DAEMON_LOG_PATH } from './paths.js'

const log = createLogger('guard-manager')
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
