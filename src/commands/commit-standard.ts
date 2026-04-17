import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { type Command } from './types/command.js'

const TEMP_PATTERNS = ['~', '.tmp', '.temp', '.bak', '.swp', '.swo']
const TEMP_EXTENSIONS = ['.tmp', '.temp', '.bak', '.swp', '.swo', '.log']

function findTempFiles(dir: string): string[] {
  const temps: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry.startsWith('.')) continue
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          temps.push(...findTempFiles(fullPath))
        } else if (stat.isFile()) {
          if (TEMP_PATTERNS.some(p => entry.includes(p)) || TEMP_EXTENSIONS.includes(extname(entry).toLowerCase())) {
            temps.push(fullPath)
          }
        }
      } catch {}
    }
  } catch {}
  return temps
}

function cleanTempFiles(dir: string): number {
  const temps = findTempFiles(dir)
  for (const temp of temps) {
    try {
      unlinkSync(temp)
    } catch {}
  }
  return temps.length
}

function runGit(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim()
}

function getPendingChanges(): { staged: string[], unstaged: string[], untracked: string[] } {
  const staged = runGit("git diff --name-only --cached").split('\n').filter(Boolean)
  const unstaged = runGit("git diff --name-only").split('\n').filter(Boolean)
  const untracked = runGit("git ls-files --others --exclude-standard").split('\n').filter(Boolean)
  return { staged, unstaged, untracked }
}

function getDiffContent(): string {
  return runGit("git diff HEAD")
}

function getRecentCommits(count: number = 10): string {
  return runGit(`git log --oneline -${count}`)
}

function generateCommitMessage(changes: { staged: string[], unstaged: string[], untracked: string[] }, diff: string, recentCommits: string): string {
  const allChanged = [...new Set([...changes.staged, ...changes.unstaged, ...changes.untracked])]
  const files = allChanged.slice(0, 50).join(', ')

  const lines: string[] = []
  lines.push('# Commit Message Generator')
  lines.push('')
  lines.push('## Changed Files')
  lines.push(files || 'none')
  lines.push('')
  lines.push('## Recent Commit History')
  lines.push(recentCommits)
  lines.push('')
  lines.push('## Diff Summary')
  lines.push(diff.slice(0, 8000))
  lines.push('')
  lines.push('Based on the changed files, diff, and recent commits above, write a detailed commit message.')
  lines.push('Format:')
  lines.push('- First line: Short summary (50-72 chars, imperative mood)')
  lines.push('- Then a blank line')
  lines.push('- Then detailed description of WHAT changed and WHY')
  lines.push('')
  lines.push('Be specific. Include file/feature names. Do not start with "Update", "Fix", etc. - just describe.')

  return lines.join('\n')
}

function parseCommitFromResponse(response: string): string {
  const lines = response.split('\n').filter(l => l.trim())
  const commitLines: string[] = []
  let collecting = false

  for (const line of lines) {
    if (line.startsWith('## Commit Message') || line.startsWith('###')) continue
    if (line.startsWith('#')) {
      collecting = true
      continue
    }
    if (collecting) {
      commitLines.push(line)
    }
  }

  let result = commitLines.join('\n').trim()

  // If empty, try to extract first non-comment lines
  if (!result) {
    const nonComment = lines.filter(l => !l.startsWith('#') && l.trim())
    if (nonComment.length > 0) {
      result = nonComment.join('\n').trim()
    }
  }

  // Fallback
  if (!result) {
    result = lines[0] || 'Update changes'
  }

  return result
}

async function updateChangelog(changes: { staged: string[], unstaged: string[], untracked: string[] }, message: string): Promise<void> {
  const changesPath = join(process.cwd(), 'changes.md')
  if (!existsSync(changesPath)) return

  const content = readFileSync(changesPath, 'utf-8')

  // Extract first line of commit message for changelog
  const firstLine = message.split('\n')[0].replace(/^[^a-zA-Z0-9]+/, '')

  // Determine category from changed files
  const allChanged = [...new Set([...changes.staged, ...changes.unstaged, ...changes.untracked])]
  let category = 'Changed'

  if (allChanged.some(f => f.includes('service') || f.includes('api'))) {
    category = 'Changed'
  }
  if (allChanged.some(f => f.includes('command') || f.includes('tool'))) {
    category = 'Added'
  }
  if (allChanged.some(f => f.includes('fix') || f.includes('bug'))) {
    category = 'Fixed'
  }

  const today = new Date().toISOString().split('T')[0]
  const unreleasedMatch = content.match(/## \[Unreleased\] - (\d{4}-\d{2}-\d{2})/)
  const date = unreleasedMatch ? unreleasedMatch[1] : today

  const entry = `\n- **${firstLine}**`;

  // Find the section to insert into
  let newContent = content

  // Check if there's an Unreleased section
  if (content.includes('## [Unreleased]')) {
    // Find the last entry under Unreleased and add after it
    const unreleasedIndex = content.indexOf('## [Unreleased]')
    const nextSection = content.indexOf('\n## [', unreleasedIndex + 1)

    if (nextSection === -1) {
      // Add before end or at end
      const insertAt = content.lastIndexOf('\n')
      newContent = content.slice(0, insertAt) + entry + content.slice(insertAt)
    } else {
      // Add entries in the unreleased section
      const sectionContent = content.slice(unreleasedIndex, nextSection)
      const lastEntry = sectionContent.lastIndexOf('- **')
      if (lastEntry !== -1) {
        const entryEnd = sectionContent.indexOf('\n', lastEntry)
        const absEntryEnd = unreleasedIndex + entryEnd + 1
        newContent = content.slice(0, absEntryEnd) + entry + content.slice(absEntryEnd)
      } else {
        // Add after the date line
        const dateLineEnd = content.indexOf('\n', unreleasedIndex)
        if (dateLineEnd !== -1 && dateLineEnd < nextSection) {
          newContent = content.slice(0, dateLineEnd + 1) + entry + content.slice(dateLineEnd + 1)
        }
      }
    }
  } else {
    // Insert new Unreleased section
    const insertMarker = '\n## [' // Find first version section
    const firstVersion = content.indexOf(insertMarker)
    if (firstVersion !== -1) {
      newContent = content.slice(0, firstVersion) +
        `## [Unreleased] - ${today}\n\n### ${category}s\n${entry}\n` +
        content.slice(firstVersion)
    }
  }

  if (newContent !== content) {
    writeFileSync(changesPath, newContent, 'utf-8')
  }
}

export default {
  type: 'prompt',
  name: 'commit-standard',
  description: 'Stage all changes, generate detailed commit message, update docs, clean temp files, commit and push',
  source: 'builtin',
  availability: ['console'],
  async getPromptForCommand(args, context) {
    const changes = getPendingChanges()
    const allChanged = [...new Set([...changes.staged, ...changes.unstaged, ...changes.untracked])]

    if (allChanged.length === 0) {
      return "No pending changes to commit."
    }

    const diff = getDiffContent()
    const recentCommits = getRecentCommits(10)

    const prompt = generateCommitMessage(changes, diff, recentCommits)

    // Auto-stage all changes first
    if (changes.unstaged.length > 0 || changes.untracked.length > 0) {
      try {
        runGit('git add -A')
      } catch {}
    }

    // Clean temp files
    const cleaned = cleanTempFiles(process.cwd())

    return `${prompt}

Currently staging ${allChanged.length} file(s).
${cleaned > 0 ? `Cleaned ${cleaned} temp file(s).` : ''}

Respond ONLY with the commit message (no explanations, no markdown code blocks).`
  },
  async handleCommandResponse(response: string) {
    const message = parseCommitFromResponse(response)

    // Commit
    runGit(`git commit -m "${message.replace(/"/g, '\\"')}"`)

    // Update changelog
    const changes = getPendingChanges()
    await updateChangelog(changes, message)

    // Push
    try {
      runGit('git push')
    } catch (e: unknown) {
      const error = e as Error & { stderr?: string }
      if (error.stderr?.includes('push.default')) {
        runGit('git push -u origin HEAD')
      } else {
        throw e
      }
    }

    return `Committed and pushed:\n\n${message}`
  },
} satisfies Command
