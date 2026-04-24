import { afterEach, describe, expect, it } from 'bun:test'

import { clearSessionEnvVars, setSessionEnvVar } from '../sessionEnvVars.js'
import { createPowerShellProvider } from './powershellProvider.js'

describe('createPowerShellProvider', () => {
  afterEach(() => {
    clearSessionEnvVars()
  })

  it('applies session env vars when not sandboxed', async () => {
    const provider = createPowerShellProvider('/usr/bin/pwsh')
    setSessionEnvVar('PATH', '/custom/bin')
    setSessionEnvVar('FOO', 'bar')

    const env = await provider.getEnvironmentOverrides('echo hi')

    expect(env).toEqual({
      FOO: 'bar',
      PATH: '/custom/bin',
    })
  })

  it('uses sandbox tmpdir without letting session env override it', async () => {
    const provider = createPowerShellProvider('/usr/bin/pwsh')
    setSessionEnvVar('TMPDIR', '/user/tmp')
    setSessionEnvVar('PATH', '/custom/bin')

    await provider.buildExecCommand('echo hi', {
      id: 'test',
      sandboxTmpDir: '/sandbox/tmp',
      useSandbox: true,
    })

    const env = await provider.getEnvironmentOverrides('echo hi')

    expect(env).toEqual({
      CLAUDE_CODE_TMPDIR: '/sandbox/tmp',
      PATH: '/custom/bin',
      TMPDIR: '/sandbox/tmp',
    })
  })
})
