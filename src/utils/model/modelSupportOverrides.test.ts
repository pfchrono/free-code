import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { get3PModelCapabilityOverride } from './modelSupportOverrides.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_ZEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_CODEX',
  'CLAUDE_CODE_USE_OPENROUTER',
  'CLAUDE_CODE_USE_COPILOT',
  'CLAUDE_CODE_USE_LMSTUDIO',
  'CLAUDE_CODE_USE_MINIMAX',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_MISTRAL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_ACCESS_TOKEN',
  'NVIDIA_NIM',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
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

describe('get3PModelCapabilityOverride', () => {
  test('does not reuse stale override after capability env changes', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'GLM-5.1'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES = ''

    expect(get3PModelCapabilityOverride('GLM-5.1', 'thinking')).toBe(false)

    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES

    expect(get3PModelCapabilityOverride('GLM-5.1', 'thinking')).toBeUndefined()
  })

  test('keeps provider changes isolated from 3p override cache', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'GLM-5.1'
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES = 'thinking'

    expect(get3PModelCapabilityOverride('glm-5.1', 'thinking')).toBe(true)

    delete process.env.CLAUDE_CODE_USE_OPENAI
    process.env.ANTHROPIC_API_KEY = 'test-first-party-key'

    expect(get3PModelCapabilityOverride('glm-5.1', 'thinking')).toBeUndefined()
  })
})
