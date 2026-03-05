import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
}

const CANONICAL_APP = '/Applications/rex_app.app'
const LEGACY_APP = '/Applications/REX.app'

type BuildMode = 'debug' | 'release'

interface AppBuildInfo {
  installedAt: string
  sourceRepo: string
  buildMode: BuildMode
  sourceBundle: string
  git: {
    branch: string
    commit: string
    dirty: boolean
  }
}

function ok(msg: string) { console.log(`  ${COLORS.green}✓${COLORS.reset} ${msg}`) }
function info(msg: string) { console.log(`  ${COLORS.cyan}ℹ${COLORS.reset} ${msg}`) }
function fail(msg: string) { console.log(`  ${COLORS.red}✗${COLORS.reset} ${msg}`) }

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function findRepoRoot(startDir = process.cwd()): string | null {
  let current = resolve(startDir)
  while (true) {
    const flutterPubspec = join(current, 'packages', 'flutter_app', 'pubspec.yaml')
    if (existsSync(flutterPubspec)) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function getBuildBundle(repoRoot: string, mode: BuildMode): string {
  return join(
    repoRoot,
    'packages',
    'flutter_app',
    'build',
    'macos',
    'Build',
    'Products',
    mode === 'release' ? 'Release' : 'Debug',
    'rex_app.app',
  )
}

function buildFlutterApp(repoRoot: string, mode: BuildMode) {
  if (!commandExists('flutter')) {
    throw new Error('flutter command not found in PATH')
  }
  const flutterDir = join(repoRoot, 'packages', 'flutter_app')
  const flag = mode === 'release' ? '--release' : '--debug'
  info(`Building Flutter macOS app (${mode})...`)
  execSync(`flutter build macos ${flag}`, { cwd: flutterDir, stdio: 'inherit' })
}

function gitInfo(repoRoot: string) {
  let branch = 'unknown'
  let commit = 'unknown'
  let dirty = false
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim()
  } catch {}
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim()
  } catch {}
  try {
    dirty = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf-8' }).trim().length > 0
  } catch {}
  return { branch, commit, dirty }
}

function installAppBundle(sourceBundle: string) {
  if (!existsSync(sourceBundle)) throw new Error(`Build bundle not found: ${sourceBundle}`)

  info(`Installing app to ${CANONICAL_APP}`)
  rmSync(CANONICAL_APP, { recursive: true, force: true })
  rmSync(LEGACY_APP, { recursive: true, force: true })
  // Use macOS-native bundle copy to preserve internal framework symlinks.
  execSync(`ditto "${sourceBundle}" "${CANONICAL_APP}"`, { stdio: 'ignore' })

  // Keep backward compatibility with older scripts referencing /Applications/REX.app.
  try {
    execSync(`ln -sfn "${CANONICAL_APP}" "${LEGACY_APP}"`, { stdio: 'ignore' })
  } catch {}
}

function writeBuildInfo(infoData: AppBuildInfo) {
  const resourcesDir = join(CANONICAL_APP, 'Contents', 'Resources')
  mkdirSync(resourcesDir, { recursive: true })
  const infoPath = join(resourcesDir, 'rex-build-info.json')
  writeFileSync(infoPath, JSON.stringify(infoData, null, 2) + '\n')
}

function readBuildInfo(): AppBuildInfo | null {
  const infoPath = join(CANONICAL_APP, 'Contents', 'Resources', 'rex-build-info.json')
  if (!existsSync(infoPath)) return null
  try {
    return JSON.parse(readFileSync(infoPath, 'utf-8')) as AppBuildInfo
  } catch {
    return null
  }
}

function relaunchApp() {
  try {
    execSync(`pkill -f '/Contents/MacOS/rex_app'`, { stdio: 'ignore' })
  } catch {}
  execSync(`open -a "${CANONICAL_APP}"`, { stdio: 'ignore' })
}

function printAppInfo() {
  console.log(`\n${COLORS.bold}REX App Info${COLORS.reset}`)
  console.log(`  Canonical path: ${CANONICAL_APP} ${existsSync(CANONICAL_APP) ? `${COLORS.green}(installed)${COLORS.reset}` : `${COLORS.red}(missing)${COLORS.reset}`}`)
  console.log(`  Legacy path:    ${LEGACY_APP} ${existsSync(LEGACY_APP) ? `${COLORS.yellow}(alias present)${COLORS.reset}` : `${COLORS.dim}(none)${COLORS.reset}`}`)

  const infoData = readBuildInfo()
  if (infoData) {
    console.log(`  Source repo:    ${infoData.sourceRepo}`)
    console.log(`  Git:            ${infoData.git.branch}@${infoData.git.commit}${infoData.git.dirty ? ' (dirty)' : ''}`)
    console.log(`  Build mode:     ${infoData.buildMode}`)
    console.log(`  Installed at:   ${infoData.installedAt}`)
  } else {
    console.log(`  ${COLORS.dim}No build metadata found (install once via \`rex app update\`).${COLORS.reset}`)
  }

  try {
    const running = execSync(`pgrep -fal '/Contents/MacOS/rex_app'`, { encoding: 'utf-8' }).trim()
    if (running) {
      console.log(`  Running process:\n${running.split('\n').map(line => `    ${line}`).join('\n')}`)
    } else {
      console.log(`  Running process: ${COLORS.dim}none${COLORS.reset}`)
    }
  } catch {
    console.log(`  Running process: ${COLORS.dim}none${COLORS.reset}`)
  }
  console.log('')
}

function usage() {
  console.log(`
${COLORS.bold}REX App Commands${COLORS.reset}
  rex app update [--debug|--release] [--no-launch] [--no-build]
  rex app info
  rex app open
`)
}

function parseMode(args: string[]): BuildMode {
  if (args.includes('--release')) return 'release'
  return 'debug'
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function ensureDarwin() {
  if (process.platform !== 'darwin') {
    throw new Error('App install/update is only supported on macOS')
  }
}

function updateApp(args: string[]) {
  ensureDarwin()
  const mode = parseMode(args)
  const launch = !hasFlag(args, '--no-launch')
  const noBuild = hasFlag(args, '--no-build')

  const repoRoot = findRepoRoot()
  if (!repoRoot) {
    throw new Error('REX monorepo not found from current directory (need packages/flutter_app)')
  }

  if (!noBuild) buildFlutterApp(repoRoot, mode)

  let sourceBundle = getBuildBundle(repoRoot, mode)
  if (!existsSync(sourceBundle)) {
    const fallbackMode: BuildMode = mode === 'debug' ? 'release' : 'debug'
    const fallbackBundle = getBuildBundle(repoRoot, fallbackMode)
    if (existsSync(fallbackBundle)) {
      info(`Requested ${mode} bundle not found, using existing ${fallbackMode} bundle`)
      sourceBundle = fallbackBundle
    } else {
      throw new Error(`No built app found. Expected:\n- ${sourceBundle}\n- ${fallbackBundle}`)
    }
  }

  installAppBundle(sourceBundle)
  const git = gitInfo(repoRoot)
  writeBuildInfo({
    installedAt: new Date().toISOString(),
    sourceRepo: repoRoot,
    buildMode: mode,
    sourceBundle,
    git,
  })

  ok(`Installed ${CANONICAL_APP}`)
  info(`Source: ${repoRoot} (${git.branch}@${git.commit}${git.dirty ? ', dirty' : ''})`)
  info(`Mode: ${mode}`)

  if (launch) {
    relaunchApp()
    ok('REX app launched')
  } else {
    info('Launch skipped (--no-launch)')
  }
}

function openApp() {
  ensureDarwin()
  if (existsSync(CANONICAL_APP)) {
    execSync(`open -a "${CANONICAL_APP}"`, { stdio: 'ignore' })
    ok('REX app opened')
    return
  }
  if (existsSync(LEGACY_APP)) {
    execSync(`open -a "${LEGACY_APP}"`, { stdio: 'ignore' })
    ok('REX app opened')
    return
  }
  throw new Error('No installed app found. Run `rex app update` first.')
}

export async function app(args: string[]) {
  const sub = args[0] ?? 'help'
  try {
    switch (sub) {
      case 'update':
        updateApp(args.slice(1))
        break
      case 'info':
        printAppInfo()
        break
      case 'open':
        openApp()
        break
      case 'help':
      default:
        usage()
        break
    }
  } catch (error: any) {
    fail(error?.message ?? String(error))
    process.exit(1)
  }
}
