import { describe, expect, it } from 'bun:test'

import type { Message } from '../../types/message.js'

describe('collectContextData', () => {
  it('passes the pre-microcompact API view for API usage extraction', async () => {

    const messages: Message[] = [
      {
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        cwd: '/tmp',
        sessionId: 'session-1',
        version: '1.0.0',
        type: 'user',
        uuid: 'msg-1',
        timestamp: new Date(1_000).toISOString(),
        message: {
          role: 'user',
          content: 'before boundary',
        },
      },
      {
        parentUuid: 'msg-1',
        isSidechain: false,
        userType: 'external',
        cwd: '/tmp',
        sessionId: 'session-1',
        version: '1.0.0',
        type: 'user',
        uuid: 'msg-2',
        timestamp: new Date(2_000).toISOString(),
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content: JSON.stringify({
                subtype: 'compact_boundary',
                originalMessages: 1,
              }),
              is_error: false,
            },
          ],
        },
      },
      {
        parentUuid: 'msg-2',
        isSidechain: false,
        userType: 'external',
        cwd: '/tmp',
        sessionId: 'session-1',
        version: '1.0.0',
        type: 'assistant',
        uuid: 'msg-3',
        timestamp: new Date(3_000).toISOString(),
        message: {
          id: 'msg-api-1',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [
            {
              type: 'text',
              text: 'kept after boundary',
            },
          ],
          usage: {
            input_tokens: 321,
            output_tokens: 123,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        requestId: 'req-1',
      },
      {
        parentUuid: 'msg-3',
        isSidechain: false,
        userType: 'external',
        cwd: '/tmp',
        sessionId: 'session-1',
        version: '1.0.0',
        type: 'user',
        uuid: 'msg-4',
        timestamp: new Date(4_000).toISOString(),
        message: {
          role: 'user',
          content: 'x'.repeat(18_000),
        },
      },
    ]

    const { collectContextData } = await import('./context-noninteractive.js')

    const result = await collectContextData({
      messages,
      getAppState: () => ({
        toolPermissionContext: {},
        agent: 'main-agent',
        agentDefinitions: {
          activeAgents: [
            {
              agentType: 'main-agent',
              name: 'Main Agent',
              source: 'built-in',
              baseDir: 'built-in',
              tools: [],
              getSystemPrompt: () => 'You are the main agent.',
            },
          ],
        },
      }) as never,
      options: {
        mainLoopModel: 'claude-sonnet-4-5',
        tools: [],
        agentDefinitions: {
          activeAgents: [],
          allSourceMetadata: [],
          loadedFromCache: false,
        },
        systemPromptOverride: ['test system prompt'],
        slashCommandInfoOverride: {
          totalCommands: 0,
          includedCommands: 0,
        },
      },
    })

    expect(result.apiUsage).toEqual({
      input_tokens: 321,
      output_tokens: 123,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })
})
