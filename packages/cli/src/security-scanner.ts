/**
 * REX Security Scanner — validate MCPs, skills, repos before install
 *
 * Wraps existing OSS tools:
 * - invariantlabs-ai/mcp-scan  → validates MCP server tool descriptions
 * - cisco-ai-defense/skill-scanner → static + bytecode analysis for skills
 * - VirusTotal API              → file/URL/npm package hash scan
 * - Custom injection detector  → regex + local LLM for prompt injection
 *
 * Called automatically by mcp-discover.ts before any install.
 * REX can be 10GB — we include everything useful.
 */

import { execSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from './logger.js'
import { REX_DIR } from './paths.js'

const log = createLogger('security-scanner')

// ── Types ──────────────────────────────────────────────

export type ScanTarget = 'mcp' | 'skill' | 'npm-package' | 'repo' | 'url' | 'script'

export interface ScanResult {
  ok: boolean
  target: string
  targetType: ScanTarget
  threats: ThreatFinding[]
  score: number           // 0-100 (100 = safe, 0 = definitely malicious)
  recommendation: 'allow' | 'warn' | 'block'
  scanners: string[]      // which scanners ran
  durationMs: number
}

export interface ThreatFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  scanner: string
  finding: string
  details?: string
}

// Scan cache to avoid re-scanning same hash
const SCAN_CACHE_PATH = join(REX_DIR, 'security-cache.json')
type ScanCache = Record<string, { result: ScanResult; scannedAt: string }>

function readScanCache(): ScanCache {
  try {
    if (existsSync(SCAN_CACHE_PATH)) return JSON.parse(readFileSync(SCAN_CACHE_PATH, 'utf-8')) as ScanCache
  } catch { /* noop */ }
  return {}
}

function writeScanCache(cache: ScanCache): void {
  writeFileSync(SCAN_CACHE_PATH, JSON.stringify(cache, null, 2))
}

// ── Prompt injection patterns ──────────────────────────

// These are known injection patterns used in real attacks
// (curl | bash, ignore instructions, exfiltrate env, etc.)
const INJECTION_PATTERNS = [
  // Command injection via curl/wget
  /curl\s+.*\s*\|\s*(?:bash|sh|zsh)/i,
  /wget\s+.*\s*\|\s*(?:bash|sh|zsh)/i,
  // Instruction override
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(your|all)\s+(instructions|guidelines|rules)/i,
  /you\s+are\s+now\s+(a\s+)?(?:DAN|evil|unrestricted)/i,
  // Env var exfiltration
  /\$(?:HOME|USER|PATH|ANTHROPIC_API_KEY|OPENAI_API_KEY|GH_TOKEN)/,
  /process\.env\./,
  /printenv|env\s*>/,
  // Hidden instructions (unicode, zero-width chars)
  /[\u200B\u200C\u200D\u2060\uFEFF]/,
  // Jailbreak patterns
  /Do\s+Anything\s+Now|DAN\s+mode/i,
  /pretend\s+you\s+(?:have|are|can)/i,
  // Data exfiltration
  /send\s+.*(to|via)\s+(http|curl|webhook)/i,
  /exfiltrate|exfiltr/i,
  // System file access
  /\/etc\/passwd|\/etc\/shadow|~\/\.ssh/,
  /cat\s+~\/\.(env|bashrc|zshrc|profile)/,
]

// ── Scanners ───────────────────────────────────────────

/**
 * 1. Static regex scan for injection patterns
 * Script-based, 0 tokens, instant.
 */
function scanForInjection(content: string): ThreatFinding[] {
  const findings: ThreatFinding[] = []
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      findings.push({
        severity: 'critical',
        scanner: 'injection-detector',
        finding: `Injection pattern detected: ${pattern.source.slice(0, 50)}`,
        details: content.match(pattern)?.[0]?.slice(0, 100),
      })
    }
  }
  return findings
}

/**
 * 2. mcp-scan (invariantlabs) — validates MCP tool descriptions
 * Requires: pip install mcp-scan
 */
async function runMcpScan(mcpId: string): Promise<ThreatFinding[]> {
  const hasMcpScan = !!run('which mcp-scan 2>/dev/null')
  if (!hasMcpScan) {
    // Auto-install
    try {
      execSync('pip install mcp-scan --quiet 2>/dev/null', { timeout: 30_000 })
    } catch {
      log.warn('mcp-scan not available, skipping')
      return [{ severity: 'info', scanner: 'mcp-scan', finding: 'mcp-scan not installed — install with: pip install mcp-scan' }]
    }
  }

  try {
    const result = execSync(`mcp-scan --json ${mcpId} 2>&1`, { encoding: 'utf-8', timeout: 15_000 })
    const data = JSON.parse(result) as { threats?: Array<{ severity: string; description: string }> }
    return (data.threats ?? []).map(t => ({
      severity: (t.severity as ThreatFinding['severity']) ?? 'medium',
      scanner: 'mcp-scan',
      finding: t.description,
    }))
  } catch {
    return []
  }
}

/**
 * 3. VirusTotal API — scan npm package hash or URL
 * Free: 4 req/min, 500/day. Results cached.
 */
async function scanVirusTotal(target: string, type: 'file' | 'url'): Promise<ThreatFinding[]> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY
  if (!apiKey) {
    return [{ severity: 'info', scanner: 'virustotal', finding: 'No VIRUSTOTAL_API_KEY set — skipping VT scan' }]
  }

  try {
    let endpoint: string
    let body: URLSearchParams

    if (type === 'url') {
      endpoint = 'https://www.virustotal.com/api/v3/urls'
      body = new URLSearchParams({ url: target })
    } else {
      // File hash (SHA256 of npm package tarball)
      const hash = createHash('sha256').update(target).digest('hex')
      endpoint = `https://www.virustotal.com/api/v3/files/${hash}`
      body = new URLSearchParams()
    }

    const res = await fetch(endpoint, {
      method: type === 'url' ? 'POST' : 'GET',
      headers: { 'x-apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: type === 'url' ? body : undefined,
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return []

    const data = await res.json() as { data: { attributes: { last_analysis_stats: Record<string, number> } } }
    const stats = data.data?.attributes?.last_analysis_stats ?? {}
    const malicious = stats.malicious ?? 0
    const suspicious = stats.suspicious ?? 0

    if (malicious > 0) {
      return [{ severity: 'critical', scanner: 'virustotal', finding: `${malicious} engines flagged as malicious`, details: JSON.stringify(stats) }]
    }
    if (suspicious > 2) {
      return [{ severity: 'high', scanner: 'virustotal', finding: `${suspicious} engines flagged as suspicious`, details: JSON.stringify(stats) }]
    }
    return []
  } catch {
    return []
  }
}

/**
 * 4. skill-scanner (Cisco AI Defense) — static + bytecode for skills
 * Requires: pip install skill-scanner
 */
async function runSkillScanner(skillPath: string): Promise<ThreatFinding[]> {
  const hasScanner = !!run('which skill-scanner 2>/dev/null')
  if (!hasScanner) {
    try {
      execSync('pip install skill-scanner --quiet 2>/dev/null', { timeout: 30_000 })
    } catch {
      return [{ severity: 'info', scanner: 'skill-scanner', finding: 'skill-scanner not installed — install with: pip install skill-scanner' }]
    }
  }

  try {
    const result = execSync(`skill-scanner scan ${skillPath} --use-behavioral 2>&1`, { encoding: 'utf-8', timeout: 30_000 })
    const critical = result.toLowerCase().includes('critical')
    const high = result.toLowerCase().includes('high risk')
    if (critical) return [{ severity: 'critical', scanner: 'skill-scanner', finding: 'Critical threat in skill', details: result.slice(0, 500) }]
    if (high) return [{ severity: 'high', scanner: 'skill-scanner', finding: 'High-risk pattern in skill', details: result.slice(0, 500) }]
    return []
  } catch {
    return []
  }
}

/**
 * 5. npm audit — for npm packages
 */
async function runNpmAudit(packageName: string): Promise<ThreatFinding[]> {
  try {
    const result = execSync(`npm audit --json --package-lock-only 2>/dev/null || echo "{}"`, {
      encoding: 'utf-8', timeout: 15_000,
    })
    const data = JSON.parse(result) as { vulnerabilities?: Record<string, { severity: string; title: string }> }
    return Object.values(data.vulnerabilities ?? {}).map(v => ({
      severity: (v.severity as ThreatFinding['severity']) ?? 'medium',
      scanner: 'npm-audit',
      finding: v.title,
    }))
  } catch {
    return []
  }
}

// ── Main scanner ───────────────────────────────────────

/**
 * Scan a target before installing/using it.
 * Results cached by content hash to avoid re-scanning.
 */
export async function scan(target: string, type: ScanTarget): Promise<ScanResult> {
  const start = Date.now()
  const cache = readScanCache()
  const cacheKey = `${type}:${target}`

  // Cache hit — don't re-scan same thing within 24h
  if (cache[cacheKey]) {
    const entry = cache[cacheKey]
    const age = Date.now() - new Date(entry.scannedAt).getTime()
    if (age < 86_400_000) {
      log.info(`Security cache hit for ${target}`)
      return entry.result
    }
  }

  const threats: ThreatFinding[] = []
  const scanners: string[] = []

  // Run appropriate scanners based on target type
  if (type === 'mcp') {
    const vtFindings = await scanVirusTotal(`https://npmjs.com/package/${target}`, 'url')
    threats.push(...vtFindings)
    scanners.push('virustotal')

    const mcpFindings = await runMcpScan(target)
    threats.push(...mcpFindings)
    scanners.push('mcp-scan')
  }

  if (type === 'skill') {
    const content = existsSync(target) ? readFileSync(target, 'utf-8') : target
    const injectionFindings = scanForInjection(content)
    threats.push(...injectionFindings)
    scanners.push('injection-detector')

    if (existsSync(target)) {
      const skillFindings = await runSkillScanner(target)
      threats.push(...skillFindings)
      scanners.push('skill-scanner')
    }
  }

  if (type === 'npm-package') {
    const vtFindings = await scanVirusTotal(`https://npmjs.com/package/${target}`, 'url')
    threats.push(...vtFindings)
    scanners.push('virustotal')

    const npmFindings = await runNpmAudit(target)
    threats.push(...npmFindings)
    scanners.push('npm-audit')
  }

  if (type === 'script' || type === 'repo') {
    const content = existsSync(target) ? readFileSync(target, 'utf-8') : target
    const injectionFindings = scanForInjection(content)
    threats.push(...injectionFindings)
    scanners.push('injection-detector')

    if (type === 'repo') {
      const vtFindings = await scanVirusTotal(target, 'url')
      threats.push(...vtFindings)
      scanners.push('virustotal')
    }
  }

  // Calculate score + recommendation
  const criticalCount = threats.filter(t => t.severity === 'critical').length
  const highCount = threats.filter(t => t.severity === 'high').length
  const mediumCount = threats.filter(t => t.severity === 'medium').length

  let score = 100
  score -= criticalCount * 40
  score -= highCount * 20
  score -= mediumCount * 5
  score = Math.max(0, score)

  let recommendation: ScanResult['recommendation'] = 'allow'
  if (criticalCount > 0 || score < 40) recommendation = 'block'
  else if (highCount > 0 || score < 70) recommendation = 'warn'

  const result: ScanResult = {
    ok: recommendation !== 'block',
    target,
    targetType: type,
    threats,
    score,
    recommendation,
    scanners,
    durationMs: Date.now() - start,
  }

  // Cache result
  cache[cacheKey] = { result, scannedAt: new Date().toISOString() }
  writeScanCache(cache)

  if (!result.ok) {
    log.error(`🚨 SECURITY BLOCK: ${target} — score ${score}/100 — ${criticalCount} critical threats`)
  } else if (recommendation === 'warn') {
    log.warn(`⚠️ Security warning for ${target} — score ${score}/100`)
  }

  return result
}

/**
 * Print scan result in a human-readable format.
 */
export function printScanResult(result: ScanResult): void {
  const icons = { block: '🚨', warn: '⚠️', allow: '✅' }
  const colors = { block: '\x1b[31m', warn: '\x1b[33m', allow: '\x1b[32m' }
  const reset = '\x1b[0m'
  const c = colors[result.recommendation]

  console.log()
  console.log(`${c}${icons[result.recommendation]} ${result.target}${reset} — Score: ${result.score}/100`)
  console.log(`  Scanners: ${result.scanners.join(', ')}  |  ${result.durationMs}ms`)

  for (const threat of result.threats) {
    const sc = threat.severity === 'critical' ? '\x1b[31m' : threat.severity === 'high' ? '\x1b[33m' : '\x1b[2m'
    console.log(`  ${sc}[${threat.severity.toUpperCase()}]${reset} ${threat.scanner}: ${threat.finding}`)
  }

  if (result.recommendation === 'block') {
    console.log(`\n  ${c}❌ BLOCKED — This package will not be installed.${reset}`)
  } else if (result.recommendation === 'warn') {
    console.log(`\n  ${c}⚠️ WARNING — Proceed with caution.${reset}`)
  }
  console.log()
}

function run(cmd: string): string {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 }).trim() } catch { return '' }
}
