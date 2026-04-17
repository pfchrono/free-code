import { afterEach, describe, expect, it } from 'bun:test'

import { getDefaultHaikuModel, getDefaultOpusModel, getDefaultSonnetModel, parseUserSpecifiedModel } from './model.js'

afterEach(() => {
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_MINIMAX
  delete process.env.CLAUDE_CODE_USE_ZEN
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
  delete process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
})

describe('provider-equivalent model routing', () => {
  it('routes family aliases to Codex equivalents', () => {
    process.env.CLAUDE_CODE_USE_CODEX = '1'

    expect(getDefaultHaikuModel()).toBe('gpt-5.4-mini')
    expect(getDefaultSonnetModel()).toBe('gpt-5.4')
    expect(getDefaultOpusModel()).toBe('gpt-5.1-codex-max')
  })

  it('routes explicit Claude family models to OpenAI equivalents', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    expect(parseUserSpecifiedModel('claude-haiku-4-5')).toBe('gpt-5.4-mini')
    expect(parseUserSpecifiedModel('claude-sonnet-4-6')).toBe('gpt-5.4')
    expect(parseUserSpecifiedModel('claude-opus-4-6')).toBe('gpt-5.4')
  })

  it('routes family aliases to Copilot Claude equivalents', () => {
    process.env.CLAUDE_CODE_USE_COPILOT = '1'

    expect(parseUserSpecifiedModel('haiku')).toBe('claude-haiku-4.5')
    expect(parseUserSpecifiedModel('sonnet')).toBe('claude-sonnet-4.6')
    expect(parseUserSpecifiedModel('opus')).toBe('claude-opus-4.6')
  })
})
