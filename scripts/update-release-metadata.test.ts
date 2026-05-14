import { describe, expect, test } from 'bun:test'

import {
  buildReleasePlan,
  detectReleaseType,
  getExplicitVersion,
  updateChangesContent,
  buildRecentCommitsBlock,
} from './update-release-metadata.ts'

describe('detectReleaseType', () => {
  test('uses patch bumps for fixes', () => {
    expect(detectReleaseType('fix(session): preserve resume core memory')).toBe('patch')
  })

  test('uses minor bumps for features', () => {
    expect(detectReleaseType('feat(search): add indexed content search')).toBe('minor')
  })

  test('uses major bumps for breaking changes', () => {
    expect(detectReleaseType('feat(api)!: remove legacy endpoint')).toBe('major')
  })

  test('uses major bumps for milestones', () => {
    expect(detectReleaseType('milestone: ship 1.0.0')).toBe('major')
  })
})

describe('getExplicitVersion', () => {
  test('extracts higher explicit versions from commit headers', () => {
    expect(getExplicitVersion('chore(release): bump version to 0.6.7', '0.6.6')).toBe('0.6.7')
  })

  test('ignores versions that do not advance', () => {
    expect(getExplicitVersion('chore(release): bump version to 0.6.6', '0.6.6')).toBeNull()
  })
})

describe('buildReleasePlan', () => {
  test('keeps current version for fixes', () => {
    expect(buildReleasePlan('0.6.6', 'fix(session): preserve resume core memory')).toEqual({
      version: '0.6.6',
      releaseType: 'patch',
      createTag: false,
    })
  })

  test('keeps current version for features', () => {
    expect(buildReleasePlan('0.6.6', 'feat(search): add indexed content search')).toEqual({
      version: '0.6.6',
      releaseType: 'minor',
      createTag: false,
    })
  })

  test('jumps to 1.0.0 for milestone commits before stable', () => {
    expect(buildReleasePlan('0.6.6', 'milestone: ship stable')).toEqual({
      version: '1.0.0',
      releaseType: 'major',
      createTag: true,
    })
  })

  test('honors explicit target versions', () => {
    expect(buildReleasePlan('0.6.6', 'chore(release): bump version to 1.0.0')).toEqual({
      version: '1.0.0',
      releaseType: 'major',
      createTag: true,
    })
  })
})

describe('buildRecentCommitsBlock', () => {
  test('skips release bump commits from generated block', () => {
    expect(
      buildRecentCommitsBlock([
        { date: '2026-05-14', subject: 'fix(session): preserve resume core memory' },
        { date: '2026-05-13', subject: 'chore(release): bump version to 0.6.6' },
        { date: '2026-05-13', subject: 'feat(search): add indexed content search' },
      ])
    ).toBe(`<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
- 2026-05-13 feat(search): add indexed content search
<!-- GENERATED_RECENT_COMMITS_END -->`)
  })

  test('prepends pending commit subject', () => {
    expect(
      buildRecentCommitsBlock(
        [{ date: '2026-05-13', subject: 'feat(search): add indexed content search' }],
        { date: '2026-05-14', subject: 'fix(session): preserve resume core memory' }
      )
    ).toBe(`<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
- 2026-05-13 feat(search): add indexed content search
<!-- GENERATED_RECENT_COMMITS_END -->`)
  })
})

describe('updateChangesContent', () => {
  test('moves unreleased notes into fresh release section', () => {
    const content = `# Changelog

All notable changes to free-code are documented here.

## [Unreleased]

### Added
- Fresh thing

### Fixed
- Real fix

## [0.6.6] - 2026-05-13

### Changed
- Stale old thing

<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-13 chore(release): bump version to 0.6.6
<!-- GENERATED_RECENT_COMMITS_END -->
`

    const generatedBlock = `<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
<!-- GENERATED_RECENT_COMMITS_END -->`

    expect(updateChangesContent(content, '0.6.7', '2026-05-14', generatedBlock)).toBe(`# Changelog

All notable changes to free-code are documented here.

## [Unreleased]

## [0.6.7] - 2026-05-14

### Added
- Fresh thing

### Fixed
- Real fix

<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
<!-- GENERATED_RECENT_COMMITS_END -->

## [0.6.6] - 2026-05-13

### Changed
- Stale old thing

<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-13 chore(release): bump version to 0.6.6
<!-- GENERATED_RECENT_COMMITS_END -->
`)
  })

  test('replaces existing draft section for same version', () => {
    const content = `# Changelog

## [Unreleased]

### Added
- New note

## [0.6.7] - 2026-05-13

### Changed
- Old draft
`

    const generatedBlock = `<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
<!-- GENERATED_RECENT_COMMITS_END -->`

    expect(updateChangesContent(content, '0.6.7', '2026-05-14', generatedBlock)).toBe(`# Changelog

## [Unreleased]

## [0.6.7] - 2026-05-14

### Added
- New note

<!-- GENERATED_RECENT_COMMITS_START -->
### Recent commits
- 2026-05-14 fix(session): preserve resume core memory
<!-- GENERATED_RECENT_COMMITS_END -->
`)
  })
})
