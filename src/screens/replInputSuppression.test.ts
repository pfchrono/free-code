import { describe, expect, it } from 'bun:test'

import { isPromptTypingSuppressionActive } from './replInputSuppression.js'

describe('isPromptTypingSuppressionActive', () => {
  it('returns true when prompt input is active', () => {
    expect(isPromptTypingSuppressionActive(true, '')).toBe(true)
  })

  it('returns true when buffered input exists even if prompt focus is inactive', () => {
    expect(isPromptTypingSuppressionActive(false, ' buffered text ')).toBe(true)
  })

  it('returns false when nothing is being typed and no input is buffered', () => {
    expect(isPromptTypingSuppressionActive(false, '   ')).toBe(false)
  })
})
