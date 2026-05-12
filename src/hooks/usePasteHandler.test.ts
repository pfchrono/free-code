import { describe, expect, it } from 'bun:test'

import { shouldCheckClipboardForEmptyImagePaste } from './usePasteHandler.js'

describe('shouldCheckClipboardForEmptyImagePaste', () => {
  it('accepts empty pastes when image handler exists', () => {
    expect(
      shouldCheckClipboardForEmptyImagePaste('', () => {}),
    ).toBe(true)
  })

  it('rejects non-empty pastes', () => {
    expect(
      shouldCheckClipboardForEmptyImagePaste('hello', () => {}),
    ).toBe(false)
  })

  it('rejects empty pastes without an image handler', () => {
    expect(shouldCheckClipboardForEmptyImagePaste('')).toBe(false)
  })
})
