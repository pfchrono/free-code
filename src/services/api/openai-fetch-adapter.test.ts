import { describe, expect, it } from 'bun:test'

import { testExports } from './openai-fetch-adapter.js'

describe('translateMessages', () => {
  it('coalesces consecutive user messages for strict alternating backends', () => {
    const translated = testExports.translateMessages([
      { role: 'user', content: 'first message' },
      { role: 'user', content: 'second message' },
    ])

    expect(translated).toHaveLength(1)
    expect(translated[0]).toEqual({
      role: 'user',
      content: 'first message\nsecond message',
    })
  })

  it('coalesces consecutive assistant messages while preserving tool calls', () => {
    const translated = testExports.translateMessages([
      { role: 'assistant', content: 'thinking...' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'Bash',
            input: { command: 'ls' },
          },
        ],
      },
    ])

    expect(translated).toHaveLength(1)
    expect(translated[0]?.role).toBe('assistant')
    expect(translated[0]?.content).toBe('thinking...')
    expect(translated[0]?.tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'Bash',
          arguments: '{"command":"ls"}',
        },
      },
    ])
  })
})
