import { describe, expect, it } from 'bun:test'
import type { ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  appendFileMutationFooterToAssistantMessage,
  createFileMutationVerifier,
} from './fileMutationVerifier.js'
import type { AssistantMessage, UserMessage } from '../../types/message.js'

function toolUse(
  id: string,
  name: string,
  input: Record<string, unknown>,
): ToolUseBlock {
  return {
    type: 'tool_use',
    id,
    name,
    input,
    caller: { type: 'direct' },
  }
}

function toolResult(
  toolUseId: string,
  content: string,
  isError?: boolean,
): UserMessage {
  const block: ToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    ...(isError === undefined ? {} : { is_error: isError }),
  }
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [block],
    },
    uuid: 'user-1',
    parent_tool_use_id: null,
    session_id: 'session-1',
  } as UserMessage
}

function assistantMessage(text: string): AssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
    uuid: 'assistant-1',
    parent_tool_use_id: null,
    session_id: 'session-1',
  } as AssistantMessage
}

describe('FileMutationVerifier', () => {
  it('records failed file mutation tool results with path and error', () => {
    const verifier = createFileMutationVerifier()
    const toolUses = new Map([
      ['tool-1', toolUse('tool-1', 'Edit', { file_path: '/tmp/app.ts' })],
    ])

    verifier.recordToolResultMessage(
      toolResult(
        'tool-1',
        '<tool_use_error>Error editing file: stale read</tool_use_error>',
        true,
      ),
      toolUses,
    )

    expect(verifier.formatFooter()).toContain(
      '- Edit `/tmp/app.ts`: Error editing file: stale read',
    )
  })

  it('suppresses earlier failure when later same tool and path succeeds', () => {
    const verifier = createFileMutationVerifier()
    const toolUses = new Map([
      ['fail-1', toolUse('fail-1', 'Write', { file_path: '/tmp/app.ts' })],
      ['ok-1', toolUse('ok-1', 'Write', { file_path: '/tmp/app.ts' })],
    ])

    verifier.recordToolResultMessage(toolResult('fail-1', 'denied', true), toolUses)
    verifier.recordToolResultMessage(toolResult('ok-1', 'wrote file'), toolUses)

    expect(verifier.getPendingFailures()).toEqual([])
    expect(verifier.formatFooter()).toBeNull()
  })

  it('tracks notebook mutation paths separately', () => {
    const verifier = createFileMutationVerifier()
    const toolUses = new Map([
      [
        'tool-1',
        toolUse('tool-1', 'NotebookEdit', { notebook_path: '/tmp/notebook.ipynb' }),
      ],
    ])

    verifier.recordToolResultMessage(toolResult('tool-1', 'bad cell', true), toolUses)

    expect(verifier.formatFooter()).toContain(
      '- NotebookEdit `/tmp/notebook.ipynb`: bad cell',
    )
  })

  it('appends footer to visible assistant text without mutating original', () => {
    const original = assistantMessage('Done.')
    const next = appendFileMutationFooterToAssistantMessage(
      original,
      'File mutation check: missing edit',
    )

    expect(next.message.content).toEqual([
      { type: 'text', text: 'Done.\n\nFile mutation check: missing edit' },
    ])
    expect(original.message.content).toEqual([{ type: 'text', text: 'Done.' }])
  })
})
