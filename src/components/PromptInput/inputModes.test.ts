import { describe, expect, test } from 'bun:test'

import { detectModeEntry } from './inputModes.js'

describe('detectModeEntry', () => {
  test('strips bare bash marker for single-character mode entry', () => {
    expect(
      detectModeEntry({
        value: '!',
        prevInputLength: 0,
        cursorOffset: 0,
      }),
    ).toEqual({
      mode: 'bash',
      strippedValue: '',
    })
  })

  test('strips bash marker from multi-character empty input entry', () => {
    expect(
      detectModeEntry({
        value: '! gcloud auth login',
        prevInputLength: 0,
        cursorOffset: 0,
      }),
    ).toEqual({
      mode: 'bash',
      strippedValue: ' gcloud auth login',
    })
  })

  test('ignores mode marker inserted away from start', () => {
    expect(
      detectModeEntry({
        value: 'echo !',
        prevInputLength: 5,
        cursorOffset: 5,
      }),
    ).toBeNull()
  })

  test('ignores normal prompt input', () => {
    expect(
      detectModeEntry({
        value: 'hello',
        prevInputLength: 4,
        cursorOffset: 0,
      }),
    ).toBeNull()
  })
})
