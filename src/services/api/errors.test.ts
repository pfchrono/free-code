import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { APIError } from '@anthropic-ai/sdk'

import { getAssistantMessageFromError } from './errors.js'

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.CLAUDE_MOCK_HEADERLESS_429 = '1'
  process.env.USER_TYPE = 'coder'
})

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_MOCK_HEADERLESS_429
  delete process.env.USER_TYPE
})

function createApiError(options: {
  status: number
  message: string
  headers?: Record<string, string>
}): APIError {
  return new APIError(
    options.status,
    undefined,
    options.message,
    new Headers(options.headers),
  )
}

describe('getAssistantMessageFromError', () => {
  it('includes retry-after timing for generic 429 responses', () => {
    const result = getAssistantMessageFromError(
      createApiError({
        status: 429,
        message: '429 {"message":"temporary capacity issue"}',
        headers: { 'retry-after': '12' },
      }),
      'claude-sonnet-4-6',
    )

    const textBlock = result.message.content[0]
    expect(textBlock?.type).toBe('text')
    expect(textBlock?.text).toContain('Request rejected (429)')
    expect(textBlock?.text).toContain('temporary capacity issue')
    expect(textBlock?.text).toContain('Try again in 12 seconds.')
  })

  it('falls back to a generic retry hint when retry-after is unavailable', () => {
    const result = getAssistantMessageFromError(
      createApiError({
        status: 429,
        message: '429 backend overloaded',
      }),
      'claude-sonnet-4-6',
    )

    const textBlock = result.message.content[0]
    expect(textBlock?.type).toBe('text')
    expect(textBlock?.text).toContain('Try again in a few seconds.')
  })
})
