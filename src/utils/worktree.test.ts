import { describe, expect, test } from 'bun:test'
import { buildRevParseFailureMessage } from './worktree.js'

describe('buildRevParseFailureMessage', () => {
  test('includes git stderr for missing branches', () => {
    const message = buildRevParseFailureMessage(
      'origin/main',
      'fatal: ambiguous argument origin/main',
      128,
    )

    expect(message).toBe(
      'Failed to resolve base branch "origin/main": fatal: ambiguous argument origin/main',
    )
  })

  test('falls back to exit code when stderr is empty', () => {
    expect(buildRevParseFailureMessage('feature', '', 129)).toBe(
      'Failed to resolve base branch "feature": exit code 129',
    )
  })

  test('adds an actionable hint for unresolved HEAD', () => {
    const message = buildRevParseFailureMessage(
      'HEAD',
      'fatal: ambiguous argument HEAD',
      128,
    )

    expect(message).toContain('fatal: ambiguous argument HEAD')
    expect(message).toContain('make at least one commit')
  })
})
