import { afterEach, describe, expect, it, mock } from 'bun:test'

import { createCodexFetch } from './codex-fetch-adapter.js'

function makeCodexToken(accountId = 'acct_test_123'): string {
  const payload = Buffer.from(
    JSON.stringify({
      'https://api.openai.com/auth': {
        chatgpt_account_id: accountId,
      },
    }),
  ).toString('base64')

  return ['header', payload, 'signature'].join('.')
}

function createStreamResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const originalFetch = globalThis.fetch
const originalAtob = globalThis.atob
const originalStderrWrite = process.stderr.write.bind(process.stderr)

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.atob = originalAtob
  process.stderr.write = originalStderrWrite
  mock.restore()
})

describe('createCodexFetch', () => {
  it('emits text when codex only finalizes message content in output_item.done', async () => {
    globalThis.fetch = mock(async () => {
      return createStreamResponse(
        [
          'event: response.output_item.done',
          'data: ' +
            JSON.stringify({
              type: 'response.output_item.done',
              item: {
                id: 'msg_1',
                type: 'message',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'Final answer',
                    annotations: [],
                  },
                ],
              },
            }),
          '',
          'event: response.completed',
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: {
                usage: {
                  input_tokens: 12,
                  output_tokens: 3,
                  total_tokens: 15,
                },
              },
            }),
          '',
        ].join('\n'),
      )
    }) as typeof fetch

    const stderrWrites: string[] = []
    process.stderr.write = mock(((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk))
      return true
    }) as typeof process.stderr.write)

    const codexFetch = createCodexFetch(makeCodexToken())
    const response = await codexFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const text = await response.text()

    expect(text).toContain('message_start')
    expect(text).toContain('Final answer')
    expect(text).toContain('message_stop')
    expect(
      stderrWrites.some(line => line.includes('[Anthropic leak detected]')),
    ).toBe(false)
  })

  it('decodes jwt payloads without relying on global atob', async () => {
    globalThis.atob = undefined as typeof globalThis.atob
    globalThis.fetch = mock(async () => {
      return createStreamResponse(
        [
          'event: response.completed',
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: {
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [
                      {
                        type: 'output_text',
                        text: 'No atob needed',
                        annotations: [],
                      },
                    ],
                  },
                ],
                usage: {
                  input_tokens: 2,
                  output_tokens: 3,
                  total_tokens: 5,
                },
              },
            }),
          '',
        ].join('\n'),
      )
    }) as typeof fetch

    const codexFetch = createCodexFetch(makeCodexToken())
    const response = await codexFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const text = await response.text()

    expect(text).toContain('No atob needed')
  })

  it('emits text when codex finalizes content in output_text.done', async () => {
    globalThis.fetch = mock(async () => {
      return createStreamResponse(
        [
          'event: response.output_text.done',
          'data: ' +
            JSON.stringify({
              type: 'response.output_text.done',
              text: 'Done text',
            }),
          '',
          'event: response.completed',
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: {
                usage: {
                  input_tokens: 1,
                  output_tokens: 1,
                  total_tokens: 2,
                },
              },
            }),
          '',
        ].join('\n'),
      )
    }) as typeof fetch

    const codexFetch = createCodexFetch(makeCodexToken())
    const response = await codexFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const text = await response.text()

    expect(text).toContain('Done text')
    expect(text).toContain('message_stop')
  })

  it('emits text when codex only includes final output in response.completed', async () => {
    globalThis.fetch = mock(async () => {
      return createStreamResponse(
        [
          'event: response.completed',
          'data: ' +
            JSON.stringify({
              type: 'response.completed',
              response: {
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [
                      {
                        type: 'output_text',
                        text: 'Completed text',
                        annotations: [],
                      },
                    ],
                  },
                ],
                usage: {
                  input_tokens: 2,
                  output_tokens: 4,
                  total_tokens: 6,
                },
              },
            }),
          '',
        ].join('\n'),
      )
    }) as typeof fetch

    const codexFetch = createCodexFetch(makeCodexToken())
    const response = await codexFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const text = await response.text()

    expect(text).toContain('Completed text')
    expect(text).toContain('message_stop')
  })

  it('keeps reading after response.done so later text deltas are not dropped', async () => {
    globalThis.fetch = mock(async () => {
      return createStreamResponse(
        [
          'event: response.done',
          'data: ' +
            JSON.stringify({
              type: 'response.done',
              response: {
                usage: {
                  input_tokens: 2,
                  output_tokens: 4,
                  total_tokens: 6,
                },
              },
            }),
          '',
          'event: response.output_text.done',
          'data: ' +
            JSON.stringify({
              type: 'response.output_text.done',
              text: 'Late final text',
            }),
          '',
        ].join('\n'),
      )
    }) as typeof fetch

    const codexFetch = createCodexFetch(makeCodexToken())
    const response = await codexFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hello' }],
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const text = await response.text()

    expect(text).toContain('Late final text')
    expect(text).toContain('message_stop')
  })
})
