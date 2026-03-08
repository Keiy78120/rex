import { existsSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('workflow')

function git(cmd: string, cwd?: string): string {
  return execSync(`git ${cmd}`, {
    encoding: 'utf-8',
    timeout: 30_000,
    cwd,
    stdio: 'pipe',
  }).trim()
}

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function currentBranch(): string {
  return git('rev-parse --abbrev-ref HEAD')
}

export function startFeature(name: string): void {
  const branch = `feat/${toKebab(name)}`
  const current = currentBranch()

  if (current !== 'main' && current !== 'master') {
    log.warn(`Starting feature from branch '${current}' (not main)`)
  }

  git(`checkout -b ${branch}`)
  log.info(`Created branch: ${branch}`)

  const featureMd = join(process.cwd(), 'FEATURE.md')
  if (!existsSync(featureMd)) {
    const template = `# Feature: ${name}

## Goal


## Acceptance Criteria

- [ ]

## Notes

`
    writeFileSync(featureMd, template)
    log.info('Created FEATURE.md template')
  }

  console.log(`Branch: ${branch}`)
  console.log(`FEATURE.md created — fill in the details.`)
}

export function startBugfix(description: string): void {
  const branch = `fix/${toKebab(description)}`
  const current = currentBranch()

  if (current !== 'main' && current !== 'master') {
    log.warn(`Starting bugfix from branch '${current}' (not main)`)
  }

  git(`checkout -b ${branch}`)
  log.info(`Created branch: ${branch}`)

  const bugMd = join(process.cwd(), 'BUG.md')
  if (!existsSync(bugMd)) {
    const template = `# Bug: ${description}

## Symptoms


## Steps to Reproduce

1.

## Root Cause


## Fix


`
    writeFileSync(bugMd, template)
    log.info('Created BUG.md template')
  }

  console.log(`Branch: ${branch}`)
  console.log(`BUG.md created — document the issue.`)
}

export function workflowPR(): void {
  const branch = currentBranch()
  if (branch === 'main' || branch === 'master') {
    console.log('Cannot create PR from main/master. Create a feature branch first.')
    return
  }

  // Get commits since main
  let baseBranch = 'main'
  try {
    git('rev-parse --verify main')
  } catch {
    baseBranch = 'master'
  }

  let commits: string
  try {
    commits = git(`log ${baseBranch}..HEAD --oneline`)
  } catch {
    commits = git('log --oneline -10')
  }

  if (!commits) {
    console.log('No commits to push. Commit your changes first.')
    return
  }

  // Push branch
  try {
    git(`push -u origin ${branch}`)
    log.info(`Pushed branch: ${branch}`)
  } catch (e: any) {
    log.error(`Push failed: ${e.message?.slice(0, 200)}`)
    console.log('Push failed. Check your remote configuration.')
    return
  }

  // Create PR via gh
  const title = branch
    .replace(/^(feat|fix)\//, '')
    .replace(/-/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())

  const body = `## Changes\n\n${commits.split('\n').map(l => `- ${l}`).join('\n')}\n\n## Test Plan\n\n- [ ] \n`

  try {
    const prUrl = execSync(
      `gh pr create --title "${title}" --body "$(cat <<'EOF'\n${body}\nEOF\n)"`,
      { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' }
    ).trim()
    log.info(`PR created: ${prUrl}`)
    console.log(`PR created: ${prUrl}`)
  } catch (e: any) {
    // gh might not be installed or authenticated
    log.error(`PR creation failed: ${e.message?.slice(0, 200)}`)
    console.log(`Branch pushed. Create PR manually or install/configure 'gh' CLI.`)
  }
}

export function workflowDeploy(env: 'staging' | 'prod'): void {
  const branch = currentBranch()

  // 1. Check CI status (if gh available)
  let ciPassed: boolean | null = null
  try {
    const runs = execSync(`gh run list --branch ${branch} --limit 1 --json status,conclusion 2>/dev/null`, {
      encoding: 'utf-8', timeout: 15_000, stdio: 'pipe',
    })
    const parsed = JSON.parse(runs) as Array<{ status: string; conclusion: string }>
    if (parsed.length > 0) {
      ciPassed = parsed[0].conclusion === 'success'
      if (!ciPassed && parsed[0].status !== 'in_progress') {
        console.log(`CI status: ${parsed[0].conclusion} — deploy blocked. Fix CI first.`)
        process.exit(1)
      }
    }
  } catch {
    log.warn('Could not check CI status (gh not configured or no runs)')
  }

  // 2. Prod confirmation
  if (env === 'prod') {
    const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    const answer: string = execSync(
      'read -p "Deploy to PRODUCTION? (yes/no): " ans && echo $ans',
      { encoding: 'utf-8', shell: '/bin/bash', timeout: 30_000 }
    ).trim()
    if (answer.toLowerCase() !== 'yes') {
      console.log('Deploy cancelled.')
      process.exit(0)
    }
  }

  // 3. Auto-generate changelog from commits since last tag
  let changelog = ''
  try {
    const lastTag = git('describe --tags --abbrev=0 2>/dev/null || echo ""').trim()
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
    changelog = git(`log ${range} --oneline`).split('\n').map((l: string) => `- ${l}`).join('\n')
  } catch {}

  // 4. Push to deploy branch / trigger deploy
  const deployBranch = env === 'prod' ? 'main' : `deploy/${env}`
  log.info(`Deploying to ${env} (branch: ${deployBranch})`)

  if (env === 'prod') {
    // Tag + push
    const tag = `v${Date.now()}`
    try {
      git(`tag ${tag}`)
      git(`push origin ${tag}`)
      git(`push origin ${branch}:main`)
      log.info(`Tagged and pushed: ${tag}`)
      console.log(`Deployed to ${env}: ${tag}`)
      if (changelog) console.log(`\nChangelog:\n${changelog}`)
    } catch (e: any) {
      log.error(`Deploy failed: ${e.message?.slice(0, 200)}`)
      console.log('Deploy failed. Check your remote and CI configuration.')
    }
  } else {
    // Push to staging branch
    try {
      execSync(`git push -u origin ${branch}:${deployBranch} --force-with-lease`, {
        encoding: 'utf-8', timeout: 30_000, stdio: 'pipe',
      })
      log.info(`Pushed to ${deployBranch}`)
      console.log(`Deployed to ${env}: branch ${deployBranch}`)
    } catch (e: any) {
      log.error(`Staging push failed: ${e.message?.slice(0, 200)}`)
      console.log(`Push to ${deployBranch} failed.`)
    }
  }
}
