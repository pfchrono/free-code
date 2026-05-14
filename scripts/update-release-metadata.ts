import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import semver from 'semver'

type ReleaseType = 'major' | 'minor' | 'patch'

type CommitEntry = {
  date: string
  subject: string
}

type ReleasePlan = {
  version: string
  releaseType: ReleaseType
  createTag: boolean
}

type ChangesSection = {
  heading: string
  body: string
}

const initialVersion = '0.3.0'
const generatedBlockStart = '<!-- GENERATED_RECENT_COMMITS_START -->'
const generatedBlockEnd = '<!-- GENERATED_RECENT_COMMITS_END -->'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const packageJsonPath = join(rootDir, 'package.json')
const changesPath = join(rootDir, 'changes.md')

function runGit(args: string[]): string {
  const proc = Bun.spawnSync({
    cmd: ['git', ...args],
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim()
    throw new Error(stderr || `git ${args.join(' ')} failed`)
  }

  return new TextDecoder().decode(proc.stdout).trim()
}

function getGitDir() {
  return runGit(['rev-parse', '--absolute-git-dir'])
}

function resolveCommitMessagePath(path: string) {
  if (existsSync(path)) return path

  const relativeToRoot = join(rootDir, path)
  if (existsSync(relativeToRoot)) return relativeToRoot

  return join(getGitDir(), basename(path))
}

function getReleasePlanPath() {
  return join(getGitDir(), '.release-plan.json')
}

function isMergeMessagePath(path: string) {
  return basename(path) === 'MERGE_MSG'
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function bumpVersion(version: string, releaseType: ReleaseType): string {
  const next = semver.inc(version, releaseType)
  if (!next) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  return next
}

function detectReleaseType(commitMessage: string): ReleaseType {
  const message = commitMessage.trim()
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? ''
  const lower = message.toLowerCase()

  if (
    /(^|\n)([^\n]+!:\s|[^\n]+\([^\n]+\)!:)/.test(message) ||
    lower.includes('breaking change') ||
    lower.includes('milestone') ||
    lower.startsWith('major:')
  ) {
    return 'major'
  }

  if (/^(feat)(\([^)]+\))?:/.test(firstLine)) {
    return 'minor'
  }

  return 'patch'
}

function getExplicitVersion(commitMessage: string, currentVersion: string): string | null {
  const firstLine = commitMessage.split(/\r?\n/, 1)[0] ?? ''
  const match = firstLine.match(/\bv?(\d+\.\d+\.\d+)\b/)
  if (!match) return null

  const explicitVersion = match[1]
  if (!semver.valid(explicitVersion) || !semver.gt(explicitVersion, currentVersion)) {
    return null
  }

  return explicitVersion
}

function buildReleasePlan(currentVersion: string, commitMessage: string): ReleasePlan {
  const lower = commitMessage.toLowerCase()
  const explicitVersion = getExplicitVersion(commitMessage, currentVersion)

  if (explicitVersion) {
    const diff = semver.diff(currentVersion, explicitVersion)
    const releaseType: ReleaseType = diff === 'major' ? 'major' : diff === 'minor' ? 'minor' : 'patch'
    return {
      version: explicitVersion,
      releaseType,
      createTag: releaseType === 'major',
    }
  }

  if (lower.includes('milestone')) {
    const version = semver.major(currentVersion) === 0 ? '1.0.0' : bumpVersion(currentVersion, 'major')
    return {
      version,
      releaseType: 'major',
      createTag: true,
    }
  }

  return {
    version: currentVersion,
    releaseType: detectReleaseType(commitMessage),
    createTag: false,
  }
}

function isReleaseBumpCommit(subject: string) {
  return /^chore\(release\): bump version to \d+\.\d+\.\d+$/.test(subject)
}

function getRecentCommits(limit: number): CommitEntry[] {
  const output = runGit([
    'log',
    '--date=format:%Y-%m-%d',
    `--pretty=format:%ad%x09%s`,
    `-${limit * 2}`,
  ])

  if (!output) return []

  return output
    .split(/\r?\n/)
    .map(line => {
      const [date, subject] = line.split('\t')
      return { date, subject }
    })
    .filter(entry => entry.date && entry.subject)
    .filter(entry => !isReleaseBumpCommit(entry.subject))
    .slice(0, limit)
}

function buildRecentCommitsBlock(commits = getRecentCommits(20), pendingCommit?: CommitEntry) {
  const nextCommits = pendingCommit && !isReleaseBumpCommit(pendingCommit.subject)
    ? [pendingCommit, ...commits.filter(entry => entry.subject !== pendingCommit.subject)]
    : commits

  const lines = nextCommits
    .filter(entry => !isReleaseBumpCommit(entry.subject))
    .map(entry => `- ${entry.date} ${entry.subject}`)
    .join('\n')

  return [
    generatedBlockStart,
    '### Recent commits',
    lines || '- No commits yet',
    generatedBlockEnd,
  ].join('\n')
}

function parseChangesSections(content: string) {
  const normalized = content.replace(/\r\n/g, '\n')
  const sectionPattern = /^## \[[^\]]+\].*$/gm
  const matches = Array.from(normalized.matchAll(sectionPattern))

  if (matches.length === 0) {
    return { preface: normalized.trimEnd(), sections: [] as ChangesSection[] }
  }

  const preface = normalized.slice(0, matches[0]!.index).trimEnd()
  const sections = matches.map((match, index) => {
    const start = match.index ?? 0
    const end = index + 1 < matches.length ? (matches[index + 1]!.index ?? normalized.length) : normalized.length
    const raw = normalized.slice(start, end).trim()
    const [heading, ...bodyLines] = raw.split('\n')
    return {
      heading,
      body: bodyLines.join('\n').trim(),
    }
  })

  return { preface, sections }
}

function renderChangesContent(preface: string, sections: ChangesSection[]) {
  const parts = [preface, ...sections.map(section => (section.body ? `${section.heading}\n\n${section.body}` : section.heading))]
    .filter(Boolean)
    .join('\n\n')

  return parts.endsWith('\n') ? parts : `${parts}\n`
}

function updateChangesContent(content: string, version: string, today: string, generatedBlock: string) {
  const { preface, sections } = parseChangesSections(content)
  const releaseHeading = `## [${version}] - ${today}`
  const nextSections = sections.filter(section => !section.heading.startsWith(`## [${version}] - `))
  const unreleasedIndex = nextSections.findIndex(section => section.heading === '## [Unreleased]')
  const unreleasedBody = unreleasedIndex >= 0 ? nextSections[unreleasedIndex]!.body : ''
  const releaseBody = [unreleasedBody, generatedBlock].filter(Boolean).join('\n\n')
  const releaseSection = { heading: releaseHeading, body: releaseBody }

  if (unreleasedIndex >= 0) {
    nextSections[unreleasedIndex] = { heading: '## [Unreleased]', body: '' }
    nextSections.splice(unreleasedIndex + 1, 0, releaseSection)
    return renderChangesContent(preface, nextSections)
  }

  return renderChangesContent(preface, [releaseSection, ...nextSections])
}

function updateChanges(version: string, pendingSubject?: string) {
  const content = readFileSync(changesPath, 'utf-8')
  const today = new Date().toISOString().slice(0, 10)
  const pendingCommit = pendingSubject ? { date: today, subject: pendingSubject } : undefined
  const generatedBlock = buildRecentCommitsBlock(getRecentCommits(20), pendingCommit)
  const next = updateChangesContent(content, version, today, generatedBlock)
  writeFileSync(changesPath, next)
}

function setPackageVersion(version: string) {
  const pkg = readJson<{ version: string }>(packageJsonPath)
  pkg.version = version
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

function stageReleaseFiles() {
  runGit(['add', 'package.json', 'changes.md'])
}

function restoreReleaseFiles() {
  runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', 'package.json', 'changes.md'])
}

function getCurrentVersion() {
  const pkg = readJson<{ version: string }>(packageJsonPath)
  return pkg.version === '1.0.0' ? initialVersion : pkg.version
}

function saveReleasePlan(plan: ReleasePlan) {
  writeJson(getReleasePlanPath(), plan)
}

function clearReleasePlan() {
  if (existsSync(getReleasePlanPath())) {
    unlinkSync(getReleasePlanPath())
  }
}

function createTagIfNeeded(plan: ReleasePlan) {
  if (!plan.createTag) return

  const tagName = `v${plan.version}`
  const existing = runGit(['tag', '--list', tagName])
  if (existing === tagName) return

  runGit(['tag', '-a', tagName, '-m', `Release ${tagName}`])
}

export { buildRecentCommitsBlock, buildReleasePlan, bumpVersion, detectReleaseType, getExplicitVersion, updateChangesContent }

if (import.meta.main) {
  const [mode, arg] = process.argv.slice(2)

  if (mode === 'pre-commit') {
    if (existsSync(getReleasePlanPath())) {
      clearReleasePlan()
      restoreReleaseFiles()
    }
    process.exit(0)
  }

  if (mode === 'commit-msg') {
    if (!arg) throw new Error('Missing commit message file path')
    const commitMessagePath = resolveCommitMessagePath(arg)
    if (isMergeMessagePath(commitMessagePath)) {
      process.exit(0)
    }

    const message = readFileSync(commitMessagePath, 'utf-8')
    const subject = message.split(/\r?\n/, 1)[0]?.trim() ?? ''
    const plan = buildReleasePlan(getCurrentVersion(), message)
    saveReleasePlan(plan)
    try {
      setPackageVersion(plan.version)
      updateChanges(plan.version, subject)
      stageReleaseFiles()
    } catch (error) {
      restoreReleaseFiles()
      clearReleasePlan()
      throw error
    }
    process.exit(0)
  }

  if (mode === 'post-commit') {
    if (!existsSync(getReleasePlanPath())) {
      process.exit(0)
    }

    const plan = readJson<ReleasePlan>(getReleasePlanPath())
    createTagIfNeeded(plan)
    clearReleasePlan()
    restoreReleaseFiles()
    process.exit(0)
  }

  throw new Error(
    'Usage: bun run ./scripts/update-release-metadata.ts <pre-commit|commit-msg|post-commit> [commit-msg-file]',
  )
}
