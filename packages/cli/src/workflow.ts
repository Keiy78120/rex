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
