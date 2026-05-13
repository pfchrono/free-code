import { describe, expect, test } from 'bun:test'
import { buildGitChildEnv, sanitizeEnvForGit } from './gitEnv.js'

describe('sanitizeEnvForGit', () => {
  test('drops env values containing control characters', () => {
    const result = sanitizeEnvForGit({
      GOOD: 'value',
      BAD_LF: 'line1\nline2',
      BAD_CR: 'value\r',
      BAD_NUL: 'a\0b',
    })

    expect(result.env).toEqual({ GOOD: 'value' })
    expect(result.dropped).toEqual(['BAD_LF', 'BAD_CR', 'BAD_NUL'])
  })

  test('drops env keys containing control characters', () => {
    const result = sanitizeEnvForGit({
      'BAD\nKEY': 'safe',
      GOOD: 'value',
    })

    expect(result.env).toEqual({ GOOD: 'value' })
    expect(result.dropped).toEqual(['BAD\nKEY'])
  })

  test('ignores undefined entries', () => {
    const result = sanitizeEnvForGit({
      GOOD: 'value',
      MAYBE: undefined,
    })

    expect(result.env).toEqual({ GOOD: 'value' })
    expect(result.dropped).toEqual([])
  })
})

describe('buildGitChildEnv', () => {
  test('sets no-prompt git overrides', () => {
    const env = buildGitChildEnv()

    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GIT_ASKPASS).toBe('')
  })

  test('caller extras override default git env and are sanitized', () => {
    const env = buildGitChildEnv({
      GIT_TERMINAL_PROMPT: '1',
      EXTRA_BAD: 'a\rb',
    })

    expect(env.GIT_TERMINAL_PROMPT).toBe('1')
    expect(env.EXTRA_BAD).toBeUndefined()
  })
})
