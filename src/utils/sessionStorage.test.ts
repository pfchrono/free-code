import { describe, expect, it } from 'bun:test'
import { cleanMessagesForLogging } from './sessionStorage.js'
import type { Message } from '../types/message.js'

describe('cleanMessagesForLogging', () => {
  it('summarizes oversized tool metadata before transcript persistence', () => {
    const largeText = 'x'.repeat(80 * 1024)
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: 'done',
        },
        toolUseResult: largeText,
        mcpMeta: {
          structuredContent: {
            rows: largeText,
          },
        },
      },
    ] as unknown as Message[]

    const [logged] = cleanMessagesForLogging(messages) as Array<Record<string, unknown>>
    const toolUseResult = logged.toolUseResult as Record<string, unknown>
    const mcpMeta = logged.mcpMeta as Record<string, Record<string, unknown>>

    expect(toolUseResult.truncated).toBe(true)
    expect(toolUseResult.originalBytes).toBeGreaterThan(64 * 1024)
    expect(mcpMeta.structuredContent.truncated).toBe(true)
    expect(mcpMeta.structuredContent.originalBytes).toBeGreaterThan(64 * 1024)
  })

  it('keeps small tool metadata intact', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: 'done',
        },
        toolUseResult: 'small',
        mcpMeta: {
          structuredContent: {
            ok: true,
          },
        },
      },
    ] as unknown as Message[]

    const [logged] = cleanMessagesForLogging(messages) as Array<Record<string, unknown>>
    const mcpMeta = logged.mcpMeta as Record<string, Record<string, unknown>>

    expect(logged.toolUseResult).toBe('small')
    expect(mcpMeta.structuredContent).toEqual({ ok: true })
  })

  it('sanitizes snake_case transcript metadata too', () => {
    const largeText = 'x'.repeat(80 * 1024)
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: 'done',
        },
        tool_use_result: largeText,
        mcp_metadata: {
          structured_content: {
            rows: largeText,
          },
        },
      },
    ] as unknown as Message[]

    const [logged] = cleanMessagesForLogging(messages) as Array<Record<string, unknown>>
    const toolUseResult = logged.tool_use_result as Record<string, unknown>
    const mcpMeta = logged.mcp_metadata as Record<string, Record<string, unknown>>

    expect(toolUseResult.truncated).toBe(true)
    expect(mcpMeta.structured_content.truncated).toBe(true)
  })
})
