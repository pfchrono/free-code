import { describe, expect, test } from 'bun:test'

import { isInteractiveSession } from './interactivity.js'

describe('isInteractiveSession', () => {
  test('returns true when stdout is TTY', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: true,
        args: [],
        env: {},
        platform: 'linux',
      }),
    ).toBe(true)
  })

  test('returns false when stdout is not TTY and no interactive fallback applies', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: false,
        args: [],
        env: {},
        platform: 'linux',
      }),
    ).toBe(false)
  })

  test('returns true for allocated SSH TTY even when stdout TTY is unreliable', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: false,
        args: [],
        env: { SSH_TTY: '/dev/pts/0' },
        platform: 'linux',
      }),
    ).toBe(true)
  })

  test('does not treat SSH_CONNECTION alone as interactive', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: false,
        args: [],
        env: { SSH_CONNECTION: '192.168.1.1 56789 192.168.1.100 22' },
        platform: 'linux',
      }),
    ).toBe(false)
  })

  test('explicit non-interactive flags win over TTY and SSH_TTY', () => {
    for (const args of [['-p'], ['--print'], ['--init-only']]) {
      expect(
        isInteractiveSession({
          stdoutIsTTY: true,
          args,
          env: { SSH_TTY: '/dev/pts/0' },
          platform: 'linux',
        }),
      ).toBe(false)
    }
  })

  test('caller controls whether sdk-url means non-interactive', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: true,
        args: ['--sdk-url=ws://localhost'],
        env: {},
        platform: 'linux',
        sdkUrlIsNonInteractive: false,
      }),
    ).toBe(true)

    expect(
      isInteractiveSession({
        stdoutIsTTY: true,
        args: ['--sdk-url=ws://localhost'],
        env: {},
        platform: 'linux',
        sdkUrlIsNonInteractive: true,
      }),
    ).toBe(false)
  })

  test('keeps Windows interactive fallback without explicit headless flags', () => {
    expect(
      isInteractiveSession({
        stdoutIsTTY: false,
        args: [],
        env: {},
        platform: 'win32',
      }),
    ).toBe(true)
  })
})
