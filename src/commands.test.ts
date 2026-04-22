import { describe, expect, test } from 'bun:test'

import { builtInCommandNames } from './commands.js'

describe('command registry', () => {
  test('includes memory commands', () => {
    const names = builtInCommandNames()

    expect(names.has('memory')).toBe(true)
    expect(names.has('memory+')).toBe(true)
  })
})
