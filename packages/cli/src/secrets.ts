/**
 * REX Secrets Manager
 *
 * AES-256-GCM encrypted secrets vault stored at ~/.claude/rex/secrets.enc
 * Master key stored at ~/.claude/rex/master.key (chmod 600, generated once).
 *
 * Secrets come from two sources (in priority order):
 *   1. ~/.claude/rex/secrets.enc  (encrypted vault — preferred)
 *   2. ~/.claude/settings.json .env section  (plaintext fallback)
 *
 * Usage:
 *   rex secrets:list               Show secret keys (values masked)
 *   rex secrets:set KEY=VALUE      Add or update a secret
 *   rex secrets:delete KEY         Remove a secret
 *   rex secrets:rotate             Generate new master key, re-encrypt all
 *   rex secrets:export             Migrate from settings.json to encrypted vault
 *
 * @module CORE
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { REX_DIR } from './paths.js'
import { createLogger } from './logger.js'

const log = createLogger('CORE:secrets')

// ── Paths ──────────────────────────────────────────────────────────────────

const MASTER_KEY_PATH = join(REX_DIR, 'master.key')
const SECRETS_PATH = join(REX_DIR, 'secrets.enc')
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

// ── Crypto constants ──────────────────────────────────────────────────────

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32   // 256 bits
const IV_LEN = 12    // 96 bits for GCM
const TAG_LEN = 16   // 128 bits auth tag
const SALT = 'rex-secrets-v1'  // deterministic salt (key derivation only)

// ── Master key ────────────────────────────────────────────────────────────

function loadOrCreateMasterKey(): Buffer {
  if (existsSync(MASTER_KEY_PATH)) {
    return Buffer.from(readFileSync(MASTER_KEY_PATH, 'utf-8').trim(), 'hex')
  }
  const key = randomBytes(KEY_LEN)
  if (!existsSync(REX_DIR)) mkdirSync(REX_DIR, { recursive: true })
  writeFileSync(MASTER_KEY_PATH, key.toString('hex') + '\n', { mode: 0o600 })
  chmodSync(MASTER_KEY_PATH, 0o600)
  log.info('Generated new master key at ~/.claude/rex/master.key')
  return key
}

function deriveKey(masterKey: Buffer): Buffer {
  return scryptSync(masterKey, SALT, KEY_LEN) as Buffer
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(hex) + ':' + tag(hex) + ':' + ciphertext(hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc).toString('utf-8') + decipher.final('utf-8')
}

// ── Vault I/O ─────────────────────────────────────────────────────────────

interface VaultFile {
  version: number
  secrets: Record<string, string>  // key → encrypted value
}

function loadVault(key: Buffer): Record<string, string> {
  if (!existsSync(SECRETS_PATH)) return {}
  try {
    const raw = JSON.parse(readFileSync(SECRETS_PATH, 'utf-8')) as VaultFile
    const result: Record<string, string> = {}
    for (const [k, enc] of Object.entries(raw.secrets ?? {})) {
      try { result[k] = decrypt(enc, key) } catch { /* skip corrupt entry */ }
    }
    return result
  } catch { return {} }
}

function saveVault(secrets: Record<string, string>, key: Buffer): void {
  const encrypted: Record<string, string> = {}
  for (const [k, v] of Object.entries(secrets)) {
    encrypted[k] = encrypt(v, key)
  }
  const vault: VaultFile = { version: 1, secrets: encrypted }
  if (!existsSync(REX_DIR)) mkdirSync(REX_DIR, { recursive: true })
  writeFileSync(SECRETS_PATH, JSON.stringify(vault, null, 2) + '\n', { mode: 0o600 })
  chmodSync(SECRETS_PATH, 0o600)
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Read a secret by key.
 * Falls back to settings.json if not in encrypted vault.
 */
export function getSecret(key: string): string | undefined {
  try {
    const masterKey = loadOrCreateMasterKey()
    const dk = deriveKey(masterKey)
    const vault = loadVault(dk)
    if (vault[key] !== undefined) return vault[key]
  } catch {}

  // Fallback: settings.json plaintext env
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) as { env?: Record<string, string> }
    return settings.env?.[key]
  } catch {}

  return process.env[key]
}

/**
 * Set a secret in the encrypted vault.
 */
export function setSecret(key: string, value: string): void {
  const masterKey = loadOrCreateMasterKey()
  const dk = deriveKey(masterKey)
  const vault = loadVault(dk)
  vault[key] = value
  saveVault(vault, dk)
  log.info(`Secret '${key}' saved to encrypted vault`)
}

/**
 * Delete a secret from the vault.
 */
export function deleteSecret(key: string): boolean {
  const masterKey = loadOrCreateMasterKey()
  const dk = deriveKey(masterKey)
  const vault = loadVault(dk)
  if (!(key in vault)) return false
  delete vault[key]
  saveVault(vault, dk)
  log.info(`Secret '${key}' deleted`)
  return true
}

/**
 * List all secret keys (values never exposed).
 */
export function listSecrets(): string[] {
  try {
    const masterKey = loadOrCreateMasterKey()
    const dk = deriveKey(masterKey)
    const vault = loadVault(dk)
    return Object.keys(vault).sort()
  } catch { return [] }
}

/**
 * Rotate master key: generate a new key, re-encrypt all secrets.
 * The old key file is overwritten — no recovery without backup.
 */
export function rotateSecrets(): { rotated: number; newKeyPath: string } {
  // 1. Read all secrets with old key
  const oldMasterKey = loadOrCreateMasterKey()
  const oldDk = deriveKey(oldMasterKey)
  const vault = loadVault(oldDk)

  // 2. Generate new key
  const newMasterKey = randomBytes(KEY_LEN)
  const newDk = deriveKey(newMasterKey)

  // 3. Re-encrypt with new key
  saveVault(vault, newDk)

  // 4. Overwrite master key file
  writeFileSync(MASTER_KEY_PATH, newMasterKey.toString('hex') + '\n', { mode: 0o600 })
  chmodSync(MASTER_KEY_PATH, 0o600)

  log.info(`Secrets rotated: ${Object.keys(vault).length} secrets re-encrypted`)
  return { rotated: Object.keys(vault).length, newKeyPath: MASTER_KEY_PATH }
}

/**
 * Import secrets from settings.json into the encrypted vault.
 * Keeps settings.json untouched (non-destructive migration).
 */
export function importFromSettings(): { imported: number; skipped: number } {
  let imported = 0, skipped = 0
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) as { env?: Record<string, string> }
    const env = settings.env ?? {}
    const masterKey = loadOrCreateMasterKey()
    const dk = deriveKey(masterKey)
    const vault = loadVault(dk)
    for (const [k, v] of Object.entries(env)) {
      if (!v || k.startsWith('_')) { skipped++; continue }
      vault[k] = v
      imported++
    }
    saveVault(vault, dk)
    log.info(`Imported ${imported} secrets from settings.json`)
  } catch (e: any) {
    log.error(`Import failed: ${e.message}`)
  }
  return { imported, skipped }
}

// ── CLI printer ───────────────────────────────────────────────────────────

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }

export function printSecrets(): void {
  const keys = listSecrets()
  const vaultExists = existsSync(SECRETS_PATH)
  const keyExists = existsSync(MASTER_KEY_PATH)

  console.log(`\n${C.bold}REX Secrets Vault${C.reset}`)
  console.log('─'.repeat(48))
  console.log(`  Vault:      ${vaultExists ? `${C.green}encrypted${C.reset}` : `${C.yellow}not initialized${C.reset}`}  ${SECRETS_PATH}`)
  console.log(`  Master key: ${keyExists ? `${C.green}present${C.reset}` : `${C.red}missing${C.reset}`}  ${MASTER_KEY_PATH}`)
  console.log(`  Secrets:    ${keys.length}`)
  console.log()

  if (keys.length === 0) {
    console.log(`  ${C.dim}No secrets stored. Run 'rex secrets:export' to import from settings.json${C.reset}`)
  } else {
    for (const k of keys) {
      console.log(`  ${C.green}●${C.reset}  ${k}  ${C.dim}[encrypted]${C.reset}`)
    }
  }
  console.log()
}
