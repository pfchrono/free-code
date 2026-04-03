import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createCopilotFetch } from './copilot-fetch-adapter.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  mock.restore()
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

    const copilotFetch = createCopilotFetch('test-copilot-token')
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

    const copilotFetch = createCopilotFetch('test-copilot-token')
    const response = await copilotFetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
    })

    expect(fetchCalls).toHaveLength(1)
    expect(String(fetchCalls[0]?.input)).toBe('https://api.anthropic.com/v1/models')
    expect(response.status).toBe(204)
  })
})