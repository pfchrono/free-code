import { afterEach, describe, expect, it } from 'bun:test'
import { getProviderRuntimeValidationError } from './providerRuntime.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_CODEX',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_OPENROUTER',
  'CLAUDE_CODE_USE_COPILOT',
  'CLAUDE_CODE_USE_LMSTUDIO',
  'CLAUDE_CODE_USE_MINIMAX',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'MINIMAX_API_KEY',
]

const originalEnv = new Map<string, string | undefined>()
for (const key of ENV_KEYS) {
  originalEnv.set(key, process.env[key])
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('getProviderRuntimeValidationError', () => {
  it('requires OPENAI_API_KEY for openai provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    delete process.env.OPENAI_API_KEY
    expect(getProviderRuntimeValidationError()).toBe(
      'OpenAI provider active but OPENAI_API_KEY missing.',
    )
  })

  it('accepts OPENAI_API_KEY for openai provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_API_KEY = 'test-key'
    expect(getProviderRuntimeValidationError()).toBeNull()
  })

  it('requires OPENROUTER_API_KEY for openrouter provider', () => {
    process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    delete process.env.OPENROUTER_API_KEY
    expect(getProviderRuntimeValidationError()).toBe(
      'OpenRouter provider active but OPENROUTER_API_KEY missing.',
    )
  })

  it('requires MINIMAX_API_KEY for minimax provider', () => {
    process.env.CLAUDE_CODE_USE_MINIMAX = '1'
    delete process.env.MINIMAX_API_KEY
    expect(getProviderRuntimeValidationError()).toBe(
      'MiniMax provider active but MINIMAX_API_KEY missing.',
    )
  })
})
