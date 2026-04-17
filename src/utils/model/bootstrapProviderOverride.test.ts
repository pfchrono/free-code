import { afterEach, describe, expect, it } from 'bun:test'
import { applyRepoLocalApiProviderOverride } from './bootstrapProviderOverride.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_CODEX',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_OPENROUTER',
  'CLAUDE_CODE_USE_COPILOT',
  'CLAUDE_CODE_USE_LMSTUDIO',
  'CLAUDE_CODE_USE_ZEN',
  'CLAUDE_CODE_USE_MINIMAX',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
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

describe('applyRepoLocalApiProviderOverride', () => {
  it('preserves explicit env provider flags', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    applyRepoLocalApiProviderOverride()
    expect(process.env.CLAUDE_CODE_USE_OPENAI).toBe('1')
  })
})
