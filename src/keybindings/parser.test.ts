import { describe, expect, it } from 'bun:test'

import {
  chordToDisplayString,
  parseChord,
  parseKeystroke,
  keystrokeToDisplayString,
} from './parser.js'

describe('keybinding parser', () => {
  it('accepts minus key names with modifiers', () => {
    expect(parseKeystroke('minus')).toMatchObject({
      key: 'minus',
      alt: false,
    })
    expect(parseKeystroke('alt+minus')).toMatchObject({
      key: 'minus',
      alt: true,
    })
  })

  it('displays minus keybindings as a literal hyphen', () => {
    expect(keystrokeToDisplayString(parseKeystroke('minus'))).toBe('-')
    expect(chordToDisplayString(parseChord('alt+minus'))).toBe('alt+-')
  })
})
