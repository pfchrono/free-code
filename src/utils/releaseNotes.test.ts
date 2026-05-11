import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  _resetChangelogCacheForTesting,
  getStoredChangelog,
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
