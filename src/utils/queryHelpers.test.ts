import { describe, expect, it } from 'bun:test'

import { isResultSuccessful } from './queryHelpers.js'

describe('isResultSuccessful', () => {
  it('treats api_error results as unsuccessful even with end_turn', () => {
    expect(isResultSuccessful(undefined, 'end_turn', 'api_error')).toBe(false)
  })
})
