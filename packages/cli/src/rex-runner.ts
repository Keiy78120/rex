/** @module REX-RUNNER — .rex literate file parser and executor */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createLogger } from './logger.js'

const log = createLogger('rex-runner')
const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RexBlock {
  language: 'typescript' | 'bash' | 'python' | 'sh'
  source: string
  lineNumber: number
  heading?: string
  executable: boolean
}

export interface RexRunResult {
  blockIndex: number
  heading?: string
  language: string
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  error?: string
}

export interface RexFileResult {
  filePath: string
  totalBlocks: number
  executableBlocks: number
  results: RexRunResult[]
  durationMs: number
  errors: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempTs(source: string): string {
  const dir = join(tmpdir(), 'rex-runner')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `block-${Date.now()}.ts`)
  writeFileSync(file, source, 'utf-8')
  return file
}

function findTsxBin(): string {
  const candidates = [
    join(homedir(), '.nvm', 'versions', 'node', 'v22.20.0', 'bin', 'tsx'),
    '/usr/local/bin/tsx',
    '/usr/bin/tsx',
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return 'npx tsx'
}

// ---------------------------------------------------------------------------
// parseRexFile
// ---------------------------------------------------------------------------

export function parseRexFile(filePath: string): RexBlock[] {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  const FENCE_EXEC = /^```(typescript|bash|python|sh)\s+#!exec\s*$/i
  const FENCE_ANY = /^```(typescript|bash|python|sh)(\s.*)?$/i
  const FENCE_CLOSE = /^```\s*$/
  const HEADING = /^##\s+(.+)/

  const blocks: RexBlock[] = []
  let currentHeading: string | undefined
  let inBlock = false
  let currentLang: RexBlock['language'] = 'bash'
  let currentExecutable = false
  let blockStart = 0
  let sourceLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!inBlock) {
      // Track nearest ## heading
      const headingMatch = HEADING.exec(line)
      if (headingMatch) {
        currentHeading = headingMatch[1].trim()
        continue
      }

      // Opening fence with #!exec
      const execMatch = FENCE_EXEC.exec(line)
      if (execMatch) {
        inBlock = true
        currentExecutable = true
        currentLang = execMatch[1].toLowerCase() as RexBlock['language']
        blockStart = i + 1
        sourceLines = []
        continue
      }

      // Opening fence without #!exec (non-executable)
      const anyMatch = FENCE_ANY.exec(line)
      if (anyMatch) {
        inBlock = true
        currentExecutable = false
        currentLang = anyMatch[1].toLowerCase() as RexBlock['language']
        blockStart = i + 1
        sourceLines = []
        continue
      }

      continue
    }

    // Inside a block — look for closing fence
    if (FENCE_CLOSE.test(line)) {
      blocks.push({
        language: currentLang,
        source: sourceLines.join('\n'),
        lineNumber: blockStart,
        heading: currentHeading,
        executable: currentExecutable,
      })
      inBlock = false
      sourceLines = []
      continue
    }

    sourceLines.push(line)
  }

  return blocks
}

// ---------------------------------------------------------------------------
// executeBlock
// ---------------------------------------------------------------------------

export async function executeBlock(
  block: RexBlock,
  opts?: { cwd?: string; timeout?: number; env?: Record<string, string> }
): Promise<RexRunResult> {
  const start = Date.now()
  const timeout = opts?.timeout ?? 30_000
  const cwd = opts?.cwd ?? process.cwd()
  const env = { ...process.env, ...(opts?.env ?? {}) }

  const base: Omit<RexRunResult, 'stdout' | 'stderr' | 'exitCode' | 'durationMs'> = {
    blockIndex: 0,
    heading: block.heading,
    language: block.language,
  }

  try {
    if (block.language === 'typescript') {
      const tmpFile = writeTempTs(block.source)
      try {
        const tsxBin = findTsxBin()
        let stdout = ''
        let stderr = ''

        if (tsxBin === 'npx tsx') {
          const result = await execFileAsync('npx', ['tsx', tmpFile], {
            timeout,
            cwd,
            env,
            encoding: 'utf-8',
          })
          stdout = result.stdout
          stderr = result.stderr
        } else {
          const result = await execFileAsync(tsxBin, [tmpFile], {
            timeout,
            cwd,
            env,
            encoding: 'utf-8',
          })
          stdout = result.stdout
          stderr = result.stderr
        }

        return {
          ...base,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0,
          durationMs: Date.now() - start,
        }
      } finally {
        try { unlinkSync(tmpFile) } catch {}
      }
    }

    if (block.language === 'bash' || block.language === 'sh') {
      const result = await execFileAsync('bash', ['-c', block.source], {
        timeout,
        cwd,
        env,
        encoding: 'utf-8',
      })
      return {
        ...base,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        exitCode: 0,
        durationMs: Date.now() - start,
      }
    }

    if (block.language === 'python') {
      const result = await execFileAsync('python3', ['-c', block.source], {
        timeout,
        cwd,
        env,
        encoding: 'utf-8',
      })
      return {
        ...base,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
        exitCode: 0,
        durationMs: Date.now() - start,
      }
    }

    return {
      ...base,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Date.now() - start,
      error: `Unsupported language: ${block.language}`,
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    // execFile rejects with an error that may have stdout/stderr attached
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string }
    const exitCode = typeof e.code === 'number' ? e.code : 1
    return {
      ...base,
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? '').trim(),
      exitCode,
      durationMs,
      error: e.message ?? String(err),
    }
  }
}

// ---------------------------------------------------------------------------
// runRexFile
// ---------------------------------------------------------------------------

export async function runRexFile(
  filePath: string,
  opts?: { dryRun?: boolean; headingFilter?: string; timeout?: number }
): Promise<RexFileResult> {
  const globalStart = Date.now()
  const allBlocks = parseRexFile(filePath)
  const executableBlocks = allBlocks.filter(b => b.executable)

  let filtered = executableBlocks
  if (opts?.headingFilter) {
    const needle = opts.headingFilter.toLowerCase()
    filtered = executableBlocks.filter(b =>
      b.heading?.toLowerCase().includes(needle)
    )
  }

  const results: RexRunResult[] = []
  let errors = 0

  for (let i = 0; i < filtered.length; i++) {
    const block = filtered[i]

    if (opts?.dryRun) {
      log.info(`[DRY RUN] would execute: ${block.language} block at line ${block.lineNumber}${block.heading ? ` (## ${block.heading})` : ''}`)
      continue
    }

    log.debug(`Running block ${i + 1}/${filtered.length}: ${block.language} at line ${block.lineNumber}`)

    try {
      const result = await executeBlock(block, { timeout: opts?.timeout })
      result.blockIndex = i
      results.push(result)
      if (result.exitCode !== 0) {
        errors++
        log.warn(`Block ${i + 1} failed (exit ${result.exitCode}): ${result.error ?? result.stderr}`)
      }
    } catch (err) {
      // Should not reach here — executeBlock never throws — but guard anyway
      errors++
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error(`Unexpected error in block ${i + 1}: ${errMsg}`)
      results.push({
        blockIndex: i,
        heading: block.heading,
        language: block.language,
        stdout: '',
        stderr: '',
        exitCode: 1,
        durationMs: 0,
        error: errMsg,
      })
    }
  }

  return {
    filePath,
    totalBlocks: allBlocks.length,
    executableBlocks: executableBlocks.length,
    results,
    durationMs: Date.now() - globalStart,
    errors,
  }
}

// ---------------------------------------------------------------------------
// printRexResult
// ---------------------------------------------------------------------------

export function printRexResult(result: RexFileResult): void {
  const RESET = '\x1b[0m'
  const BOLD = '\x1b[1m'
  const DIM = '\x1b[2m'
  const GREEN = '\x1b[32m'
  const RED = '\x1b[31m'
  const CYAN = '\x1b[36m'

  console.log(`\n${BOLD}REX Runner — ${result.filePath}${RESET}`)
  console.log(`${DIM}Blocks: ${result.executableBlocks} executable / ${result.totalBlocks} total${RESET}\n`)

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i]
    const label = r.heading ? `## ${r.heading}` : `(no heading)`
    const prefix = `[${i + 1}/${result.results.length}] ${label} ${DIM}(${r.language})${RESET}`

    if (r.exitCode === 0) {
      console.log(`${GREEN}✅${RESET} ${prefix}`)
      console.log(`   ${DIM}${r.durationMs}ms${RESET}${r.stdout ? ` — ${r.stdout}` : ''}`)
    } else {
      console.log(`${RED}❌${RESET} ${prefix}`)
      const detail = r.error ?? r.stderr ?? `exit ${r.exitCode}`
      console.log(`   ${RED}exit ${r.exitCode}${RESET} — ${detail}`)
    }
  }

  const totalMs = result.durationMs
  const status = result.errors === 0
    ? `${GREEN}All passed${RESET}`
    : `${RED}${result.errors} error(s)${RESET}`

  console.log(`\n${CYAN}Done in ${totalMs}ms — ${status}${RESET}\n`)
}
