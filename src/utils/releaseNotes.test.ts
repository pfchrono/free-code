import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  _resetChangelogCacheForTesting,
  getAllReleaseNotes,
  getRecentReleaseNoteGroups,
  getStoredChangelog,
  parseChangelog,
} from './releaseNotes.js'

let tempDir: string | undefined
const originalConfigHome = process.env.FREE_CODE_CONFIG_HOME

afterEach(async () => {
  _resetChangelogCacheForTesting()

  if (originalConfigHome === undefined) {
    delete process.env.FREE_CODE_CONFIG_HOME
  } else {
    process.env.FREE_CODE_CONFIG_HOME = originalConfigHome
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('getStoredChangelog', () => {
  test('prefers fetched cache over bundled changes.md', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'free-code-release-notes-'))
    process.env.FREE_CODE_CONFIG_HOME = tempDir

    const cacheDir = join(tempDir, 'cache')
    await mkdir(cacheDir, { recursive: true })
    await writeFile(join(cacheDir, 'changelog.md'), '## [9.9.9]\n- from cache\n')

    const changelog = await getStoredChangelog()

    expect(changelog).toContain('from cache')
    expect(changelog).not.toContain('Harness ratchet workflow')
  })
})

describe('parseChangelog', () => {
  test('normalizes release-please headings and markdown notes', () => {
    const changelog = `## [0.6.5](https://example.com/compare/v0.6.4...v0.6.5) - 2026-05-13
* **Provider config** -- use \`gpt-5.5\` by default ([#123](https://example.com/pull/123))
`

    expect(parseChangelog(changelog)).toEqual({
      '0.6.5': ['Provider config -- use gpt-5.5 by default (#123)'],
    })
  })
})

describe('release note ordering', () => {
  const changelog = `## [Unreleased]
- upcoming change

## [0.6.4] - 2026-04-16
- shipped change

## [0.6.3] - 2026-04-01
- older change
`

  test('includes Unreleased before released versions in recent groups', () => {
    expect(getRecentReleaseNoteGroups('0.6.4', '0.6.4', changelog, 3)).toEqual([
      ['Unreleased', ['upcoming change']],
    ])
  })

  test('treats Unreleased as latest in all release notes', () => {
    expect(getAllReleaseNotes(changelog)).toEqual([
      ['0.6.3', ['older change']],
      ['0.6.4', ['shipped change']],
      ['Unreleased', ['upcoming change']],
    ])
  })
})
