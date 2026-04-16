import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

type ReleaseType = 'major' | 'minor' | 'patch'

const initialVersion = '0.3.0'

type CommitEntry = {
  date: string
  subject: string
}

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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function bumpVersion(version: string, releaseType: ReleaseType): string {
  const [major, minor, patch] = version.split('.').map(Number)
  if ([major, minor, patch].some(Number.isNaN)) {
    throw new Error(`Unsupported version format: ${version}`)
  }

  if (releaseType === 'major') return `${major + 1}.0.0`
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function getStagedStats() {
  const output = runGit(['diff', '--cached', '--shortstat'])
  const files = Number(output.match(/(\d+) files? changed/)?.[1] ?? '0')
  const insertions = Number(output.match(/(\d+) insertions?\(\+\)/)?.[1] ?? '0')
  const deletions = Number(output.match(/(\d+) deletions?\(-\)/)?.[1] ?? '0')
  return { files, insertions, deletions, totalLines: insertions + deletions }
}

function detectReleaseType(commitMessage: string): ReleaseType {
  const message = commitMessage.trim()
  const lower = message.toLowerCase()

  if (
    /(^|\n)(.+!:\s|.+\([^\n]+\)!:)/.test(message) ||
    lower.includes('breaking change') ||
    lower.startsWith('major:')
  ) {
    return 'major'
  }

  if (lower.startsWith('feat:') || /^feat\([^\n]+\):/.test(lower)) {
    return 'minor'
  }

  return 'patch'
}

function getRecentCommits(limit: number): CommitEntry[] {
  const output = runGit([
    'log',
    '--date=format:%Y-%m-%d',
    `--pretty=format:%ad%x09%s`,
    `-${limit}`,
  ])

  if (!output) return []

  return output
    .split(/\r?\n/)
    .map(line => {
      const [date, subject] = line.split('\t')
      return { date, subject }
    })
    .filter(entry => entry.date && entry.subject)
}

function buildRecentCommitsBlock() {
  const commits = getRecentCommits(20)
  const lines = commits.map(entry => `- ${entry.date} ${entry.subject}`).join('\n')
  return [
    generatedBlockStart,
    '### Recent commits',
    lines || '- No commits yet',
    generatedBlockEnd,
  ].join('\n')
}

function updateChanges(version: string) {
  const content = readFileSync(changesPath, 'utf-8')
  const today = new Date().toISOString().slice(0, 10)
  const currentHeaderMatch = content.match(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}/m)
  const nextHeader = `## [${version}] - ${today}`
  const withHeader = currentHeaderMatch
    ? content.replace(currentHeaderMatch[0], nextHeader)
    : `${nextHeader}\n\n${content}`

  const generatedBlock = buildRecentCommitsBlock()
  const blockPattern = new RegExp(`${generatedBlockStart}[\\s\\S]*?${generatedBlockEnd}`)
  const next = blockPattern.test(withHeader)
    ? withHeader.replace(blockPattern, generatedBlock)
    : withHeader.replace(nextHeader, `${nextHeader}\n\n${generatedBlock}`)

  writeFileSync(changesPath, next.endsWith('\n') ? next : `${next}\n`)
}

function setPackageVersion(version: string) {
  const pkg = readJson<{ version: string }>(packageJsonPath)
  pkg.version = version
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

const [mode, arg] = process.argv.slice(2)

if (mode === 'pre-commit') {
  const pkg = readJson<{ version: string }>(packageJsonPath)
  const version = pkg.version === '1.0.0' ? initialVersion : pkg.version
  if (version !== pkg.version) {
    setPackageVersion(version)
  }
  updateChanges(version)
  process.exit(0)
}

if (mode === 'commit-msg') {
  if (!arg) throw new Error('Missing commit message file path')
  const message = readFileSync(arg, 'utf-8')
  const pkg = readJson<{ version: string }>(packageJsonPath)
  const currentVersion = pkg.version === '1.0.0' ? initialVersion : pkg.version
  const nextVersion = bumpVersion(currentVersion, detectReleaseType(message))
  setPackageVersion(nextVersion)
  updateChanges(nextVersion)
  process.exit(0)
}

throw new Error('Usage: bun run ./scripts/update-release-metadata.ts <pre-commit|commit-msg> [commit-msg-file]')
