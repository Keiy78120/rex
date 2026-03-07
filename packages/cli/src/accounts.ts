/**
 * REX Multi-Account Manager
 * Isolates Claude accounts via CLAUDE_CONFIG_DIR.
 * Commands: rex accounts list|add|switch|aliases
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const logger = createLogger('accounts')

export interface Account {
  name: string
  configDir: string
}

function accountsConfigPath(): string {
  return join(homedir(), '.claude', 'rex', 'accounts.json')
}

export function getAccountsConfig(): { accounts: Account[] } {
  const configPath = accountsConfigPath()
  if (!existsSync(configPath)) return { accounts: [] }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as { accounts: Account[] }
  } catch {
    return { accounts: [] }
  }
}

export function saveAccountsConfig(config: { accounts: Account[] }): void {
  const configPath = accountsConfigPath()
  mkdirSync(join(homedir(), '.claude', 'rex'), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

export function listAccounts(): void {
  const { accounts } = getAccountsConfig()
  const current = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  if (accounts.length === 0) {
    console.log('No accounts configured. Run: rex accounts add <name>')
    return
  }
  for (const acc of accounts) {
    const active = acc.configDir === current ? ' ← active' : ''
    console.log(`  ${acc.name}: ${acc.configDir}${active}`)
  }
}

export function addAccount(name: string): void {
  const configDir = join(homedir(), `.claude-${name}`)
  mkdirSync(configDir, { recursive: true })
  const { accounts } = getAccountsConfig()
  if (accounts.find(a => a.name === name)) {
    console.log(`Account "${name}" already exists`)
    return
  }
  accounts.push({ name, configDir })
  saveAccountsConfig({ accounts })
  logger.info(`Account "${name}" created at ${configDir}`)
  console.log(`✅ Account "${name}" created at ${configDir}`)
  console.log(`Login: CLAUDE_CONFIG_DIR=${configDir} claude`)
  console.log(`Or add to ~/.zshrc: alias claude-${name}='CLAUDE_CONFIG_DIR=${configDir} claude'`)
}

export function switchAccount(name: string): void {
  const { accounts } = getAccountsConfig()
  const acc = accounts.find(a => a.name === name)
  if (!acc) {
    console.log(`Account "${name}" not found. Run: rex accounts list`)
    return
  }
  // Print export command — caller evaluates with: eval $(rex accounts switch <name>)
  console.log(`export CLAUDE_CONFIG_DIR="${acc.configDir}"`)
  logger.info(`Switch to account: ${name}`)
}

export function removeAccount(name: string): void {
  const config = getAccountsConfig()
  const idx = config.accounts.findIndex(a => a.name === name)
  if (idx === -1) {
    console.log(`Account "${name}" not found. Run: rex accounts list`)
    return
  }
  const [removed] = config.accounts.splice(idx, 1)
  saveAccountsConfig(config)
  logger.info(`Account "${name}" removed`)
  console.log(`✅ Account "${name}" removed (config dir preserved at ${removed.configDir})`)
}

export function generateAliases(): void {
  const { accounts } = getAccountsConfig()
  if (accounts.length === 0) {
    console.log('No accounts configured. Run: rex accounts add <name>')
    return
  }
  console.log('# Add these to your ~/.zshrc or ~/.bashrc:')
  for (const acc of accounts) {
    console.log(`alias claude-${acc.name}='CLAUDE_CONFIG_DIR=${acc.configDir} claude'`)
  }
}

export async function accounts(args: string[]): Promise<void> {
  const sub = args[0]
  switch (sub) {
    case 'list':
    case undefined:
      listAccounts()
      break
    case 'add': {
      const name = args[1]
      if (!name) { console.log('Usage: rex accounts add <name>'); break }
      addAccount(name)
      break
    }
    case 'switch': {
      const name = args[1]
      if (!name) { console.log('Usage: rex accounts switch <name>'); break }
      switchAccount(name)
      break
    }
    case 'remove': {
      const name = args[1]
      if (!name) { console.log('Usage: rex accounts remove <name>'); break }
      removeAccount(name)
      break
    }
    case 'aliases':
      generateAliases()
      break
    default:
      console.log(`Unknown accounts subcommand: ${sub}`)
      console.log('Usage: rex accounts [list|add|switch|remove|aliases]')
  }
}
