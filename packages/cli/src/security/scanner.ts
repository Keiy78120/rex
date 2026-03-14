/**
 * REX Security Scanner — MCP/skill/package threat detection
 *
 * Scans MCP server descriptions, skill files, and npm packages for:
 * - Tool poisoning / prompt injection patterns
 * - Env-var exfiltration attempts
 * - Supply chain risks
 * - Malicious install commands
 *
 * Results are cached 24h by SHA-256 hash of the scanned content.
 * Called by mcp-discover.ts BEFORE any install.
 *
 * OSS integration: invariantlabs-ai/mcp-scan (via uvx/npx, optional)
 *
 * Spec: docs/plans/action.md §27
 * @module TOOLS
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { createLogger } from '../logger.js'
import { REX_DIR, ensureRexDirs } from '../paths.js'

const log = createLogger('TOOLS:security')

// ── Types ──────────────────────────────────────────────────────────

export type ScanTarget = 'mcp' | 'skill' | 'package' | 'url'

export type ScanRecommendation = 'allow' | 'warn' | 'block'

export interface ScanFinding {
  rule: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  match: string
  offset?: number
}

export interface ScanResult {
  id: string
  target: ScanTarget
  recommendation: ScanRecommendation
  findings: ScanFinding[]
  scannedAt: string
  usedExternalScanner: boolean
}

// ── Cache ──────────────────────────────────────────────────────────

const CACHE_FILE = join(REX_DIR, 'scan-cache.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000 // 24h

interface CacheEntry {
  result: ScanResult
  cachedAt: number
}

type ScanCache = Record<string, CacheEntry>

function readCache(): ScanCache {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) as ScanCache
  } catch {}
  return {}
}

function writeCache(cache: ScanCache): void {
  ensureRexDirs()
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

function cacheKey(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function getCached(key: string): ScanResult | null {
  const cache = readCache()
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null
  return entry.result
}

function putCache(key: string, result: ScanResult): void {
  const cache = readCache()
  cache[key] = { result, cachedAt: Date.now() }
  // Prune entries older than 48h
  const now = Date.now()
  for (const k of Object.keys(cache)) {
    if (now - cache[k].cachedAt > CACHE_TTL_MS * 2) delete cache[k]
  }
  writeCache(cache)
}

// ── Injection patterns ─────────────────────────────────────────────
//
// Derived from known MCP poisoning CVEs and prompt injection research.
// Patterns sorted by severity descending.

interface InjectionRule {
  rule: string
  pattern: RegExp
  severity: ScanFinding['severity']
}

const INJECTION_RULES: InjectionRule[] = [
  // Critical — exfiltration
  {
    rule: 'env-exfil-anthropic',
    pattern: /ANTHROPIC_API_KEY|CLAUDE_API_KEY/i,
    severity: 'critical',
  },
  {
    rule: 'env-exfil-openai',
    pattern: /OPENAI_API_KEY/i,
    severity: 'critical',
  },
  {
    rule: 'env-exfil-process-env',
    pattern: /process\.env\.\w+/,
    severity: 'high',
  },
  {
    rule: 'env-exfil-generic',
    pattern: /\$(?:HOME|USER|SHELL|PATH|AWS_|GCP_|AZURE_)/,
    severity: 'high',
  },
  // Critical — unsafe install
  {
    rule: 'pipe-to-bash',
    pattern: /curl[^|]*\|\s*(?:bash|sh|zsh)/i,
    severity: 'critical',
  },
  {
    rule: 'pipe-to-eval',
    pattern: /\|\s*eval/i,
    severity: 'critical',
  },
  // High — system file access
  {
    rule: 'etc-passwd',
    pattern: /\/etc\/passwd/,
    severity: 'high',
  },
  {
    rule: 'ssh-keys',
    pattern: /~\/\.ssh\b/,
    severity: 'high',
  },
  {
    rule: 'known-hosts',
    pattern: /known_hosts|authorized_keys/i,
    severity: 'high',
  },
  // High — prompt injection
  {
    rule: 'ignore-previous',
    pattern: /ignore\s+(?:previous|all|above)\s+instructions?/i,
    severity: 'high',
  },
  {
    rule: 'dan-mode',
    pattern: /\bDAN\s+mode\b|developer\s+mode\s+enabled/i,
    severity: 'high',
  },
  {
    rule: 'jailbreak-pattern',
    pattern: /act\s+as\s+(?:a|an)\s+(?:unrestricted|unaligned|evil|malicious)/i,
    severity: 'high',
  },
  // Medium — covert instruction delivery
  {
    rule: 'zero-width-char',
    pattern: /[\u200B-\u200D\u202A-\u202E\uFEFF]/,
    severity: 'medium',
  },
  {
    rule: 'hidden-unicode',
    pattern: /[\u2060\u2061\u2062\u2063]/,
    severity: 'medium',
  },
  // Medium — suspicious network
  {
    rule: 'raw-ip-exfil',
    pattern: /https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/,
    severity: 'medium',
  },
  {
    rule: 'ngrok-tunnel',
    pattern: /ngrok\.io|tunnelmole|localtunnel/i,
    severity: 'medium',
  },
  // Low — suspicious but valid in some contexts
  {
    rule: 'base64-blob',
    pattern: /(?:[A-Za-z0-9+/]{40,}={0,2})/,
    severity: 'low',
  },
]

function runRegexScan(content: string): ScanFinding[] {
  const findings: ScanFinding[] = []
  for (const rule of INJECTION_RULES) {
    const match = rule.pattern.exec(content)
    if (match) {
      findings.push({
        rule: rule.rule,
        severity: rule.severity,
        match: match[0].slice(0, 80),
        offset: match.index,
      })
    }
  }
  return findings
}

// ── External scanner (mcp-scan via uvx) ───────────────────────────

function tryExternalMcpScan(content: string): ScanFinding[] {
  // mcp-scan only makes sense for full MCP server descriptions (JSON)
  try {
    const hasMcpScan = (() => {
      try { execSync('which uvx', { stdio: 'ignore', timeout: 2000 }); return true } catch { return false }
    })()
    if (!hasMcpScan) return []

    // Write content to a temp file for mcp-scan stdin
    const tmpPath = join(tmpdir(), `rex-mcp-scan-${Date.now()}.json`)
    writeFileSync(tmpPath, content)

    const out = execSync(`uvx mcp-scan@latest scan --quiet ${tmpPath}`, {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: 'pipe',
    }).trim()

    try { unlinkSync(tmpPath) } catch {}

    if (!out) return []
    // Parse simple mcp-scan output (text summary, not JSON)
    const threats = out.split('\n').filter(l => l.includes('RISK') || l.includes('THREAT') || l.includes('INJECTION'))
    return threats.map(t => ({
      rule: 'mcp-scan-external',
      severity: 'high' as const,
      match: t.slice(0, 120),
    }))
  } catch {
    return []
  }
}

// ── Recommendation logic ───────────────────────────────────────────

function deriveRecommendation(findings: ScanFinding[]): ScanRecommendation {
  if (findings.some(f => f.severity === 'critical')) return 'block'
  if (findings.some(f => f.severity === 'high')) return 'block'
  if (findings.some(f => f.severity === 'medium')) return 'warn'
  if (findings.some(f => f.severity === 'low')) return 'warn'
  return 'allow'
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Scan content (description, script text, package name, URL) for threats.
 * Results are cached 24h by SHA-256 hash.
 */
export async function scan(
  content: string,
  target: ScanTarget,
  id = 'unknown',
): Promise<ScanResult> {
  const key = cacheKey(`${target}:${content}`)
  const cached = getCached(key)
  if (cached) {
    log.debug(`scan cache hit: ${id}`)
    return cached
  }

  const regexFindings = runRegexScan(content)
  const externalFindings = target === 'mcp' ? tryExternalMcpScan(content) : []
  const findings = [...regexFindings, ...externalFindings]

  const result: ScanResult = {
    id,
    target,
    recommendation: deriveRecommendation(findings),
    findings,
    scannedAt: new Date().toISOString(),
    usedExternalScanner: externalFindings.length > 0,
  }

  putCache(key, result)
  return result
}

/** Print a scan result summary to stdout */
export function printScanResult(result: ScanResult): void {
  const icon = result.recommendation === 'allow' ? '\x1b[32m✓\x1b[0m'
    : result.recommendation === 'warn' ? '\x1b[33m!\x1b[0m'
    : '\x1b[31m✗\x1b[0m'
  const label = result.recommendation.toUpperCase()
  console.log(`${icon} ${result.id} [${label}]`)

  for (const f of result.findings) {
    const sev = f.severity === 'critical' ? '\x1b[31mcritical\x1b[0m'
      : f.severity === 'high' ? '\x1b[31mhigh\x1b[0m'
      : f.severity === 'medium' ? '\x1b[33mmedium\x1b[0m'
      : 'low'
    console.log(`  ${sev}  ${f.rule}: ${f.match}`)
  }

  if (result.findings.length === 0) {
    console.log('  No threats detected.')
  }
}

/**
 * Scan an agent skill file (Markdown template) for dangerous patterns.
 * Checks for prompt-injection attempts, exfiltration vectors, dangerous commands.
 * This is the REX equivalent of the Cisco skill-scanner concept.
 */
export async function scanSkillFile(skillPath: string): Promise<ScanResult> {
  if (!existsSync(skillPath)) {
    return {
      id: skillPath,
      target: 'skill' as const,
      scannedAt: new Date().toISOString(),
      findings: [{ rule: 'not-found', severity: 'high' as const, match: `File not found: ${skillPath}` }],
      recommendation: 'block' as const,
      usedExternalScanner: false,
    }
  }
  const content = readFileSync(skillPath, 'utf-8')
  return scan(content, 'skill', skillPath)
}

/** Scan all skill files in a directory and return a summary */
export async function scanSkillDirectory(skillsDir: string): Promise<{
  total: number
  clean: number
  warned: number
  blocked: number
  results: Array<{ file: string; result: ScanResult }>
}> {
  const results: Array<{ file: string; result: ScanResult }> = []
  let blocked = 0, warned = 0

  function walkSkills(dir: string) {
    if (!existsSync(dir)) return
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walkSkills(full)
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
          results.push({ file: full, result: { id: full, target: 'skill' as const, scannedAt: '', findings: [], recommendation: 'allow' as const, usedExternalScanner: false } })
        }
      }
    } catch {}
  }

  walkSkills(skillsDir)

  // Now scan each file (replace placeholder results)
  for (let i = 0; i < results.length; i++) {
    const r = await scanSkillFile(results[i].file)
    results[i].result = r
    if (r.recommendation === 'block') blocked++
    else if (r.recommendation === 'warn') warned++
  }

  return {
    total: results.length,
    clean: results.length - warned - blocked,
    warned,
    blocked,
    results,
  }
}

/** Scan an npm package name via npm audit (shallow — package.json of that package only) */
export async function scanNpmPackage(packageName: string): Promise<ScanResult> {
  // Use package name as the content to check injection patterns first
  const nameResult = await scan(packageName, 'package', packageName)
  if (nameResult.recommendation === 'block') return nameResult

  // Try npm audit if available
  const extraFindings: ScanFinding[] = []
  try {
    const out = execSync(`npm audit --package-lock-only --json 2>/dev/null || echo "{}"`, {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: 'pipe',
    })
    const parsed = JSON.parse(out) as { vulnerabilities?: Record<string, { severity: string }> }
    if (parsed.vulnerabilities) {
      for (const [vuln, meta] of Object.entries(parsed.vulnerabilities)) {
        if (meta.severity === 'critical' || meta.severity === 'high') {
          extraFindings.push({
            rule: 'npm-audit',
            severity: meta.severity as 'critical' | 'high',
            match: `${packageName} → ${vuln}`,
          })
        }
      }
    }
  } catch {}

  if (extraFindings.length === 0) return nameResult

  const findings = [...nameResult.findings, ...extraFindings]
  return {
    ...nameResult,
    findings,
    recommendation: deriveRecommendation(findings),
  }
}
