import { describe, expect, it } from 'bun:test'

import { createBashShellProvider } from './bashProvider.js'

describe('createBashShellProvider', () => {
  it('places login flag before -c when snapshot missing', async () => {
    const provider = await createBashShellProvider('/bin/bash', {
      skipSnapshot: true,
    })

    expect(provider.getSpawnArgs('echo hi')).toEqual(['-l', '-c', 'echo hi'])
  })

  it('rewrites Windows null redirect before quoting command', async () => {
    const provider = await createBashShellProvider('/bin/bash', {
      skipSnapshot: true,
    })

    const { commandString } = await provider.buildExecCommand('echo hi 2>nul', {
      id: 'test',
      useSandbox: false,
    })

    expect(commandString).toContain("eval 'echo hi 2>/dev/null'")
    expect(commandString).toContain('\\< /dev/null')
    expect(commandString).not.toContain('2>nul')
  })

  it('preserves rewritten null redirect when rearranging piped command', async () => {
    const provider = await createBashShellProvider('/bin/bash', {
      skipSnapshot: true,
    })

    const { commandString } = await provider.buildExecCommand('echo hi 2>nul | wc -l', {
      id: 'test',
      useSandbox: false,
    })

    expect(commandString).toContain("eval 'echo hi 2>/dev/null < /dev/null | wc -l'")
    expect(commandString).not.toContain('2>nul')
  })
})
