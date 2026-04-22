import { describe, expect, mock, test } from 'bun:test'

import { runHeadlessLocalSlashCommand } from './headlessLocalCommandRunner.js'

describe('runHeadlessLocalSlashCommand', () => {
  test('executes local-jsx commands in headless mode', async () => {
    const onDoneResult = 'Memory command opened'
    const call = mock(async (onDone: (result?: string) => void) => {
      onDone(onDoneResult)
      return null
    })

    const result = await runHeadlessLocalSlashCommand('/memory+', {
      cwd: process.cwd(),
      appState: {},
      setAppState: () => {},
      fileCache: {} as never,
      commands: [
        {
          name: 'memory+',
          description: 'Enhanced memory',
          source: 'builtin',
          type: 'local-jsx',
          load: async () => ({ call }),
        },
      ],
    })

    expect(call).toHaveBeenCalled()
    expect(result).toEqual({
      command: expect.objectContaining({ name: 'memory+', type: 'local-jsx' }),
      parsedArgs: '',
      result: {
        type: 'text',
        value: onDoneResult,
      },
    })
  })

  test('returns no-content text when local-jsx command only renders JSX in headless mode', async () => {
    const call = mock(async () => 'jsx-node')

    const result = await runHeadlessLocalSlashCommand('/memory+', {
      cwd: process.cwd(),
      appState: {},
      setAppState: () => {},
      fileCache: {} as never,
      commands: [
        {
          name: 'memory+',
          description: 'Enhanced memory',
          source: 'builtin',
          type: 'local-jsx',
          load: async () => ({ call }),
        },
      ],
    })

    expect(call).toHaveBeenCalled()
    expect(result).toEqual({
      command: expect.objectContaining({ name: 'memory+', type: 'local-jsx' }),
      parsedArgs: '',
      result: {
        type: 'text',
        value: '(no content)',
      },
    })
  })
})
