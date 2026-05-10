import { afterEach, beforeEach, expect, test } from 'bun:test'

import {
  DEFAULT_GITHUB_MODELS_API_MODEL,
  normalizeGithubModelsApiModel,
  resolveProviderRequest,
} from './providerConfig.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_OPENAI',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_API_FORMAT',
] as const

const originalEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
  }
})

test.each([
  ['copilot', DEFAULT_GITHUB_MODELS_API_MODEL],
  ['github:copilot', DEFAULT_GITHUB_MODELS_API_MODEL],
  ['github:gpt-4o', 'gpt-4o'],
  ['gpt-4o', 'gpt-4o'],
  ['github:openai/gpt-4.1', 'openai/gpt-4.1'],
  ['openai/gpt-4.1', 'openai/gpt-4.1'],
] as const)('normalizeGithubModelsApiModel(%s) -> %s', (input, expected) => {
  expect(normalizeGithubModelsApiModel(input)).toBe(expected)
})

test('resolveProviderRequest applies GitHub normalization when enabled', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const result = resolveProviderRequest({ model: 'github:gpt-4o' })
  expect(result.resolvedModel).toBe('gpt-4o')
  expect(result.transport).toBe('chat_completions')
})

test('resolveProviderRequest routes GitHub GPT-5 models to responses transport', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const result = resolveProviderRequest({ model: 'gpt-5.3-codex' })
  expect(result.resolvedModel).toBe('gpt-5.3-codex')
  expect(result.transport).toBe('codex_responses')
})

test('resolveProviderRequest keeps gpt-5-mini on chat completions for GitHub', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const result = resolveProviderRequest({ model: 'gpt-5-mini' })
  expect(result.resolvedModel).toBe('gpt-5-mini')
  expect(result.transport).toBe('chat_completions')
})

test('resolveProviderRequest leaves GitHub-prefixed model unchanged without flag', () => {
  const result = resolveProviderRequest({ model: 'github:gpt-4o' })
  expect(result.resolvedModel).toBe('github:gpt-4o')
})
