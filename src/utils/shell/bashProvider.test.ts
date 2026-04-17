import { describe, expect, it } from 'bun:test'

import { createBashShellProvider } from './bashProvider.js'

describe('createBashShellProvider', () => {
  it('places login flag before -c when snapshot missing', async () => {
    const provider = await createBashShellProvider('/bin/bash', {
      skipSnapshot: true,
    })

    expect(provider.getSpawnArgs('echo hi')).toEqual(['-l', '-c', 'echo hi'])
  })
})
