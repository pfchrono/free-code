import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  applyModelFlagFromArgs,
  applyProviderFlag,
  applyProviderFlagFromArgs,
  parseModelFlag,
  parseProviderFlag,
  VALID_PROVIDERS,
} from './providerFlag.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_OPENROUTER',
  'CLAUDE_CODE_USE_COPILOT',
  'CLAUDE_CODE_USE_LMSTUDIO',
  'CLAUDE_CODE_USE_ZEN',
  'CLAUDE_CODE_USE_MINIMAX',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_MISTRAL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'GEMINI_MODEL',
  'NVIDIA_API_KEY',
  'NVIDIA_NIM',
  'BNKR_API_KEY',
  'XAI_API_KEY',
  'ZAI_API_KEY',
  'MINIMAX_API_KEY',
  'MISTRAL_MODEL',
  'ANTHROPIC_MODEL',
] as const

const originalEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  originalEnv.clear()
})

describe('parseProviderFlag', () => {
  test('returns provider name for --provider', () => {
    expect(parseProviderFlag(['--provider', 'openai'])).toBe('openai')
  })

  test('returns provider name for --profile alias', () => {
    expect(parseProviderFlag(['--profile', 'openrouter'])).toBe('openrouter')
  })

  test('picks earliest of --provider and --profile', () => {
    expect(
      parseProviderFlag(['--profile', 'openrouter', '--provider', 'openai']),
    ).toBe('openrouter')
  })

  test('returns null when flag missing or value missing', () => {
    expect(parseProviderFlag(['--model', 'gpt-5'])).toBeNull()
    expect(parseProviderFlag(['--provider'])).toBeNull()
    expect(parseProviderFlag(['--profile', '--model'])).toBeNull()
  })
})

describe('parseModelFlag', () => {
  test('returns model when present', () => {
    expect(parseModelFlag(['--model', 'gpt-5-mini'])).toBe('gpt-5-mini')
  })

  test('returns null when missing or malformed', () => {
    expect(parseModelFlag(['--provider', 'openai'])).toBeNull()
    expect(parseModelFlag(['--model'])).toBeNull()
    expect(parseModelFlag(['--model', '--provider'])).toBeNull()
  })
})

describe('VALID_PROVIDERS', () => {
  test('includes free-code adapter and descriptor-backed providers', () => {
    expect(VALID_PROVIDERS).toContain('openrouter')
    expect(VALID_PROVIDERS).toContain('copilot')
    expect(VALID_PROVIDERS).toContain('lmstudio')
    expect(VALID_PROVIDERS).toContain('zen')
    expect(VALID_PROVIDERS).toContain('deepseek')
  })
})

describe('applyProviderFlagFromArgs', () => {
  test('applies provider and model from --provider', () => {
    const result = applyProviderFlagFromArgs([
      '--provider',
      'ollama',
      '--model',
      'qwen2.5:3b',
    ])

    expect(result?.error).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(process.env.OPENAI_BASE_URL).toBe('http://localhost:11434/v1')
    expect(process.env.OPENAI_API_KEY).toBe('ollama')
    expect(process.env.OPENAI_MODEL).toBe('qwen2.5:3b')
  })

  test('applies provider and model from --profile alias', () => {
    const result = applyProviderFlagFromArgs([
      '--profile',
      'openrouter',
      '--model',
      'anthropic/claude-sonnet-4.5',
    ])

    expect(result?.error).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENROUTER).toBe('1')
    expect(process.env.OPENAI_MODEL).toBe('anthropic/claude-sonnet-4.5')
  })

  test('returns undefined when provider flag absent', () => {
    expect(applyProviderFlagFromArgs(['--model', 'gpt-5'])).toBeUndefined()
  })
})

describe('applyModelFlagFromArgs', () => {
  test('is no-op when model absent', () => {
    applyModelFlagFromArgs(['--ide'])
    expect(process.env.OPENAI_MODEL).toBeUndefined()
    expect(process.env.GEMINI_MODEL).toBeUndefined()
    expect(process.env.ANTHROPIC_MODEL).toBeUndefined()
  })

  test('is no-op when provider or profile also present', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    applyModelFlagFromArgs(['--provider', 'openai', '--model', 'gpt-5'])
    expect(process.env.OPENAI_MODEL).toBeUndefined()

    applyModelFlagFromArgs(['--profile', 'openrouter', '--model', 'gpt-5'])
    expect(process.env.OPENAI_MODEL).toBeUndefined()
  })

  test('routes model to active provider env', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    applyModelFlagFromArgs(['--model', 'gpt-5-mini'])
    expect(process.env.OPENAI_MODEL).toBe('gpt-5-mini')

    delete process.env.CLAUDE_CODE_USE_OPENAI
    delete process.env.OPENAI_MODEL
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    applyModelFlagFromArgs(['--model', 'gemini-2.5-flash'])
    expect(process.env.GEMINI_MODEL).toBe('gemini-2.5-flash')

    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.GEMINI_MODEL
    process.env.CLAUDE_CODE_USE_MISTRAL = '1'
    applyModelFlagFromArgs(['--model', 'devstral-latest'])
    expect(process.env.MISTRAL_MODEL).toBe('devstral-latest')
  })

  test('falls back to anthropic model when no provider active', () => {
    applyModelFlagFromArgs(['--model', 'claude-sonnet-4-6'])
    expect(process.env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6')
  })
})

describe('applyProviderFlag', () => {
  test('returns error for invalid provider', () => {
    const result = applyProviderFlag('unknown-provider', [])
    expect(result.error).toContain('unknown-provider')
    expect(result.error).toContain(VALID_PROVIDERS.join(', '))
  })

  test('clears stale copied OpenAI key when switching providers', () => {
    process.env.NVIDIA_API_KEY = 'nvidia-live-key'
    expect(applyProviderFlag('nvidia-nim', []).error).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBe('nvidia-live-key')

    expect(applyProviderFlag('openrouter', []).error).toBeUndefined()
    expect(process.env.NVIDIA_NIM).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBeUndefined()
  })

  test('uses route defaults for descriptor-backed providers', () => {
    const result = applyProviderFlag('deepseek', [])

    expect(result.error).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.deepseek.com/v1')
    expect(process.env.OPENAI_MODEL).toBe('deepseek-v4-pro')
  })

  test('copies ZAI_API_KEY for Z.AI provider when OpenAI key is absent', () => {
    process.env.ZAI_API_KEY = 'zai-live-key'

    const result = applyProviderFlag('zai', [])

    expect(result.error).toBeUndefined()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
    expect(process.env.OPENAI_BASE_URL).toBe('https://api.z.ai/api/coding/paas/v4')
    expect(process.env.OPENAI_API_KEY).toBe('zai-live-key')
  })

  test('preserves explicit OpenAI key for Z.AI provider', () => {
    process.env.ZAI_API_KEY = 'zai-live-key'
    process.env.OPENAI_API_KEY = 'explicit-openai-key'

    const result = applyProviderFlag('zai', [])

    expect(result.error).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBe('explicit-openai-key')
  })

  test('clears stale copied Z.AI key when switching providers', () => {
    process.env.ZAI_API_KEY = 'zai-live-key'
    expect(applyProviderFlag('zai', []).error).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBe('zai-live-key')

    expect(applyProviderFlag('openrouter', []).error).toBeUndefined()
    expect(process.env.OPENAI_API_KEY).toBeUndefined()
  })
})
