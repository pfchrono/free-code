import { describe, expect, test } from 'bun:test'
import { shouldUseFirstPartyAnthropicAuthForProvider } from './authRouting.js'

describe('shouldUseFirstPartyAnthropicAuthForProvider', () => {
  test('uses first-party auth only for first-party provider without override', () => {
    expect(
      shouldUseFirstPartyAnthropicAuthForProvider({
        apiProvider: 'firstParty',
        isFirstPartyBaseUrl: true,
      }),
    ).toBe(true)
  })

  test('does not use first-party auth when provider override is present', () => {
    expect(
      shouldUseFirstPartyAnthropicAuthForProvider({
        providerOverride: {
          model: 'gpt-4o',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-oai',
        },
        apiProvider: 'firstParty',
        isFirstPartyBaseUrl: true,
      }),
    ).toBe(false)
  })

  test('does not use first-party auth for non-first-party provider or base URL', () => {
    expect(
      shouldUseFirstPartyAnthropicAuthForProvider({
        apiProvider: 'openai',
        isFirstPartyBaseUrl: true,
      }),
    ).toBe(false)
    expect(
      shouldUseFirstPartyAnthropicAuthForProvider({
        apiProvider: 'firstParty',
        isFirstPartyBaseUrl: false,
      }),
    ).toBe(false)
  })
})
