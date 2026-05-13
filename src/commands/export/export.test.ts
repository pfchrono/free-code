import { describe, expect, mock, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'

const renderMessagesToPlainText = mock(async () => '')

mock.module('../../utils/exportRenderer.js', () => ({
  renderMessagesToPlainText,
}))

function makeContext(messages: ToolUseContext['messages']): ToolUseContext {
  return {
    messages,
    options: {
      tools: [],
    },
  } as ToolUseContext
}

describe('/export command', () => {
  test('guards empty conversation before dialog or file export', async () => {
    const { call } = await import(`./export.js?empty=${Date.now()}`)
    const onDone = mock()
    renderMessagesToPlainText.mockResolvedValueOnce('')

    const result = await call(onDone, makeContext([]), 'out.txt')

    expect(result).toBeNull()
    expect(onDone).toHaveBeenCalledWith('Nothing to export — conversation is empty')
  })

  test('extracts and sanitizes first prompt for filenames', async () => {
    const { extractFirstPrompt, sanitizeFilename } = await import(
      `./export.js?helpers=${Date.now()}`
    )
    const prompt = extractFirstPrompt([
      {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, Free-Code!\nSecond line' }],
        },
        uuid: 'user-1',
        parent_tool_use_id: null,
        session_id: 'session-1',
      },
    ] as ToolUseContext['messages'])

    expect(prompt).toBe('Hello, Free-Code!')
    expect(sanitizeFilename(prompt)).toBe('hello-free-code')
  })
})
