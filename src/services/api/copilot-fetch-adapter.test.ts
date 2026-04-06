import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createCopilotFetch } from './copilot-fetch-adapter.js'

function createStreamResponse() {
  return new Response('data: [DONE]\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
  delete process.env.COPILOT_DISABLE_REQUEST_DEDUP
  delete process.env.COPILOT_DEDUP_TTL_MS
  delete process.env.COPILOT_STRICT_TOOL_RESULT_PRUNING
  delete process.env.COPILOT_CONTEXT_COMPACTION_RATIO
  delete process.env.COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS
  delete process.env.COPILOT_CONTEXT_MIN_MESSAGES
})

describe('createCopilotFetch', () => {
  it('intercepts Anthropic messages URLs with query params', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return new Response('unauthorized', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      })
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    const response = await copilotFetch('https://api.anthropic.com/v1/messages?beta=true', {
      method: 'POST',
      body: JSON.stringify({ messages: [], model: 'claude-sonnet-4-5' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(fetchCalls).toHaveLength(1)
    expect(String(fetchCalls[0]?.input)).toBe('https://api.githubcopilot.com/chat/completions')
    expect(response.status).toBe(401)
  })

  it('passes through non-message endpoints unchanged', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return new Response(null, { status: 204 })
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    const response = await copilotFetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
    })

    expect(fetchCalls).toHaveLength(1)
    expect(String(fetchCalls[0]?.input)).toBe('https://api.anthropic.com/v1/models')
    expect(response.status).toBe(204)
  })

  it('translates mixed text and image content into Copilot vision parts', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    const response = await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 32,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe this image' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'ZmFrZQ==',
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(response.status).toBe(200)
    expect(fetchCalls).toHaveLength(1)

    const upstreamInit = fetchCalls[0]?.init
    const upstreamBody = JSON.parse(String(upstreamInit?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>
    }
    const upstreamHeaders = new Headers(upstreamInit?.headers)

    expect(upstreamBody.messages[0]?.content).toEqual([
      { type: 'text', text: 'describe this image' },
      { image_url: { url: 'data:image/png;base64,ZmFrZQ==' }, type: 'image_url' },
    ])
    expect(upstreamHeaders.get('Copilot-Vision-Request')).toBe('true')
  })

  it('drops unsupported image media types and keeps vision header disabled', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'look at this' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/svg+xml',
                  data: 'PHN2Zz48L3N2Zz4=',
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamInit = fetchCalls[0]?.init
    const upstreamBody = JSON.parse(String(upstreamInit?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>
    }
    const upstreamHeaders = new Headers(upstreamInit?.headers)

    expect(upstreamBody.messages[0]?.content).toEqual([{ type: 'text', text: 'look at this' }])
    expect(upstreamHeaders.get('Copilot-Vision-Request')).toBe('false')
  })

  it('preserves tool results alongside translated vision content', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_123',
                name: 'inspect_image',
                input: { path: 'image.jpg' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool_123',
                content: 'done',
              },
              { type: 'text', text: 'now inspect this image' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: 'ZmFrZS1qcGVn',
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages).toEqual([
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'tool_123',
            type: 'function',
            function: {
              name: 'inspect_image',
              arguments: '{"path":"image.jpg"}',
            },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'tool_123', content: 'done' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'now inspect this image' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,ZmFrZS1qcGVn' },
          },
        ],
      },
    ])
  })

  it('suppresses vision payloads and headers for models without vision support', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch(
      { copilotToken: 'test-copilot-token' },
      {
        getModelById: async () => ({
          id: 'gpt-4o',
          name: 'GPT-4o',
          version: 'gpt-4o',
          modelPickerEnabled: true,
          supportedEndpoints: ['/chat/completions'],
          supportsToolCalls: true,
          supportsVision: false,
        }),
      },
    )

    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'text stays' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'ZmFrZQ==',
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamInit = fetchCalls[0]?.init
    const upstreamBody = JSON.parse(String(upstreamInit?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>
    }
    const upstreamHeaders = new Headers(upstreamInit?.headers)

    expect(upstreamBody.messages[0]?.content).toEqual([{ type: 'text', text: 'text stays' }])
    expect(upstreamHeaders.get('Copilot-Vision-Request')).toBe('false')
  })

  it('drops empty message content after vision filtering', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch(
      { copilotToken: 'test-copilot-token' },
      {
        getModelById: async () => ({
          id: 'gpt-4o',
          name: 'GPT-4o',
          version: 'gpt-4o',
          modelPickerEnabled: true,
          supportedEndpoints: ['/chat/completions'],
          supportsToolCalls: true,
          supportsVision: false,
        }),
      },
    )

    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'ZmFrZQ==',
                },
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages).toHaveLength(0)
  })

  it('compacts oversized message histories while keeping recent context', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const longText = 'x'.repeat(25000)
    const messages = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ type: 'text', text: `${i}:${longText}` }],
    }))

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages.length).toBeLessThan(messages.length)
    expect(upstreamBody.messages.length).toBeGreaterThanOrEqual(8)
  })

  it('compacts when explicit target tokens override is set for benchmarking', async () => {
    process.env.COPILOT_CONTEXT_COMPACTION_TARGET_TOKENS = '12000'
    process.env.COPILOT_CONTEXT_MIN_MESSAGES = '2'

    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const longText = 'x'.repeat(25000)
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: [{ type: 'text', text: `${i}:${longText}` }],
    }))

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages.length).toBeLessThan(messages.length)
  })

  it('replays identical requests from cache without a second upstream call', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    const requestInit: RequestInit = {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello world' }] }],
      }),
      headers: { 'Content-Type': 'application/json' },
    }

    const first = await copilotFetch('https://api.anthropic.com/v1/messages', requestInit)
    await first.text()

    const second = await copilotFetch('https://api.anthropic.com/v1/messages', requestInit)
    await second.text()

    expect(fetchCalls).toHaveLength(1)
  })

  it('coalesces in-flight duplicate requests', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    const requestInit: RequestInit = {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'same request' }] }],
      }),
      headers: { 'Content-Type': 'application/json' },
    }

    const [first, second] = await Promise.all([
      copilotFetch('https://api.anthropic.com/v1/messages', requestInit),
      copilotFetch('https://api.anthropic.com/v1/messages', requestInit),
    ])

    await Promise.all([first.text(), second.text()])

    expect(fetchCalls).toHaveLength(1)
  })

  it('strictly prunes old tool results when configured and context is oversized', async () => {
    process.env.COPILOT_STRICT_TOOL_RESULT_PRUNING = '1'
    process.env.COPILOT_CONTEXT_COMPACTION_RATIO = '0.3'
    process.env.COPILOT_CONTEXT_MIN_MESSAGES = '8'

    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const longTool = 't'.repeat(60000)
    const messages = Array.from({ length: 30 }, (_, i) => {
      if (i % 3 === 0) {
        return {
          role: 'user',
          content: [{ type: 'text', text: `user-${i}` }],
        }
      }
      if (i % 3 === 1) {
        return {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `tool_${i}`,
              name: 'big_tool',
              input: { i },
            },
          ],
        }
      }
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `tool_${i - 1}`,
            content: longTool,
          },
        ],
      }
    })

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages,
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    const toolMessageCount = upstreamBody.messages.filter((m) => m.role === 'tool').length
    expect(toolMessageCount).toBeLessThan(10)
  })

  it('drops orphaned translated tool results that do not match an assistant tool call', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'missing_tool',
                content: 'orphan',
              },
              { type: 'text', text: 'continue normally' },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages).toEqual([
      {
        role: 'user',
        content: [{ type: 'text', text: 'continue normally' }],
      },
    ])
  })

  it('inserts synthetic tool results when assistant tool calls are missing results', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_missing',
                name: 'ctx_batch_execute',
                input: { query: 'x' },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'next user turn' }],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages).toEqual([
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'tool_missing',
            type: 'function',
            function: {
              name: 'ctx_batch_execute',
              arguments: '{"query":"x"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'tool_missing',
        content: '[Tool execution interrupted before result was recorded]',
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'next user turn' }],
      },
    ])
  })

  it('converts tool_reference blocks in tool results into text for Copilot compatibility', async () => {
    const fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ input, init })
      return createStreamResponse()
    }) as typeof fetch

    const copilotFetch = createCopilotFetch({ copilotToken: 'test-copilot-token' })
    await copilotFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool_search_1',
                name: 'ToolSearch',
                input: { query: 'ctx_batch_execute' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'tool_search_1',
                content: [
                  { type: 'tool_reference', tool_name: 'ctx_batch_execute' },
                  { type: 'tool_reference', tool_name: 'ctx_search' },
                ],
              },
            ],
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const upstreamBody = JSON.parse(String(fetchCalls[0]?.init?.body)) as {
      messages: Array<Record<string, unknown>>
    }

    expect(upstreamBody.messages).toEqual([
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'tool_search_1',
            type: 'function',
            function: {
              name: 'ToolSearch',
              arguments: '{"query":"ctx_batch_execute"}',
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'tool_search_1',
        content: '[Tool reference: ctx_batch_execute]\n[Tool reference: ctx_search]',
      },
    ])
  })
})
