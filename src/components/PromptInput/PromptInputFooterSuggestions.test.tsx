import { describe, expect, it } from 'bun:test'
import { getMaxVisibleSuggestionItems, OVERLAY_MAX_ITEMS } from './PromptInputFooterSuggestions.js'

describe('getMaxVisibleSuggestionItems', () => {
  it('uses overlay chrome offset when overlay is enabled', () => {
    expect(getMaxVisibleSuggestionItems(10, true)).toBe(4)
  })

  it('caps overlay items at overlay max', () => {
    expect(getMaxVisibleSuggestionItems(40, true)).toBe(OVERLAY_MAX_ITEMS)
  })
})
