import { afterEach, describe, expect, it } from 'bun:test'

import { getCurrentAPIAdapterName } from './model/providers.js'

afterEach(() => {
  delete process.env.CLAUDE_CODE_API_PROVIDER
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.CLAUDE_CODE_USE_CODEX
  delete process.env.CLAUDE_CODE_USE_ZEN
  delete process.env.CLAUDE_CODE_USE_OPENROUTER
  delete process.env.CLAUDE_CODE_USE_COPILOT
  delete process.env.CLAUDE_CODE_USE_LMSTUDIO
  delete process.env.CLAUDE_CODE_USE_MINIMAX
})

describe('getCurrentAPIAdapterName', () => {
  it('uses active provider when explicit adapter env is absent', () => {
    process.env.CLAUDE_CODE_USE_CODEX = '1'

    expect(getCurrentAPIAdapterName()).toBe('codex-adapter')
  })

  it('preserves explicit adapter env override when present', () => {
    process.env.CLAUDE_CODE_API_PROVIDER = 'custom-adapter'
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    expect(getCurrentAPIAdapterName()).toBe('custom-adapter')
  })
})
