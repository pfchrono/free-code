import { describe, expect, test } from 'bun:test'
import { supportsOsc52Clipboard } from '../../utils/env.js'
import { shouldUseNativeClipboard } from './osc.js'

describe('supportsOsc52Clipboard', () => {
  test.each(['ghostty', 'kitty', 'WezTerm', 'windows-terminal', 'vscode'])(
    'allows %s',
    terminal => {
      expect(supportsOsc52Clipboard(terminal)).toBe(true)
    },
  )

  test.each(['iTerm.app', 'alacritty', 'Apple_Terminal', 'xterm', 'tmux', 'screen', 'cursor', null])(
    'rejects %s',
    terminal => {
      expect(supportsOsc52Clipboard(terminal)).toBe(false)
    },
  )
})

describe('shouldUseNativeClipboard', () => {
  test('disables native clipboard over SSH', () => {
    expect(shouldUseNativeClipboard({ SSH_CONNECTION: '1' }, 'xterm')).toBe(false)
    expect(shouldUseNativeClipboard({ SSH_CONNECTION: '1' }, 'ghostty')).toBe(false)
  })

  test('keeps native clipboard inside tmux and screen', () => {
    expect(shouldUseNativeClipboard({ TMUX: '/tmp/tmux-1' }, 'ghostty')).toBe(true)
    expect(shouldUseNativeClipboard({ STY: '1234.pts-0.host' }, 'kitty')).toBe(true)
  })

  test('skips native clipboard for reliable raw OSC52 terminals', () => {
    expect(shouldUseNativeClipboard({}, 'ghostty')).toBe(false)
    expect(shouldUseNativeClipboard({}, 'kitty')).toBe(false)
    expect(shouldUseNativeClipboard({}, 'WezTerm')).toBe(false)
    expect(shouldUseNativeClipboard({}, 'windows-terminal')).toBe(false)
    expect(shouldUseNativeClipboard({}, 'vscode')).toBe(false)
  })

  test('keeps native clipboard for conservative terminals', () => {
    expect(shouldUseNativeClipboard({}, 'xterm')).toBe(true)
    expect(shouldUseNativeClipboard({}, 'iTerm.app')).toBe(true)
    expect(shouldUseNativeClipboard({}, null)).toBe(true)
  })
})
