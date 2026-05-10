import { afterEach, expect, test } from 'bun:test'

import {
  getAdditionalModelOptionsCacheScope,
  getLocalProviderRetryBaseUrls,
  isLocalProviderUrl,
  resolveProviderRequest,
  shouldAttemptLocalToollessRetry,
} from './providerConfig.js'

const originalEnv = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_CUSTOM_HEADERS: process.env.ANTHROPIC_CUSTOM_HEADERS,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_API_FORMAT: process.env.OPENAI_API_FORMAT,
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    restoreEnv(key, value)
  }
})

test('treats local endpoints as local', () => {
  expect(isLocalProviderUrl('http://localhost:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://127.0.0.2:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://10.0.0.1:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://192.168.0.1:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://ollama.local:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('http://[fd00::1]:11434/v1')).toBe(true)
  expect(isLocalProviderUrl('https://example.com/v1')).toBe(false)
})

test('creates a partitioned cache scope for local openai-compatible providers', () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'http://localhost:1234/v1'
  process.env.OPENAI_MODEL = 'llama-3.2-3b-instruct'
  process.env.OPENAI_API_KEY = 'first-key'
  process.env.ANTHROPIC_CUSTOM_HEADERS = 'X-Route: first'

  const firstScope = getAdditionalModelOptionsCacheScope()
  process.env.OPENAI_API_KEY = 'second-key'
  const secondScope = getAdditionalModelOptionsCacheScope()

  expect(firstScope?.startsWith('openai:http://localhost:1234/v1:')).toBe(true)
  expect(firstScope).not.toBe(secondScope)
})

test('keeps codex alias models on chat completions for local providers', () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8080/v1'
  process.env.OPENAI_MODEL = 'gpt-5.4'

  expect(resolveProviderRequest()).toMatchObject({
    transport: 'chat_completions',
    requestedModel: 'gpt-5.4',
    resolvedModel: 'gpt-5.4',
    baseUrl: 'http://127.0.0.1:8080/v1',
  })
})

test('uses responses transport when API format requests responses', () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
  process.env.OPENAI_MODEL = 'gpt-5.4'
  process.env.OPENAI_API_FORMAT = 'responses'

  expect(resolveProviderRequest()).toMatchObject({
    transport: 'responses',
    resolvedModel: 'gpt-5.4',
    baseUrl: 'https://api.openai.com/v1',
  })
})

test('derives local retry base URLs with /v1 and loopback candidates', () => {
  expect(getLocalProviderRetryBaseUrls('http://localhost:11434')).toEqual([
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://0.0.0.0:11434/v1',
  ])
})

test('enables local toolless retry only for likely Ollama endpoints with tools', () => {
  expect(
    shouldAttemptLocalToollessRetry({
      baseUrl: 'http://localhost:11434/v1',
      hasTools: true,
    }),
  ).toBe(true)
  expect(
    shouldAttemptLocalToollessRetry({
      baseUrl: 'http://localhost:1234/v1',
      hasTools: true,
    }),
  ).toBe(false)
})
