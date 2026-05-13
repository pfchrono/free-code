import { describe, expect, test } from 'bun:test'

import { shouldExitForStartupProviderValidationError } from './providerValidation.js'

describe('shouldExitForStartupProviderValidationError', () => {
  test('does not exit for allocated SSH TTY when stdout TTY is unreliable', () => {
    expect(
      shouldExitForStartupProviderValidationError({
        stdoutIsTTY: false,
        env: { SSH_TTY: '/dev/pts/0' },
        platform: 'linux',
      }),
    ).toBe(false)
  })

  test('exits for SSH connection without allocated TTY', () => {
    expect(
      shouldExitForStartupProviderValidationError({
        stdoutIsTTY: false,
        env: { SSH_CONNECTION: '192.168.1.1 56789 192.168.1.100 22' },
        platform: 'linux',
      }),
    ).toBe(true)
  })

  test('still treats sdk-url as non-interactive for startup validation', () => {
    expect(
      shouldExitForStartupProviderValidationError({
        stdoutIsTTY: true,
        args: ['--sdk-url=ws://localhost'],
        env: {},
        platform: 'linux',
      }),
    ).toBe(true)
  })
})
