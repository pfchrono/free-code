import { describe, expect, it } from 'bun:test'

import { compactCavemanText, shouldCompactCavemanText } from './cavemanText.js'

describe('compactCavemanText', () => {
  it('compresses plain natural-language text', () => {
    expect(
      compactCavemanText(
        'You should just use the smaller helper in order to reduce the token count.',
      ),
    ).toBe('use smaller helper to reduce token count.')
  })

  it('preserves code fences exactly', () => {
    const input = 'Keep this intro.\n```ts\nconst value = 1\n```\nAnd this outro.'
    expect(compactCavemanText(input)).toBe(
      'Keep this intro.\n```ts\nconst value = 1\n```\nAnd this outro.',
    )
  })

  it('preserves shell commands and file paths', () => {
    const input = 'Run `bun test` in F:/code/free-code before commit.'
    expect(compactCavemanText(input)).toBe(
      'Run `bun test` in F:/code/free-code before commit.',
    )
  })

  it('preserves xml-like structured content', () => {
    const input = '<system-reminder>Important structured content</system-reminder>'
    expect(compactCavemanText(input)).toBe(input)
  })

  it('preserves quoted exact errors', () => {
    const input = 'Saw "invalid_request error" in logs.'
    expect(compactCavemanText(input)).toBe(input)
  })

  it('compacts prose around code fences without changing fenced code', () => {
    const input =
      'You should just keep this note.\n```ts\nconst value = 1\n```\nYou should just use smaller reply text.'
    expect(compactCavemanText(input)).toBe(
      'keep this note.\n```ts\nconst value = 1\n```\nuse smaller reply text.',
    )
  })

  it('compacts prose around inline code and preserves exact code span', () => {
    const input =
      'You should just use `useMemo` in order to reduce the token count.'
    expect(compactCavemanText(input)).toBe(
      'use `useMemo` to reduce token count.',
    )
  })

  it('compacts prose around json without changing json lines', () => {
    const input =
      'You should just use smaller reply text.\n{"keep":"exact","count":1}'
    expect(compactCavemanText(input)).toBe(
      'use smaller reply text.\n{"keep":"exact","count":1}',
    )
  })

  it('marks plain prose as eligible and shell text as ineligible', () => {
    expect(shouldCompactCavemanText('You should just use smaller reply text.')).toBe(true)
    expect(shouldCompactCavemanText('bun test src/utils/cavemanText.test.ts')).toBe(false)
    expect(
      shouldCompactCavemanText(
        'You should just keep note.\n```ts\nconst value = 1\n```',
      ),
    ).toBe(true)
  })
})
