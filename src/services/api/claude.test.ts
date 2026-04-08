import { afterEach, describe, expect, it } from 'bun:test'

import { getPromptCachingEnabled } from './claude.js'

afterEach(() => {
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_OPENROUTER
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.DISABLE_PROMPT_CACHING
})

describe('getPromptCachingEnabled', () => {
  it('disables prompt caching for third-party providers', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(getPromptCachingEnabled('gpt-5.4')).toBe(false)

    delete process.env.CLAUDE_CODE_USE_OPENAI
    process.env.CLAUDE_CODE_USE_OPENROUTER = '1'
    expect(getPromptCachingEnabled('openai/gpt-4.1')).toBe(false)

    delete process.env.CLAUDE_CODE_USE_OPENROUTER
    process.env.CLAUDE_CODE_USE_COPILOT = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4')).toBe(false)
  })

  it('keeps prompt caching enabled for explicitly Anthropic-compatible providers', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4-6')).toBe(true)

    delete process.env.CLAUDE_CODE_USE_BEDROCK
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getPromptCachingEnabled('claude-sonnet-4-6')).toBe(true)
  })
})
