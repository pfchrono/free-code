import { describe, expect, it } from 'bun:test'
import { APIError } from '@anthropic-ai/sdk'

import { testExports } from './withRetry.js'

function createApiError(message: string): APIError {
  return new APIError(429, undefined, message, new Headers())
}

describe('isQuotaExhausted', () => {
  it('detects exhausted quota messages that should not be retried', () => {
    expect(
      testExports.isQuotaExhausted(
        createApiError('429 exceeded your current quota, please check your plan'),
      ),
    ).toBe(true)

    expect(
      testExports.isQuotaExhausted(createApiError('429 account limit: 0')),
    ).toBe(true)
  })

  it('does not classify generic 429 capacity errors as quota exhaustion', () => {
    expect(
      testExports.isQuotaExhausted(createApiError('429 backend overloaded')),
    ).toBe(false)
  })
})
