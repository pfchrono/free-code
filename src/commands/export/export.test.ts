import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { describe, expect, mock, test } from 'bun:test'
import type { ToolUseContext } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'

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

  test('renders standalone html export content', async () => {
    const { renderStandaloneHtml } = await import(`./export.js?html=${Date.now()}`)

    const html = renderStandaloneHtml('hello <world>')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<pre>hello &lt;world&gt;</pre>')
    expect(html).toContain('<title>Free-Code Conversation Export</title>')
  })

  test('writes html export when filename arg provided', async () => {
    const { call } = await import(`./export.js?file=${Date.now()}`)
    const onDone = mock()
    const filename = `export-test-${Date.now()}.txt`
    const targetPath = join(getCwd(), filename.replace(/\.txt$/, '.html'))
    renderMessagesToPlainText.mockResolvedValueOnce('plain text export')

    try {
      const result = await call(
        onDone,
        makeContext([
          {
            type: 'user',
            message: {
              role: 'user',
              content: [{ type: 'text', text: 'Export this chat' }],
            },
            uuid: 'user-1',
            parent_tool_use_id: null,
            session_id: 'session-1',
          },
        ] as ToolUseContext['messages']),
        filename
      )

      expect(result).toBeNull()
      expect(existsSync(targetPath)).toBe(true)
      expect(readFileSync(targetPath, 'utf8')).toContain('<pre>plain text export</pre>')
      expect(onDone).toHaveBeenCalledWith(`Conversation exported to: ${targetPath}`)
    } finally {
      rmSync(targetPath, { force: true })
    }
  })
})
